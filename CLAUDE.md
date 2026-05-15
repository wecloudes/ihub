# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ihub

ihub is an AI artifact registry — a central hub for publishing, discovering, and installing agents, skills, rules, memories, and prompts used by AI coding assistants. It works with Claude Code, Gemini CLI, Qwen Code, Cursor IDE, Codex CLI, and Open Code — installing artifacts to each agent's native path with the correct format.

Each artifact is a `.md` file with YAML frontmatter. The CLI manages them locally, syncs with a remote HTTP registry (Node.js + SQLite), and includes sensitive data detection, IP firewall, Prometheus metrics, Grafana dashboard, Slack notifications, audit trail, and an interactive TUI browser.

## Project structure

```
cli/       — CLI tool (ESM, zero external dependencies)
  index.js       — command dispatcher, type-first routing, all commands
  parse.js       — frontmatter parser and registry loader
  registry.js    — HTTP client for remote registry
  render.js      — terminal markdown renderer (ANSI)
  dashboard.js   — terminal metrics dashboard
  tui.js         — interactive TUI browser (multi-select, comments, metrics, audit, projects, config, remove, review, split-pane preview, dynamic resize)
  agents-config.js — coding agent path configs (6 agents)
server/    — registry API server
  index.js    — http entrypoint
  routes.js   — REST handlers (auth, CRUD, comments, attachments, backup, metrics, audit, firewall)
  auth0.js    — Auth0 JWT verification (RS256, JWKS)
  slack.js    — Slack webhook (push notifications + digest)
  config.js   — config loader (ihub.config.json + env vars)
  db.js       — SQLite (users, entries, attachments, comments, audit_log)
  metrics.js  — Prometheus metrics collector
  sensitive.js — sensitive data detection and masking (80+ patterns)
  security-alert.js — security alert notifications (terminal/slack/email via notify_via config)
tests/     — 307 tests (node:test)
  parse, registry, render, dashboard, config, metrics, sensitive, slack, db, routes, cli, tui
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
ihub list [type]
ihub search <query>
ihub search --remote <query>
ihub show <type> <name>
ihub preview <type> <name>
ihub validate
ihub projects [name]

# Create & import
ihub create <type> <name> [-i]
ihub import <type> <path> [-i] [--no-push]   # auto-detects source agent

# Publish & pull
ihub push <type> <name> [--force]            # scans + masks sensitive data
ihub pull <type> <name[:ver]> [--local|--global] [--agent claude,cursor,...]
ihub remove <type> <name>
ihub comment <type> <name>
ihub comments <type> <name>

# Admin
ihub audit [--user U] [--action A] [--page N]
ihub metrics [--type T] [--user U] [--name N] [--project P]
ihub config
ihub backup [path]
ihub admin set-role <user> <role>
ihub admin approve <type>/<name>        # unblock artifact after security review
ihub admin blocked                       # list blocked artifacts
ihub admin digest

# Auth
ihub register <url>
ihub login <url> [--auth0]
ihub passwd
ihub whoami

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

Run tests: `npm test` (307 tests)

## Key conventions

- Five artifact types: agent, skill, rule, memory, prompt
- Multi-agent pull: `--agent claude,cursor` installs to each agent's native path; Claude/Gemini/Qwen/Codex/OpenCode use `<name>/SKILL.md` dirs; Cursor uses `.mdc`
- `transformForAgent()` rewrites frontmatter per agent on pull
- `import` auto-detects source agent, maps fields, prompts for missing required fields
- Sensitive data: scanned + masked on push (CLI + server-side); if found, artifact is **blocked** (status: "blocked", pulls return 403); admin must `ihub admin approve` to unblock; security alert sent via `security.notify_via` (terminal/slack/email); `sensitive-detected` audit action; `ihub_sensitive_detected_total` metric
- Firewall: IP whitelist loaded once at startup (immutable); supports exact, CIDR, wildcard; blocked IPs logged + tracked
- Memories always install to local `memories/`
- Attachments: companion files in `<type>/<name>/` uploaded on push, recreated on pull
- TUI (`ihub browse`): types, list, detail, comments, projects (`j`), metrics (`m`, side-by-side charts), audit (`t`), config (`i`), guide (`G`, 3-tab artifact reference), remove (`d` twice to confirm), write review (`w`), blocked (`B`), multi-select + bulk pull (`space`/`a`/`p`), split-pane preview (`{`/`}` scroll, auto-shown when terminal >= 120 cols), dynamic resize, search cancel with Esc/q, scroll clamping, footer pinned to bottom

## After every change

1. **Run tests**: `npm test` — all 307 tests must pass
2. **Add tests**: for any new command, endpoint, or DB function
3. **Update docs**: CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md
4. **Verify Docker build** if server code changed
