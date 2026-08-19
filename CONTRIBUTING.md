# Contributing to ihub

## Getting started

```bash
git clone <repo-url> && cd ihub
bun install
bun test          # run all tests (should pass before you start)
bun run server    # start the registry server locally
```

## Project layout

ihub manages exactly one artifact type: a **plugin** (a Claude Code plugin directory bundling skills, commands, agents, MCP servers, and hooks). Local plugins live in `plugins/<name>/`.

```
cli/           CLI tool (ESM, no external dependencies)
  index.js       command dispatcher + browse/open; accepts the `plugin`/`plugins` noun
  context.js     shared constants: ROOT, TYPE/TYPE_PLURAL, COMPONENT_KINDS, PLUGIN_FIELDS, VALID_HOOK_EVENTS, PLUGIN_NAME_RE, readline helpers, parseJsonFlag
  query.js       list, search, show, preview, validate, projects
  create.js      create (scaffold plugins/<name>/), import (plugin dir or lone component)
  publish.js     push, pull, remove, comment, watch, pullFromUrl, marketplace helpers
  auth.js        register, login, passwd, whoami
  admin.js       audit, metrics, backup, restore, admin, webhook, federation
  diagnostics.js completions, man, config, outdated, doctor, verify, diff, version, help
  pinning.js     version pinning (key plugins/<name>), bundle + marketplace export/import
  parse.js       frontmatter parser; loadPlugin/loadPlugins, collectPluginComponents, collectFiles, unwrapConfig
  registry.js    HTTP client for remote registry + config/header helpers (getBaseUrl, getToken, authHeaders, jsonHeaders)
  render.js      terminal markdown renderer (ANSI)
  dashboard.js   terminal metrics dashboard renderer
  tui.js         interactive TUI browser (plugin list, component-tree detail, comments, metrics, audit, projects, guide, split-pane preview, filter mode, non-blocking fetches with Esc-cancel, dynamic resize)
  agents-config.js  plugin install targets — pluginInstallDir(scope) → ~/.claude/plugins or ./.claude/plugins
  config-merge.js   idempotent JSON merge helpers + extractConfigBlock
server/        registry API server
  index.js       native http server entrypoint
  routes.js      REST route handlers (VALID_TYPES=["plugins"]; auth, CRUD, comments, attachments, backup/restore, webhooks, federation, metrics, audit, firewall, blocked/approve)
  auth0.js       Auth0 JWT verification (RS256, JWKS, optional)
  slack.js       Slack webhook (push notifications + digest)
  config.js      unified config loader (ihub.config.json + env vars)
  db.js          SQLite layer — users, entries, attachments, comments, audit_log, webhooks (type always "plugin")
  storage.js     pluggable storage abstraction (SQLite, S3, R2, GCS, Azure, 30+)
  signing.js     HMAC-SHA256 artifact signing and verification
  versioning.js  semver policy enforcement, breaking change detection
  federation.js  upstream registry sync (VALID_TYPES=["plugins"]; mcp-registry → plugin)
  webhooks.js    webhook notification delivery (HMAC-signed)
  plugins.js     extensible push/pull lifecycle hooks (server-side plugin API — unrelated to the plugin artifact type)
  ui.js          web UI handler (browser-based registry)
  metrics.js     in-memory metrics collector (VictoriaMetrics-compatible)
  vlogs.js       VictoriaLogs client (structured log shipping)
  sensitive.js   sensitive data detection and masking (80+ patterns)
  security-alert.js  security alert notifications (terminal/slack/email)
tests/         test suite (node:test / bun test)
plugins/       working directory for local plugin dirs (gitignored)
examples/plugins/  sample plugins (code-quality, dev-mcps, docs-tools) + DROPPED.md (tracked in git)
templates/plugin/  plugin scaffold used by `ihub create`
completions/   bash and zsh shell completions
man/           manual page source
k8s/           Kubernetes manifests (kustomize)
grafana/       dashboard JSON, VictoriaMetrics scrape config, Grafana provisioning
Dockerfile     multi-stage server image (oven/bun)
docker-compose.yml  ihub + VictoriaMetrics + VictoriaLogs + Grafana stack
```

## Running tests

```bash
bun test                           # run all tests
bun test tests/parse.test.js       # run a single test file
bun test --test-name-pattern "push" tests/cli.test.js  # run matching tests
```

Tests use Bun's built-in test runner with `node:test` compatibility. No test framework dependencies.

CLI integration tests (`tests/cli.test.js`) spawn a real server process on a random port with an isolated DB and HOME directory.

## Making changes

### Adding a new CLI command

1. Add the function in the relevant `cli/*.js` module (e.g. read commands in `query.js`, publish flow in `publish.js`)
2. Import it in `cli/index.js` and register it in the `commands` object
3. Update the `help()` output in `cli/diagnostics.js`
4. Add tests in `tests/cli.test.js`

### Adding a new API endpoint

1. Add DB helpers in `server/db.js` if needed
2. Add the route handler in `server/routes.js`
3. Add the HTTP client function in `cli/registry.js` if it needs CLI access
4. Add tests in `tests/routes.test.js` (API level) and `tests/db.test.js` (DB level)

### Working with the plugin model

There is one artifact type — `plugin`. When adding features:

1. A local plugin is a `plugins/<name>/` directory with `.claude-plugin/plugin.json`. `loadPlugin`/`loadPlugins` in `cli/parse.js` load them; `collectPluginComponents` derives `meta.components` (`skills`/`commands`/`agents`/`mcpServers`/`hooks`).
2. Push packs the plugin into a registry entry: manifest → meta, README → body, every component file → an attachment. Pull reverses it. Reuse the attachment infra rather than adding a new transfer path.
3. MCP config (`.mcp.json`) and hook config (`hooks/hooks.json`) are Claude-native shapes — use `unwrapConfig()` (tolerates wrapped and flat forms). Keep secrets as `${VAR}` placeholders; never commit or transfer literal secrets.
4. Server-side, the type dimension is fixed: `VALID_TYPES = ["plugins"]` in `server/routes.js`, `server/federation.js`, and `server/ui.js`. Don't reintroduce per-type branching.
5. Extend `ihub validate` (`cli/query.js`) when you add a component-level constraint; add a case to `tests/validate-*.test.js`.

### Modifying the database schema

- Add new tables in the `init()` function in `server/db.js`
- For existing columns, add a migration `try/catch` block (see the `owner` column migration as an example)
- The DB auto-creates on first run; no separate migration tool

## Code conventions

- ESM throughout (`"type": "module"`)
- No external dependencies in the CLI (uses native `fetch`, `readline`, `fs`)
- Server uses Bun's built-in `bun:sqlite`; the only external dependency is `files-sdk` (storage backends)
- Terminal rendering uses raw ANSI escape codes, no dependencies
- Frontmatter parser handles simple YAML only (no nested objects, no multi-line values); plugin manifests are JSON (`.claude-plugin/plugin.json`)
- Plugin structure is validated by `ihub validate` (manifest, skill/command/agent files, `.mcp.json`, `hooks/hooks.json`)
- MCP config (`.mcp.json`) and hook config (`hooks/hooks.json`) are Claude-native and travel inside the plugin; a plugin installs as a whole directory (`ihub pull --install`) — there is no per-agent config merge
- Secrets in MCP `env`/`headers` are always `${VAR}` placeholders; the sensitive scanner masks and blocks literal secrets on push (README body + every text component file)

## Before submitting

1. Run `bun test` and ensure all tests pass
2. Add tests for any new commands, endpoints, or DB functions
3. Run `ihub validate` to check that local plugins are well-formed
4. If you changed the server, verify the Docker image builds: `docker build -t ihub-server .`
5. Update all documentation: CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md
