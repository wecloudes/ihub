# Changelog

All notable changes to ihub are documented in this file.

## [0.5.0] - 2026-05-21

### Added

- **`ihub open` command**: opens the web UI in your default browser (macOS, Linux, Windows)
- **VictoriaMetrics**: replaced Prometheus with VictoriaMetrics for metrics scraping — same Prometheus-compatible text format, lighter footprint, built-in scraping via `-promscrape.config`
- **VictoriaLogs**: structured log shipping from `logAction()` to VictoriaLogs via JSON Lines API (`/insert/jsonline`); every audit event (push, pull, view, comment, remove, register, firewall-blocked, etc.) is shipped asynchronously; configured via `IHUB_VLOGS_URL` env var or `logs.vlogs_url` config
- **Grafana VictoriaLogs datasource**: added `victoriametrics-logs-datasource` plugin to Grafana provisioning for log querying in dashboards
- **`logs` config section**: `logs.vlogs_url` in `ihub.config.json` (or `IHUB_VLOGS_URL` env var) to configure VictoriaLogs endpoint; printed in startup config output
- **Agent `memories` and `prompts` fields**: agents can now declare which memories and prompts they use via frontmatter arrays (parallel to `skills` and `rules`); `ihub validate` checks cross-references; `ihub pull` resolves all dependencies transitively (unless `--no-deps`); template, examples, and interactive create updated
- **Prompt `memories` field**: prompts can declare which memories they need for context; `ihub validate` checks cross-references; `ihub pull` resolves memory dependencies transitively
- **Web UI: Artifact Graph view**: new "Graph" nav item shows a force-directed bubble map of all artifacts and their relationships (skills, rules, memories, prompts, compatible_agents, applies_to, related); nodes colored by type, sized by connection count; click to highlight neighborhood, double-click to navigate; info panel with connections grouped by type; Center button + auto-recenter on resize
- **Web UI: Dependency panel in detail view**: every artifact detail page now shows "Uses" (outgoing) and "Used by" (incoming) relationships as clickable color-coded chips — navigate the dependency graph without leaving the detail view
- **Web UI: Global search**: search input now spans all artifact types simultaneously, showing grouped results across agents, skills, rules, memories, and prompts; breadcrumb trail for navigation context
- **Web UI: Version diff**: version history entries have a "diff" button that loads both versions and shows a line-by-line comparison with added/removed highlighting
- **Web UI: Attachment preview**: detail view shows a file list of attachments with download links when an artifact has companion files
- **Web UI: Export buttons**: single-artifact export from detail view ("Export" button) and bulk export from Browse (select mode with checkboxes, "Export N" button); both produce JSON bundles
- **Web UI: Bulk selection**: Browse view has a "Select" toggle that shows checkboxes on cards for multi-select; selected artifacts can be bulk-exported
- **Web UI: Markdown preview in Push form**: Write/Preview tabs on the body textarea; Preview renders the markdown using the existing renderer before pushing
- **Web UI: Breadcrumbs**: Browse and detail views show a breadcrumb trail (Browse > type > name) for orientation and quick navigation back
- **Web UI: Trending sort**: new "trending" sort option in Browse that ranks by a composite of pulls, ratings, and comment count
- **Web UI: Pull counts on cards and detail**: pull count shown on Browse cards and detail meta when available
- **Web UI: Backup & Restore in Admin**: download SQLite or full JSON backups with timestamped filenames; restore from `.db` or `.json` backup files via file upload (auto-detects format, confirmation dialog); import JSON bundles to push all artifacts at once
- **Web UI: Webhooks management in Admin**: table of configured webhooks with URL, events, and Remove button; Add form with URL, events filter, and optional HMAC secret
- **Web UI: Federation status in Admin**: shows upstream registries with URL, types, last sync time, and synced count; "Sync Now" button triggers manual federation sync
- **`ihub diff` CLI command**: `ihub diff <type> <name> <v1> <v2>` compares two versions of an artifact with color-coded terminal output (green additions, red deletions, line count summary)
- **Rule `globs` field**: rules can now specify file patterns (e.g. `globs: "src/**/*.{js,ts}"`) to scope which files the rule applies to; mapped to Cursor `.mdc` globs on pull, Claude Code rule globs, and imported from Cursor `.mdc` files; template and examples updated
- **Test suite**: 456 tests (18 new) — CLI tests for diff command, open command, agent memories/prompts/validate cross-refs, help output; route tests for UI endpoint HTML content, version diff API, artifact relationship meta storage; VictoriaLogs client tests (init, shipLog, structured JSON delivery, level field, graceful missing fields)

### Changed

- **`ihub list`**: now queries the remote registry and merges with local entries (dedup by name, remote wins); previously only read from local filesystem
- **`ihub search`**: now queries the remote registry and merges with local results by default; `--remote` flag still works for remote-only search
- **Docker Compose**: replaced `prom/prometheus` with `victoriametrics/victoria-metrics` (port 8428) + `victoriametrics/victoria-logs` (port 9428); Grafana depends on both
- **Kubernetes**: replaced `k8s/prometheus.yaml` with `k8s/victoriametrics.yaml` containing VictoriaMetrics + VictoriaLogs deployments, services, and config; updated `kustomization.yaml`; added `IHUB_VLOGS_URL` env var and `victoriametrics.com/*` annotations to deployment
- **Grafana datasources**: renamed Prometheus datasource to VictoriaMetrics (URL `http://victoriametrics:8428`), added VictoriaLogs datasource; dashboard queries unchanged (VictoriaMetrics is PromQL-compatible)
- **Scrape config**: renamed `grafana/prometheus.yml` to `grafana/scrape.yml` (same format, VictoriaMetrics uses Prometheus-compatible scrape config)

### Fixed

- **Web UI: content clipping** (high) — horizontal overflow on Browse cards, detail pages, audit table, blocked table, and metrics cards; added `overflow-x:hidden` to main-content and `min()` in grid minmax values
- **Web UI: review form unreachable** (high) — detail view content area not scrollable; added `overflow-y:auto` to content container
- **Web UI: prompts tab hidden** (medium) — tab bar overflowed at narrow viewports; added `overflow-x:auto` to type-tabs
- **Web UI: Projects nav/back broken** (medium) — clicking artifact from Projects switched nav to Browse and Back returned to wrong page; `navToArtifact` now stores `_previousView`, `backToList` restores it
- **Web UI: audit pagination non-functional** (medium) — API uses `offset` parameter, not `page`; fixed query to `?limit=50&offset=((page-1)*50)`
- **Web UI: blocked reason column empty** (medium) — added fallback text "Sensitive data detected" when no explicit reason stored
- **Web UI: Set Role crashes on invalid username** (medium) — wrong API endpoint `/admin/role` fixed to `/users/:username/role`
- **Web UI: no Set Role feedback** (medium) — same root cause as endpoint bug; toast now shows on success
- **Web UI: rating/pulls not shown on cards** (low) — added pull count to card footer
- **Web UI: metrics blank space** (low) — reduced metrics-grid margin
- **Web UI: user section invisible** (low) — added `color:var(--text)` to sidebar user section
- **Web UI: hamburger menu non-functional** (low) — added sidebar overlay element and click-to-close handler
- **Web UI: default 5-star rating** (low) — `_reviewRating` now reset to 0 on each detail render
- **TUI: arrow key navigation breaks after first tab switch** — mouse tracking now only enabled when `process.stdin.isTTY` is true; programmatic drivers (expect, piped stdin) no longer get mouse sequences mixed with arrow keys

---

## [0.4.0] - 2026-05-19

### Added

- **Full backup/restore (JSON)**: `ihub backup --full` exports the entire registry as a portable JSON bundle (artifacts, comments, users, attachments base64-encoded) — works with any storage adapter (S3, R2, GCS, etc.), not just SQLite. `ihub restore <file.json>` imports it back. Server endpoints: `GET /api/backup/full`, `POST /api/backup/full`
- **Database restore**: `ihub restore <file.db>` restores from a SQLite backup. Server endpoint: `POST /api/backup` (validates SQLite magic bytes). `restoreDb()` in `server/db.js` closes, copies, and reopens the database
- **Webhooks**: admin-managed HTTP webhooks for registry events (push, pull, comment, remove, approve, register). CRUD via `ihub webhook list|add|remove` CLI commands and `GET/POST/DELETE /api/webhooks` endpoints. Payloads signed with HMAC-SHA256 (`X-Ihub-Signature` header) when a secret is configured. Server module: `server/webhooks.js`
- **Federation**: subscribe to upstream registries and mirror artifacts. `ihub federation sync` triggers manual sync; `ihub federation status` shows upstream state. Server module: `server/federation.js` with periodic `syncAll()`. Synced artifacts have `owner: "federated:{url}"`. Endpoints: `POST /api/federation/sync`, `GET /api/federation/status`
- **Artifact signing**: HMAC-SHA256 signing and verification. Artifacts signed on push, verified on pull when `signing.enabled: true` and `signing.key` (or `IHUB_SIGNING_KEY` env var) is set. `ihub verify <type> <name>` checks signature locally. Server module: `server/signing.js`
- **Versioning policy**: enforce semver bumps and detect breaking changes (removed sections, >50% body shrinkage). Configure `versioning.enforce_semver` and `versioning.require_major_for_breaking` in config. Server module: `server/versioning.js`
- **Plugin system**: extensible hooks for push/pull lifecycle. Plugins are JS modules listed in `ihub.config.json` under `plugins[]`. Each exports `{ name, beforePush?, afterPush?, beforePull? }`. `beforePush` can block; `afterPush` is fire-and-forget; `beforePull` can transform body/meta. Server module: `server/plugins.js`
- **Version pinning**: `ihub pin <type> <name> [version]` locks an artifact to a specific version; `ihub unpin` removes the pin; `ihub pins` lists all pins. Stored in `~/.ihubrc` under `pins`
- **Bundle export/import**: `ihub export [--project P] [--type T]` exports artifacts as a JSON bundle to stdout; `ihub import <file.json> [--no-push]` imports a bundle, saving locally and optionally pushing. CLI module: `cli/pinning.js`
- **Watch mode**: `ihub watch` watches local artifact directories for `.md` file changes and auto-pushes on save (500ms debounce)
- **Doctor command**: `ihub doctor` runs diagnostic checks — server reachability, auth validity, local artifact validation, storage writeability, config file existence
- **Outdated command**: `ihub outdated` compares local artifact versions against the registry and lists available updates
- **Verify command**: `ihub verify <type> <name>` validates HMAC-SHA256 signature stored in artifact `meta._signature`
- **Create from template**: `ihub create <type> <name> --from <template>` downloads an existing registry artifact as a template for a new local artifact
- **Pull from URL**: `ihub pull <url>` pulls an artifact directly from any registry URL (auto-detects type/name from URL path)
- **Pull --no-deps**: `ihub pull <type> <name> --no-deps` skips transitive dependency resolution
- **JSON output**: `--json` flag on `list`, `show`, `search`, `comments`, `whoami`, `projects`, `audit`, `metrics` for machine-readable output
- **Web UI**: browser-based registry interface at `/ui` with full feature parity — artifact browsing, detail views, projects, comments, metrics, audit, guide. Server module: `server/ui.js`
- **TUI mouse support**: click to select, scroll wheel navigation, tab clicking
- **TUI light theme**: `IHUB_THEME=light` environment variable for light terminals
- **TUI related navigation**: `>` key in detail view to navigate to referenced artifacts
- **Test suite**: expanded with signing, versioning, federation, webhooks, plugins tests; backup/restore and webhook route tests added

### Fixed

- Web UI header alignment, projects view with type colors
- Web UI sidebar icons, detail spacing, layout
- Web UI metrics, audit colors, guide layout
- Web UI light theme tags readability
- Web UI regex escaping for asterisks in template literals
- Web UI meta parsing when already deserialized

---

## [0.3.0] - 2026-05-15

### Added

- **TUI split-pane preview**: right-side markdown preview when terminal >= 120 columns; list width adapts dynamically to content (shorter names = wider preview); scroll with `{`/`}` keys; clamped so you can't scroll past content
- **TUI artifact guide**: `G` key opens interactive guide with 3 tabs — overview (types, boundaries, decision tree), memory context types (6 types with examples), knowledge mapping (50+ IT project situations mapped to context types and roles)
- **TUI comprehensive metrics**: `m` key now shows all available metrics in paired side-by-side charts (when terminal >= 100 cols) — entries by type/project, pushes/pulls/views by user and artifact, comments by user/artifact, removes, HTTP requests, security stats, admin stats
- **TUI delete confirmation**: `d` requires double-press to confirm, any other key cancels
- **TUI project filtering**: `j` from list view shows only the selected artifact's project; `A` from project view shows all
- **TUI search cancel**: pressing Esc or `q` (when input is empty) cancels the `/` search prompt
- **TUI dynamic resize**: terminal resize re-renders layout; footer pinned to bottom; scroll clamping on all views; pagination info in footer bar
- **Memory taxonomy**: formalized `context_type` vocabulary — `decision`, `architecture`, `incident`, `domain`, `context`, `learning` — with clear boundaries against other artifact types
- **Grafana dashboard**: expanded from 14 to 24 panels — added pulls by user/time, entries by project, comments by artifact, sensitive detected, firewall blocked, role changes
- **Documentation**: comprehensive knowledge mapping tables for IT projects (development, infrastructure, FinOps, migrations, landing zones) with roles and context types; security alerts and blocking workflow fully documented across all files
- **Registry examples**: 12 new memories, 3 agents, 4 skills, 3 rules, 3 prompts, 2 blocked artifacts, 3 users with 108+ comments
- **Test suite**: 307 tests (44 TUI + 35 sensitive + 228 existing)

### Fixed

- Blocked artifacts now correctly resolve type for preview and detail view
- Scroll pagination moved from content area to footer line
- ESC key works in guide view

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
- **Sensitive data detection + blocking**: auto-scans + masks on push (CLI + server-side); if findings detected, artifact is **blocked** (pulls return 403); admin must `ihub admin approve` to unblock; 80+ patterns for API keys (AWS, Azure, GCP, OpenAI, Anthropic, Stripe, Slack, etc.), Kubernetes/ArgoCD tokens, Atlassian (Jira, Confluence), private keys, passwords, connection strings, Spain-specific PII (mobile, DNI/NIE, CIF, IBAN), credit cards, SSN; logged as `sensitive-detected` audit action; `ihub_sensitive_detected_total` metric
- **Security alerts**: configurable via `security.notify_via` — terminal (default), Slack (dedicated webhook), or email (SMTP); sends structured alerts with findings, artifact info, and approval command
- **Admin approve/blocked**: `ihub admin approve <type>/<name>` unblocks artifacts; `ihub admin blocked` lists all blocked artifacts; `GET /api/blocked` and `POST /api/:type/:name/approve` endpoints
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
