# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ihub

ihub is a registry for **Claude Code plugins** — a central hub for publishing, discovering, and installing plugins. A plugin is a Claude Code plugin (per the [plugin spec](https://code.claude.com/docs/en/plugins-reference)): a directory that bundles components — skills, commands, agents, MCP servers, and hooks — into one installable unit. ihub publishes and pulls whole plugins.

There is exactly **one artifact type: `plugin`**. The old nine-type model (agent/command/design/hook/mcp/memory/prompt/rule/skill) is gone — those are now either *components* inside a plugin (skill/command/agent/mcp/hook) or dropped (rule/memory/prompt/design have no plugin-spec equivalent; see `examples/DROPPED.md`).

The CLI manages plugins locally, syncs with a remote HTTP registry (Bun + SQLite), and includes sensitive data detection, IP firewall, Prometheus metrics, Grafana dashboard, Slack notifications, audit trail, and an interactive TUI browser.

## The plugin model

### On-disk layout

A plugin lives under `plugins/<name>/`:

```
plugins/<name>/
  .claude-plugin/plugin.json     # manifest (required — this is what makes a dir a plugin)
  README.md                      # human doc → becomes the registry entry body
  skills/<skill>/SKILL.md        # 0..N skills
  commands/<cmd>.md              # 0..N commands
  agents/<agent>.md              # 0..N agents
  .mcp.json                      # optional { "<server>": { command/args/env | type/url/headers } }
  hooks/hooks.json               # optional { "<Event>": [ { matcher?, hooks: [...] } ] }
```

Only `.claude-plugin/plugin.json` lives in `.claude-plugin/`; everything else is at the plugin root. MCP config is the exact Claude-native `.mcp.json` shape; hook config is the Claude `settings.json` `hooks` fragment. Both are consumed verbatim by Claude Code on install — no shape transform. Secrets in MCP `env`/`headers` MUST be `${VAR}` placeholders; literal secrets are masked and blocked on push.

### plugin.json manifest

Required: `name` (kebab-case `^[a-z0-9-]+$`, no `:`) and `description`. Optional: `displayName`, `version` (semver, default `0.1.0`), `author` (`{ name, email?, url? }` or a string), `homepage`, `repository`, `license`, `keywords` (array — doubles as tags). ihub-extra optional: `project` (groups plugins in projects view / marketplace export). Component-path overrides (`skills`/`commands`/`agents`/`hooks`/`mcpServers`) are honored if present; default paths used otherwise.

### How ihub packs a plugin into a registry entry

One registry entry per plugin. `type` is always the literal `"plugin"` (plural key `"plugins"`); identity is `(type="plugin", name, version)`.

- **Entry meta** = the plugin.json fields PLUS a derived `meta.components = { skills:[names], commands:[names], agents:[names], mcpServers:[names], hooks:[events] }`, computed on push (`collectPluginComponents` in `cli/parse.js`) and used for the UI + graph.
- **Entry body** = the plugin's `README.md` content (or a generated stub).
- **Entry attachments** = every component file, stored at its plugin-relative path (`.claude-plugin/plugin.json`, `skills/x/SKILL.md`, `commands/y.md`, `agents/z.md`, `.mcp.json`, `hooks/hooks.json`). The attachments infra (db attachments table, `storage.js`, `downloadAttachment`) recreates these on pull.

`ihub pull` reverses this: it downloads every attachment to its path, writes `README.md` from the body, and synthesizes `plugin.json` from meta if it wasn't among the attachments.

## Project structure

```
cli/       — CLI tool (ESM, zero external dependencies)
  index.js       — command dispatcher; accepts `plugin`/`plugins` as an optional noun (ihub plugin list = ihub list)
  context.js     — shared constants: ROOT, TYPE/TYPE_PLURAL ("plugin"/"plugins"), COMPONENT_KINDS, PLUGIN_FIELDS, VALID_HOOK_EVENTS, PLUGIN_NAME_RE, readline helpers, parseJsonFlag
  query.js       — read commands: list, search, show (manifest + component tree), preview, validate, projects
  create.js      — create (scaffold plugins/<name>/ from templates/plugin/), import (Claude plugin dir OR single component → plugin), bundle import delegate
  publish.js     — push (pack plugin → entry + attachments), pull (recreate plugin dir; --install / --marketplace), remove, comment, comments, watch, pullFromUrl, marketplace helpers
  auth.js        — register, login (+ Auth0), passwd, whoami
  admin.js       — audit, metrics, backup, restore, admin, webhook, federation
  diagnostics.js — completions, man, config, outdated, doctor, verify, diff, version, help
  pinning.js     — version pinning (key plugins/<name>), bundle + marketplace export/import
  parse.js       — frontmatter parser; loadPlugin/loadPlugins (walk plugins/<name>/), collectPluginComponents, collectFiles, unwrapConfig
  registry.js    — HTTP client for remote registry + shared config/header helpers (getBaseUrl, getToken, authHeaders, jsonHeaders)
  render.js      — terminal markdown renderer (ANSI)
  dashboard.js   — terminal metrics dashboard
  tui.js         — interactive TUI browser (plugin list, component-tree detail, comments, metrics, audit, projects, config, remove, review, split-pane preview, dynamic resize)
  agents-config.js — plugin install targets: pluginInstallDir(scope) → ~/.claude/plugins (global) or ./.claude/plugins (local)
  config-merge.js — idempotent JSON merge helpers + extractConfigBlock (retained for loose component merges)
server/    — registry API server
  index.js    — http entrypoint
  routes.js   — REST handlers; VALID_TYPES = ["plugins"] (auth, CRUD, comments, attachments, backup/restore, webhooks, federation, metrics, audit, firewall)
  auth0.js    — Auth0 JWT verification (RS256, JWKS)
  slack.js    — Slack webhook (push notifications + digest)
  config.js   — config loader (ihub.config.json + env vars)
  db.js       — SQLite (users, entries, attachments, comments, audit_log, webhooks); type column always "plugin", UNIQUE(type,name,version)
  storage.js  — storage abstraction (SQLite default, files-sdk for 30+ cloud providers)
  signing.js  — HMAC-SHA256 artifact signing and verification
  versioning.js — semver policy enforcement, breaking change detection (README-heading + body-shrink heuristic)
  federation.js — upstream registry sync (periodic + manual); VALID_TYPES = ["plugins"]
  webhooks.js — webhook notification delivery (HMAC-signed)
  plugins.js  — extensible push/pull lifecycle hooks (server-side plugin API — unrelated to the plugin artifact type)
  ui.js       — web UI handler (browser-based registry interface)
  metrics.js  — metrics collector (VictoriaMetrics-compatible)
  vlogs.js    — VictoriaLogs client (structured log shipping)
  sensitive.js — sensitive data detection and masking (80+ patterns); scans body + every text attachment on push
  security-alert.js — security alert notifications (terminal/slack/email via notify_via config)
tests/     — test suite (node:test / bun test)
plugins/   — working directory for local plugin dirs (gitignored)
examples/  — sample plugins (code-quality, dev-mcps, docs-tools) + DROPPED.md documenting what the 9→1 collapse discarded
templates/plugin/ — plugin scaffold (plugin.json skeleton, README, skills/commands/agents examples, .mcp.json, hooks/hooks.json)
completions/ — bash + zsh shell completions
man/       — manual page (ihub.1.md)
k8s/       — Kubernetes manifests (kustomize)
grafana/   — dashboard + VictoriaMetrics scrape config
```

## Commands

```bash
# Browse & search
ihub browse                              # interactive TUI
ihub open                                # open web UI in browser
ihub list                                # list plugins (local + remote), --json
ihub search <query>                      # --json
ihub search --remote <query>
ihub show <name>                         # manifest + component tree, --json
ihub preview <name>                      # render README + component tree
ihub validate                            # validate every local plugin
ihub projects [name]                     # group plugins by project, --json

# Create & import
ihub create <name> [-i]                  # scaffold plugins/<name>/ from templates/plugin/
ihub import <path> [--no-push]           # ingest a Claude plugin dir, OR wrap a lone component into a plugin

# Publish & pull
ihub push <name> [--force]               # pack plugin → entry + attachments; scans + masks sensitive data
ihub pull <name[:ver]> [--install] [--global|--local] [--marketplace <dir>] [--yes]
ihub pull <url>                          # pull a plugin directly from any registry URL
ihub watch                               # watch plugins/ and auto-push on save
ihub remove <name>
ihub comment <name>
ihub comments <name>                     # --json

# Version pinning (key: plugins/<name>)
ihub pin <name> [version]
ihub unpin <name>
ihub pins

# Bundle / marketplace export-import
ihub export [--project P] [--name N] [-o file]        # self-contained JSON bundle
ihub export --format claude-plugin --out <dir>        # Claude Code plugin marketplace (1:1 from plugin entries)
ihub export --from <url>                              # export from another registry
ihub import <bundle.json> [--no-push]                # bundle import

# Admin
ihub audit [--user U] [--action A] [--page N]  # --json
ihub metrics [--user U] [--name N] [--project P]  # --json
ihub config
ihub backup [path]                           # SQLite backup
ihub backup --full [path]                    # full JSON backup (any storage adapter)
ihub restore <path>                          # restore from .json or .db backup
ihub webhook list|add|remove
ihub federation sync|status
ihub admin set-role <user> <role>
ihub admin approve plugins/<name>            # unblock a plugin after security review
ihub admin blocked                           # list blocked plugins
ihub admin digest

# Diagnostics
ihub doctor                                  # server, auth, local plugins, storage, config checks
ihub outdated                                # compare local vs registry versions
ihub verify <name>                           # check a plugin's HMAC signature
ihub diff <name> <v1> <v2>                   # compare two versions (README body)

# Auth
ihub register <url>
ihub login <url> [--auth0]
ihub passwd
ihub whoami                                  # --json

# Utilities
ihub completions [bash|zsh]
ihub man
ihub version

# Plugin noun (accepted for symmetry)
ihub plugin list   = ihub list
ihub plugin show <name> = ihub show <name>

# Server
bun run server
docker compose up -d
kubectl apply -k k8s/
```

Run tests: `bun test`

## Server API

Single type; routes are shaped `/api/plugins/...`:

- `GET /api/plugins` — list
- `GET /api/plugins/:name` — pull (entry + signature; optional `?version=`)
- `POST /api/plugins/:name` — push (versioning, sensitive scan over body + all attachment contents, signing, upsert, attachments, blocking)
- `GET /api/plugins/:name/versions`
- `GET/POST/DELETE /api/plugins/:name/comments`
- `GET /api/plugins/:name/attachments`, `GET /api/plugins/:name/attachments/:filepath`
- `DELETE /api/plugins/:name`, `POST /api/plugins/:name/approve`
- `GET /api/search?q=`, plus backup/restore, webhooks, federation, metrics, audit, firewall — unchanged except the type dimension is always `plugin`.

`VALID_TYPES = ["plugins"]` in `server/routes.js`, `server/federation.js`, and `server/ui.js`. The DB keeps `type TEXT NOT NULL` + `UNIQUE(type,name,version)` (value is always `"plugin"` — no schema migration).

## Key conventions

- **One unit — the plugin.** Components inside it: skills (`skills/<name>/SKILL.md`), commands (`commands/<name>.md`), agents (`agents/<name>.md`), MCP servers (`.mcp.json`), hooks (`hooks/hooks.json`). `meta.components` records their names/events for UI + graph.
- **MCP + hook config are Claude-native and travel inside the plugin** — `.mcp.json` is the exact `.mcp.json` server map; `hooks/hooks.json` is the exact `settings.json` `hooks` fragment. There is no per-agent shape transform anymore: a plugin installs as a directory. `unwrapConfig()` in `cli/parse.js` tolerates both wrapped (`{ mcpServers: {...} }` / `{ hooks: {...} }`) and flat forms.
- **Secrets** in MCP `env`/`headers` use `${VAR}` placeholders resolved from the developer's environment; literal secrets are masked + blocked on push (`cli/publish.js` masks over the README body and every text attachment; the server re-scans server-side).
- **Hook pulls are gated** — before recreating a plugin that carries `hooks/hooks.json`, the commands are displayed and require y/N confirmation (`--yes` to skip); signature is verified when present (verification failure omits hooks).
- **Install** — `ihub pull --install` drops the whole plugin directory into `~/.claude/plugins/<name>` (global/personal) or `./.claude/plugins/<name>` (local/project). `--marketplace <dir>` assembles a Claude marketplace (`.claude-plugin/marketplace.json` + `plugins/<name>/`).
- **Validation (`ihub validate`)** per local plugin: plugin.json present + valid JSON; `name` kebab-case, no `:`; `description` non-empty; `version` semver if present; each `skills/*/SKILL.md` has a `description` (skill booleans `background`/`disable-model-invocation` accept yes/no/on/off/1/0/true/false); each declared command/agent file exists; `.mcp.json` valid, each server has `command` or `url`, optional `protocolVersion` = `YYYY-MM-DD`, literal-secret env/header warns; `hooks/hooks.json` valid, event keys ∈ `VALID_HOOK_EVENTS`, each entry has a hook `command`.
- **Storage** — pluggable backends via `storage.adapter`: SQLite (default), S3, R2, GCS, Azure, filesystem, MinIO, and 30+ more via files-sdk; credentials from standard env vars; SQLite keeps index rows for queries; body search only with SQLite. Plugin component files are stored as attachments (blobs).
- **Sensitive data** — scanned + masked on push (CLI over README body + every text attachment, plus server-side over body + attachment contents); if found, the plugin is **blocked** (`status: "blocked"`, pulls return 403); admin must `ihub admin approve plugins/<name>` to unblock; security alert via `security.notify_via` (terminal/slack/email); `sensitive-detected` audit action; `ihub_sensitive_detected_total` metric.
- **Firewall** — IP whitelist loaded once at startup (immutable); exact, CIDR, wildcard; blocked IPs logged + tracked.
- **Signing** — HMAC-SHA256 via `signing.enabled` + `signing.key` (or `IHUB_SIGNING_KEY`); signs on push, verifies on pull; signature stored in `meta._signature`.
- **Versioning** — policy via `versioning.enforce_semver` and `versioning.require_major_for_breaking`; detects removed README headings and >50% body shrinkage as breaking changes.
- **Federation** — `federation.enabled` + `federation.upstreams[]`; syncs plugins from upstream ihub registries (synced entries `owner: "federated:{url}"`). An upstream with `type: "mcp-registry"` syncs the official MCP Registry (optional `search`/`limit`, default 50): each MCP server becomes a **plugin** named after the server, carrying a single `.mcp.json` attachment + generated plugin.json; secrets always `${VAR}` placeholders. Upstream config validated at startup.
- **Claude-plugin export** — `ihub export --format claude-plugin --out <dir>` writes `.claude-plugin/marketplace.json` + one `plugins/<name>/` per plugin entry (1:1, no lossy type filtering — plugins are already Claude-native), grouped/named by `--project` when given. `--format json` (default) emits a self-contained bundle including base64 attachment content.
- **Webhooks** — admin-managed HTTP hooks for push/pull/comment/remove/approve/register events; HMAC-SHA256 signed payloads (`X-Ihub-Signature`); stored in the `webhooks` table.
- **Server-side plugins** (`server/plugins.js`, config `plugins[]`) — JS lifecycle modules `{ name, beforePush?, afterPush?, beforePull? }`; unrelated to the plugin artifact type (naming collision, kept as-is).
- **Backup/Restore** — `ihub backup` (SQLite) or `ihub backup --full` (JSON, any storage adapter); `ihub restore` auto-detects format (.db or .json).
- **Version pinning** — `ihub pin/unpin/pins` stored in `~/.ihubrc` under `pins`, keyed `plugins/<name>`; pull uses the pinned version instead of latest.
- **Attachments** — a plugin's component files are uploaded on push and recreated on pull, each at its plugin-relative path.
- **Web UI** — browser-based registry at `/ui`; plugin list, component-tree detail, graph (plugin→component containment), hash-routing deep links (`#<name>`), server-backed search, keyboard shortcuts (`/` search, `Esc` close).
- **TUI (`ihub browse`)** — flat plugin list, component-tree detail, comments, projects (`j`), metrics (`m`), audit (`t`), config (`i`), guide (`G`, plugin + component-type reference), remove (`d` twice), write review (`w`), blocked (`B`), multi-select + bulk pull (`space`/`a`/`p`), split-pane preview (auto-shown when terminal >= 120 cols), filter mode, Home/End/PgUp/PgDn, dynamic resize, offline indicator, light theme (`IHUB_THEME=light`), `NO_COLOR` support.

## After every change

1. **Run tests**: `bun test` — all tests must pass
2. **Add tests**: for any new command, endpoint, or DB function
3. **Update docs**: CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md
4. **Verify Docker build** if server code changed
