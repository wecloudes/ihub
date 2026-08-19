// Plugin install targets.
//
// A plugin is a Claude Code plugin (a directory of components). ihub pulls a
// whole plugin and drops it, unchanged, into the Claude Code plugin location —
// or assembles a local marketplace the user can add. The old coding-agent ×
// artifact-type matrix is gone: plugins are Claude-native and install as a
// directory, not as per-agent transformed files.
//
// Source: https://code.claude.com/docs/en/plugins-reference

import { homedir } from "os";
import { join } from "path";

const HOME = homedir();

// Where a pulled plugin directory lands.
//   global — personal Claude plugin cache (~/.claude/plugins/<name>)
//   local  — project-scoped plugin dir (./.claude/plugins/<name>)
export const PLUGIN_PATHS = {
  global: join(HOME, ".claude", "plugins"),
  local: join(".claude", "plugins"),
};

/**
 * Root directory a plugin installs into for the given scope.
 * The plugin's own <name>/ subdirectory is created under this.
 */
export function pluginInstallDir(scope = "global") {
  return scope === "local" ? PLUGIN_PATHS.local : PLUGIN_PATHS.global;
}

// Minimal residual exports. Plugins are Claude Code native, so the multi-agent
// registry has collapsed to a single entry. Kept so callers that still import
// these names (e.g. the TUI) keep loading.
export const CODING_AGENTS = {
  claude: { name: "Claude Code" },
};
export const AGENT_NAMES = Object.keys(CODING_AGENTS);

/**
 * Install location for a plugin. Signature kept compatible with prior callers
 * (agent/type args are ignored — there is one target).
 * Returns { path, isDir: true }.
 */
export function getInstallPath(_agent, _type, scope) {
  return { path: pluginInstallDir(scope === "global" ? "global" : "local"), isDir: true };
}

/**
 * No per-agent shared-config merge target anymore — MCP/hook config travels
 * inside the plugin's own .mcp.json / hooks/hooks.json. Kept for signature
 * stability; always reports unsupported.
 */
export function getConfigTarget() {
  return { note: "MCP and hook config live inside the plugin (.mcp.json / hooks/hooks.json)" };
}
