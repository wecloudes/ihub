import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { loadRegistry, loadPlugins, parseFrontmatter, unwrapConfig } from "./parse.js";
import { renderMarkdown } from "./render.js";
import { remoteSearch, loadConfig, getBaseUrl, authHeaders } from "./registry.js";
import {
  ROOT, VALID_HOOK_EVENTS, PLUGIN_NAME_RE, COMPONENT_KINDS, parseJsonFlag,
} from "./context.js";

// Merge remote + local plugins, dedup by name (remote wins).
async function mergePlugins() {
  const base = getBaseUrl();
  const local = loadPlugins(ROOT);
  let remote = [];
  try {
    const res = await fetch(`${base}/api/plugins`);
    if (res.ok) remote = await res.json();
  } catch { /* registry unavailable — local only */ }

  const merged = [];
  const seen = new Set();
  for (const e of remote) {
    const meta = typeof e.meta === "string" ? safeJson(e.meta) : (e.meta || {});
    seen.add(e.name || e.file);
    merged.push({ ...e, ...meta, name: e.name || e.file, remote: true });
  }
  for (const e of local) {
    if (!seen.has(e.name)) merged.push(e);
  }
  return merged;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

export async function list(args) {
  const { jsonMode } = parseJsonFlag(args);
  const plugins = await mergePlugins();

  if (jsonMode) {
    const data = plugins.map(({ body, path, files, ...rest }) => rest);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Best-effort ratings
  const base = getBaseUrl();
  const ratings = {};
  for (const p of plugins) {
    try {
      const res = await fetch(`${base}/api/plugins/${p.name}/comments`);
      if (res.ok) {
        const d = await res.json();
        if (d.rating && d.rating.count > 0) ratings[p.name] = d.rating.average;
      }
    } catch { /* ignore */ }
  }

  console.log(`\nPLUGINS (${plugins.length})`);
  for (const p of plugins) {
    const rating = ratings[p.name] ? `  ★${ratings[p.name]}` : "";
    const desc = p.description ? "— " + p.description : "";
    console.log(`  ${p.name}${rating}  ${desc}`);
    const c = p.components || {};
    const parts = COMPONENT_KINDS
      .map((k) => (Array.isArray(c[k]) && c[k].length) ? `${c[k].length} ${k}` : null)
      .filter(Boolean);
    if (parts.length) console.log(`    ${parts.join(", ")}`);
  }
  console.log();
}

export async function search(args) {
  const { jsonMode, rest: filteredArgs } = parseJsonFlag(args);
  const isRemote = filteredArgs[0] === "--remote";
  if (isRemote) filteredArgs.shift();

  const query = filteredArgs.join(" ").toLowerCase();
  if (!query) {
    console.error("Usage: ihub search [--remote] <query>");
    process.exit(1);
  }

  if (isRemote) {
    const results = await remoteSearch(query);
    if (jsonMode) { console.log(JSON.stringify(results, null, 2)); return; }
    if (results.length === 0) { console.log("No remote results found."); return; }
    console.log(`\nFound ${results.length} remote result(s):\n`);
    for (const r of results) console.log(`  ${r.name} — ${r.description || ""}`);
    console.log();
    return;
  }

  let remoteResults = [];
  try { remoteResults = await remoteSearch(query); } catch { /* offline */ }

  const localResults = [];
  for (const entry of loadPlugins(ROOT)) {
    const compNames = Object.values(entry.components || {}).flat();
    const haystack = [
      entry.name, entry.description,
      ...(Array.isArray(entry.tags) ? entry.tags : []),
      ...compNames, entry.body,
    ].filter(Boolean).join(" ").toLowerCase();
    if (haystack.includes(query)) localResults.push(entry);
  }

  const seen = new Set();
  const results = [];
  for (const r of remoteResults) { seen.add(r.name); results.push(r); }
  for (const r of localResults) { if (!seen.has(r.name)) results.push(r); }

  if (jsonMode) {
    console.log(JSON.stringify(results.map(({ body, path, files, ...rest }) => rest), null, 2));
    return;
  }
  if (results.length === 0) { console.log("No results found."); return; }
  console.log(`\nFound ${results.length} result(s):\n`);
  for (const r of results) console.log(`  ${r.name} — ${r.description || ""}`);
  console.log();
}

function componentTree(components) {
  const lines = [];
  const kinds = COMPONENT_KINDS.filter((k) => (components?.[k] || []).length);
  kinds.forEach((kind, ki) => {
    const isLastKind = ki === kinds.length - 1;
    lines.push(`${isLastKind ? "└" : "├"}── \x1b[33m${kind}\x1b[0m`);
    const items = components[kind];
    items.forEach((item, ii) => {
      const isLast = ii === items.length - 1;
      const prefix = isLastKind ? "    " : "│   ";
      lines.push(`${prefix}${isLast ? "└" : "├"}── ${item}`);
    });
  });
  return lines.join("\n");
}

function findLocalPlugin(name) {
  return loadPlugins(ROOT).find((p) => p.name === name || p.dir === name);
}

export function show(args) {
  const { jsonMode, rest: filtered } = parseJsonFlag(args);
  const [name] = filtered;
  if (!name) {
    console.error("Usage: ihub show <name>");
    process.exit(1);
  }
  const entry = findLocalPlugin(name);
  if (!entry) {
    console.error(`Not found: ${name}`);
    process.exit(1);
  }

  if (jsonMode) {
    const { body, path, files, manifestPath, ...data } = entry;
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`\n--- ${entry.name} ---`);
  const { body, path, files, manifestPath, manifestError, dir, file, ...meta } = entry;
  console.log(JSON.stringify(meta, null, 2));
  console.log(`\nComponents:`);
  const tree = componentTree(entry.components);
  console.log(tree || "  (none)");
  if (body) console.log(`\n${body}\n`);
}

export function preview(args) {
  const [name] = args;
  if (!name) {
    console.error("Usage: ihub preview <name>");
    process.exit(1);
  }
  const entry = findLocalPlugin(name);
  if (!entry) {
    console.error(`Not found: ${name}`);
    process.exit(1);
  }
  const readmePath = join(entry.path, "README.md");
  const md = existsSync(readmePath) ? readFileSync(readmePath, "utf-8") : `# ${entry.name}\n\n${entry.description || ""}`;
  console.log(renderMarkdown(md));
  console.log(`\nComponents:\n${componentTree(entry.components) || "  (none)"}\n`);
}

// 2026 conventions: skill boolean frontmatter accepts yes/no/on/off/1/0.
const BOOLEAN_LIKE = /^(true|false|yes|no|on|off|1|0)$/i;
function isBooleanLike(value) {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return value === 0 || value === 1;
  return typeof value === "string" && BOOLEAN_LIKE.test(value.trim());
}
const SKILL_BOOLEAN_FIELDS = ["background", "disable-model-invocation"];

// Detect a literal secret (non-placeholder) in an env/header value.
function looksLikeSecret(value) {
  const s = String(value || "");
  if (!s) return false;
  if (/\$\{[^}]+\}/.test(s)) return false; // ${VAR} placeholder — good
  if (/^\$[A-Z0-9_]+$/.test(s)) return false; // $VAR — good
  return /(key|token|secret|password|bearer|[A-Za-z0-9_-]{24,})/i.test(s);
}

/**
 * Validate every local plugin (CONTRACT §6). Returns the error count and prints
 * findings; exits non-zero when any plugin is invalid.
 */
export function validate() {
  const plugins = loadPlugins(ROOT);
  let errors = 0;
  const err = (msg) => { console.error(`  ${msg}`); errors++; };

  if (plugins.length === 0) {
    console.log("No local plugins found.");
    return;
  }

  for (const p of plugins) {
    const label = `plugins/${p.dir}`;

    // plugin.json
    if (p.manifestError) {
      err(`INVALID plugin.json in ${label}: ${p.manifestError}`);
      continue;
    }
    if (!p.name) err(`MISSING name in ${label}`);
    if (p.name && !PLUGIN_NAME_RE.test(p.name)) {
      err(`INVALID name "${p.name}" in ${label} (must be kebab-case [a-z0-9-], no ":")`);
    }
    if (!p.description) err(`MISSING description in ${label}`);
    if (p.version && !/^\d+\.\d+\.\d+([-+].+)?$/.test(String(p.version))) {
      err(`INVALID version "${p.version}" in ${label} (expected semver)`);
    }

    // skills/*/SKILL.md
    for (const skill of p.components.skills) {
      const sp = join(p.path, "skills", skill, "SKILL.md");
      const { meta } = parseFrontmatter(readFileSync(sp, "utf-8"));
      if (!meta.description) err(`MISSING description in ${label}/skills/${skill}/SKILL.md`);
      for (const field of SKILL_BOOLEAN_FIELDS) {
        if (meta[field] !== undefined && !isBooleanLike(meta[field])) {
          err(`INVALID ${field} "${meta[field]}" in ${label}/skills/${skill} (expected true/false, yes/no, on/off, or 1/0)`);
        }
      }
    }

    // commands/*.md + agents/*.md must parse (frontmatter never throws — just read)
    for (const cmd of p.components.commands) {
      const cp = join(p.path, "commands", `${cmd}.md`);
      if (!existsSync(cp)) err(`MISSING command file ${label}/commands/${cmd}.md`);
    }
    for (const agent of p.components.agents) {
      const ap = join(p.path, "agents", `${agent}.md`);
      if (!existsSync(ap)) err(`MISSING agent file ${label}/agents/${agent}.md`);
    }

    // .mcp.json
    const mcpPath = join(p.path, ".mcp.json");
    if (existsSync(mcpPath)) {
      let servers = null;
      try {
        servers = unwrapConfig(JSON.parse(readFileSync(mcpPath, "utf-8")), "mcpServers");
      } catch (e) {
        err(`INVALID .mcp.json in ${label}: ${e.message}`);
      }
      if (servers) {
        for (const [sname, cfg] of Object.entries(servers)) {
          if (!cfg || typeof cfg !== "object") { err(`INVALID mcp server "${sname}" in ${label}`); continue; }
          if (!cfg.command && !cfg.url) {
            err(`INVALID mcp server "${sname}" in ${label}: needs "command" (stdio) or "url" (remote)`);
          }
          if (cfg.protocolVersion !== undefined) {
            const pv = String(cfg.protocolVersion);
            const m = pv.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) {
              err(`INVALID protocolVersion "${pv}" for mcp "${sname}" in ${label} (expected YYYY-MM-DD)`);
            }
          }
          for (const bag of [cfg.env, cfg.headers]) {
            for (const v of Object.values(bag || {})) {
              if (looksLikeSecret(v)) {
                console.error(`  WARN literal secret in mcp "${sname}" env/headers in ${label} — use \${VAR} placeholders`);
              }
            }
          }
        }
      }
    }

    // hooks/hooks.json
    const hooksPath = join(p.path, "hooks", "hooks.json");
    if (existsSync(hooksPath)) {
      let events = null;
      try {
        events = unwrapConfig(JSON.parse(readFileSync(hooksPath, "utf-8")), "hooks");
      } catch (e) {
        err(`INVALID hooks/hooks.json in ${label}: ${e.message}`);
      }
      if (events) {
        for (const [event, listRaw] of Object.entries(events)) {
          if (!VALID_HOOK_EVENTS.includes(event)) {
            err(`INVALID hook event "${event}" in ${label} (valid: ${VALID_HOOK_EVENTS.join(", ")})`);
          }
          const list = Array.isArray(listRaw) ? listRaw : [listRaw];
          for (const he of list) {
            const cmds = Array.isArray(he?.hooks) ? he.hooks : [];
            if (!cmds.length || cmds.some((h) => !h?.command)) {
              err(`MISSING hook command in ${label} (event ${event})`);
            }
          }
        }
      }
    }
  }

  if (errors === 0) {
    console.log(`Registry is valid (${plugins.length} plugin(s)).`);
  } else {
    console.error(`\n${errors} error(s) found.`);
    process.exit(1);
  }
}

export async function projects(args) {
  const { jsonMode } = parseJsonFlag(args);
  const localOnly = args.includes("--local");
  const filtered = args.filter((a) => a !== "--json" && a !== "--local");
  const [projectName] = filtered;

  let plugins;
  if (localOnly) {
    plugins = loadPlugins(ROOT);
  } else {
    const config = loadConfig();
    const base = (config.registry || process.env.IHUB_REGISTRY || "").replace(/\/+$/, "");
    if (!base) {
      plugins = loadPlugins(ROOT);
    } else {
      try {
        const res = await fetch(`${base}/api/plugins`, { headers: authHeaders() });
        const raw = res.ok ? await res.json() : [];
        plugins = raw.map((e) => {
          const meta = typeof e.meta === "string" ? safeJson(e.meta) : (e.meta || {});
          return { ...e, ...meta, name: e.name || e.file, project: meta.project || e.project || "" };
        });
      } catch {
        plugins = loadPlugins(ROOT);
      }
    }
  }

  const projectMap = {};
  const unassigned = [];
  for (const p of plugins) {
    const proj = p.project || "";
    if (proj) {
      (projectMap[proj] = projectMap[proj] || []).push(p);
    } else {
      unassigned.push(p);
    }
  }
  const projectNames = Object.keys(projectMap).sort();

  if (jsonMode) {
    const strip = ({ body, path, files, ...rest }) => rest;
    const result = {};
    for (const pn of projectNames) result[pn] = projectMap[pn].map(strip);
    if (unassigned.length) result["(unassigned)"] = unassigned.map(strip);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (projectName) {
    const bucket = projectMap[projectName];
    if (!bucket) {
      console.error(`Project not found: ${projectName}`);
      console.error(`Available projects: ${projectNames.join(", ") || "(none)"}`);
      process.exit(1);
    }
    printProjectTree(projectName, bucket);
    return;
  }

  if (projectNames.length === 0 && unassigned.length === 0) {
    console.log("\nNo plugins found.\n");
    return;
  }
  for (const name of projectNames) printProjectTree(name, projectMap[name]);
  if (unassigned.length) printProjectTree("(unassigned)", unassigned);
}

export function printProjectTree(name, plugins) {
  console.log(`\n\x1b[1m\x1b[36m${name}\x1b[0m`);
  if (!plugins.length) {
    console.log(`└── \x1b[2m(empty)\x1b[0m`);
    return;
  }
  plugins.forEach((p, i) => {
    const isLast = i === plugins.length - 1;
    const connector = isLast ? "└" : "├";
    const desc = p.description ? `\x1b[2m — ${p.description}\x1b[0m` : "";
    const ver = p.version ? `\x1b[90m@${p.version}\x1b[0m` : "";
    console.log(`${connector}── ${p.name}${ver}${desc}`);
  });
}
