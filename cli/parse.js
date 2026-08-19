import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, basename } from "path";

/**
 * Parse YAML frontmatter from a markdown string.
 * Handles simple YAML (strings, arrays, booleans, numbers) without dependencies.
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { meta: {}, body: content };

  const yamlStr = match[1];
  const body = content.slice(match[0].length).trim();
  const meta = {};

  for (const line of yamlStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // inline array: [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (value === "true") {
      value = true;
    } else if (value === "false") {
      value = false;
    } else if (value !== "" && !isNaN(Number(value))) {
      value = Number(value);
    }

    meta[key] = value;
  }

  return { meta, body };
}

// Recursively collect every file under `dir`, returning plugin-relative paths.
// `exclude(relPath)` may skip files (e.g. the README, which becomes the body).
export function collectFiles(dir, baseDir, result = [], exclude = () => false) {
  let names;
  try { names = readdirSync(dir); } catch { return result; }
  for (const name of names) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      collectFiles(full, baseDir, result, exclude);
    } else {
      const filepath = relative(baseDir, full).split("\\").join("/");
      if (exclude(filepath)) continue;
      result.push({ filepath, abspath: full });
    }
  }
  return result;
}

// Read a plugin JSON config that may be wrapped (`{ mcpServers: {...} }`,
// `{ hooks: {...} }`) or flat (`{ "<key>": {...} }`). Returns the inner object.
export function unwrapConfig(obj, wrapperKey) {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    if (obj[wrapperKey] && typeof obj[wrapperKey] === "object") return obj[wrapperKey];
    return obj;
  }
  return {};
}

/**
 * Summarize the components a plugin directory contains.
 * Returns { skills, commands, agents, mcpServers, hooks } — arrays of names/events.
 */
export function collectPluginComponents(pluginDir) {
  const components = { skills: [], commands: [], agents: [], mcpServers: [], hooks: [] };

  // skills/<name>/SKILL.md
  const skillsDir = join(pluginDir, "skills");
  try {
    for (const name of readdirSync(skillsDir)) {
      const p = join(skillsDir, name);
      if (statSync(p).isDirectory() && existsSync(join(p, "SKILL.md"))) {
        components.skills.push(name);
      }
    }
  } catch { /* no skills dir */ }

  // commands/*.md (may be nested)
  components.commands = collectFiles(join(pluginDir, "commands"), join(pluginDir, "commands"))
    .filter((f) => f.filepath.endsWith(".md"))
    .map((f) => f.filepath.replace(/\.md$/, ""));

  // agents/*.md (may be nested)
  components.agents = collectFiles(join(pluginDir, "agents"), join(pluginDir, "agents"))
    .filter((f) => f.filepath.endsWith(".md"))
    .map((f) => f.filepath.replace(/\.md$/, ""));

  // .mcp.json → server names
  const mcpPath = join(pluginDir, ".mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const servers = unwrapConfig(JSON.parse(readFileSync(mcpPath, "utf-8")), "mcpServers");
      components.mcpServers = Object.keys(servers);
    } catch { /* invalid — validate reports it */ }
  }

  // hooks/hooks.json → event names
  const hooksPath = join(pluginDir, "hooks", "hooks.json");
  if (existsSync(hooksPath)) {
    try {
      const events = unwrapConfig(JSON.parse(readFileSync(hooksPath, "utf-8")), "hooks");
      components.hooks = Object.keys(events);
    } catch { /* invalid — validate reports it */ }
  }

  return components;
}

/**
 * Load a single plugin directory into an entry object, or null if it has no
 * `.claude-plugin/plugin.json`. Entry shape (flat manifest + derived fields):
 *   { name, file, dir, path, manifestPath, ...manifestFields,
 *     components, files:[{filepath, abspath}], body }
 */
export function loadPlugin(pluginDir) {
  const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return null;

  let manifest = {};
  let manifestError = null;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    manifestError = err.message;
  }

  const dirName = basename(pluginDir);
  const name = manifest.name || dirName;

  const readmePath = join(pluginDir, "README.md");
  const body = existsSync(readmePath) ? readFileSync(readmePath, "utf-8").trim() : "";

  const components = collectPluginComponents(pluginDir);

  // Attachments = every file except the root README.md (that becomes the body).
  const files = collectFiles(pluginDir, pluginDir, [], (rel) => rel === "README.md");

  // author may be an object {name,email} in plugin.json — flatten to a string
  // for list/tree display while keeping the raw value under _author.
  const authorStr = typeof manifest.author === "object" && manifest.author
    ? manifest.author.name || ""
    : manifest.author || "";

  return {
    ...manifest,
    name,
    file: name,
    dir: dirName,
    path: pluginDir,
    manifestPath,
    manifestError,
    author: authorStr,
    _author: manifest.author,
    // keywords double as tags for search/list
    tags: Array.isArray(manifest.keywords) ? manifest.keywords : (manifest.tags || []),
    components,
    files,
    body,
  };
}

/**
 * Load every plugin under `<root>/plugins/`.
 */
export function loadPlugins(root) {
  const dir = join(root, "plugins");
  const plugins = [];
  let names;
  try { names = readdirSync(dir); } catch { return plugins; }
  for (const name of names) {
    const pluginDir = join(dir, name);
    let st;
    try { st = statSync(pluginDir); } catch { continue; }
    if (!st.isDirectory()) continue;
    const entry = loadPlugin(pluginDir);
    if (entry) plugins.push(entry);
  }
  return plugins;
}

/**
 * Load the full registry from the project root. Single type: plugins.
 */
export function loadRegistry(root) {
  return {
    plugins: loadPlugins(root),
  };
}
