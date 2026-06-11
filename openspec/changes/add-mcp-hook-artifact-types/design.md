# Design — add `mcp` and `hook` artifact types

## Context

ihub has 7 artifact types, all installed by writing standalone `.md` files into per-agent directories (`getInstallPath()` in `cli/agents-config.js:132`, install loop in `cli/index.js:1462-1578`, per-agent rewriting in `transformForAgent()` at `cli/index.js:1661`). MCP servers and hooks differ fundamentally: their install target is a **shared config file owned by the coding agent** (`.mcp.json`, `.cursor/mcp.json`, `.claude/settings.json`), which ihub must merge into without clobbering user content.

Constraints:
- Frontmatter parser (`cli/parse.js`) handles flat YAML only — no nested objects, no multi-line values. MCP `env`/`headers` must be flat string arrays (`KEY=value`).
- Zero external CLI dependencies — JSON merge implemented with `JSON.parse`/`JSON.stringify`, no jsonc library.
- Type lists are duplicated across ~10 locations (CLI maps, TUI, routes, federation, ui, completions); all must be extended in sync.
- Hooks execute shell commands → security gate required; signing (HMAC, `server/signing.js`) and sensitive scan already exist and get wired in, not rebuilt.

## Goals / Non-Goals

**Goals:**
- `mcp` and `hook` as first-class types in every lifecycle surface (push/pull/list/search/create/validate/export/federation/UI/TUI/completions).
- A single reusable config-merge installer both types use; declarative per-agent targets in `agents-config.js`.
- Idempotent installs; user-authored config never modified.
- Security: placeholder-only secrets in MCP configs (enforced by existing scanner), confirmation + signature gate on hook installs.

**Non-Goals:**
- Codex TOML merge (manual note instead).
- Local uninstall/unmerge (no artifact type has it today; markers make it possible later).
- Remote MCP OAuth flows; hook support for agents other than Claude Code.
- Frontmatter parser extension for nested YAML.

## Decisions

**D1 — Flat `env`/`headers` arrays over nested objects.** `env: ["GITHUB_TOKEN=${GITHUB_TOKEN}"]` keeps the simple-YAML parser untouched. The installer splits on the first `=` (or `: ` for headers) when building the JSON entry. Alternative (extend parser to nested maps) rejected: parser is used by every type and the simplicity is a documented project convention.

**D2 — New `cli/config-merge.js` module, declarative targets in `CODING_AGENTS`.** Each agent gains a `configTargets` section, e.g. `mcp: { global: "~/.claude.json", local: ".mcp.json", key: "mcpServers", shape: "standard" }` and `hook: { global: "~/.claude/settings.json", local: ".claude/settings.json", key: "hooks", shape: "claude-hooks" }`. `shape` selects a small transform function (standard mcpServers entry, OpenCode `mcp` entry with `command` array + `environment`, Claude hooks event array). Alternative (branching inside the pull command like the existing design/memory special cases) rejected: that pattern already produced 200 lines of special cases; two more types with per-agent file targets would make it unmaintainable.

**D3 — Object-key merge for MCP, marker-keyed array merge for hooks.** `mcpServers` is a name-keyed object → merging by artifact name is naturally idempotent. Claude hooks are arrays grouped by event → installed entries carry `_ihub: "hook/<name>"` so re-pull replaces in place and user entries (no marker) are never touched. Claude Code ignores unknown properties in hook entries, so the marker is safe. Alternative (track installs in `~/.ihubrc`) rejected: state drifts from reality when users edit settings by hand; the marker lives where the entry lives.

**D4 — Hook gate = display + confirm + signature.** Pull prints event/matcher/command verbatim, prompts y/N (existing `readline` prompt pattern), `--yes` bypasses the prompt only. With signing enabled, failed verification aborts regardless of `--yes`; missing signature prints a warning. Alternative (require signing for hooks unconditionally) rejected: most registries run without signing; an unconditional requirement would make the type unusable there. The default-on confirmation is the real gate.

**D5 — Transitive deps follow the existing pattern.** Agent pull already resolves `skills/rules/memories/prompts` (`cli/index.js:1582-1626`); `mcps` and `hooks` extend the same loop, with hook deps routed through the gate. Pinning works unchanged because dependency pulls already consult `cfg.pins`.

**D6 — Version bump to 0.7.0**, matching repo convention (version rides the feature commit).

## Risks / Trade-offs

- [Concurrent edits to agent config files] → merge is read-modify-write; last writer wins. Acceptable: same risk as editing settings by hand; files are small and per-developer.
- [Claude Code rejects `_ihub` marker in future schema validation] → fallback documented: key array entries by exact command match. Marker placement verified against current Claude Code settings behavior during implementation.
- [`${VAR}` expansion semantics differ per agent] → ihub writes placeholders verbatim and documents that expansion is the agent's job; the artifact body documents required env vars.
- [Type-list sprawl: 10 manual locations] → tasks include a checklist of every location from the code map; tests assert the new types appear in list/validate/server validation.
- [Hook arrays nested two levels (`hooks.<event>[].hooks[]`)] → shape function owns the structure; spec scenario covers idempotent re-pull.

## Migration Plan

Pure addition — no schema migration (entries table `type` is a free string), no existing-artifact impact. Ship CLI + server together (server VALID_TYPES must accept the new plurals before clients push them). Rollback = revert commit; merged entries in agent configs are inert if ihub is rolled back.

## Open Questions

- None blocking. Cursor global MCP path (`~/.cursor/mcp.json`) verified during implementation; if absent in older Cursor versions, global scope falls back to a note.
