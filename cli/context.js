import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");

export const TYPE_FIELDS = {
  agent: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "inputs", label: "Inputs (comma-separated)", type: "array" },
    { key: "outputs", label: "Outputs (comma-separated)", type: "array" },
    { key: "skills", label: "Skills (comma-separated)", type: "array" },
    { key: "rules", label: "Rules (comma-separated)", type: "array" },
    { key: "memories", label: "Memories (comma-separated)", type: "array" },
    { key: "prompts", label: "Prompts (comma-separated)", type: "array" },
    { key: "commands", label: "Commands (comma-separated)", type: "array" },
    { key: "mcps", label: "MCP servers (comma-separated)", type: "array" },
    { key: "hooks", label: "Hooks (comma-separated)", type: "array" },
  ],
  skill: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "triggers", label: "Triggers (comma-separated)", type: "array" },
    { key: "args", label: "Arguments (comma-separated)", type: "array" },
    { key: "compatible_agents", label: "Compatible agents (comma-separated)", type: "array" },
  ],
  rule: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "scope", label: "Scope", type: "string", default: "global" },
    { key: "severity", label: "Severity (error/warning/info)", type: "string", default: "error" },
    { key: "globs", label: "File globs (e.g. src/**/*.{js,ts})", type: "string" },
    { key: "applies_to", label: "Applies to agents (comma-separated)", type: "array" },
  ],
  memory: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "scope", label: "Scope", type: "string", default: "global" },
    { key: "context_type", label: "Context type (memory/preference/decision/insight)", type: "string", default: "memory" },
    { key: "related", label: "Related entries (comma-separated)", type: "array" },
  ],
  prompt: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "model", label: "Target model", type: "string" },
    { key: "compatible_agents", label: "Compatible agents (comma-separated)", type: "array" },
    { key: "memories", label: "Memories (comma-separated)", type: "array" },
  ],
  command: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "trigger", label: "Trigger (e.g. /commit)", type: "string" },
    { key: "agent", label: "Agent this command invokes", type: "string" },
    { key: "skills", label: "Skills (comma-separated)", type: "array" },
    { key: "prompts", label: "Prompts (comma-separated)", type: "array" },
    { key: "args", label: "Arguments (comma-separated)", type: "array" },
    { key: "compatible_agents", label: "Compatible agents (comma-separated)", type: "array" },
  ],
  design: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "platform", label: "Platform (web/mobile/desktop)", type: "string" },
    { key: "component_type", label: "Component type (page/component/layout/token/style-guide)", type: "string" },
    { key: "design_system", label: "Design system name", type: "string" },
    { key: "format", label: "Format (figma/sketch/html/css/svg)", type: "string" },
  ],
  // mcp/hook configs live in a fenced ```json block in the body (Claude-native
  // shape) — frontmatter carries metadata only
  mcp: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "compatible_agents", label: "Compatible agents (comma-separated)", type: "array" },
  ],
  hook: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "compatible_agents", label: "Compatible agents (comma-separated)", type: "array" },
  ],
};

export const VALID_HOOK_EVENTS = [
  "PreToolUse", "PostToolUse", "UserPromptSubmit", "Notification",
  "Stop", "SubagentStop", "SessionStart", "SessionEnd", "PreCompact",
];

// Uniform frontmatter ref checks for `validate`: [field, registryKey, singularLabel].
// Each array field must reference an existing entry in the corresponding registry type.
// compatible_agents/applies_to have special-case logic and are checked separately.
export const REF_CHECKS = [
  ["skills", "skills", "skill"],
  ["rules", "rules", "rule"],
  ["memories", "memories", "memory"],
  ["prompts", "prompts", "prompt"],
  ["mcps", "mcps", "mcp"],
  ["hooks", "hooks", "hook"],
];

export const PLURAL_MAP = {
  agent: "agents", skill: "skills", rule: "rules",
  memory: "memories", prompt: "prompts",
  command: "commands", design: "designs",
  mcp: "mcps", hook: "hooks",
};
export const SINGULAR_MAP = Object.fromEntries(
  Object.entries(PLURAL_MAP).map(([s, p]) => [p, s])
);
export const TYPE_ALIASES = {
  ...PLURAL_MAP,
  agents: "agents", skills: "skills", rules: "rules",
  memories: "memories", prompts: "prompts",
  commands: "commands", designs: "designs",
  mcps: "mcps", hooks: "hooks",
};

export function pluralize(type) {
  return PLURAL_MAP[type] || TYPE_ALIASES[type] || type;
}

export function singularize(type) {
  return SINGULAR_MAP[type] || type;
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
