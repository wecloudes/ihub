import { resolve, dirname, join } from "path";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, statSync,
  readdirSync, cpSync, watch as fsWatch,
} from "fs";
import { pluginInstallDir } from "./agents-config.js";
import { maskSensitiveData, formatFindings } from "../server/sensitive.js";
import {
  pullEntry, removeEntry, commentEntry, getEntryComments,
  downloadAttachment, loadConfig, headers,
  getBaseUrl, getToken, jsonHeaders,
} from "./registry.js";
import { loadPlugin, loadPlugins, unwrapConfig } from "./parse.js";
import { ROOT, prompt, closeReadline, parseJsonFlag } from "./context.js";

const TEXT_EXT = new Set([
  ".md", ".json", ".txt", ".js", ".ts", ".mjs", ".cjs", ".sh", ".bash",
  ".py", ".rb", ".yaml", ".yml", ".toml", ".env", ".mdc",
]);
function isTextPath(p) {
  const dot = p.lastIndexOf(".");
  return dot !== -1 && TEXT_EXT.has(p.slice(dot).toLowerCase());
}

// Build the registry entry meta from a plugin's manifest + derived components.
function buildPluginMeta(entry) {
  let manifest = {};
  try { manifest = JSON.parse(readFileSync(entry.manifestPath, "utf-8")); } catch { /* validated elsewhere */ }
  return { ...manifest, components: entry.components };
}

/**
 * Pack a local plugin directory into an entry + attachments and POST it.
 * Masks sensitive data in the README (body) and every text attachment before
 * upload. Returns { result, findings }.
 */
export async function pushPlugin(entry) {
  const base = getBaseUrl();
  const name = entry.name;
  const findings = [];

  const attachments = [];
  for (const f of entry.files) {
    let buf = readFileSync(f.abspath);
    if (isTextPath(f.filepath)) {
      const { maskedContent, findings: fnd } = maskSensitiveData(buf.toString("utf-8"));
      if (fnd.length) { findings.push(...fnd); buf = Buffer.from(maskedContent, "utf-8"); }
    }
    attachments.push({ filepath: f.filepath, content: buf.toString("base64") });
  }

  let body = entry.body || "";
  const { maskedContent, findings: bfnd } = maskSensitiveData(body);
  if (bfnd.length) { findings.push(...bfnd); body = maskedContent; }

  const meta = buildPluginMeta(entry);

  const res = await fetch(`${base}/api/plugins/${name}`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      version: meta.version || "0.1.0",
      description: meta.description || "",
      tags: Array.isArray(meta.keywords) ? meta.keywords : (meta.tags || []),
      meta,
      body,
      author: typeof meta.author === "object" ? (meta.author?.name || "") : (meta.author || ""),
      attachments,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Push failed: ${res.status}`);
  return { result: data, findings };
}

export async function push(args) {
  const force = args.includes("--force");
  const filtered = args.filter((a) => a !== "--force");
  const [name] = filtered;
  if (!name) {
    console.error("Usage: ihub push <name> [--force]");
    process.exit(1);
  }

  const pluginDir = resolve(ROOT, "plugins", name);
  const entry = loadPlugin(pluginDir);
  if (!entry) {
    console.error(`Not found locally: plugins/${name} (missing .claude-plugin/plugin.json)`);
    process.exit(1);
  }
  if (entry.manifestError) {
    console.error(`Invalid plugin.json in plugins/${name}: ${entry.manifestError}`);
    process.exit(1);
  }

  if (!force) {
    const diffShown = await showPushDiff(name, entry);
    if (diffShown) {
      const answer = await prompt("Proceed with push? [y/N]: ", "n");
      if (!/^y(es)?$/i.test(answer)) {
        closeReadline();
        console.log("Push cancelled.");
        return;
      }
      closeReadline();
    }
  }

  const { result, findings } = await pushPlugin(entry);
  console.log(`Pushed plugins/${name}@${result.version}` + (result.attachments ? ` (+${result.attachments} files)` : ""));

  if (findings.length > 0) {
    console.log(formatFindings(findings));
    console.log(`\x1b[41m\x1b[37m\x1b[1m ⚠ BLOCKED \x1b[0m ${findings.length} sensitive value(s) masked — plugin requires admin approval`);
    console.log(`\x1b[2mAn admin must run: ihub admin approve plugins/${name}\x1b[0m`);
  }
}

export async function showPushDiff(name, localEntry) {
  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}/api/plugins/${name}`, { headers: jsonHeaders() });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`\n\x1b[32mNew plugin\x1b[0m — plugins/${name} does not exist on registry yet.\n`);
        return false;
      }
      return false;
    }
    const remote = await res.json();
    const rMeta = remote.meta || {};
    let hasDiff = false;

    const metaChanges = [];
    if ((rMeta.description || remote.description || "") !== (localEntry.description || "")) {
      metaChanges.push(`  description: "${rMeta.description || remote.description || ""}" -> "${localEntry.description || ""}"`);
    }
    if ((rMeta.version || remote.version) !== (localEntry.version || "0.1.0")) {
      metaChanges.push(`  version: ${rMeta.version || remote.version} -> ${localEntry.version || "0.1.0"}`);
    }
    const rComp = rMeta.components || {};
    const summarize = (c) => ["skills", "commands", "agents", "mcpServers", "hooks"]
      .map((k) => `${k}:${(c?.[k] || []).length}`).join(" ");
    if (summarize(rComp) !== summarize(localEntry.components)) {
      metaChanges.push(`  components: [${summarize(rComp)}] -> [${summarize(localEntry.components)}]`);
    }
    if (metaChanges.length) {
      hasDiff = true;
      console.log(`\n\x1b[1mChanges:\x1b[0m`);
      for (const c of metaChanges) console.log(`\x1b[33m~${c}\x1b[0m`);
    }

    const diffLines = computeSimpleDiff((remote.body || "").split("\n"), (localEntry.body || "").split("\n"));
    if (diffLines.length) {
      hasDiff = true;
      console.log(`\n\x1b[1mREADME changes:\x1b[0m`);
      for (const line of diffLines) {
        if (line.startsWith("+")) console.log(`\x1b[32m${line}\x1b[0m`);
        else if (line.startsWith("-")) console.log(`\x1b[31m${line}\x1b[0m`);
        else console.log(line);
      }
    }

    if (!hasDiff) console.log(`\n\x1b[2mNo changes detected — content is identical to remote.\x1b[0m\n`);
    else console.log("");
    return hasDiff;
  } catch {
    return false;
  }
}

export function computeSimpleDiff(oldLines, newLines) {
  const result = [];
  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi >= oldLines.length) { result.push(`+ ${newLines[ni]}`); ni++; }
    else if (ni >= newLines.length) { result.push(`- ${oldLines[oi]}`); oi++; }
    else if (oldLines[oi] === newLines[ni]) { oi++; ni++; }
    else {
      let foundInNew = -1;
      for (let k = ni + 1; k < Math.min(ni + 5, newLines.length); k++) {
        if (newLines[k] === oldLines[oi]) { foundInNew = k; break; }
      }
      let foundInOld = -1;
      for (let k = oi + 1; k < Math.min(oi + 5, oldLines.length); k++) {
        if (oldLines[k] === newLines[ni]) { foundInOld = k; break; }
      }
      if (foundInNew !== -1 && (foundInOld === -1 || foundInNew - ni <= foundInOld - oi)) {
        while (ni < foundInNew) { result.push(`+ ${newLines[ni]}`); ni++; }
      } else if (foundInOld !== -1) {
        while (oi < foundInOld) { result.push(`- ${oldLines[oi]}`); oi++; }
      } else {
        result.push(`- ${oldLines[oi]}`); result.push(`+ ${newLines[ni]}`); oi++; ni++;
      }
    }
  }
  return result;
}

// --- Recreate a plugin directory from a registry entry ---

/**
 * Materialize a pulled plugin entry into `destPluginDir`: download every
 * attachment to its plugin-relative path, write README.md from the body, and
 * synthesize plugin.json from meta if it was not among the attachments.
 * opts.skipHooks omits hooks/ files (declined hook confirmation).
 */
export async function writePluginDir(destPluginDir, name, entry, opts = {}) {
  const attachments = entry.attachments || [];
  for (const att of attachments) {
    if (opts.skipHooks && att.filepath.startsWith("hooks/")) continue;
    const content = await downloadAttachment("plugins", name, att.filepath);
    const p = resolve(destPluginDir, att.filepath);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }

  if (entry.body && entry.body.trim()) {
    const readme = entry.body.endsWith("\n") ? entry.body : entry.body + "\n";
    writeFileSync(resolve(destPluginDir, "README.md"), readme);
  }

  const manifestPath = resolve(destPluginDir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    const meta = entry.meta || {};
    const { components, ...manifest } = meta;
    if (!manifest.name) manifest.name = name;
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
}

// Build a marketplace plugin listing entry.
export function marketplacePluginEntry(name, meta = {}) {
  const author = typeof meta.author === "string" ? { name: meta.author } : meta.author;
  return {
    name,
    source: `./plugins/${name}`,
    description: meta.description || "",
    version: meta.version || "0.1.0",
    ...(author && author.name && { author }),
  };
}

/**
 * Upsert plugin listing entries into `<outDir>/.claude-plugin/marketplace.json`,
 * creating the file if missing. Existing (non-matching) plugins are preserved.
 */
export function writeMarketplaceJson(outDir, { name = "ihub-export", ownerName = "ihub" } = {}, pluginEntries = []) {
  const mkPath = join(outDir, ".claude-plugin", "marketplace.json");
  let marketplace = {
    name,
    description: "Plugins exported from an ihub registry",
    owner: { name: String(ownerName) },
    plugins: [],
  };
  if (existsSync(mkPath)) {
    try {
      const existing = JSON.parse(readFileSync(mkPath, "utf-8"));
      if (existing && typeof existing === "object") {
        marketplace = { ...marketplace, ...existing };
        marketplace.plugins = Array.isArray(existing.plugins) ? existing.plugins : [];
      }
    } catch { /* overwrite corrupt file */ }
  }
  for (const pe of pluginEntries) {
    const idx = marketplace.plugins.findIndex((p) => p && p.name === pe.name);
    if (idx !== -1) marketplace.plugins[idx] = pe;
    else marketplace.plugins.push(pe);
  }
  mkdirSync(dirname(mkPath), { recursive: true });
  writeFileSync(mkPath, JSON.stringify(marketplace, null, 2) + "\n");
}

/**
 * Hooks run shell commands — before recreating a plugin that carries a
 * hooks/hooks.json, show the commands and require confirmation unless --yes.
 * Returns true to install hooks, false to omit them.
 */
async function confirmPluginHooks(name, entry, yes) {
  const hasHooks = (entry.attachments || []).some((a) => a.filepath.startsWith("hooks/"));
  if (!hasHooks) return true;
  if (entry.verified === false) {
    console.error(`Plugin ${name}: signature verification failed — hooks not installed.`);
    return false;
  }
  let events = {};
  try {
    const content = await downloadAttachment("plugins", name, "hooks/hooks.json");
    events = unwrapConfig(JSON.parse(content.toString("utf-8")), "hooks");
  } catch { /* show best-effort */ }
  console.log(`\nPlugin ${name} contains hooks that run shell command(s):`);
  for (const [event, listRaw] of Object.entries(events)) {
    const list = Array.isArray(listRaw) ? listRaw : [listRaw];
    for (const he of list) {
      if (he?.matcher) console.log(`  matcher: ${he.matcher}`);
      for (const h of (Array.isArray(he?.hooks) ? he.hooks : [])) {
        console.log(`  ${event}: ${h.command || "(unset)"}`);
      }
    }
  }
  if (yes) return true;
  const answer = await prompt("Install these hooks? [y/N]: ", "n");
  closeReadline();
  return /^y(es)?$/i.test(answer);
}

export async function pull(args) {
  let destination;      // "local" | "global" (install scope)
  let install = false;  // --install → drop into Claude plugin dir
  let marketplaceDir = null;
  let yes = false;
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--local" || args[i] === "-l") destination = "local";
    else if (args[i] === "--global" || args[i] === "-g") destination = "global";
    else if (args[i] === "--install") install = true;
    else if (args[i] === "--marketplace" && args[i + 1]) marketplaceDir = args[++i];
    else if (args[i] === "--yes" || args[i] === "-y") yes = true;
    else filtered.push(args[i]);
  }

  const firstArg = filtered[0];
  if (firstArg && (firstArg.startsWith("http://") || firstArg.startsWith("https://"))) {
    await pullFromUrl(firstArg, { install, destination, yes });
    return;
  }

  const [nameArg] = filtered;
  if (!nameArg) {
    console.error("Usage: ihub pull <name[:version]> [--install] [--global|--local] [--marketplace <dir>] [--yes]");
    console.error("  Or:    ihub pull <url>");
    process.exit(1);
  }

  const colonIdx = nameArg.indexOf(":");
  let name, version;
  if (colonIdx !== -1) {
    name = nameArg.slice(0, colonIdx);
    const tag = nameArg.slice(colonIdx + 1);
    version = tag === "latest" ? undefined : tag;
  } else {
    name = nameArg;
  }

  // Pin (only when no explicit version)
  let pullVersion = version;
  if (!version) {
    const cfg = loadConfig();
    const pinKey = `plugins/${name}`;
    if (cfg.pins && cfg.pins[pinKey]) {
      pullVersion = cfg.pins[pinKey];
      console.log(`Pinned to ${pullVersion} (use ihub unpin to get latest)`);
    }
  }

  const entry = await pullEntry("plugins", name, pullVersion);
  const ver = entry.meta?.version || "latest";

  if (entry.verified === true) console.log("\x1b[32m✓ Signature verified\x1b[0m");
  else if (entry.verified === false) console.log("\x1b[33m⚠ Signature verification failed — plugin may have been tampered with\x1b[0m");

  const installHooks = await confirmPluginHooks(name, entry, yes);

  // Always recreate into the project working copy.
  const projectDir = resolve(ROOT, "plugins", name);
  await writePluginDir(projectDir, name, entry, { skipHooks: !installHooks });
  const compCount = Object.values(entry.meta?.components || {}).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
  console.log(`Pulled plugins/${name}@${ver} → ${projectDir}` + (compCount ? ` (${compCount} component(s))` : ""));
  if (!installHooks) console.log("  (hooks omitted — confirmation declined)");

  if (install) {
    const scope = destination === "local" ? "local" : "global";
    const target = resolve(pluginInstallDir(scope), name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(projectDir, target, { recursive: true });
    console.log(`Installed plugins/${name}@${ver} → ${target} (${scope === "global" ? "personal" : "project"})`);
  }

  if (marketplaceDir) {
    const dest = resolve(marketplaceDir);
    const pluginDest = resolve(dest, "plugins", name);
    mkdirSync(dirname(pluginDest), { recursive: true });
    cpSync(projectDir, pluginDest, { recursive: true });
    const meta = entry.meta || {};
    writeMarketplaceJson(dest, { ownerName: (typeof meta.author === "object" ? meta.author?.name : meta.author) || "ihub" },
      [marketplacePluginEntry(name, meta)]);
    console.log(`Added plugins/${name}@${ver} to marketplace → ${dest}`);
  }
}

// --- Pull from an arbitrary registry URL ---

export async function pullFromUrl(url, opts = {}) {
  const parsed = new URL(url);
  const origin = parsed.origin;
  const pathParts = parsed.pathname.split("/").filter(Boolean);

  let name = null;
  for (let i = 0; i < pathParts.length - 1; i++) {
    if (pathParts[i] === "api" && pathParts[i + 1] === "plugins" && pathParts[i + 2]) {
      name = pathParts[i + 2];
      break;
    }
  }
  if (!name && pathParts.length) name = pathParts[pathParts.length - 1];
  if (!name) {
    console.error(`Could not parse plugin name from URL: ${url}`);
    console.error("Expected format: https://registry.example.com/api/plugins/<name>");
    process.exit(1);
  }

  const res = await fetch(`${origin}/api/plugins/${name}`);
  if (!res.ok) {
    const text = await res.text();
    let errMsg; try { errMsg = JSON.parse(text).error; } catch { errMsg = `HTTP ${res.status}`; }
    throw new Error(`Pull from URL failed: ${errMsg}`);
  }
  const entry = await res.json();
  const ver = entry.meta?.version || "latest";

  const projectDir = resolve(ROOT, "plugins", name);
  // Download attachments directly from the foreign origin.
  for (const att of entry.attachments || []) {
    try {
      const ares = await fetch(`${origin}/api/plugins/${name}/attachments/${att.filepath}`);
      if (!ares.ok) continue;
      const buf = Buffer.from(await ares.arrayBuffer());
      const p = resolve(projectDir, att.filepath);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, buf);
    } catch { /* skip missing attachment */ }
  }
  if (entry.body && entry.body.trim()) {
    writeFileSync(resolve(projectDir, "README.md"), entry.body.endsWith("\n") ? entry.body : entry.body + "\n");
  }
  const manifestPath = resolve(projectDir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) {
    const meta = entry.meta || {};
    const { components, ...manifest } = meta;
    if (!manifest.name) manifest.name = name;
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  }
  console.log(`Pulled plugins/${name}@${ver} from ${parsed.host} → ${projectDir}`);
}

// --- Watch ---

export async function watch() {
  const base = getBaseUrl();
  const token = getToken();
  if (!token) {
    console.error("Not logged in. Run: ihub register <url> or ihub login <url>");
    process.exit(1);
  }

  const pluginsRoot = resolve(ROOT, "plugins");
  const debounceTimers = {};
  const ts = () => `[${new Date().toLocaleTimeString("en-GB", { hour12: false })}]`;

  console.log(`${ts()} Watching for changes in: plugins/`);
  console.log(`${ts()} Registry: ${base}`);
  console.log(`${ts()} Press Ctrl+C to stop.\n`);

  if (!existsSync(pluginsRoot)) {
    console.log(`${ts()} No plugins/ directory yet — create one with: ihub create <name>`);
    await new Promise(() => {});
    return;
  }

  fsWatch(pluginsRoot, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const pluginName = String(filename).split(/[\\/]/)[0];
    if (!pluginName) return;
    const key = pluginName;
    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(async () => {
      delete debounceTimers[key];
      const pluginDir = join(pluginsRoot, pluginName);
      const entry = loadPlugin(pluginDir);
      if (!entry) return;
      if (entry.manifestError) {
        console.log(`${ts()} ✗ ${pluginName}: invalid plugin.json — ${entry.manifestError}`);
        return;
      }
      console.log(`${ts()} Detected change in plugins/${pluginName} → pushing...`);
      try {
        const { result } = await pushPlugin(entry);
        console.log(`${ts()} ✓ Pushed plugins/${pluginName} v${result.version}`);
      } catch (err) {
        console.log(`${ts()} ✗ Push failed: ${err.message}`);
      }
    }, 500);
  });

  await new Promise(() => {});
}

// --- Remove / comments ---

export async function remove(args) {
  const [name] = args;
  if (!name) {
    console.error("Usage: ihub remove <name>");
    process.exit(1);
  }
  const result = await removeEntry("plugins", name);
  console.log(`Removed: ${result.deleted}`);
}

export async function comment(args) {
  const [name] = args;
  if (!name) {
    console.error("Usage: ihub comment <name>");
    process.exit(1);
  }
  const ratingStr = await prompt("Rating (1-5): ");
  const rating = parseInt(ratingStr, 10);
  if (!rating || rating < 1 || rating > 5) {
    console.error("Rating must be between 1 and 5.");
    process.exit(1);
  }
  const body = await prompt("Comment: ");
  if (!body) {
    console.error("Comment cannot be empty.");
    process.exit(1);
  }
  closeReadline();
  await commentEntry("plugins", name, { rating, body });
  console.log(`Comment added to plugins/${name} (${rating}/5)`);
}

export async function comments(args) {
  const { jsonMode, rest: filtered } = parseJsonFlag(args);
  const [name] = filtered;
  if (!name) {
    console.error("Usage: ihub comments <name>");
    process.exit(1);
  }
  const data = await getEntryComments("plugins", name);
  if (jsonMode) { console.log(JSON.stringify(data, null, 2)); return; }
  if (data.rating.count === 0) { console.log(`\nNo comments for plugins/${name}\n`); return; }
  console.log(`\nplugins/${name} — ${data.rating.average}/5 (${data.rating.count} review${data.rating.count !== 1 ? "s" : ""})\n`);
  for (const c of data.comments) {
    const stars = "★".repeat(c.rating) + "☆".repeat(5 - c.rating);
    console.log(`  ${stars}  @${c.username}  ${c.created_at}`);
    console.log(`  ${c.body}\n`);
  }
}
