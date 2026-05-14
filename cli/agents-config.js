// Coding agent path configurations for artifact installation.
// Verified against official documentation as of May 2026.
//
// Sources:
//   Claude Code: https://code.claude.com/docs/en/skills
//   Gemini CLI:  https://geminicli.com/docs/cli/skills/
//   Cursor IDE:  https://cursor.com/docs/rules
//   Codex CLI:   https://developers.openai.com/codex/skills + https://developers.openai.com/codex/rules
//   Qwen Code:   https://github.com/QwenLM/qwen-code
//   Open Code:   https://opencode.ai/docs/skills/

import { homedir } from "os";
import { join } from "path";

const HOME = homedir();

export const CODING_AGENTS = {
  claude: {
    name: "Claude Code",
    paths: {
      // Skills are directories with SKILL.md inside: ~/.claude/skills/<name>/SKILL.md
      agents:   { global: join(HOME, ".claude", "skills"),   local: join(".claude", "skills") },
      skills:   { global: join(HOME, ".claude", "skills"),   local: join(".claude", "skills") },
      rules:    { global: join(HOME, ".claude", "rules"),    local: join(".claude", "rules") },
      prompts:  { global: join(HOME, ".claude", "skills"),   local: join(".claude", "skills") },
      memories: { global: null,                              local: null, note: "Auto-managed by Claude Code" },
    },
    // Skills install as <name>/SKILL.md directory structure
    skillAsDir: true,
    skillFilename: "SKILL.md",
  },
  gemini: {
    name: "Gemini CLI",
    // Skills: ~/.gemini/skills/ (user) and .gemini/skills/ (workspace)
    // Also aliased at ~/.agents/skills/ and .agents/skills/
    // Uses SKILL.md format like Claude Code
    paths: {
      agents:   { global: join(HOME, ".gemini", "skills"),   local: join(".gemini", "skills") },
      skills:   { global: join(HOME, ".gemini", "skills"),   local: join(".gemini", "skills") },
      rules:    { global: null,                              local: join(".gemini", "skills"), note: "Rules as skills" },
      prompts:  { global: join(HOME, ".gemini", "skills"),   local: join(".gemini", "skills") },
      memories: { global: null,                              local: null, note: "Managed cloud context" },
    },
    skillAsDir: true,
    skillFilename: "SKILL.md",
  },
  qwen: {
    name: "Qwen Code",
    // Same SKILL.md format as Claude Code
    paths: {
      agents:   { global: join(HOME, ".qwen", "skills"),     local: join(".qwen", "skills") },
      skills:   { global: join(HOME, ".qwen", "skills"),     local: join(".qwen", "skills") },
      rules:    { global: null,                              local: join(".qwen", "skills") },
      prompts:  { global: join(HOME, ".qwen", "skills"),     local: join(".qwen", "skills") },
      memories: { global: null,                              local: null, note: "Managed by Qwen Code" },
    },
    skillAsDir: true,
    skillFilename: "SKILL.md",
  },
  opencode: {
    name: "Open Code",
    // Loads from multiple paths: ~/.config/opencode/, ~/.claude/, ~/.agents/
    paths: {
      agents:   { global: join(HOME, ".config", "opencode", "agents"),  local: join(".opencode", "agents") },
      skills:   { global: join(HOME, ".config", "opencode", "skills"),  local: join(".opencode", "skills") },
      rules:    { global: null,                                          local: join(".opencode", "rules") },
      prompts:  { global: join(HOME, ".config", "opencode", "skills"),  local: join(".opencode", "skills") },
      memories: { global: null,                                          local: null, note: "SQLite (project-aware)" },
    },
    skillAsDir: true,
    skillFilename: "SKILL.md",
  },
  codex: {
    name: "Codex CLI",
    // Skills: ~/.agents/skills/ (user), .agents/skills/ (project), /etc/codex/skills (admin)
    // Uses SKILL.md directory format like Claude Code
    // Rules: ~/.codex/rules/*.rules (Starlark format — not markdown, cannot install directly)
    // Source: https://developers.openai.com/codex/skills, https://developers.openai.com/codex/rules
    paths: {
      agents:   { global: join(HOME, ".agents", "skills"),   local: join(".agents", "skills") },
      skills:   { global: join(HOME, ".agents", "skills"),   local: join(".agents", "skills") },
      rules:    { global: null,                              local: null, note: "Codex uses .rules (Starlark format)" },
      prompts:  { global: join(HOME, ".agents", "skills"),   local: join(".agents", "skills") },
      memories: { global: null,                              local: null, note: "Managed via config.toml" },
    },
    skillAsDir: true,
    skillFilename: "SKILL.md",
  },
  cursor: {
    name: "Cursor IDE",
    // Rules in .cursor/rules/ as .mdc files; can also load Claude skills
    paths: {
      agents:   { global: join(HOME, ".cursor", "skills"),   local: join(".cursor", "skills") },
      skills:   { global: join(HOME, ".cursor", "skills"),   local: join(".cursor", "skills") },
      rules:    { global: null,                              local: join(".cursor", "rules"), ext: ".mdc" },
      prompts:  { global: null,                              local: join(".cursor", "rules"), ext: ".mdc" },
      memories: { global: null,                              local: null, note: "Project Index (SQLite)" },
    },
  },
  ihub: {
    name: "ihub (default)",
    paths: {
      agents:   { global: join(HOME, ".claude", "agents"),   local: "agents" },
      skills:   { global: join(HOME, ".claude", "skills"),   local: "skills" },
      rules:    { global: join(HOME, ".claude", "rules"),    local: "rules" },
      prompts:  { global: null,                              local: "prompts" },
      memories: { global: null,                              local: "memories" },
    },
  },
};

export const AGENT_NAMES = Object.keys(CODING_AGENTS);

/**
 * Get the install path for a given agent, artifact type, and scope.
 * Returns { path, note, ext, skillAsDir, skillFilename } or null if not supported.
 */
export function getInstallPath(agent, artifactType, scope) {
  const config = CODING_AGENTS[agent];
  if (!config) return null;

  const typeMap = {
    agent: "agents", agents: "agents",
    skill: "skills", skills: "skills",
    rule: "rules", rules: "rules",
    prompt: "prompts", prompts: "prompts",
    memory: "memories", memories: "memories",
  };
  const type = typeMap[artifactType] || artifactType;

  const paths = config.paths[type];
  if (!paths) return null;

  const dir = scope === "global" ? paths.global : paths.local;
  if (!dir) return {
    path: null,
    note: paths.note || `Not supported for ${scope} install`,
    ext: paths.ext,
    appendTo: config.appendTo,
  };

  return {
    path: dir,
    note: paths.note,
    ext: paths.ext || ".md",
    skillAsDir: config.skillAsDir,
    skillFilename: config.skillFilename,
  };
}
