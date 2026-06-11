# hook-artifact-type

## ADDED Requirements

### Requirement: Hook artifact definition
The system SHALL support a `hook` artifact type (plural `hooks`, local directory `hooks/`) as a `.md` file with YAML frontmatter carrying metadata (`description` required, `version` required, `author`, `project`, `tags`, `compatible_agents`; v1 supports `claude`). The canonical hook config SHALL live in the body as a fenced ```json block holding the exact Claude Code `settings.json` hooks fragment — `{ "<Event>": [{ "matcher"?: ..., "hooks": [{ "type": "command", "command": ..., "timeout"?: ... }] }] }` — with one or more valid events and one or more entries per event. The legacy flat-frontmatter fields (`event`, `matcher`, `command`, `timeout`) SHALL remain supported as a deprecated fallback when no config block exists. The body also documents what the hook does and why.

#### Scenario: Valid hook passes validation
- **WHEN** `ihub validate` runs over `hooks/format-on-save.md` with `event: PostToolUse`, `matcher: Write|Edit`, and a `command`
- **THEN** validation reports no errors

#### Scenario: Unknown event fails validation
- **WHEN** a hook artifact declares `event: OnBananas`
- **THEN** `ihub validate` reports an error listing the valid events

### Requirement: Hook install merges into agent settings
`ihub pull hook <name> --agent claude` SHALL merge the hook into Claude Code settings using the config-merge installer: local scope writes `.claude/settings.json`, global scope writes `~/.claude/settings.json`, under `hooks.<event>` as `{ "matcher": <matcher>, "hooks": [{ "type": "command", "command": <command>, "timeout": <timeout> }] }` (matcher omitted when not set). Re-pulling SHALL replace the previously installed entry for the same artifact rather than appending a duplicate. Agents other than Claude Code SHALL be skipped with an unsupported note in v1. The artifact's `.md` SHALL also be saved to the local `hooks/` directory for tracking.

#### Scenario: Pull installs hook into project settings
- **WHEN** `ihub pull hook format-on-save --agent claude` runs in a project
- **THEN** `.claude/settings.json` contains the hook entry under `hooks.PostToolUse` and `hooks/format-on-save.md` exists

#### Scenario: Re-pull is idempotent
- **WHEN** the same hook is pulled twice
- **THEN** `.claude/settings.json` contains exactly one entry for it

### Requirement: Hook pulls are gated as executable code
Because hooks execute shell commands, `ihub pull hook` SHALL always display the exact `command` (and event/matcher) before installing and require interactive confirmation. A `--yes` flag SHALL skip the prompt for scripted use. When the registry has signing enabled, a hook whose signature fails verification SHALL NOT install; a hook with no signature SHALL print a prominent warning before the confirmation prompt.

#### Scenario: Confirmation required
- **WHEN** `ihub pull hook format-on-save --agent claude` runs interactively and the user answers no
- **THEN** nothing is written and the CLI reports the install was cancelled

#### Scenario: Invalid signature blocks install
- **WHEN** signing is enabled and the artifact's `meta._signature` fails verification on pull
- **THEN** the hook is not installed and an error names the signature failure

#### Scenario: --yes skips prompt but not signature check
- **WHEN** `ihub pull hook format-on-save --agent claude --yes` runs with a valid or absent signature
- **THEN** the hook installs without prompting (with the unsigned warning still printed when applicable)

### Requirement: Hook type participates in the full artifact lifecycle
The `hook` type SHALL be available in every type-driven surface: push (with sensitive scan), pull (with version pinning), list, search, show, preview, create (interactive + template), remove, export/import bundles, federation sync, server REST validation, web UI tabs/colors, TUI tabs, shell completions, and metrics.

#### Scenario: Server accepts hook type
- **WHEN** a client POSTs an entry with `type: hooks` to the registry
- **THEN** the request passes VALID_TYPES validation and the entry is stored and listable

### Requirement: Agents can declare mcps and hooks dependencies
Agent artifacts SHALL support `mcps:` and `hooks:` frontmatter arrays (parallel to `skills:`/`rules:`/`memories:`/`prompts:`/`commands:`). `ihub validate` SHALL check the cross-references against the registry. `ihub pull agent <name>` SHALL resolve and install declared mcps and hooks transitively (hooks still gated per the confirmation requirement) unless `--no-deps` is passed.

#### Scenario: Broken mcp reference fails validation
- **WHEN** an agent declares `mcps: [nonexistent]` and no such mcp exists
- **THEN** `ihub validate` reports a broken-reference error

#### Scenario: Agent pull resolves mcp dependency
- **WHEN** `ihub pull agent backend-dev --agent claude` runs and the agent declares `mcps: [github]`
- **THEN** the github MCP server is merged into `.mcp.json` in addition to the agent's own install
