// Plugin pinning and bundle / marketplace export-import.
import { resolve, dirname, join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { loadConfig, saveConfig, pullEntry } from "./registry.js";
import { loadPlugin } from "./parse.js";
import { marketplacePluginEntry, writeMarketplaceJson, pushPlugin } from "./publish.js";

function pinKeyFor(name) { return `plugins/${name}`; }

export function pin(args, ROOT) {
  const [name, versionArg] = args;
  if (!name) {
    console.error("Usage: ihub pin <name> [version]");
    process.exit(1);
  }

  let pinVersion = versionArg;
  if (!pinVersion) {
    const entry = loadPlugin(resolve(ROOT, "plugins", name));
    if (entry && entry.version) {
      pinVersion = entry.version;
    } else {
      console.error("No version specified and no local version found. Usage: ihub pin <name> <version>");
      process.exit(1);
    }
  }

  const config = loadConfig();
  if (!config.pins) config.pins = {};
  const key = pinKeyFor(name);
  config.pins[key] = pinVersion;
  saveConfig(config);
  console.log(`Pinned ${key} to ${pinVersion}`);
}

export function unpin(args) {
  const [name] = args;
  if (!name) {
    console.error("Usage: ihub unpin <name>");
    process.exit(1);
  }
  const config = loadConfig();
  const key = pinKeyFor(name);
  if (!config.pins || !config.pins[key]) {
    console.error(`Not pinned: ${key}`);
    process.exit(1);
  }
  delete config.pins[key];
  if (Object.keys(config.pins).length === 0) delete config.pins;
  saveConfig(config);
  console.log(`Unpinned ${key} (will pull latest on next pull)`);
}

export function pins() {
  const config = loadConfig();
  const pinned = config.pins || {};
  const entries = Object.entries(pinned);
  if (entries.length === 0) {
    console.log("No pinned plugins.");
    return;
  }
  console.log(`\nPinned plugins (${entries.length}):\n`);
  for (const [key, ver] of entries) console.log(`  ${key} → ${ver}`);
  console.log();
}

// --- Export ---

// Fetch full plugin entries (meta + body + attachments WITH base64 content)
// from a registry base. Returns [{ name, version, description, meta, body,
// attachments:[{filepath, content}] }].
async function gatherPlugins(base, token, { projectFilter, nameFilters }) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let list = [];
  try {
    const url = projectFilter
      ? `${base}/api/plugins?project=${encodeURIComponent(projectFilter)}`
      : `${base}/api/plugins`;
    const res = await fetch(url, { headers });
    if (res.ok) list = await res.json();
  } catch { /* offline */ }
  if (!Array.isArray(list)) list = [];

  const out = [];
  for (const e of list) {
    const name = e.name || e.meta?.name;
    if (!name) continue;
    const meta = typeof e.meta === "string" ? safeJson(e.meta) : (e.meta || {});
    if (projectFilter && meta.project !== projectFilter && e.project !== projectFilter) continue;
    if (nameFilters.length && !nameFilters.includes(name)) continue;

    let full;
    try { full = await pullEntry("plugins", name); } catch { continue; }
    const fullMeta = full.meta || {};

    const attachments = [];
    for (const att of full.attachments || []) {
      try {
        const ares = await fetch(`${base}/api/plugins/${name}/attachments/${att.filepath}`, { headers });
        if (!ares.ok) continue;
        const buf = Buffer.from(await ares.arrayBuffer());
        attachments.push({ filepath: att.filepath, content: buf.toString("base64") });
      } catch { /* skip */ }
    }
    out.push({
      name,
      version: fullMeta.version || e.version || "0.1.0",
      description: fullMeta.description || e.description || "",
      meta: fullMeta,
      body: full.body || "",
      attachments,
    });
  }
  return out;
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

export async function exportBundle(args, ROOT) {
  let projectFilter = null, outputPath = null, fromUrl = null, format = "json", outDir = null;
  const nameFilters = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) projectFilter = args[++i];
    else if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) outputPath = args[++i];
    else if (args[i] === "--name" && args[i + 1]) nameFilters.push(args[++i]);
    else if (args[i] === "--from" && args[i + 1]) fromUrl = args[++i];
    else if (args[i] === "--format" && args[i + 1]) format = args[++i];
    else if (args[i] === "--out" && args[i + 1]) outDir = args[++i];
  }

  const validFormats = ["json", "claude-plugin", "marketplace"];
  if (!validFormats.includes(format)) {
    console.error(`Unknown format: ${format} (valid: json, claude-plugin)`);
    process.exit(1);
  }
  const isMarketplace = format === "claude-plugin" || format === "marketplace";
  if (isMarketplace && !outDir) {
    console.error("Missing --out <dir> for marketplace export.");
    console.error("Usage: ihub export --format claude-plugin --out <dir> [--project P] [--name N]");
    process.exit(1);
  }

  const config = loadConfig();
  const base = (fromUrl || config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
  const token = fromUrl ? "" : (config.token || process.env.IHUB_TOKEN || "");
  if (fromUrl) console.error(`Exporting from: ${base}`);

  const plugins = await gatherPlugins(base, token, { projectFilter, nameFilters });

  if (isMarketplace) {
    const dest = resolve(outDir);
    const ownerName = plugins.map((p) => (typeof p.meta.author === "object" ? p.meta.author?.name : p.meta.author)).find(Boolean) || "ihub";
    const marketName = projectFilter ? `${kebab(projectFilter)}-plugins` : "ihub-export";
    const entries = [];
    for (const p of plugins) {
      const pluginDest = join(dest, "plugins", p.name);
      writePluginFilesFromContent(pluginDest, p);
      entries.push(marketplacePluginEntry(p.name, p.meta));
    }
    writeMarketplaceJson(dest, { name: marketName, ownerName }, entries);
    console.log(`Exported ${plugins.length} plugin(s) to ${dest} (claude-plugin marketplace)`);
    return;
  }

  // JSON bundle (self-contained: includes attachment content).
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  const bundle = {
    ihub_version: pkg.version,
    exported_at: new Date().toISOString(),
    source: base,
    filters: {
      ...(projectFilter && { project: projectFilter }),
      ...(nameFilters.length && { names: nameFilters }),
    },
    artifacts: plugins.map((p) => ({
      type: "plugin",
      name: p.name,
      version: p.version,
      description: p.description,
      meta: p.meta,
      body: p.body,
      attachments: p.attachments,
    })),
  };
  const json = JSON.stringify(bundle, null, 2);
  if (outputPath) {
    writeFileSync(outputPath, json + "\n");
    console.log(`Exported ${plugins.length} plugin(s) to ${outputPath}`);
  } else {
    console.log(json);
  }
}

function kebab(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

// Write a plugin's files (base64 attachment content) + README + plugin.json.
function writePluginFilesFromContent(destDir, entry) {
  for (const att of entry.attachments || []) {
    const p = resolve(destDir, att.filepath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, Buffer.from(att.content, "base64"));
  }
  if (entry.body && entry.body.trim()) {
    writeFileSync(resolve(destDir, "README.md"), entry.body.endsWith("\n") ? entry.body : entry.body + "\n");
  }
  const manifestPath = resolve(destDir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    const { components, ...manifest } = entry.meta || {};
    if (!manifest.name) manifest.name = entry.name;
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
}

// --- Import bundle ---

export async function importBundle(args, ROOT) {
  const noPush = args.includes("--no-push");
  const filtered = args.filter((a) => a !== "--no-push");
  const [filePath] = filtered;
  if (!filePath) {
    console.error("Usage: ihub import <file.json> [--no-push]");
    process.exit(1);
  }
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  let bundle;
  try {
    bundle = JSON.parse(readFileSync(absPath, "utf-8"));
  } catch (err) {
    console.error(`Failed to parse bundle: ${err.message}`);
    process.exit(1);
  }
  if (!bundle.artifacts || !Array.isArray(bundle.artifacts)) {
    console.error("Invalid bundle: missing artifacts array");
    process.exit(1);
  }

  console.log(`Importing bundle (${bundle.artifacts.length} plugin(s), ihub v${bundle.ihub_version || "unknown"})`);

  for (const artifact of bundle.artifacts) {
    const { name, meta, body, attachments } = artifact;
    if (!name) { console.error("  Skipping invalid artifact (missing name)"); continue; }

    const dest = resolve(ROOT, "plugins", name);
    writePluginFilesFromContent(dest, { name, meta: meta || {}, body: body || "", attachments: attachments || [] });
    console.log(`  Saved plugins/${name} → ${dest}`);

    if (!noPush) {
      try {
        const entry = loadPlugin(dest);
        if (entry) {
          const { result } = await pushPlugin(entry);
          console.log(`  Pushed plugins/${name}@${result.version}`);
        }
      } catch (err) {
        console.error(`  Push failed for plugins/${name}: ${err.message}`);
      }
    }
  }

  console.log(`\nImport complete. ${bundle.artifacts.length} plugin(s) processed.`);
}
