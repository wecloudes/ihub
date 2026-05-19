# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ihub

ihub is an AI artifact registry — a central hub for publishing, discovering, and installing agents, skills, rules, memories, and prompts used by AI coding assistants. It works with Claude Code, Gemini CLI, Qwen Code, Cursor IDE, Codex CLI, and Open Code — installing artifacts to each agent's native path with the correct format.

Each artifact is a `.md` file with YAML frontmatter. The CLI manages them locally, syncs with a remote HTTP registry (Node.js + SQLite), and includes sensitive data detection, IP firewall, Prometheus metrics, Grafana dashboard, Slack notifications, audit trail, and an interactive TUI browser.

## Project structure

```
cli/       — CLI tool (ESM, zero external dependencies)
  index.js       — command dispatcher, type-first routing, all commands
  pinning.js     — version pinning, bundle export/import
  parse.js       — frontmatter parser and registry loader
  registry.js    — HTTP client for remote registry
  render.js      — terminal markdown renderer (ANSI)
  dashboard.js   — terminal metrics dashboard
  tui.js         — interactive TUI browser (multi-select, comments, metrics, audit, projects, config, remove, review, split-pane preview, dynamic resize)
  agents-config.js — coding agent path configs (6 agents)
server/    — registry API server
  index.js    — http entrypoint
  routes.js   — REST handlers (auth, CRUD, comments, attachments, backup/restore, webhooks, federation, metrics, audit, firewall)
  auth0.js    — Auth0 JWT verification (RS256, JWKS)
  slack.js    — Slack webhook (push notifications + digest)
  config.js   — config loader (ihub.config.json + env vars)
  db.js       — SQLite (users, entries, attachments, comments, audit_log, webhooks)
  storage.js  — storage abstraction (SQLite default, files-sdk for 30+ cloud providers)
  signing.js  — HMAC-SHA256 artifact signing and verification
  versioning.js — semver policy enforcement, breaking change detection
  federation.js — upstream registry sync (periodic + manual)
  webhooks.js — webhook notification delivery (HMAC-signed)
  plugins.js  — extensible push/pull lifecycle hooks
  ui.js       — web UI handler (browser-based registry interface)
  metrics.js  — Prometheus metrics collector
  sensitive.js — sensitive data detection and masking (80+ patterns)
  security-alert.js — security alert notifications (terminal/slack/email via notify_via config)
tests/     — test suite (node:test)
  parse, registry, render, dashboard, config, metrics, sensitive, slack, db, routes, cli, tui,
  signing, versioning, federation, webhooks, plugins
agents/ skills/ rules/ memories/ prompts/ — working directories (gitignored)
examples/  — sample entries (4 agents, 6 skills, 4 rules, 3 memories, 5 prompts) + more in registry
templates/ — scaffolding templates
completions/ — bash + zsh shell completions
man/       — manual page (ihub.1.md)
k8s/       — Kubernetes manifests (kustomize)
grafana/   — dashboard + Prometheus config
```

## Commands

```bash
# Browse & search
ihub browse                              # interactive TUI
ihub list [type]                         # supports --json
ihub search <query>                      # supports --json
ihub search --remote <query>
ihub show <type> <name>                  # supports --json
ihub preview <type> <name>
ihub validate
ihub projects [name]                     # supports --json

# Create & import
ihub create <type> <name> [-i] [--from <template>]
ihub import <type> <path> [-i] [--no-push]   # auto-detects source agent

# Publish & pull
ihub push <type> <name> [--force]            # scans + masks sensitive data
ihub pull <type> <name[:ver]> [--local|--global] [--agent claude,cursor,...] [--no-deps]
ihub pull <url>                              # pull directly from any registry URL
ihub watch                                   # watch local dirs and auto-push on save
ihub remove <type> <name>
ihub comment <type> <name>
ihub comments <type> <name>                  # supports --json

# Version pinning
ihub pin <type> <name> [version]
ihub unpin <type> <name>
ihub pins

# Bundle export/import
ihub export [--project P] [--type T]         # JSON bundle to stdout
ihub import <bundle.json> [--no-push]

# Admin
ihub audit [--user U] [--action A] [--page N]  # supports --json
ihub metrics [--type T] [--user U] [--name N] [--project P]  # supports --json
ihub config
ihub backup [path]                           # SQLite backup
ihub backup --full [path]                    # full JSON backup (any storage adapter)
ihub restore <path>                          # restore from .json or .db backup
ihub webhook list|add|remove                 # manage webhooks
ihub federation sync|status                  # upstream registry sync
ihub admin set-role <user> <role>
ihub admin approve <type>/<name>             # unblock artifact after security review
ihub admin blocked                           # list blocked artifacts
ihub admin digest

# Diagnostics
ihub doctor                                  # server, auth, artifacts, storage, config checks
ihub outdated                                # compare local vs registry versions
ihub verify <type> <name>                    # check artifact signature

# Auth
ihub register <url>
ihub login <url> [--auth0]
ihub passwd
ihub whoami                                  # supports --json

# Utilities
ihub completions [bash|zsh]
ihub man
ihub version

# Type-first syntax
ihub agent show <name>          # = ihub show agent <name>

# Server
npm run server
docker compose up -d
kubectl apply -k k8s/
```

Run tests: `npm test`

## Key conventions

- Five artifact types: agent, skill, rule, memory, prompt
- Multi-agent pull: `--agent claude,cursor` installs to each agent's native path; Claude/Gemini/Qwen/Codex/OpenCode use `<name>/SKILL.md` dirs; Cursor uses `.mdc`
- `transformForAgent()` rewrites frontmatter per agent on pull
- `import` auto-detects source agent, maps fields, prompts for missing required fields
- Storage: pluggable backends via `storage.adapter` config — SQLite (default), S3, R2, GCS, Azure, filesystem, MinIO, and 30+ more via files-sdk; credentials from standard env vars; SQLite keeps index rows for queries; body search only with SQLite
- Sensitive data: scanned + masked on push (CLI + server-side); if found, artifact is **blocked** (status: "blocked", pulls return 403); admin must `ihub admin approve` to unblock; security alert sent via `security.notify_via` (terminal/slack/email); `sensitive-detected` audit action; `ihub_sensitive_detected_total` metric
- Firewall: IP whitelist loaded once at startup (immutable); supports exact, CIDR, wildcard; blocked IPs logged + tracked
- Signing: HMAC-SHA256 via `signing.enabled` + `signing.key` (or `IHUB_SIGNING_KEY` env); signs on push, verifies on pull; signature stored in `meta._signature`
- Versioning: policy enforcement via `versioning.enforce_semver` and `versioning.require_major_for_breaking`; detects removed headings and >50% body shrinkage as breaking changes
- Federation: `federation.enabled` + `federation.upstreams[]` config; syncs artifacts from upstream registries; synced entries have `owner: "federated:{url}"`
- Webhooks: admin-managed HTTP hooks for push/pull/comment/remove/approve/register events; HMAC-SHA256 signed payloads (`X-Ihub-Signature` header); stored in `webhooks` table
- Plugins: JS modules listed in `plugins[]` config; exports `{ name, beforePush?, afterPush?, beforePull? }`; beforePush can block, beforePull can transform
- Backup/Restore: `ihub backup` (SQLite) or `ihub backup --full` (JSON, any storage adapter); `ihub restore` auto-detects format (.db or .json)
- Version pinning: `ihub pin/unpin/pins` — stored in `~/.ihubrc` under `pins`; pull uses pinned version instead of latest
- Memories always install to local `memories/`
- Attachments: companion files in `<type>/<name>/` uploaded on push, recreated on pull
- Web UI: browser-based registry at `/ui` with full feature parity
- TUI (`ihub browse`): types, list, detail, comments, projects (`j`), metrics (`m`, side-by-side charts), audit (`t`), config (`i`), guide (`G`, 3-tab artifact reference), remove (`d` twice to confirm), write review (`w`), blocked (`B`), multi-select + bulk pull (`space`/`a`/`p`), split-pane preview (`{`/`}` scroll, auto-shown when terminal >= 120 cols), dynamic resize, search cancel with Esc/q, scroll clamping, footer pinned to bottom, mouse support, light theme (`IHUB_THEME=light`)

## After every change

1. **Run tests**: `npm test` — all tests must pass
2. **Add tests**: for any new command, endpoint, or DB function
3. **Update docs**: CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md
4. **Verify Docker build** if server code changed
