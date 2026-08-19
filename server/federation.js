// Federation — subscribe to upstream registries and mirror artifacts.

import { loadServerConfig } from "./config.js";
import { upsertEntry, upsertAttachment, getDb } from "./db.js";

const VALID_TYPES = ["plugins"];

export const UPSTREAM_TYPES = ["ihub", "mcp-registry"];
const MCP_REGISTRY_DEFAULT_LIMIT = 50;

// In-memory state: last sync timestamps per upstream URL
const syncState = new Map();

// In-memory upstreams (added at runtime)
const runtimeUpstreams = [];

/**
 * Sync artifacts from an upstream registry.
 * For each configured type, fetches the list and then each individual artifact.
 * Stores locally with owner set to "federated:{upstreamUrl}".
 */
export async function syncFromUpstream(upstreamUrl, types) {
  const url = upstreamUrl.replace(/\/+$/, "");
  const typesToSync = (types || VALID_TYPES).filter((t) => VALID_TYPES.includes(t));
  let synced = 0;
  const errors = [];

  for (const type of typesToSync) {
    try {
      const listRes = await fetch(`${url}/api/${type}`);
      if (!listRes.ok) {
        errors.push(`Failed to list ${type} from ${url}: ${listRes.status}`);
        continue;
      }
      const entries = await listRes.json();

      for (const entry of entries) {
        const name = entry.name;
        if (!name) continue;

        try {
          const detailRes = await fetch(`${url}/api/${type}/${name}`);
          if (!detailRes.ok) {
            errors.push(`Failed to fetch ${type}/${name} from ${url}: ${detailRes.status}`);
            continue;
          }
          const detail = await detailRes.json();

          // Parse meta — it may be a string or object
          let meta = detail.meta || {};
          if (typeof meta === "string") {
            try { meta = JSON.parse(meta); } catch { meta = {}; }
          }

          upsertEntry({
            type,
            name,
            version: detail.version || meta.version || "0.1.0",
            description: detail.description || meta.description || "",
            tags: detail.tags || (typeof meta.tags === "string" ? JSON.parse(meta.tags) : meta.tags) || [],
            meta,
            body: detail.body || "",
            author: detail.author || meta.author || "",
            owner: `federated:${url}`,
          });
          synced++;
        } catch (err) {
          errors.push(`Error fetching ${type}/${name}: ${err.message}`);
        }
      }
    } catch (err) {
      errors.push(`Error listing ${type} from ${url}: ${err.message}`);
    }
  }

  syncState.set(url, { lastSync: new Date().toISOString(), synced, errors: errors.length });
  return { synced, errors };
}

// --- MCP Registry upstreams (registry.modelcontextprotocol.io) ---

/** Lowercase, keep [a-z0-9], collapse everything else into single dashes. */
function sanitizeName(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Env var / placeholder name: uppercase, [A-Z0-9_] only. */
function sanitizeVarName(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Convert a header/env value from an MCP Registry record into a safe value.
 * Registry templates like "Bearer {smithery_api_key}" become "Bearer ${SMITHERY_API_KEY}".
 * Secret values (or missing ones) become "${NAME}" — literal secrets are never emitted.
 */
function placeholderize(value, name, isSecret) {
  const fallback = "${" + sanitizeVarName(name) + "}";
  if (!value) return fallback;
  const replaced = String(value).replace(/\{([^}]+)\}/g, (_, v) => "${" + sanitizeVarName(v) + "}");
  if (isSecret && !replaced.includes("${")) return fallback;
  return replaced;
}

/** Collect argument values from runtimeArguments/packageArguments entries. */
function argValues(args) {
  const out = [];
  for (const a of args || []) {
    if (!a || typeof a !== "object") continue;
    const type = a.type || (a.name ? "named" : "positional");
    if (type === "named" && a.name) {
      out.push(a.name);
      if (a.value !== undefined && a.value !== null && a.value !== "") out.push(String(a.value));
    } else if (a.value !== undefined && a.value !== null && a.value !== "") {
      out.push(String(a.value));
    }
  }
  return out;
}

/**
 * Build the Claude-native .mcp.json server config for one MCP Registry record.
 * Prefers remotes (type http/sse); falls back to npm packages (npx).
 * Returns null when the record has neither a usable remote nor an npm package.
 * Supports both current camelCase and legacy snake_case field names.
 */
function buildMcpConfig(server, shortname) {
  // Remote transports → { type: "http"|"sse", url, headers? }
  const remotes = server.remotes || [];
  const remote = remotes.find((r) => r && r.url);
  if (remote) {
    const config = {
      type: remote.type === "sse" ? "sse" : "http",
      url: remote.url,
    };
    const headerList = remote.headers || [];
    if (headerList.length > 0) {
      const headers = {};
      for (const h of headerList) {
        if (!h || !h.name) continue;
        headers[h.name] = placeholderize(h.value, h.name, h.isSecret ?? h.is_secret);
      }
      if (Object.keys(headers).length > 0) config.headers = headers;
    }
    return { [shortname]: config };
  }

  // npm packages → { command: "npx", args: ["-y", identifier, ...], env }
  const packages = server.packages || [];
  const pkg = packages.find((p) => p && (p.registryType || p.registry_type) === "npm" && p.identifier);
  if (pkg) {
    const args = ["-y"];
    for (const v of argValues(pkg.runtimeArguments || pkg.runtime_arguments)) {
      if (v !== "-y") args.push(v);
    }
    args.push(pkg.identifier);
    args.push(...argValues(pkg.packageArguments || pkg.package_arguments));

    const config = { command: pkg.runtimeHint || pkg.runtime_hint || "npx", args };
    const envList = pkg.environmentVariables || pkg.environment_variables || [];
    if (envList.length > 0) {
      const env = {};
      for (const e of envList) {
        if (!e || !e.name) continue;
        // Always a ${VAR} placeholder — never a literal value.
        env[e.name] = "${" + sanitizeVarName(e.name) + "}";
      }
      if (Object.keys(env).length > 0) config.env = env;
    }
    return { [shortname]: config };
  }

  return null;
}

function b64(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

/**
 * Map one MCP Registry server record to an ihub `plugins` entry.
 *
 * The MCP server becomes a single-component plugin: a generated
 * `.claude-plugin/plugin.json` manifest plus a `.mcp.json` holding the
 * Claude-native server config (secrets always `${VAR}` placeholders). Both are
 * returned as base64 attachments so the standard attachment infra recreates the
 * plugin directory on pull.
 *
 * Returns null for records with neither usable remotes nor npm packages.
 */
export function mapMcpServerToEntry(server, upstreamUrl) {
  const fullName = server?.name;
  if (!fullName) return null;

  const shortname = sanitizeName(fullName.split("/").pop()) || sanitizeName(fullName);
  const artifactName = sanitizeName(fullName);
  if (!artifactName) return null;

  const config = buildMcpConfig(server, shortname);
  if (!config) return null;

  const description = server.description || "";
  const version = server.version || "0.0.0";

  // Generated plugin.json manifest (Claude Code plugin spec).
  const manifest = {
    name: artifactName,
    version,
    description,
    ...(server.repository?.url ? { repository: server.repository.url } : {}),
    keywords: ["mcp-registry"],
  };

  const bodyParts = [`# ${server.title || shortname}`];
  if (description) bodyParts.push(description);
  if (server.repository?.url) bodyParts.push(`Repository: ${server.repository.url}`);
  bodyParts.push("This plugin bundles the `" + shortname + "` MCP server.");
  bodyParts.push("```json\n" + JSON.stringify(config, null, 2) + "\n```");

  return {
    type: "plugins",
    name: artifactName,
    version,
    description,
    tags: ["mcp-registry"],
    meta: {
      source: "mcp-registry",
      registry_name: fullName,
      ...(server.repository?.url ? { repository: server.repository.url } : {}),
      components: { skills: [], commands: [], agents: [], mcpServers: [shortname], hooks: [] },
    },
    body: bodyParts.join("\n\n") + "\n",
    author: fullName.includes("/") ? fullName.split("/")[0] : "",
    owner: `federated:${upstreamUrl}`,
    attachments: [
      { filepath: ".claude-plugin/plugin.json", content: b64(JSON.stringify(manifest, null, 2) + "\n") },
      { filepath: ".mcp.json", content: b64(JSON.stringify(config, null, 2) + "\n") },
    ],
  };
}

/**
 * Sync MCP servers from an official MCP Registry (registry.modelcontextprotocol.io API).
 * Pages GET /v0/servers?version=latest[&search=...] with cursor pagination, mapping each
 * record to an ihub `plugins` artifact. At most `limit` records are processed (default 50) —
 * never the whole registry. Records without usable remotes or npm packages are skipped.
 */
export async function syncFromMcpRegistry(upstreamUrl, { search, limit } = {}) {
  const url = upstreamUrl.replace(/\/+$/, "");
  const max = Number.isInteger(limit) && limit > 0 ? limit : MCP_REGISTRY_DEFAULT_LIMIT;
  let synced = 0;
  let skipped = 0;
  const errors = [];
  let cursor = null;
  let processed = 0;

  try {
    while (processed < max) {
      const params = new URLSearchParams({ version: "latest", limit: String(Math.min(max - processed, 100)) });
      if (search) params.set("search", search);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`${url}/v0/servers?${params}`);
      if (!res.ok) {
        errors.push(`Failed to list servers from ${url}: ${res.status}`);
        break;
      }
      const data = await res.json();
      const records = data.servers || [];
      if (records.length === 0) break;

      for (const record of records) {
        if (processed >= max) break;
        processed++;
        const server = record.server || record;
        try {
          const entry = mapMcpServerToEntry(server, url);
          if (!entry) {
            skipped++;
            continue;
          }
          const { attachments, ...entryFields } = entry;
          const result = await upsertEntry(entryFields);
          if (result?.error) {
            errors.push(`Skipped ${server.name}: ${result.error}`);
            skipped++;
          } else {
            for (const att of attachments || []) {
              if (att.filepath && att.content) {
                await upsertAttachment({ type: entry.type, name: entry.name, filepath: att.filepath, content: att.content });
              }
            }
            synced++;
          }
        } catch (err) {
          errors.push(`Error syncing ${server?.name || "unknown"}: ${err.message}`);
        }
      }

      cursor = data.metadata?.nextCursor || data.metadata?.next_cursor || null;
      if (!cursor) break;
    }
  } catch (err) {
    errors.push(`Error listing servers from ${url}: ${err.message}`);
  }

  if (skipped > 0) {
    console.log(`federation: mcp-registry ${url} — skipped ${skipped} record(s) without usable remotes or npm packages`);
  }

  syncState.set(url, { lastSync: new Date().toISOString(), synced, skipped, errors: errors.length });
  return { synced, skipped, errors };
}

/**
 * Sync a single upstream, dispatching on its `type` ("ihub" default | "mcp-registry").
 */
export async function syncUpstream(upstream) {
  if (upstream.type === "mcp-registry") {
    return syncFromMcpRegistry(upstream.url, { search: upstream.search, limit: upstream.limit });
  }
  return syncFromUpstream(upstream.url, upstream.types);
}

/**
 * List configured upstreams (from config + runtime additions).
 */
export function listUpstreams() {
  const config = loadServerConfig();
  const configured = config.federation?.upstreams || [];
  const all = [...configured, ...runtimeUpstreams];

  return all.map((u) => ({
    url: u.url,
    type: UPSTREAM_TYPES.includes(u.type) ? u.type : "ihub",
    types: u.type === "mcp-registry" ? ["plugins"] : (u.types || VALID_TYPES),
    ...(u.type === "mcp-registry" ? {
      search: u.search || "",
      limit: Number.isInteger(u.limit) && u.limit > 0 ? u.limit : MCP_REGISTRY_DEFAULT_LIMIT,
    } : {}),
    interval_hours: u.interval_hours || 24,
    lastSync: syncState.get(u.url)?.lastSync || null,
    lastSynced: syncState.get(u.url)?.synced || 0,
    lastErrors: syncState.get(u.url)?.errors || 0,
  }));
}

/**
 * Add an upstream at runtime (in-memory only).
 * `extra` may carry { type, search, limit } for mcp-registry upstreams.
 */
export function addUpstream(url, types, interval_hours, extra = {}) {
  runtimeUpstreams.push({
    url: url.replace(/\/+$/, ""),
    types: types || VALID_TYPES,
    interval_hours: interval_hours || 24,
    ...extra,
  });
}

/**
 * Run periodic sync for all enabled upstreams.
 * Called by setInterval in server/index.js.
 */
export async function syncAll() {
  const upstreams = listUpstreams();
  const results = [];
  for (const upstream of upstreams) {
    const result = await syncUpstream(upstream);
    results.push({ url: upstream.url, ...result });
  }
  return results;
}
