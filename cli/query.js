import { readFileSync } from "fs";
import { AGENT_NAMES } from "./agents-config.js";
import { extractConfigBlock } from "./config-merge.js";
import { loadRegistry } from "./parse.js";
import { renderMarkdown } from "./render.js";
import { remoteSearch, loadConfig, getBaseUrl, authHeaders } from "./registry.js";
import { ROOT, REF_CHECKS, VALID_HOOK_EVENTS, pluralize, parseJsonFlag } from "./context.js";

export async function list(args) {
  const { jsonMode, rest: filtered } = parseJsonFlag(args);
  const type = filtered[0];

  const types = type ? [type] : ["agents", "commands", "designs", "hooks", "mcps", "memories", "prompts", "rules", "skills"];

  // Merge remote registry + local entries (dedup by name, remote wins)
  const base = getBaseUrl();
  const registry = {};

  for (const t of types) {
    const localEntries = loadRegistry(ROOT)[t] || [];
    let remoteEntries = [];
    try {
      const res = await fetch(`${base}/api/${t}`);
      if (res.ok) remoteEntries = await res.json();
    } catch {
      // registry unavailable — use local only
    }
    const seen = new Set();
    registry[t] = [];
    for (const e of remoteEntries) {
      const name = e.name || e.file;
      seen.add(name);
      registry[t].push(e);
    }
    for (const e of localEntries) {
      const name = e.name || e.file;
      if (!seen.has(name)) registry[t].push(e);
    }
  }

  if (jsonMode) {
    const data = {};
    for (const t of types) {
      const entries = registry[t];
      if (!entries) continue;
      data[t] = entries.map(({ body, path, ...rest }) => rest);
    }
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Fetch ratings for all entries (best-effort)
  const ratingsMap = {};

  for (const t of types) {
    const entries = registry[t];
    if (!entries) continue;
    for (const e of entries) {
      const name = e.name || e.file;
      try {
        const res = await fetch(`${base}/api/${t}/${name}/comments`);
        if (res.ok) {
          const data = await res.json();
          if (data.rating && data.rating.count > 0) {
            ratingsMap[`${t}/${name}`] = data.rating.average;
          }
        }
      } catch {
        // ignore — registry may be unavailable
      }
    }
  }

  for (const t of types) {
    const entries = registry[t];
    if (!entries) {
      console.error(`Unknown type: ${t}`);
      continue;
    }
    console.log(`\n${t.toUpperCase()} (${entries.length})`);
    for (const e of entries) {
      const name = e.name || e.file;
      const desc = e.description || "";
      const tags = Array.isArray(e.tags) ? e.tags.join(", ") : "";
      const rating = ratingsMap[`${t}/${name}`];
      const ratingStr = rating ? `  \u2605${rating}` : "";
      console.log(`  ${name}${ratingStr}  ${desc ? "— " + desc : ""}`);
      if (tags) console.log(`    tags: ${tags}`);
    }
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
    if (jsonMode) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    if (results.length === 0) {
      console.log("No remote results found.");
      return;
    }
    console.log(`\nFound ${results.length} remote result(s):\n`);
    for (const r of results) {
      console.log(`  [${r.type}] ${r.name} — ${r.description || ""}`);
    }
    console.log();
    return;
  }

  // Merge remote + local search results (dedup by type+name, remote wins)
  let remoteResults = [];
  try {
    remoteResults = await remoteSearch(query);
  } catch {
    // registry unavailable
  }

  const localRegistry = loadRegistry(ROOT);
  const localResults = [];
  for (const [type, entries] of Object.entries(localRegistry)) {
    for (const entry of entries) {
      const haystack = [
        entry.name,
        entry.description,
        ...(Array.isArray(entry.tags) ? entry.tags : []),
        entry.body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (haystack.includes(query)) {
        localResults.push({ type: type.slice(0, -1), ...entry });
      }
    }
  }

  const seen = new Set();
  const results = [];
  for (const r of remoteResults) {
    const key = `${r.type}/${r.name}`;
    seen.add(key);
    results.push(r);
  }
  for (const r of localResults) {
    const key = `${r.type}/${r.name || r.file}`;
    if (!seen.has(key)) results.push(r);
  }

  if (jsonMode) {
    const data = results.map(({ body, path, ...rest }) => rest);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  console.log(`\nFound ${results.length} result(s):\n`);
  for (const r of results) {
    console.log(`  [${r.type}] ${r.name || r.file} — ${r.description || ""}`);
  }
  console.log();
}

export function show(args) {
  const { jsonMode, rest: filtered } = parseJsonFlag(args);
  const [type, name] = filtered;
  if (!type || !name) {
    console.error("Usage: ihub show <type> <name>");
    process.exit(1);
  }

  const registry = loadRegistry(ROOT);
  const entries = registry[pluralize(type)];
  if (!entries) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  const entry = entries.find((e) => (e.name || e.file) === name);
  if (!entry) {
    console.error(`Not found: ${name}`);
    process.exit(1);
  }

  if (jsonMode) {
    const { path: _p, file: _f, ...data } = entry;
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`\n--- ${entry.name || entry.file} ---`);
  const { body, path, file, ...meta } = entry;
  console.log(JSON.stringify(meta, null, 2));
  console.log(`\n${body}\n`);
}

export function preview(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub preview <type> <name>");
    process.exit(1);
  }

  const registry = loadRegistry(ROOT);
  const entries = registry[pluralize(type)];
  if (!entries) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  const entry = entries.find((e) => (e.name || e.file) === name);
  if (!entry) {
    console.error(`Not found: ${name}`);
    process.exit(1);
  }

  const rawContent = readFileSync(entry.path, "utf-8");
  console.log(renderMarkdown(rawContent));
}

export function validate() {
  const registry = loadRegistry(ROOT);
  let errors = 0;

  for (const [type, entries] of Object.entries(registry)) {
    for (const entry of entries) {
      const label = `${type}/${entry.file}`;

      if (!entry.name) {
        console.error(`  MISSING name in ${label}`);
        errors++;
      }
      if (!entry.description) {
        console.error(`  MISSING description in ${label}`);
        errors++;
      }
      if (!entry.version) {
        console.error(`  MISSING version in ${label}`);
        errors++;
      }

      // Uniform ref checks: each frontmatter array field must reference an existing
      // entry in the corresponding registry type. (compatible_agents/applies_to have
      // special-case logic and are handled separately below.)
      for (const [field, regKey, singular] of REF_CHECKS) {
        if (!Array.isArray(entry[field])) continue;
        for (const ref of entry[field]) {
          if (!registry[regKey].find((e) => (e.name || e.file) === ref)) {
            console.error(`  BROKEN ref: ${singular} "${ref}" in ${label}`);
            errors++;
          }
        }
      }
      if (Array.isArray(entry.compatible_agents)) {
        for (const ref of entry.compatible_agents) {
          // For mcps/hooks, compatible_agents names coding agents (claude, cursor, ...);
          // for other types it references agent artifacts
          const isCodingAgentRef = (type === "mcps" || type === "hooks") && AGENT_NAMES.includes(ref);
          if (!isCodingAgentRef && !registry.agents.find((a) => (a.name || a.file) === ref)) {
            console.error(`  BROKEN ref: agent "${ref}" in ${label}`);
            errors++;
          }
        }
      }
      if (Array.isArray(entry.applies_to)) {
        for (const ref of entry.applies_to) {
          if (!registry.agents.find((a) => (a.name || a.file) === ref)) {
            console.error(`  BROKEN ref: agent "${ref}" in ${label}`);
            errors++;
          }
        }
      }

      if (type === "mcps") {
        let block = null;
        let blockError = null;
        try { block = extractConfigBlock(entry.body); } catch (err) { blockError = err.message; }
        if (blockError) {
          console.error(`  INVALID config block in ${label}: ${blockError}`);
          errors++;
        } else if (block) {
          // Canonical format: ```json block with one Claude-shape mcpServers entry
          const keys = (typeof block === "object" && !Array.isArray(block)) ? Object.keys(block) : [];
          if (keys.length !== 1 || !block[keys[0]] || typeof block[keys[0]] !== "object") {
            console.error(`  INVALID config block in ${label}: must contain exactly one server entry { "<name>": { ... } }`);
            errors++;
          } else if (!block[keys[0]].command && !block[keys[0]].url) {
            console.error(`  INVALID config block in ${label}: server entry needs "command" (stdio) or "url" (remote)`);
            errors++;
          }
        } else {
          // Legacy flat-frontmatter format
          const transport = entry.transport || "stdio";
          if (!["stdio", "http", "sse"].includes(transport)) {
            console.error(`  INVALID transport "${transport}" in ${label} (must be stdio, http, or sse)`);
            errors++;
          } else if (transport === "stdio" && !entry.command) {
            console.error(`  MISSING command in ${label} (required for stdio transport)`);
            errors++;
          } else if (transport !== "stdio" && !entry.url) {
            console.error(`  MISSING url in ${label} (required for ${transport} transport)`);
            errors++;
          }
        }
      }

      if (type === "hooks") {
        let block = null;
        let blockError = null;
        try { block = extractConfigBlock(entry.body); } catch (err) { blockError = err.message; }
        if (blockError) {
          console.error(`  INVALID config block in ${label}: ${blockError}`);
          errors++;
        } else if (block) {
          // Canonical format: ```json block with Claude settings.json hooks fragment
          const events = (typeof block === "object" && !Array.isArray(block)) ? Object.keys(block) : [];
          if (!events.length) {
            console.error(`  INVALID config block in ${label}: no hook events found`);
            errors++;
          }
          for (const event of events) {
            if (!VALID_HOOK_EVENTS.includes(event)) {
              console.error(`  INVALID event "${event}" in ${label} (valid: ${VALID_HOOK_EVENTS.join(", ")})`);
              errors++;
            }
            const list = Array.isArray(block[event]) ? block[event] : [block[event]];
            for (const he of list) {
              const cmds = Array.isArray(he?.hooks) ? he.hooks : [];
              if (!cmds.length || cmds.some((h) => !h?.command)) {
                console.error(`  MISSING command in ${label} (event ${event})`);
                errors++;
              }
            }
          }
        } else {
          // Legacy flat-frontmatter format
          if (!entry.event) {
            console.error(`  MISSING event in ${label}`);
            errors++;
          } else if (!VALID_HOOK_EVENTS.includes(entry.event)) {
            console.error(`  INVALID event "${entry.event}" in ${label} (valid: ${VALID_HOOK_EVENTS.join(", ")})`);
            errors++;
          }
          if (!entry.command) {
            console.error(`  MISSING command in ${label}`);
            errors++;
          }
        }
      }
    }
  }

  if (errors === 0) {
    console.log("Registry is valid.");
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
  const TYPES = ["agents", "commands", "designs", "hooks", "mcps", "memories", "prompts", "rules", "skills"];

  // Load entries — remote by default, local with --local
  let allEntries = {};
  if (localOnly) {
    const registry = loadRegistry(ROOT);
    for (const type of TYPES) allEntries[type] = registry[type] || [];
  } else {
    const config = loadConfig();
    const base = (config.registry || process.env.IHUB_REGISTRY || "").replace(/\/+$/, "");
    if (!base) {
      // No registry configured — fall back to local
      const registry = loadRegistry(ROOT);
      for (const type of TYPES) allEntries[type] = registry[type] || [];
    } else {
      const headers = authHeaders();
      for (const type of TYPES) {
        try {
          const res = await fetch(`${base}/api/${type}`, { headers });
          if (res.ok) {
            const entries = await res.json();
            allEntries[type] = entries.map((e) => {
              const meta = typeof e.meta === "string" ? (() => { try { return JSON.parse(e.meta); } catch { return {}; } })() : (e.meta || {});
              return { ...e, ...meta, project: meta.project || e.project || "" };
            });
          } else {
            allEntries[type] = [];
          }
        } catch {
          allEntries[type] = [];
        }
      }
    }
  }

  // Collect all projects
  const projectMap = {};
  const emptyBuckets = () => Object.fromEntries(TYPES.map(t => [t, []]));
  const unassigned = emptyBuckets();

  for (const type of TYPES) {
    for (const entry of (allEntries[type] || [])) {
      const proj = entry.project || "";
      if (proj) {
        if (!projectMap[proj]) projectMap[proj] = emptyBuckets();
        projectMap[proj][type].push(entry);
      } else {
        unassigned[type].push(entry);
      }
    }
  }

  const projectNames = Object.keys(projectMap).sort();

  if (jsonMode) {
    const stripEntry = ({ body, path, ...rest }) => rest;
    const result = {};
    for (const pn of projectNames) {
      result[pn] = {};
      for (const t of TYPES) {
        if (projectMap[pn][t].length > 0) result[pn][t] = projectMap[pn][t].map(stripEntry);
      }
    }
    const hasUn = TYPES.some((t) => unassigned[t].length > 0);
    if (hasUn) {
      result['(unassigned)'] = {};
      for (const t of TYPES) {
        if (unassigned[t].length > 0) result['(unassigned)'][t] = unassigned[t].map(stripEntry);
      }
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // If a specific project is requested
  if (projectName) {
    const proj = projectMap[projectName];
    if (!proj) {
      console.error(`Project not found: ${projectName}`);
      console.error(`Available projects: ${projectNames.join(", ") || "(none)"}`);
      process.exit(1);
    }
    printProjectTree(projectName, proj);
    return;
  }

  // List all projects
  if (projectNames.length === 0 && TYPES.every((t) => unassigned[t].length === 0)) {
    console.log("\nNo entries found.\n");
    return;
  }

  for (const name of projectNames) {
    printProjectTree(name, projectMap[name]);
  }

  const hasUnassigned = TYPES.some((t) => unassigned[t].length > 0);
  if (hasUnassigned) {
    printProjectTree("(unassigned)", unassigned);
  }
}

export function printProjectTree(name, data) {
  const TYPES = ["agents", "commands", "designs", "hooks", "mcps", "memories", "prompts", "rules", "skills"];
  const typesWithEntries = TYPES.filter((t) => data[t].length > 0);

  console.log(`\n\x1b[1m\x1b[36m${name}\x1b[0m`);

  for (let ti = 0; ti < typesWithEntries.length; ti++) {
    const type = typesWithEntries[ti];
    const entries = data[type];
    const isLastType = ti === typesWithEntries.length - 1;
    const typeConnector = isLastType ? "\u2514" : "\u251c";
    const typePrefix = isLastType ? " " : "\u2502";

    console.log(`${typeConnector}\u2500\u2500 \x1b[33m${type}\x1b[0m`);

    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      const isLastEntry = ei === entries.length - 1;
      const entryConnector = isLastEntry ? "\u2514" : "\u251c";
      const desc = entry.description ? `\x1b[2m \u2014 ${entry.description}\x1b[0m` : "";
      const ver = entry.version ? `\x1b[90m@${entry.version}\x1b[0m` : "";

      console.log(`${typePrefix}   ${entryConnector}\u2500\u2500 ${entry.name || entry.file}${ver}${desc}`);
    }
  }

  if (typesWithEntries.length === 0) {
    console.log(`\u2514\u2500\u2500 \x1b[2m(empty)\x1b[0m`);
  }
}
