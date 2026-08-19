# ihub

A registry for **Claude Code plugins**. Publish a plugin once; discover, pull, and install it anywhere. A plugin bundles the things that make Claude Code useful — skills, commands, agents, MCP servers, and hooks — into one versioned, installable unit.

No proprietary formats: a plugin is a plain directory of files you can edit, version with git, and share across your team. ihub is where you package, publish, and pull those plugins, plus a registry server with search, ratings, signing, sensitive-data scanning, metrics, and a TUI + web browser.

## What is a plugin

A plugin is a [Claude Code plugin](https://code.claude.com/docs/en/plugins-reference) — a directory bundling components:

```
plugins/my-plugin/
  .claude-plugin/plugin.json     # manifest (name, description, version, ...)
  README.md                      # human doc
  skills/<skill>/SKILL.md        # capabilities the model can invoke
  commands/<cmd>.md              # user-facing slash commands
  agents/<agent>.md              # subagent definitions
  .mcp.json                      # MCP servers the plugin wires in
  hooks/hooks.json               # lifecycle hooks (shell commands on events)
```

Only `.claude-plugin/plugin.json` is required — it's what makes a directory a plugin. Everything else is optional; add the components you need. MCP and hook config are the exact Claude-native shapes, so an installed plugin works with no translation. Secrets in MCP `env`/`headers` are always `${VAR}` placeholders resolved from your environment — never literal values (pushes with literal secrets are masked and blocked).

> **Heads up — breaking change in 1.0.0.** ihub used to manage nine separate artifact types (agent/command/design/hook/mcp/memory/prompt/rule/skill). It now manages exactly one: the plugin. Skills, commands, agents, MCP servers, and hooks are *components inside a plugin*; rules, memories, prompts, and designs were dropped (no plugin-spec equivalent). See [CHANGELOG.md](CHANGELOG.md) and `examples/DROPPED.md`.

## Install

Requires [Bun](https://bun.sh) >= 1.0 — the CLI and server run on Bun (`bun:sqlite`, `bun test`).

```bash
git clone <repo-url> && cd ihub
bun install
bun link                        # makes `ihub` available globally
eval "$(ihub completions zsh)"  # or bash — enables tab completion
```

## Quick start

```bash
ihub create my-plugin -i             # scaffold plugins/my-plugin/ interactively
# edit plugins/my-plugin/ — add skills/, commands/, agents/, .mcp.json, hooks/
ihub validate                        # check every local plugin
ihub push my-plugin                  # publish to the registry (scans for secrets)

ihub search --remote "lint"          # find plugins others published
ihub pull code-quality --install     # pull + drop into ~/.claude/plugins/
ihub show code-quality               # manifest + component tree
ihub projects                        # everything grouped by project
```

Turn a registry into a Claude Code plugin marketplace you can `claude plugin add`:

```bash
ihub export --format claude-plugin --out ./my-marketplace
# → ./my-marketplace/.claude-plugin/marketplace.json + one plugins/<name>/ per plugin
```

## Command reference

The `plugin` noun is accepted for symmetry — `ihub plugin list` is the same as `ihub list`.

### Browse & search

```bash
ihub browse                     # interactive TUI: plugin list, component tree, comments, metrics, graph
ihub open                       # open the web UI (deep links #<name>, server-backed search, / and Esc shortcuts)

ihub list                       # list plugins (local + remote merged), --json
ihub show <name>                # manifest + component tree, --json
ihub preview <name>             # render README + component tree
ihub search <query>             # search remote + local, --json
ihub search --remote <query>    # remote registry only
ihub validate                   # check every local plugin for structural + manifest errors
ihub projects [name]            # tree grouped by plugin.json "project"
```

TUI keys: `↑↓` navigate, `⏎` open, `/` search, type to filter, `space`/`a`/`p` multi-select + bulk pull, `c` comments, `w` review, `d` (twice) remove, `j` projects, `m` metrics, `t` audit, `i` config, `g` graph, `B` blocked, `G` guide, `q`/`Esc` back. Split-pane preview appears at >= 120 columns. Honors `NO_COLOR`; light theme via `IHUB_THEME=light`.

### Create & import

```bash
ihub create my-plugin           # scaffold from templates/plugin/
ihub create my-plugin -i        # interactive — prompts for manifest fields

# Import an existing Claude Code plugin directory (has .claude-plugin/plugin.json)
ihub import ~/some-plugin/

# Wrap a lone component into a new plugin (a SKILL.md dir, a component tree, or a bare .md)
ihub import ~/.claude/skills/docx/       # a skill dir → plugins/docx/skills/docx/
ihub import ~/.claude/commands/deploy.md # a command file → plugins/deploy/commands/deploy.md

ihub import ~/some-plugin/ --no-push     # save locally, push later
ihub import bundle.json                  # import from a JSON bundle (created by ihub export)
```

`import` auto-detects whether the path is a full plugin or a single component and builds the plugin accordingly, synthesizing a manifest + README when needed.

### Publish & pull

```bash
ihub push my-plugin             # pack plugins/my-plugin/ → entry + attachments, mask secrets, publish
ihub push my-plugin --force     # skip the interactive push diff

ihub pull code-quality                    # recreate plugins/code-quality/ from the registry
ihub pull code-quality:1.2.0              # a specific version
ihub pull code-quality --install          # also drop into ~/.claude/plugins/ (personal)
ihub pull code-quality --install --local  # into ./.claude/plugins/ (project scope)
ihub pull code-quality --marketplace ./mp # assemble a Claude marketplace at ./mp
ihub pull code-quality --yes              # skip hook-install confirmation

ihub pull https://other-registry.com/api/plugins/code-quality   # pull from any registry URL

ihub watch                      # watch plugins/ and auto-push each plugin on save
ihub remove old-plugin          # remove from the registry (owner only)
```

Plugins that ship `hooks/hooks.json` run shell commands: on pull the commands are shown and you must confirm (`--yes` in scripts). Signed registries verify the plugin's signature first.

### Reviews, pinning, versions

```bash
ihub comment <name>             # add a 1-5 star rating + comment
ihub comments <name>            # view ratings + comments, --json

ihub pin <name> [version]       # lock to a version (pull uses it instead of latest)
ihub unpin <name>
ihub pins

ihub outdated                   # local vs registry versions
ihub verify <name>              # check the plugin's HMAC signature
ihub diff <name> <v1> <v2>      # compare two versions (README body)
```

### Export & bundles

```bash
ihub export                                   # self-contained JSON bundle (stdout)
ihub export --project developer-tools -o b.json
ihub export --name code-quality               # a single plugin
ihub export --from https://other-registry.com # export from another registry
ihub export --format claude-plugin --out ./mp # Claude Code plugin marketplace (1:1 from plugin entries)
```

### Account

```bash
ihub register http://localhost:3000
ihub login http://localhost:3000 [--auth0]
ihub passwd
ihub whoami                     # --json
```

### Administration (admin only)

```bash
ihub config                     # server config + enabled features
ihub audit [--user U] [--action A] [--page N] [--limit N]   # --json
ihub metrics [--user U] [--name N] [--project P]            # --json
ihub backup [path]              # SQLite backup
ihub backup --full [path]       # full JSON backup (any storage adapter)
ihub restore <path>             # auto-detects .db or .json
ihub webhook list|add|remove
ihub federation sync|status
ihub admin set-role <user> <role>
ihub admin approve plugins/<name>   # unblock a plugin flagged by the sensitive scanner
ihub admin blocked
ihub admin digest
```

## Sample plugins

`examples/plugins/` has three ready-to-read plugins:

| Plugin | Project | Components |
|--------|---------|-----------|
| `code-quality` | developer-tools | skills `git-commit-msg`, `lint-check`, `dependency-audit`, `test-generator`; command `commit`; agent `code-reviewer` |
| `dev-mcps` | developer-tools | `.mcp.json` wiring Azure + Context7 + GitHub servers; a `format-on-save` hook |
| `docs-tools` | developer-tools | agents `doc-generator`, `migration-assistant`, `security-scanner` |

`examples/DROPPED.md` documents what the nine-type → one-type collapse discarded and why (rules, memories, prompts, designs have no plugin-spec slot).

## Registry server

```bash
bun run server                  # start on :3000
docker compose up -d            # full stack with VictoriaMetrics + VictoriaLogs + Grafana
kubectl apply -k k8s/           # Kubernetes (kustomize)
```

The server stores plugins in SQLite and exposes a REST API under `/api/plugins/...`. See `ihub man` for the full API reference.

### Server configuration

`ihub.config.json` enables optional features on startup (all optional; env vars override):

```json
{
  "server": { "port": 3000, "db_path": "./ihub.db" },
  "admin": { "username": "admin", "password": "admin" },
  "auth0": { "enabled": false, "domain": "", "client_id": "", "audience": "ihub-api" },
  "slack": { "enabled": false, "webhook_url": "", "digest_interval_hours": 168 },
  "metrics": { "enabled": true },
  "audit": { "enabled": true, "log_anonymous": true },
  "firewall": { "enabled": false, "whitelist": [] },
  "security": { "notify_via": "terminal", "email": "", "slack_webhook_url": "" },
  "storage": { "adapter": "sqlite" },
  "federation": { "enabled": false, "upstreams": [] },
  "signing": { "enabled": false, "key": "" },
  "versioning": { "enforce_semver": false, "require_major_for_breaking": false },
  "logs": { "vlogs_url": "" },
  "plugins": []
}
```

### Sensitive data protection

Every push is scanned (CLI + server-side) over the README body and every text component file. Detected values are masked with `[MASKED:<type>]`, and the plugin is **blocked** — stored but `status: "blocked"`, pulls return `403`, and a security alert fires (`security.notify_via`: terminal/slack/email). An admin runs `ihub admin approve plugins/<name>` to unblock. Covers 80+ patterns: cloud API keys (AWS, Azure, GCP, OpenAI, Anthropic, Stripe, Slack, ...), private keys, passwords, connection strings, and PII. Tracked via the `ihub_sensitive_detected_total` metric.

### Signing & versioning

Set `signing.enabled` + `signing.key` (or `IHUB_SIGNING_KEY`) to HMAC-SHA256 sign plugins on push and verify on pull; the signature lives in `meta._signature`. `versioning.enforce_semver` / `require_major_for_breaking` enforce semver and flag breaking changes (removed README headings, >50% body shrinkage).

### Storage backends

SQLite by default. Move plugin bodies + component attachments to any of 30+ providers via [files-sdk](https://files-sdk.dev/) — S3, R2, GCS, Azure, MinIO, and more — by setting `storage.adapter` (credentials come from the standard env vars for that provider). SQLite always keeps index rows (name, version, tags, owner) for queries; full-text body search requires SQLite.

### Federation

Sync plugins from upstream registries with `federation.enabled` + `upstreams[]`. Two upstream kinds:

```json
"federation": {
  "enabled": true,
  "upstreams": [
    { "url": "https://other-ihub.example.com" },
    { "url": "https://registry.modelcontextprotocol.io", "type": "mcp-registry", "search": "postgres", "limit": 25 }
  ]
}
```

An `mcp-registry` upstream syncs the official [MCP Registry](https://registry.modelcontextprotocol.io): each server becomes a **plugin** carrying a single `.mcp.json` (remotes → `http`/`sse`, npm packages → `npx`; secrets always `${VAR}` placeholders). `limit` defaults to 50 — the full registry is never synced wholesale.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code conventions, and how to add commands or endpoints.

## License

MIT — see [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) for dependency licenses.
