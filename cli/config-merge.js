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
