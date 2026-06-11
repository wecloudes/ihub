# mcp-artifact-type

## ADDED Requirements

### Requirement: MCP artifact definition
The system SHALL support an `mcp` artifact type (plural `mcps`, local directory `mcps/`) as a `.md` file with YAML frontmatter carrying metadata (`description` required, `version` required, `author`, `project`, `tags`, `compatible_agents`). The canonical server config SHALL live in the body as a fenced ```json block holding the exact Claude `.mcp.json` server entry keyed by server name — `{ "<name>": { "command": ..., "args": [...], "env": {...} } }` for stdio, `{ "<name>": { "type": "http"|"sse", "url": ..., "headers": {...} } }` for remote. The block MUST contain exactly one server entry; the block key is the installed server name. The legacy flat-frontmatter fields (`transport`, `command`, `args`, `env`, `url`, `headers`) SHALL remain supported as a deprecated fallback when no config block exists. The body also documents the server's purpose, available tools, and auth setup.

#### Scenario: Valid stdio MCP artifact passes validation
- **WHEN** `ihub validate` runs over an `mcps/github.md` with `transport: stdio` and a `command`
- **THEN** validation reports no errors for the artifact

#### Scenario: Missing transport-specific field fails validation
- **WHEN** an MCP artifact declares `transport: stdio` without `command`, or `transport: http` without `url`
- **THEN** `ihub validate` reports an error naming the missing field

### Requirement: Env and header values must be placeholders, not literal secrets
MCP `env` and `headers` values that carry credentials SHALL use `${VAR}` environment-variable placeholders. On push, the existing sensitive-data scanner SHALL scan the full artifact (frontmatter included); detected literal secrets follow the existing block flow (status `blocked`, pulls return 403, admin approval required).

#### Scenario: Literal API key in env blocks the artifact
- **WHEN** a user pushes an MCP artifact with `env: ["GITHUB_TOKEN=ghp_<real-token>"]`
- **THEN** the scanner detects the secret, the value is masked, the artifact is blocked, and a security alert is emitted

#### Scenario: Placeholder env passes
- **WHEN** a user pushes an MCP artifact with `env: ["GITHUB_TOKEN=${GITHUB_TOKEN}"]`
- **THEN** the push succeeds with no sensitive findings

### Requirement: MCP install merges into agent-native config
`ihub pull mcp <name> --agent <agents>` SHALL merge the server definition into each target agent's native MCP config file using the config-merge installer, keyed by artifact name: Claude Code `.mcp.json` (local) / `~/.claude.json` (global) under `mcpServers`; Cursor `.cursor/mcp.json` / `~/.cursor/mcp.json` under `mcpServers`; Gemini CLI `.gemini/settings.json` / `~/.gemini/settings.json` under `mcpServers`; Qwen Code `.qwen/settings.json` / `~/.qwen/settings.json` under `mcpServers`; OpenCode `opencode.json` / `~/.config/opencode/opencode.json` under `mcp` (OpenCode entry shape: `type: "local"|"remote"`, `command` as array, `environment` object). Codex SHALL be reported as unsupported for MCP install with a note pointing to manual `config.toml` setup. The artifact's `.md` SHALL also be saved to the local `mcps/` directory for tracking.

#### Scenario: Pull installs to two agents
- **WHEN** `ihub pull mcp github --agent claude,cursor` runs in a project
- **THEN** `.mcp.json` and `.cursor/mcp.json` each contain `mcpServers.github` with the artifact's command, args, and env, and `mcps/github.md` exists

#### Scenario: Unsupported agent is skipped with a note
- **WHEN** `ihub pull mcp github --agent codex` runs
- **THEN** no file is written for codex and the CLI prints a note that Codex requires manual `config.toml` configuration

### Requirement: MCP type participates in the full artifact lifecycle
The `mcp` type SHALL be available in every type-driven surface: push, pull (with version pinning), list, search, show, preview, create (interactive + template), remove, export/import bundles, federation sync, server REST validation, web UI tabs/colors, TUI tabs, shell completions, and metrics.

#### Scenario: Server accepts mcp type
- **WHEN** a client POSTs an entry with `type: mcps` to the registry
- **THEN** the request passes VALID_TYPES validation and the entry is stored and listable

#### Scenario: Create scaffolds from template
- **WHEN** `ihub create mcp my-server` runs
- **THEN** `mcps/my-server.md` is created from `templates/mcp.md` with frontmatter placeholders
