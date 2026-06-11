# Add `mcp` and `hook` artifact types

## Why

An agent harness is more than prompts and skills — MCP servers and lifecycle hooks are part of the configuration that turns a raw model into a directed coding assistant. Today ihub users share skills, rules, memories, prompts, commands, and designs, but MCP server configurations and hooks must be copied by hand into each coding agent's config file. This breaks the "publish once, install everywhere" promise for two of the most impactful harness components.

## What Changes

- New `mcp` artifact type: an MCP server **installation config** (transport, command, args, env placeholders, url, headers) as a `.md` file with frontmatter; the body documents what the server does and how to set up auth. Pull merges the server definition into each target agent's native MCP config file (`.mcp.json`, `.cursor/mcp.json`, `.gemini/settings.json`, etc.).
- New `hook` artifact type: a lifecycle hook definition (event, matcher, command, timeout). Pull merges it into the agent's settings file (Claude Code `settings.json` hooks). Hooks execute shell commands, so pulls are gated: the command is always displayed, confirmation is required, and unsigned hooks warn loudly when signing is enabled on the registry.
- New shared **config-merge installer**: unlike the existing types (which write standalone files), `mcp` and `hook` install by idempotently merging JSON entries into a shared config file owned by the coding agent. Re-pulling updates the existing entry instead of duplicating it.
- Agents can declare `mcps:` and `hooks:` frontmatter arrays (parallel to `skills:`/`rules:`); `ihub validate` checks the cross-references and `ihub pull <agent>` resolves them transitively.
- Security: sensitive-data scan applies on push as with all types; MCP `env`/`headers` values must use `${VAR}` placeholders — literal secrets are blocked by the existing scanner/block flow. Hook pulls require explicit confirmation (`--yes` to skip in scripts).
- Type system extended everywhere types are enumerated: CLI maps, TUI, web UI, server routes, federation, completions, templates, man page, docs.
- `ihub create` gains `mcp` and `hook` (and fixes the existing gap where `command`/`design` are missing from create's valid types).

## Capabilities

### New Capabilities

- `mcp-artifact-type`: define, validate, push, pull, and install MCP server configs across coding agents.
- `hook-artifact-type`: define, validate, push, pull, and install lifecycle hooks with a confirmation/signing gate.
- `config-merge-install`: shared idempotent merge of artifact-provided entries into agent-owned JSON config files.

### Modified Capabilities

(none — fresh OpenSpec install, no existing specs)

## Impact

- **CLI**: `cli/index.js` (TYPE_FIELDS, type maps, pull/install path, transformForAgent, validate cross-refs, create), `cli/agents-config.js` (per-agent MCP/hook config file targets), new `cli/config-merge.js`, `cli/parse.js` (loadRegistry dirs), `cli/tui.js`, `cli/pinning.js` (export/import already type-driven), completions.
- **Server**: `server/routes.js` VALID_TYPES, `server/federation.js`, `server/ui.js` (tabs, colors, descriptions).
- **Templates/examples**: `templates/mcp.md`, `templates/hook.md`, `examples/mcps/`, `examples/hooks/`.
- **Docs**: CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md, man page.
- **Tests**: new `tests/config-merge.test.js`; extend `tests/cli.test.js`, `tests/routes.test.js`.
- **Constraint**: the frontmatter parser supports simple YAML only (no nested objects) — MCP `env`/`headers` are flat arrays of `KEY=value` strings.
- **Out of scope (v1)**: Codex TOML config merge (documented as unsupported; manual install note shown), local uninstall/unmerge (no type has local uninstall today), remote MCP OAuth flows.
