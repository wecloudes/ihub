# Contributing to ihub

## Getting started

```bash
git clone <repo-url> && cd ihub
npm install
npm test          # run all tests (should pass before you start)
npm run server    # start the registry server locally
```

## Project layout

```
cli/           CLI tool (ESM, no external dependencies)
  index.js       command dispatcher + all CLI commands
  pinning.js     version pinning, bundle export/import
  parse.js       frontmatter parser, entry/registry loader
  registry.js    HTTP client for remote registry
  render.js      terminal markdown renderer (ANSI)
  dashboard.js   terminal metrics dashboard renderer
  tui.js         interactive TUI browser (multi-select, comments, metrics, audit, projects, guide, split-pane preview, dynamic resize)
  agents-config.js  coding agent path configs (Claude, Gemini, Qwen, Cursor, Codex, Open Code)
server/        registry API server
  index.js       native http server entrypoint
  routes.js      REST route handlers (auth, CRUD, comments, attachments, backup/restore, webhooks, federation, metrics, audit, firewall, blocked/approve)
  auth0.js       Auth0 JWT verification (RS256, JWKS, optional)
  slack.js       Slack webhook (push notifications + digest)
  config.js      unified config loader (ihub.config.json + env vars)
  db.js          SQLite layer — users, entries, attachments, comments, audit_log, webhooks
  storage.js     pluggable storage abstraction (SQLite, S3, R2, GCS, Azure, 30+)
  signing.js     HMAC-SHA256 artifact signing and verification
  versioning.js  semver policy enforcement, breaking change detection
  federation.js  upstream registry sync
  webhooks.js    webhook notification delivery (HMAC-signed)
  plugins.js     extensible push/pull lifecycle hooks
  ui.js          web UI handler (browser-based registry)
  metrics.js     in-memory Prometheus metrics collector
  sensitive.js   sensitive data detection and masking (80+ patterns)
  security-alert.js  security alert notifications (terminal/slack/email)
tests/         test suite (node:test)
  parse.test.js, registry.test.js, render.test.js, dashboard.test.js
  config.test.js, metrics.test.js, slack.test.js
  db.test.js, routes.test.js, cli.test.js, tui.test.js, sensitive.test.js
  signing.test.js, versioning.test.js, federation.test.js, webhooks.test.js, plugins.test.js
agents/        working directory for agent entries (.md, gitignored)
skills/        working directory for skill entries (.md, gitignored)
rules/         working directory for rule entries (.md, gitignored)
memories/      working directory for memory entries (.md, gitignored)
prompts/       working directory for prompt entries (.md, gitignored)
examples/      sample entries for reference (tracked in git)
templates/     scaffolding templates for each type
completions/   bash and zsh shell completions
man/           manual page source
k8s/           Kubernetes manifests (kustomize)
grafana/       dashboard JSON, Prometheus config, provisioning
Dockerfile     multi-stage server image (slim + tini)
docker-compose.yml  ihub + Prometheus + Grafana stack
```

## Running tests

```bash
npm test                           # run all tests
node --test tests/parse.test.js    # run a single test file
node --test --test-name-pattern "push" tests/cli.test.js  # run matching tests
```

Tests use Node's built-in test runner (`node:test`). No test framework dependencies.

CLI integration tests (`tests/cli.test.js`) spawn a real server process on a random port with an isolated DB and HOME directory.

## Making changes

### Adding a new CLI command

1. Add the function in `cli/index.js`
2. Register it in the `commands` object
3. If it's a type-scoped command, add routing in the type-first dispatch block
4. Update the `help()` output
5. Add tests in `tests/cli.test.js`

### Adding a new API endpoint

1. Add DB helpers in `server/db.js` if needed
2. Add the route handler in `server/routes.js`
3. Add the HTTP client function in `cli/registry.js` if it needs CLI access
4. Add tests in `tests/routes.test.js` (API level) and `tests/db.test.js` (DB level)

### Adding a new registry type

1. Create the directory (e.g., `workflows/`)
2. Add a template in `templates/workflow.md`
3. Add the type to `loadRegistry()` in `cli/parse.js`
4. Add it to `TYPE_FIELDS` and `PLURAL_MAP` in `cli/index.js`
5. Add it to `VALID_TYPES` in `server/routes.js`
6. Add paths to `agents-config.js` for each coding agent

### Adding a new coding agent

1. Add the agent config to `CODING_AGENTS` in `cli/agents-config.js`
2. Define paths for skills, rules, agents, prompts, memories (global + local)
3. Set `skillAsDir: true` + `skillFilename` if the agent uses directory-based skills
4. Add field mappings in `mapSourceFields()` for import
5. Add output transformation in `transformForAgent()` for pull

### Modifying the database schema

- Add new tables in the `init()` function in `server/db.js`
- For existing columns, add a migration `try/catch` block (see the `owner` column migration as an example)
- The DB auto-creates on first run; no separate migration tool

## Code conventions

- ESM throughout (`"type": "module"`)
- No external dependencies in the CLI (uses native `fetch`, `readline`, `fs`)
- Server's only dependency is `better-sqlite3`
- Terminal rendering uses raw ANSI escape codes, no dependencies
- Frontmatter parser handles simple YAML only (no nested objects, no multi-line values)
- Cross-references between entries are validated by `ihub validate`

## Before submitting

1. Run `npm test` and ensure all tests pass
2. Add tests for any new commands, endpoints, or DB functions
3. Run `ihub validate` to check registry integrity
4. If you added a command, verify it works with both syntaxes (`ihub push agent x` and `ihub agent push x`)
5. If you changed the server, verify the Docker image builds: `docker build -t ihub-server .`
6. Update all documentation: CLAUDE.md, README.md, CONTRIBUTING.md, CHANGELOG.md
