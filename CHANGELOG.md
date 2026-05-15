# Changelog

All notable changes to ihub are documented in this file.

## [0.3.0] - 2026-05-15

### Added

- **Memory taxonomy**: formalized `context_type` vocabulary for memories — `decision`, `architecture`, `incident`, `domain`, `context`, `learning` — with clear boundaries against other artifact types (memories store knowledge, not actions/constraints/instructions)
- **Memory template**: updated with context_type reference and boundary guidance
- **TUI artifact guide**: `G` key opens interactive guide with 3 tabs — overview (types, boundaries, decision tree), memory context types (6 types with examples), knowledge mapping (50+ IT project situations mapped to context types and roles)
- **Registry examples**: 12 new memories covering all context types (3 ADRs, 2 architecture, 2 incidents, 2 domain, 2 context, 2 learnings), 3 agents, 4 skills, 3 rules, 3 prompts, 2 blocked artifacts, 3 users with 108+ comments
- **Documentation**: comprehensive knowledge mapping tables for IT projects (development, infrastructure, FinOps, migrations, landing zones) with roles and context types
- **Test suite**: 307 tests

---

## [0.2.0] - 2026-05-14

### Added

- **Multi-agent pull**: install artifacts to multiple coding agents simultaneously with `--agent claude,cursor`; frontmatter transformed per agent (Cursor `.mdc`, Claude/Qwen/OpenCode `SKILL.md` dirs)
- **Import from any agent**: `ihub import` auto-detects source agent from path, maps agent-specific fields to ihub format, prompts only for missing required fields
- **Interactive TUI browser**: `ihub browse` with multi-select, bulk pull, agent/scope selection, comments/ratings view, admin metrics dashboard, admin audit trail with pagination
- **Coding agent configs**: `cli/agents-config.js` with verified paths for Claude Code, Gemini CLI, Qwen Code, Open Code, Codex CLI, Cursor IDE
- **Kubernetes manifests**: `k8s/` directory deployable with `kubectl apply -k k8s/`

### Fixed

- Docker base image switched from `node:22-alpine` to `node:22-slim` (resolves high severity CVE)
- Gemini CLI paths updated to `~/.gemini/skills/` with SKILL.md format
- Codex CLI paths updated to `~/.agents/skills/` with SKILL.md format
- TUI agent-select/scope-select ESC and Enter keys fixed (handler priority)
- TUI bulk pull uses skillAsDir for directory-based agents
- TUI per-agent error isolation during bulk pull
- Memories always install to local `memories/` directory (no agent paths)
- **Sensitive data detection**: auto-scans + masks on push (CLI + server-side); 80+ patterns for API keys (AWS, Azure, GCP, OpenAI, Anthropic, Stripe, Slack, etc.), Kubernetes/ArgoCD tokens, Atlassian (Jira, Confluence), private keys, passwords, connection strings, Spain-specific PII (mobile, DNI/NIE, CIF, IBAN), credit cards, SSN; logged as `sensitive-detected` audit action; `ihub_sensitive_detected_total` metric
- **IP firewall**: whitelist-based blocking loaded once at startup (immutable); supports exact IPs, CIDR ranges, wildcards; `firewall-blocked` audit action; `ihub_firewall_blocked_total` metric
- **TUI projects view**: `j` key shows project tree grouped by type
- **TUI config view**: `i` key shows server config (admin only)
- **TUI remove**: `d` key removes artifact from detail view (double-press to confirm, any key cancels)
- **TUI write review**: `w` key adds comment/rating from detail view
- **TUI split-pane preview**: right-side markdown preview when terminal width >= 120 columns; list width adapts dynamically to content (shorter names = wider preview); scroll with `{`/`}` keys; clamped so you can't scroll past content
- **TUI project filtering**: `j` from list view shows only the selected artifact's project; `A` from project view shows all projects
- **TUI search cancel**: pressing Esc or `q` (when input is empty) cancels the `/` search prompt
- **TUI dynamic resize**: terminal resize re-renders the layout automatically; footer pinned to bottom with full-height content area
- **TUI scroll clamping**: up/down arrows and preview scroll stop at content boundaries
- **TUI blocked view fix**: blocked artifacts now correctly resolve their type for preview and detail view
- **TUI integration tests**: 38 automated tests spawning real TUI processes with simulated keystrokes
- **Test suite**: 306 tests (43 TUI + 35 sensitive + 228 existing)

---

## [0.1.0] - 2026-05-13

### Added

- **Registry types**: agents, skills, rules, memories, and prompts as markdown files with YAML frontmatter
- **Templates**: scaffolding templates for each type (`ihub create <type> <name>`)
- **Interactive mode**: `ihub create -i` prompts for all fields
- **CLI commands**: list, show, preview, search, validate, create, projects, version
- **Preview**: `ihub preview <type> <name>` renders entries with terminal markdown formatting (headings, code blocks, lists, inline styles via ANSI escape codes)
- **Type-first syntax**: `ihub agents list`, `ihub agent show <name>` as alternative to `ihub list agents`, `ihub show agent <name>`
- **Registry server**: Node.js + SQLite HTTP API for publishing and consuming artifacts
  - `POST /api/register` to create user accounts
  - `GET/POST/DELETE /api/:type/:name` for CRUD
  - `GET /api/:type/:name/versions` for version history
  - `GET /api/search?q=` for full-text search
  - `GET /api/whoami` to verify authentication
- **Push/pull**: publish local entries to the registry and download remote entries
  - Version tags: `ihub pull agent my-agent:v1.0.0` or `my-agent:latest`
  - Install destination: `--local` (project) or `--global` (`~/.claude/`)
  - Memories always install locally
- **User-based ownership**: each artifact has an owner; only the owner can update or remove it
- **Comments and ratings**: users can add comments with 1-5 star ratings to any artifact
  - `ihub comment <type> <name>` to add a review
  - `ihub comments <type> <name>` to view reviews and average rating
  - Only the comment author can delete their comment
- **Auth commands**: `register`, `login`, `passwd`, `whoami`, `version`
- **Manual page**: `ihub man` renders a full manual with all commands, types, config, and environment variables — formatted with terminal markdown rendering
- **Interactive TUI browser**: `ihub browse` — keyboard-navigable terminal UI to explore the registry
  - Navigate types, drill into artifacts, view metadata and body with markdown rendering
  - Comments/ratings view with rating distribution bar chart (press `c` from detail)
  - Admin metrics dashboard (press `m` from types view)
  - Admin audit trail with pagination (press `t` from types view, `n`/`b` for pages)
  - Multi-select with space bar, select all with `a`, bulk pull with `p`
  - Agent selection + scope selection before bulk pull
  - Search with `/`, refresh with `r`
- **Multi-agent pull**: install artifacts to multiple coding agents simultaneously
  - `--agent claude,cursor` installs to each agent's native path
  - Claude/Qwen/OpenCode: `<name>/SKILL.md` directory structure
  - Cursor: `.mdc` extension with `description/globs/alwaysApply` frontmatter
  - Gemini/Codex: skipped with notes (use monolithic files)
  - Agent preference saved to `~/.ihubrc`; `IHUB_AGENT` env var for CI
  - `transformForAgent()` rewrites frontmatter to match each agent's expected format
- **Import command**: `ihub import <type> <path>` reads external artifacts from any coding agent
  - Auto-detects source agent from path (Claude, Cursor, Qwen, Codex, Gemini, Open Code)
  - Maps agent-specific frontmatter to ihub fields (e.g., Cursor `alwaysApply` → `scope: global`)
  - Supports `.md` and `.mdc` files, plus directories with SKILL.md/AGENT.md
  - In non-interactive mode, prompts only for missing required fields
  - `-i` prompts for every field with pre-filled defaults from source
  - `--no-push` saves locally without pushing
  - Copies all companion files (scripts, schemas, configs)
- **Attachments**: artifacts can include companion files (scripts, schemas, configs)
  - Push auto-detects a `<type>/<name>/` directory and uploads all files as base64 attachments
  - Pull recreates the directory structure alongside the `.md` file
  - `GET /api/:type/:name/attachments` lists attachments; `GET /api/:type/:name/attachments/:path` downloads one
  - Attachments stored in SQLite `attachments` table; deleted when the artifact is removed
- **Shell completions**: `ihub completions bash` and `ihub completions zsh` — covers all commands, types, artifact names, flags, and type-first syntax
- **Password change**: `ihub passwd` prompts twice, validates match and min 8 chars, updates API key on server and in `~/.ihubrc`; `POST /api/account/password` endpoint; logged to audit trail
- **Admin roles**: first registered user becomes admin; admin-only operations for backup and role management
  - `ihub backup [path]` to download a full SQLite DB backup
  - `ihub admin set-role <user> <role>` to promote/demote users
  - `GET /api/backup` and `POST /api/users/:username/role` endpoints (admin only)
- **Terminal metrics dashboard**: `ihub metrics` renders a dashboard with stats, bar charts per type/user/artifact/project; supports `--type`, `--user`, `--name`, `--project` filters
- **Prometheus metrics**: `GET /api/metrics` exposes counters (push, pull, view, search, comment, remove, register, backup) and gauges (entries, users, comments) per type and user
- **Grafana dashboard**: pre-built dashboard with 14 panels (stats, time series, pie/bar charts) at `grafana/dashboard.json`
- **Audit trail**: every action (view, list, push, remove, comment, search, register, backup, set-role) is logged to an `audit_log` table with username, role, type, name, detail, and timestamp
  - `ihub audit` renders a paginated audit trail (admin only) with distinct formatting for admin vs user actions
  - Filter with `--user`, `--action`, `--page`, `--limit`
  - `GET /api/audit` endpoint with query params for pagination and filtering
  - Anonymous actions (view, pull, list, search, versions, view-comments) are logged with username `anonymous`
  - Client IP address captured on every audit entry (`x-forwarded-for` or socket address) for tracing
  - Pulls distinguished from views via `X-Ihub-Action: pull` header (CLI sends automatically)
- **Auth0 integration**: optional Auth0 JWT authentication via Device Authorization flow
  - `ihub login <url> --auth0` — opens browser for Auth0 device login
  - Server verifies RS256 JWTs against Auth0 JWKS (zero dependencies, `server/auth0.js`)
  - Auth0 users auto-provisioned in DB on first login; first user still becomes admin
  - API keys remain as fallback for programmatic/CI use
  - Configured via `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` env vars; disabled when unset
- **Slack integration**: push notifications and weekly digest via Incoming Webhook
  - Every artifact push sends a Slack message with type, name, version, and owner
  - Weekly digest: top 5 pulled artifacts per type + top 5 users by activity + summary stats
  - `ihub admin digest` triggers digest on demand; server auto-schedules weekly via `setInterval`
  - Configured via `SLACK_WEBHOOK_URL` env var; disabled when unset
- **Server config file**: `ihub.config.json` enables/disables optional features (auth0, slack, metrics, audit) at startup
  - Priority: env vars > config file > defaults; config file is optional
  - `admin.username` + `admin.password` seeds an admin user at startup (password used as API key)
  - If no admin configured, first registered user becomes admin (backward compatible)
  - Env vars `IHUB_ADMIN_USERNAME` and `IHUB_ADMIN_PASSWORD` override config file
  - `ihub config` (admin) shows enabled features; `GET /api/config` endpoint
  - Audit logging respects `audit.log_anonymous` setting
  - Metrics endpoint respects `metrics.enabled` setting
- **Health check**: `GET /api/ping` returns `{ pong: true, timestamp }` — no auth required
- **Docker Compose**: `docker-compose.yml` runs ihub server + Prometheus + Grafana with auto-provisioned datasource and dashboard
- **Projects**: optional `project` field on all artifact types; `ihub projects` renders a tree view grouping artifacts by project and type
- **Cross-reference validation**: `ihub validate` checks that all skill, rule, and agent references resolve
- **Kubernetes manifests**: `k8s/` directory with namespace, deployment, service, ingress, PVC, secrets, configmap, CronJob backup (daily, 7-day retention), Prometheus, and Grafana — all deployable with `kubectl apply -k k8s/`
- **Dockerfile**: multi-stage Alpine build for the registry server (tini, non-root user, volume at `/data`)
- **Examples directory**: sample entries (agent, skill, rule, memory, prompt) under `examples/` for reference
- **THIRD_PARTY_LICENSES**: full license text for better-sqlite3 (MIT) and bundled SQLite (public domain), plus transitive dependency table
- **Test suite**: 228 tests covering parser, markdown renderer, metrics, registry client, database, API routes, and CLI end-to-end
