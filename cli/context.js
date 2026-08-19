import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");

// The one and only artifact type. ihub publishes/pulls whole Claude Code
// plugins; the 9-type machinery (agent/command/design/hook/mcp/memory/
// prompt/rule/skill) is gone — those are now *components* inside a plugin.
export const TYPE = "plugin";
export const TYPE_PLURAL = "plugins";

// Component kinds a plugin can bundle (used for meta.components + UI trees).
export const COMPONENT_KINDS = ["skills", "commands", "agents", "mcpServers", "hooks"];

// plugin.json manifest fields prompted during `ihub create -i`.
// name is supplied positionally; description is required.
export const PLUGIN_FIELDS = [
  { key: "description", label: "Description", type: "string", required: true },
  { key: "version", label: "Version", type: "string", default: "0.1.0" },
  { key: "author", label: "Author", type: "string" },
  { key: "project", label: "Project (groups plugins in marketplace export)", type: "string" },
  { key: "keywords", label: "Keywords (comma-separated)", type: "array" },
  { key: "license", label: "License", type: "string", default: "MIT" },
  { key: "homepage", label: "Homepage URL", type: "string" },
  { key: "repository", label: "Repository URL", type: "string" },
];

// Claude Code hook events (full set as of the 2026 plugin spec).
export const VALID_HOOK_EVENTS = [
  "PreToolUse", "PostToolUse", "UserPromptSubmit", "Notification",
  "Stop", "SubagentStop", "SessionStart", "SessionEnd", "PreCompact",
];

// Plugin name rule: kebab-case, no ":" (reserved for plugin:component namespacing).
export const PLUGIN_NAME_RE = /^[a-z0-9-]+$/;

// Type-noun helpers. Plugin-only world: everything collapses to "plugins" /
// "plugin". Kept as functions so existing importers keep working unchanged.
export function pluralize() {
  return TYPE_PLURAL;
}
export function singularize() {
  return TYPE;
}

// Parse the --json flag: returns { jsonMode, rest } where rest has --json removed.
export function parseJsonFlag(args) {
  return {
    jsonMode: args.includes("--json"),
    rest: args.filter((a) => a !== "--json"),
  };
}

// --- Readline singleton ---
// Mutable state lives here only; commands import the helpers below.
let _rl;
let _lineQueue = [];
let _lineResolve = null;
let _closed = false;

export function initReadline() {
  if (_rl) return;
  _rl = createInterface({ input: process.stdin, output: process.stdout });
  _rl.on("line", (line) => {
    if (_lineResolve) {
      const resolve = _lineResolve;
      _lineResolve = null;
      resolve(line);
    } else {
      _lineQueue.push(line);
    }
  });
  _rl.on("close", () => {
    _closed = true;
    if (_lineResolve) {
      const resolve = _lineResolve;
      _lineResolve = null;
      resolve(null);
    }
  });
}

export function prompt(question, defaultValue = "") {
  initReadline();
  process.stdout.write(question);

  if (_lineQueue.length > 0) {
    const line = _lineQueue.shift();
    return Promise.resolve(line.trim() || defaultValue);
  }
  if (_closed) {
    return Promise.resolve(defaultValue);
  }

  return new Promise((resolve) => {
    _lineResolve = (line) => resolve(line === null ? defaultValue : line.trim() || defaultValue);
  });
}

export function closeReadline() {
  if (_rl) { _rl.close(); _rl = null; }
}
