# config-merge-install

## ADDED Requirements

### Requirement: Idempotent JSON config merge
The system SHALL provide a config-merge installer that inserts or replaces an entry inside an agent-owned JSON config file without disturbing unrelated content. Given a target file path, a key path (e.g. `mcpServers.github` or `hooks.PostToolUse[]`), and an entry value, it SHALL: create the file (and parent directories) with a minimal document when absent; parse existing JSON and report a clear error (without writing) when the file contains invalid JSON; replace the entry when the same key (or, for array-valued keys, an entry previously installed from the same artifact) already exists; preserve all other keys, including ones ihub does not manage; and write pretty-printed JSON with a trailing newline.

#### Scenario: Fresh file created
- **WHEN** merging `mcpServers.github` into a `.mcp.json` that does not exist
- **THEN** the file is created containing only `{ "mcpServers": { "github": { ... } } }`

#### Scenario: Existing unrelated config preserved
- **WHEN** merging into a `.gemini/settings.json` that already has `theme` and an unrelated `mcpServers.other` entry
- **THEN** after the merge both `theme` and `mcpServers.other` are byte-for-byte semantically unchanged and `mcpServers.<name>` is added

#### Scenario: Replace on re-merge
- **WHEN** the same entry is merged twice with different values
- **THEN** the file contains one entry with the latest value

#### Scenario: Corrupt target aborts
- **WHEN** the target file contains invalid JSON
- **THEN** the merge fails with an error naming the file and nothing is written

### Requirement: Array-entry merges are keyed by artifact marker
For config locations that are arrays (e.g. Claude Code `hooks.<event>` lists), each installed entry SHALL carry an `_ihub: "<type>/<name>"` marker property. Re-merging SHALL locate the prior entry by marker and replace it in place; entries without a marker (user-authored) SHALL never be modified or removed.

#### Scenario: User-authored hook untouched
- **WHEN** `hooks.PostToolUse` already contains a hand-written entry and an ihub hook is merged into the same event
- **THEN** the hand-written entry is unchanged and the ihub entry is appended with its `_ihub` marker

#### Scenario: Marker-based replace
- **WHEN** an ihub hook entry with marker `hook/format-on-save` exists and the artifact is pulled again
- **THEN** the marked entry is replaced and the array length is unchanged

### Requirement: Per-agent config targets are declared in agents-config
Each coding agent's MCP/hook config file locations (global and local scope), top-level key, and entry shape transform SHALL be declared in `cli/agents-config.js` alongside the existing path config, so adding a new agent or scope requires no installer changes. Agents without a declared target for a type SHALL be reported as unsupported with the agent's note.

#### Scenario: Unsupported agent reports note
- **WHEN** an MCP install targets an agent with no declared MCP config file
- **THEN** the CLI skips it and prints the agent's note (e.g. "Codex: configure manually in ~/.codex/config.toml")
