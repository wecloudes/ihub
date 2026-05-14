# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ihub

A registry for agents, skills, rules, memories, and prompts. Each entry is a `.md` file with YAML frontmatter. The CLI parses, queries, and syncs entries with a remote HTTP registry server backed by Node.js + SQLite. Supports multi-agent installation (Claude Code, Gemini, Qwen, Cursor, Codex, Open Code). Includes Prometheus metrics, Grafana dashboard, Slack notifications, audit trail, and an interactive TUI browser.

## Project structure

```
agents/    — working dir for agents (frontmatter: name, description, version, tags, project, inputs, outputs, skills, rules)
skills/    — working dir for skills (frontmatter: name, description, version, tags, project, triggers, args, compatible_agents)
rules/     — working dir for rules  (frontmatter: name, description, version, tags, project, scope, severity, applies_to)
memories/  — working dir for memories (frontmatter: name, description, version, tags, project, scope, context_type, related)
prompts/   — working dir for prompts (frontmatter: name, description, version, tags, project, model, compatible_agents)
examples/  — sample entries (4 agents, 6 skills, 4 rules, 3 memories, 5 prompts)
templates/ — scaffolding templates for each type
cli/       — CLI tool (ESM)
  index.js       — command dispatcher, type-first routing, all CLI commands
  parse.js       — frontmatter parser and registry loader
  registry.js    — HTTP client for push/pull/search/comments/backup against remote registry
  render.js      — terminal markdown renderer (ANSI escape codes)
  dashboard.js   — terminal metrics dashboard renderer
  tui.js         — interactive TUI browser (raw stdin, ANSI, multi-select, comments, metrics)
  agents-config.js — coding agent path configs (Claude, Gemini, Qwen, Cursor, Codex, Open Code)
server/    — registry API server
  index.js    — native http server entrypoint
  routes.js   — REST route handlers (auth, CRUD, comments, attachments, backup, metrics, audit)
  auth0.js    — Auth0 JWT verification (RS256, JWKS, zero dependencies)
  slack.js    — Slack webhook (push notifications + weekly digest)
  config.js   — unified config loader (ihub.config.json + env vars)
  db.js       — SQLite layer (better-sqlite3): users, entries, attachments, comments, audit_log tables
  metrics.js  — in-memory Prometheus metrics collector (counters + gauges)
tests/     — all tests (228, node:test, no framework)
  parse.test.js, registry.test.js, render.test.js, dashboard.test.js
  config.test.js, metrics.test.js, slack.test.js
  db.test.js, routes.test.js, cli.test.js
completions/        — bash and zsh shell completions
man/                — manual page (ihub.1.md)
k8s/                — Kubernetes manifests (kustomize)
grafana/            — Grafana dashboard, Prometheus config, provisioning
ihub.config.json    — server config (admin, auth0, slack, metrics, audit)
Dockerfile          — multi-stage server image
docker-compose.yml  — ihub + Prometheus + Grafana stack
```

## Commands

```bash
# Browse & search
ihub browse                              # interactive TUI (navigate, multi-select, pull, comments, metrics)
ihub list [agents|skills|rules|memories|prompts]
ihub search <query>
ihub search --remote <query>
ihub show <type> <name>
ihub preview <type> <name>
ihub validate
ihub projects [name]

# Create & import
ihub create <type> <name> [-i]
ihub import <type> <path> [-i] [--no-push]   # auto-detects source agent (Claude, Cursor, Qwen, etc.)

# Publish & pull
ihub push <type> <name>
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
ihub admin digest

# Auth & account
ihub register <url>
ihub login <url> [--auth0]
ihub passwd
ihub whoami

# Utilities
ihub completions [bash|zsh]
ihub man
ihub version

# Type-first syntax (equivalent)
ihub agent show <name>          # = ihub show agent <name>
ihub skills list                # = ihub list skills

# Server
npm run server
docker compose up -d            # full stack with Prometheus + Grafana
kubectl apply -k k8s/           # Kubernetes deployment
```

Run tests: `npm test` (228 tests)

## Key conventions

- Five artifact types: agent, skill, rule, memory, prompt — `PLURAL_MAP` / `singularize()` / `pluralize()` handle memory/memories
- Entries cross-reference by `name` — `validate` checks all refs resolve
- Frontmatter parser handles simple YAML only — no nested objects, no multi-line values
- All files are ESM (`"type": "module"`)
- CLI uses native `fetch` (no HTTP client dependency)
- Multi-agent pull: `--agent claude,cursor` installs to each agent's native path; saved to `~/.ihubrc` as preference
- `agents-config.js` defines per-agent paths — Claude/Qwen/OpenCode use `<name>/SKILL.md` dirs; Cursor uses `.mdc`; Gemini/Codex skipped (monolithic files)
- `transformForAgent()` rewrites frontmatter on pull: Cursor gets `description/globs/alwaysApply`; Claude gets simplified `name/description`
- `import` auto-detects source agent from path, maps agent-specific fields to ihub (e.g., Cursor `alwaysApply` → `scope: global`), prompts for missing required fields
- Memories always install to local `memories/` — no agent paths, no scope prompt
- Attachments: companion files stored in `attachments` table; push auto-detects `<type>/<name>/` directory; pull recreates structure
- Auth: API keys (register/login) or Auth0 JWT (login --auth0); first user or config `admin.username` becomes admin
- Server config: `ihub.config.json` (or `IHUB_CONFIG` env); configures admin, auth0, slack, metrics, audit
- Audit log: every action logged with username, role, IP, type, name, detail, timestamp — including anonymous
- Prometheus metrics at `GET /api/metrics`; `ihub metrics` renders terminal dashboard with filters
- Slack: push notifications + weekly digest via `SLACK_WEBHOOK_URL`
- TUI (`ihub browse`): navigate types, drill into artifacts, view comments/ratings with bar charts, admin metrics (`m`), admin audit trail (`t`) with pagination, multi-select + bulk pull with agent selection
- Kubernetes: `k8s/` with namespace, deployment, service, ingress, PVC, secrets, CronJob backup, Prometheus, Grafana

## After every change

1. **Run tests**: `npm test` — all 228 tests must pass
2. **Add tests**: for any new command, endpoint, or DB function
3. **Update docs**: CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md — test counts, commands, structure must match
4. **Verify Docker build** if server code changed: `docker build -t ihub-server .`
