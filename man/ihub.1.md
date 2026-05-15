---
name: ihub
description: Manual page for ihub — registry for agents, skills, rules, memories, and prompts
---

# ihub

An AI artifact registry for agents, skills, rules, memories, and prompts.

## Synopsis

```
ihub <command> [arguments] [flags]
ihub <type> <command> [arguments] [flags]
```

## Description

ihub is an AI artifact registry for managing agents, skills, rules, memories, and prompts as markdown files with YAML frontmatter. It works with Claude Code, Gemini CLI, Qwen Code, Cursor IDE, Codex CLI, and Open Code — installing artifacts to each coding agent's native path with the correct format.

Artifacts can be created locally, imported from any coding agent, validated for cross-references, published to a remote registry, and discovered by other users. The registry supports versioning, ownership, comments with ratings, user roles, sensitive data detection, IP firewall, audit trails, Prometheus metrics, and an interactive TUI browser.

## Commands

### Browsing

**browse**
Interactive TUI browser for the registry. Keys: ↑↓ navigate, ←→ switch type, ⏎ drill in, / search (Esc/q cancel), space multi-select, a select all, p pull selected, P quick pull, c comments, w write review, d remove (double-press to confirm), f bookmark, F bookmarks, g dependency graph, v versions, y copy pull command, j projects (shows current artifact's project, A for all), G artifact guide (3-tab reference: types, memory taxonomy, knowledge mapping), s cycle sort, {} scroll preview pane. Admin: m metrics (side-by-side charts when wide), t audit trail (n/b pages), i config, B blocked artifacts. Split-pane markdown preview appears on the right when terminal >= 120 columns. Terminal resize re-renders layout automatically.

**list** [type]
List entries. Type can be agents, skills, rules, memories, prompts, or omitted for all.

**show** <type> <name>
Show metadata (as JSON) and body for a specific entry.

**preview** <type> <name>
Render an entry with terminal markdown formatting — headings, code blocks, lists, and inline styles.

**search** <query>
Full-text search across all local entries (name, description, tags, body).

**search** --remote <query>
Search the remote registry.

**projects** [name]
Tree view of all projects and their artifacts, grouped by type. Pass a project name to filter.

**validate**
Check all entries for required fields (name, description, version) and broken cross-references between skills, rules, and agents.

### Creating

**create** <type> <name> [-i]
Create a new entry from template. Use -i or --interactive to be prompted for each field.

### Publishing

**push** <type> <name>
Publish a local entry to the remote registry. Requires authentication. The authenticated user becomes the owner.

**import** <type> <path> [-i] [--no-push]
Import an artifact from an external coding agent. Auto-detects the source agent (Claude, Cursor, Qwen, Codex, Gemini, Open Code) from the path. Maps agent-specific frontmatter fields to ihub format. Supports .md and .mdc files. In non-interactive mode, prompts only for missing required fields. Use -i to prompt for all fields. Use --no-push to save locally without publishing.

**pull** <type> <name[:version]> [--local | --global] [--agent <name>...]
Download an entry from the registry. Version can be appended with colon syntax (e.g. my-agent:v1.0.0 or my-agent:latest). Use --local/-l for project scope, --global/-g for personal scope. Use --agent to specify target coding agent(s) — supports claude, gemini, qwen, opencode, codex, cursor, ihub. Multiple --agent flags install to all specified agents simultaneously. Memories always install to the local memories/ directory. Agent preference is saved to ~/.ihubrc on first use.

**remove** <type> <name>
Remove an entry from the registry. Only the owner can remove their artifacts.

### Reviews

**comment** <type> <name>
Add a comment with a rating (1-5 stars) to an artifact. Requires authentication.

**comments** <type> <name>
View all comments and the average rating for an artifact.

### Authentication

**register** <url>
Create a new account on a registry server. The first user becomes admin (unless an admin is preconfigured in ihub.config.json). Saves the API key to ~/.ihubrc.

**login** <url> [--auth0]
Log in with an existing API key (prompted) or via Auth0 device flow with --auth0. Saves credentials to ~/.ihubrc.

**passwd**
Change your password (API key). Prompts for the new password twice. Minimum 8 characters. Updates ~/.ihubrc automatically.

**whoami**
Show the current authenticated user, role, and registry URL.

### Administration

**config**
Show the active server configuration and which features are enabled. Admin only.

**audit** [--user U] [--action A] [--page N] [--limit N]
View the audit trail. Shows the last 50 actions by default. Admin actions are displayed with a red ADMIN badge, user actions with a blue USER badge. Each entry includes timestamp, IP address, username, action, target artifact, and detail. Admin only.

**metrics** [--type T] [--user U] [--name N] [--project P]
Show a terminal metrics dashboard with bar charts for pushes, views, comments, removes, and entries — broken down by type, artifact, user, and project. Supports filtering with any combination of flags.

**backup** [path]
Download a full SQLite database backup. Defaults to ihub-backup-<timestamp>.db. Admin only.

**admin set-role** <username> <role>
Set a user's role to "user" or "admin". Admin only.

**admin approve** <type>/<name>
Unblock a blocked artifact after reviewing its sensitive data findings. The artifact's status changes from "blocked" to "available" and it becomes pullable. Admin only.

**admin blocked**
List all currently blocked artifacts with their type, name, owner, and findings summary. Admin only.

**admin digest**
Trigger the weekly Slack digest immediately. Admin only. Requires SLACK_WEBHOOK_URL.

### Utilities

**completions** [bash | zsh]
Output shell completion scripts. Run without arguments for setup instructions.

**version**
Show the ihub version and branding.

**help**
Show a quick command reference.

**man**
Show this manual page.

## Type-first syntax

All type-scoped commands support both syntaxes:

```
ihub show agent code-reviewer
ihub agent show code-reviewer
```

Types accept singular or plural: agent/agents, skill/skills, rule/rules, memory/memories, prompt/prompts.

## Artifact types

**agent** — An autonomous actor that performs a task. Defines inputs, outputs, skills used, and rules followed.

**skill** — A reusable capability or procedure. Defines triggers, arguments, and compatible agents.

**rule** — A constraint or standard. Defines scope, severity (error/warning/info), and which agents it applies to.

**memory** — Captured context or knowledge that persists across sessions. Defines scope, context type (decision/architecture/incident/domain/context/learning), and related entries.

**prompt** — A reusable instruction template. Defines the prompt text, variables, target model, and compatible agents.

## File format

Each artifact is a markdown file with YAML **frontmatter** — a block of key-value metadata between two `---` lines at the top of the file:

```yaml
---
name: my-entry
description: What this entry does
version: 0.1.0
author: your-name
project: my-project
tags: [tag1, tag2]
---

# my-entry

Regular markdown body content follows.
```

Frontmatter is parsed as YAML. The body (everything after the closing `---`) is the artifact's documentation. ihub supports simple YAML only: strings, numbers, booleans, and inline arrays `[a, b, c]`. No nested objects or multi-line values.

## Configuration

The server reads ihub.config.json on startup:

```json
{
  "server": { "port": 3000, "db_path": "./ihub.db" },
  "admin": { "username": "", "password": "" },
  "auth0": { "enabled": false, "domain": "", "client_id": "", "audience": "ihub-api" },
  "slack": { "enabled": false, "webhook_url": "", "digest_interval_hours": 168 },
  "metrics": { "enabled": true },
  "audit": { "enabled": true, "log_anonymous": true },
  "firewall": { "enabled": false, "whitelist": [] },
  "security": { "notify_via": "terminal", "email": "", "slack_webhook_url": "" }
}
```

Environment variables override config file values. Set IHUB_CONFIG for a custom path.

## Environment variables

- **IHUB_PORT** — Server port (default: 3000)
- **IHUB_DB_PATH** — SQLite database path (default: ./ihub.db)
- **IHUB_CONFIG** — Path to config file (default: ./ihub.config.json)
- **IHUB_REGISTRY** — Registry URL for CLI (default: http://localhost:3000)
- **IHUB_TOKEN** — API key for CLI
- **IHUB_ADMIN_USERNAME** — Admin username (seeded on startup)
- **IHUB_ADMIN_PASSWORD** — Admin API key (seeded on startup)
- **AUTH0_DOMAIN** — Auth0 tenant domain
- **AUTH0_CLIENT_ID** — Auth0 application client ID
- **AUTH0_AUDIENCE** — Auth0 API audience (default: ihub-api)
- **SLACK_WEBHOOK_URL** — Slack incoming webhook URL
- **IHUB_FIREWALL_WHITELIST** — Comma-separated IP whitelist (exact, CIDR, wildcard)
- **IHUB_SECURITY_NOTIFY_VIA** — Security alert channel: terminal, slack, or email
- **IHUB_SECURITY_EMAIL** — Email address for security alerts (when notify_via=email)
- **IHUB_SECURITY_SLACK_WEBHOOK** — Slack webhook for security alerts (separate from notifications)
- **SMTP_HOST** — SMTP server host for email alerts
- **SMTP_PORT** — SMTP server port (default: 587)
- **SMTP_USER** — SMTP username
- **SMTP_PASS** — SMTP password
- **SMTP_FROM** — From address for security emails

## Files

- **~/.ihubrc** — CLI client config (registry URL, token, username)
- **ihub.config.json** — Server config file
- **ihub.db** — SQLite database (entries, users, comments, audit log)

## See also

README.md, CONTRIBUTING.md, CHANGELOG.md
