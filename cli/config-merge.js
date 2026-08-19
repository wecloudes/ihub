// Idempotent merge of artifact entries into agent-owned config files.
// Used by `mcp` and `hook` installs, which target shared JSON files
// (.mcp.json, .claude/settings.json, ...) instead of standalone .md files.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";

function readJsonConfig(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf-8");
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${err.message} — fix or remove the file and retry`);
  }
}

function writeJsonConfig(filePath, config) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n");
}

// Walk a dot-separated key path, creating plain objects along the way.
// Refuses to overwrite an existing non-object value — that would silently
// destroy user config.
function walkTo(obj, keyPath, filePath) {
  let cur = obj;
  for (const key of keyPath.split(".")) {
    if (cur[key] === undefined || cur[key] === null) {
      cur[key] = {};
    } else if (typeof cur[key] !== "object" || Array.isArray(cur[key])) {
      throw new Error(`Cannot merge into ${filePath}: "${key}" exists but is not an object — fix the file and retry`);
    }
    cur = cur[key];
  }
  return cur;
}

/**
 * Insert or replace `container[name]` under `keyPath` (e.g. mcpServers.github).
 * Everything else in the file is preserved.
 */
export function mergeObjectEntry(filePath, keyPath, name, value) {
  const config = readJsonConfig(filePath);
  const container = walkTo(config, keyPath, filePath);
  container[name] = value;
  writeJsonConfig(filePath, config);
}

/**
 * Insert or replace an entry in the array at `keyPath` (e.g. hooks.PostToolUse).
 * Entries are keyed by an `_ihub: "<type>/<name>"` marker; a prior entry with
 * the same marker is replaced in place. Entries without a marker (user-authored)
 * are never touched.
 */
export function mergeArrayEntry(filePath, keyPath, marker, value) {
  const config = readJsonConfig(filePath);
  const keys = keyPath.split(".");
  const lastKey = keys.pop();
  const parent = keys.length ? walkTo(config, keys.join("."), filePath) : config;
  if (parent[lastKey] === undefined || parent[lastKey] === null) {
    parent[lastKey] = [];
  } else if (!Array.isArray(parent[lastKey])) {
    throw new Error(`Cannot merge into ${filePath}: "${lastKey}" exists but is not an array — fix the file and retry`);
  }

  const entry = { ...value, _ihub: marker };
  const idx = parent[lastKey].findIndex((e) => e && e._ihub === marker);
  if (idx !== -1) {
    parent[lastKey][idx] = entry;
  } else {
    parent[lastKey].push(entry);
  }
  writeJsonConfig(filePath, config);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Idempotent marker-keyed merge of a markdown section into a shared file
 * (project-root AGENTS.md). The section is wrapped in
 * `<!-- ihub:<marker> -->` ... `<!-- /ihub:<marker> -->` comments; a prior
 * section with the same marker is replaced in place. Content outside the
 * markers (user-authored or other ihub sections) is never touched.
 * Creates the file when missing.
 */
export function mergeMarkdownSection(filePath, marker, content) {
  const begin = `<!-- ihub:${marker} -->`;
  const end = `<!-- /ihub:${marker} -->`;
  const section = `${begin}\n${String(content).trim()}\n${end}`;

  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const re = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`);

  let next;
  if (re.test(existing)) {
    // Replace our own section in place; replacer fn avoids `$` substitution.
    next = existing.replace(re, () => section);
  } else if (existing.trim()) {
    next = existing.replace(/\n*$/, "\n\n") + section + "\n";
  } else {
    next = section + "\n";
  }

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, next);
}

// The flat frontmatter parser keeps surrounding quotes on array items — strip them.
function unquote(value) {
  const s = String(value).trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

// Split ["KEY=value", ...] into { KEY: "value" }. Splits on the first separator only.
export function parseKeyValueArray(items, separator = "=") {
  const out = {};
  for (const item of Array.isArray(items) ? items : []) {
    const unquoted = unquote(item);
    const idx = unquoted.indexOf(separator);
    if (idx === -1) continue;
    const key = unquoted.slice(0, idx).trim();
    const value = unquoted.slice(idx + separator.length).trim();
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Build the config entry for an MCP server from artifact frontmatter.
 * shape "standard": mcpServers entry used by Claude Code, Cursor, Gemini, Qwen.
 * shape "opencode": OpenCode `mcp` entry (command array, environment object).
 */
export function buildMcpEntry(meta, shape) {
  const transport = meta.transport || "stdio";
  const args = (Array.isArray(meta.args) ? meta.args : []).map(unquote);
  const env = parseKeyValueArray(meta.env, "=");
  const headers = parseKeyValueArray(meta.headers, ":");

  if (shape === "opencode") {
    if (transport === "stdio") {
      const entry = { type: "local", command: [meta.command, ...args].filter(Boolean), enabled: true };
      if (Object.keys(env).length) entry.environment = env;
      return entry;
    }
    const entry = { type: "remote", url: meta.url || "", enabled: true };
    if (Object.keys(headers).length) entry.headers = headers;
    return entry;
  }

  if (transport === "stdio") {
    const entry = { command: meta.command || "" };
    if (args.length) entry.args = args;
    if (Object.keys(env).length) entry.env = env;
    return entry;
  }
  const entry = { type: transport, url: meta.url || "" };
  if (Object.keys(headers).length) entry.headers = headers;
  return entry;
}

/**
 * Build a Claude Code settings.json hook entry from artifact frontmatter.
 * Shape: { matcher?, hooks: [{ type: "command", command, timeout? }] }
 * The _ihub marker is added by mergeArrayEntry.
 */
export function buildClaudeHookEntry(meta) {
  const hook = { type: "command", command: meta.command || "" };
  if (meta.timeout) hook.timeout = Number(meta.timeout);
  const entry = { hooks: [hook] };
  if (meta.matcher) entry.matcher = String(meta.matcher);
  return entry;
}

/**
 * Extract the first fenced ```json block from an artifact body.
 * Returns the parsed object, null when there is no block, and throws on
 * invalid JSON inside the block.
 */
export function extractConfigBlock(body) {
  const match = String(body || "").match(/```json\s*\n([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`Invalid JSON in config block: ${err.message}`);
  }
}

// Convert a Claude-shape mcpServers entry to OpenCode's `mcp` entry shape.
export function toOpencodeMcpEntry(entry) {
  if (entry.command) {
    const out = { type: "local", command: [entry.command, ...(Array.isArray(entry.args) ? entry.args : [])], enabled: true };
    if (entry.env && Object.keys(entry.env).length) out.environment = entry.env;
    return out;
  }
  const out = { type: "remote", url: entry.url || "", enabled: true };
  if (entry.headers && Object.keys(entry.headers).length) out.headers = entry.headers;
  return out;
}

/**
 * Resolve an mcp artifact to { serverName, entry } in Claude .mcp.json shape.
 * Canonical source: a fenced ```json block in the body holding the exact
 * mcpServers entry keyed by server name: { "azure": { "command": ... } }.
 * Legacy fallback: flat frontmatter fields (transport/command/args/env/url/headers).
 */
export function resolveMcpConfig(meta, body) {
  const block = extractConfigBlock(body);
  if (block && typeof block === "object" && !Array.isArray(block)) {
    const keys = Object.keys(block);
    if (keys.length === 1 && block[keys[0]] && typeof block[keys[0]] === "object") {
      return { serverName: keys[0], entry: block[keys[0]] };
    }
    throw new Error("MCP config block must contain exactly one server entry: { \"<name>\": { ... } }");
  }
  return { serverName: meta.name || "", entry: buildMcpEntry(meta, "standard") };
}

/**
 * Resolve a hook artifact to [{ event, entry }] in Claude settings.json shape.
 * Canonical source: a fenced ```json block holding the exact hooks fragment:
 * { "PostToolUse": [{ matcher?, hooks: [{ type, command, timeout? }] }], ... }.
 * Legacy fallback: flat frontmatter fields (event/matcher/command/timeout).
 */
export function resolveHookEntries(meta, body) {
  const block = extractConfigBlock(body);
  if (block && typeof block === "object" && !Array.isArray(block)) {
    const entries = [];
    for (const [event, list] of Object.entries(block)) {
      for (const entry of Array.isArray(list) ? list : [list]) {
        if (entry && typeof entry === "object") entries.push({ event, entry });
      }
    }
    if (!entries.length) throw new Error("Hook config block contains no hook entries");
    return entries;
  }
  return [{ event: meta.event || "PostToolUse", entry: buildClaudeHookEntry(meta) }];
}
