# ihub

A registry for agents, skills, rules, memories, and prompts. Each artifact is a `.md` file with YAML frontmatter metadata. No vendor lock-in, no proprietary formats — just files you can edit, version with git, and share through a central registry.

## Install

```bash
git clone <repo-url> && cd ihub
npm install
npm link                    # makes `ihub` available globally
eval "$(ihub completions zsh)"  # or bash — enables tab completion
```

## Quick start

```bash
ihub create skill my-skill -i       # create a new skill interactively
ihub push skill my-skill            # publish to the registry
ihub search --remote "lint"         # find artifacts others have published
ihub pull skill lint-check -l       # download to your project
ihub agent preview code-reviewer    # read an artifact with formatting
ihub projects                       # see everything organized by project
```

---

## Understanding artifact types

ihub manages five types of artifacts. Each solves a different problem. Choosing the right type matters — it determines the frontmatter fields, how the artifact is discovered, and how it connects to other artifacts.

### Agent — _"Who does the work?"_

An agent is an autonomous actor. It takes inputs, follows a strategy, produces outputs, and declares which skills it uses and which rules it follows. Use an agent when you want to describe **a complete workflow performer**.

```yaml
name: code-reviewer
description: Reviews code changes for quality and adherence to project rules
inputs: [diff, file-list]
outputs: [review-comments, approval-status]
skills: [lint-check, dependency-audit]
rules: [require-tests, no-secrets-in-code]
```

**Use an agent when:**
- You have an end-to-end task that takes inputs and produces outputs
- The task uses multiple skills and must follow specific rules
- You want to describe _what_ gets done, not _how_ each step works

**Real examples:** `code-reviewer` (reviews PRs), `security-scanner` (finds vulnerabilities), `doc-generator` (produces API docs from code), `migration-assistant` (generates database migration scripts)

---

### Skill — _"How is it done?"_

A skill is a reusable capability — a single, discrete action that agents (or humans) invoke. Skills define triggers, arguments, and which agents can use them. Use a skill when you want to describe **one specific action** that can be shared across multiple agents.

```yaml
name: lint-check
description: Runs configured linters and returns diagnostics
triggers: [pre-commit, on-demand]
args: [files, fix]
compatible_agents: [code-reviewer, security-scanner]
```

**Use a skill when:**
- You have a single action, not a full workflow
- Multiple agents could benefit from the same capability
- The action has clear inputs (args) and trigger conditions
- You want to attach companion files (scripts, configs) alongside the artifact

**Real examples:** `lint-check` (runs linters), `dependency-audit` (checks for CVEs), `git-commit-msg` (generates commit messages), `test-generator` (writes unit tests), `docx` (creates Word documents — with 59 attached Python scripts)

**Agent vs Skill:** An agent is a _person_ doing a job. A skill is a _tool_ in their toolbox. The `code-reviewer` agent _uses_ the `lint-check` skill. You can give the same skill to different agents.

---

### Rule — _"What must be followed?"_

A rule is a constraint or standard that encodes a decision already made. Rules define what correct and incorrect behavior looks like, and link to the agents that must follow them. Use a rule when you want to **enforce a boundary** that shouldn't be rediscussed on every PR.

```yaml
name: no-secrets-in-code
description: No API keys, tokens, or passwords in source code
scope: global
severity: error
applies_to: [code-reviewer, security-scanner]
```

**Use a rule when:**
- A team decision has been made and shouldn't be debated per-case
- You want to show _correct_ and _incorrect_ examples
- The constraint applies to specific agents or all agents globally
- You need severity levels (error = must fix, warning = should fix, info = consider)

**Real examples:** `require-tests` (PRs must include tests), `no-secrets-in-code` (no hardcoded credentials), `no-console-in-prod` (use structured logging), `max-function-length` (50 lines max)

**Rule vs Memory:** A rule is _prescriptive_ — it says what to do. A memory is _descriptive_ — it captures what was learned. Rules are enforced. Memories are recalled.

---

### Memory — _"What was learned?"_

A memory is captured context — knowledge, decisions, or insights that persist across sessions. Use a memory when you need to store **something that was learned** that isn't a rule, a procedure, or a prompt, but matters for making good decisions.

```yaml
name: api-versioning-strategy
description: Team decision on URL-based API versioning
scope: global
context_type: decision
related: [code-reviewer]
```

**Context types:**
- `memory` — a general piece of knowledge (e.g. "the payments service uses Stripe v3")
- `preference` — a team or user preference (e.g. "prefer functional style over classes")
- `decision` — a recorded architectural decision with rationale
- `insight` — a lesson learned from an incident or experience

**Use a memory when:**
- You learned something important during debugging or an incident
- A team made an architectural decision and you want to capture _why_
- You need context that should surface when working on related artifacts
- The knowledge isn't actionable enough to be a rule

**Real examples:** `api-versioning-strategy` (why URL-based versioning was chosen), `error-handling-patterns` (team conventions after a production incident), `deployment-checklist` (steps learned from past near-misses)

---

### Prompt — _"What should the AI say?"_

A prompt is a reusable instruction template. It captures the exact text you send to an AI model, with variables for dynamic content. Use a prompt when you have a **proven instruction** that produces reliable AI output and you want others to reuse it.

```yaml
name: summarize-pr
description: Generates a concise PR summary from a diff
model:
tags: [code-review, summary]
compatible_agents: [code-reviewer]
```

**Use a prompt when:**
- You've refined an instruction that consistently produces good results
- The prompt has clear variables (placeholders) and expected output
- Multiple people or agents would benefit from the same instruction
- You want to version and iterate on prompt quality

**Real examples:** `summarize-pr` (creates PR summaries from diffs), `code-review-feedback` (structured review with severity), `explain-code` (layered code explanation for onboarding), `write-tests` (generates unit tests from function signatures), `refactor-suggestion` (before/after refactoring proposals)

**Prompt vs Skill:** A prompt is _what to say_ to an AI. A skill is _what to do_ (which may or may not involve AI). A skill might use a prompt internally, but a prompt is just text — it has no triggers, no scripts, no execution logic.

---

### How they connect

```
Rules constrain what agents can do
Skills give agents capabilities to act
Memories provide agents context to act wisely
Prompts tell agents what to say

+------------------------------------------+
|                  Agent                   |
|                                          |
|   uses Skills --- to perform actions     |
|   follows Rules - to stay within bounds  |
|   recalls Memories to make better calls  |
|   runs Prompts -- to talk to models      |
+------------------------------------------+
```

### Decision tree

```
Is it a complete workflow with inputs and outputs?
  → Agent

Is it a single reusable action/procedure?
  → Skill

Is it a constraint that must be enforced?
  → Rule

Is it knowledge or context that should be remembered?
  → Memory

Is it an instruction template for an AI model?
  → Prompt
```

---

## Commands

Every command supports two syntaxes — command-first or type-first:

```bash
ihub show agent code-reviewer       # command first
ihub agent show code-reviewer       # type first (equivalent)
```

Types accept singular or plural: `agent`/`agents`, `skill`/`skills`, `rule`/`rules`, `memory`/`memories`, `prompt`/`prompts`.

### Browsing artifacts

```bash
# Interactive TUI — navigate, multi-select, pull, comments, metrics, audit
ihub browse

# List everything
ihub list

# List by type
ihub list agents
ihub skills list              # type-first

# Show metadata (JSON) and body
ihub show agent code-reviewer

# Render with terminal markdown formatting (colors, code blocks, borders)
ihub preview skill lint-check
ihub agent preview code-reviewer   # type-first

# Full-text search across local entries
ihub search "security"

# Search the remote registry
ihub search --remote "lint"

# Check for missing fields and broken cross-references
ihub validate

# Tree view grouped by project
ihub projects
ihub projects ci-toolkit      # single project
```

### Creating artifacts

```bash
# Create from template (empty frontmatter, body scaffolding)
ihub create agent my-agent
ihub create skill my-skill
ihub create rule my-rule
ihub create memory my-memory
ihub create prompt my-prompt

# Interactive — prompts for every field
ihub create agent my-agent -i

# Import from any coding agent — auto-detects source format
ihub import skill ~/.claude/skills/docx/            # from Claude Code
ihub import rule .cursor/rules/no-console.mdc       # from Cursor IDE
ihub import skill ~/.qwen/skills/my-skill/          # from Qwen Code
ihub import skill ~/.config/opencode/skills/lint/   # from Open Code
ihub import skill path/to/SKILL.md -i               # interactive (prompts for ihub metadata)
ihub import skill path/to/skill/ --no-push          # save locally, push later
```

### Publishing and pulling

```bash
# Push a local artifact to the registry
ihub push agent code-reviewer
ihub skill push lint-check         # type-first

# Pull — asks which coding agent(s) and scope on first use
ihub pull agent code-reviewer

# Pull for specific coding agent(s)
ihub pull skill lint-check --agent claude
ihub pull skill lint-check --agent claude --agent cursor   # install to both
ihub pull rule no-secrets --agent cursor -l                # Cursor project (.mdc)

# Pull a specific version
ihub pull agent code-reviewer:1.0.0
ihub pull skill lint-check:latest

# Skip prompts
ihub pull agent code-reviewer -l          # project scope
ihub pull skill lint-check -g             # personal scope

# Memories always install to local memories/ directory (no agent, no prompt)
ihub pull memory api-versioning-strategy

# Remove from registry (owner only)
ihub remove agent old-agent
```

### Reviews

```bash
# Add a comment with 1-5 star rating
ihub comment agent code-reviewer
# Prompts:
#   Rating (1-5): 5
#   Comment: Excellent for catching security issues

# View all reviews
ihub comments agent code-reviewer
# Output:
#   agent/code-reviewer — 4.5/5 (2 reviews)
#   ★★★★★  @alice  2026-05-14
#   Excellent for catching security issues
```

### Account management

```bash
# Create account on a registry
ihub register http://localhost:3000

# Log in with existing API key
ihub login http://localhost:3000

# Log in via Auth0 (opens browser)
ihub login http://localhost:3000 --auth0

# Change password (API key)
ihub passwd

# Show current user, role, registry
ihub whoami
```

### Administration (admin only)

```bash
# View server configuration
ihub config

# Audit trail — who did what, when, from where
ihub audit
ihub audit --user alice --action push
ihub audit --action remove --page 2
ihub audit --limit 100

# Terminal metrics dashboard
ihub metrics
ihub metrics --type agents
ihub metrics --user alice --project ci-toolkit

# Download full database backup
ihub backup
ihub backup /backups/ihub-2026-05-14.db

# Manage user roles
ihub admin set-role bob admin
ihub admin set-role carol user

# Trigger weekly Slack digest
ihub admin digest
```

### Utilities

```bash
# Shell completions
eval "$(ihub completions bash)"     # add to ~/.bashrc
eval "$(ihub completions zsh)"      # add to ~/.zshrc

# Full manual page (rendered in terminal)
ihub man

# Version and branding
ihub version
```

---

## File format and frontmatter

Every artifact is a markdown file with a **frontmatter** block — structured YAML metadata between `---` delimiters at the top:

```markdown
---
name: lint-check
description: Runs configured linters and returns diagnostics
version: 1.0.0
author: alice
project: ci-toolkit
tags: [linting, code-quality]
triggers: [pre-commit, on-demand]
args: [files, fix]
compatible_agents: [code-reviewer]
---

# Lint Check

Regular markdown body — headings, paragraphs, code blocks, lists.
```

Frontmatter is a widely-used convention (Jekyll, Hugo, Obsidian, Claude Code) for embedding machine-readable metadata in human-readable text files. ihub parses it for indexing, search, cross-reference validation, and versioning.

**Common fields** (all types):

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier |
| `description` | Yes | Short summary |
| `version` | Yes | Semantic version (e.g. `1.0.0`) |
| `author` | No | Creator |
| `project` | No | Group artifacts by project |
| `tags` | No | Searchable labels `[a, b, c]` |

**Type-specific fields:**

| Type | Fields |
|------|--------|
| Agent | `inputs`, `outputs`, `skills`, `rules` |
| Skill | `triggers`, `args`, `compatible_agents` |
| Rule | `scope`, `severity` (error/warning/info), `applies_to` |
| Memory | `scope`, `context_type` (memory/preference/decision/insight), `related` |
| Prompt | `model`, `compatible_agents` |

ihub supports simple YAML only: strings, numbers, booleans, and inline arrays. No nested objects or multi-line values.

## Attachments

Artifacts can include companion files (scripts, schemas, configs). Place them in a directory named after the artifact:

```
skills/
  docx.md                  # the artifact
  docx/                    # companion directory (auto-detected on push)
    scripts/run.sh
    scripts/lib/util.py
    LICENSE.txt
```

Push uploads all files. Pull recreates the directory structure. Use `ihub import` to import existing artifacts with their scripts in one step.

## Multi-agent support

ihub works with multiple coding agents. When pulling, it installs artifacts to each agent's native path with the correct format.

### Supported agents

| Agent | Skills path | Rules path | Format |
|-------|------------|------------|--------|
| Claude Code | `~/.claude/skills/<name>/SKILL.md` | `.claude/rules/<name>.md` | SKILL.md in directory |
| Qwen Code | `~/.qwen/skills/<name>/SKILL.md` | `.qwen/skills/<name>/SKILL.md` | SKILL.md in directory |
| Open Code | `~/.config/opencode/skills/<name>/SKILL.md` | `.opencode/rules/<name>.md` | SKILL.md in directory |
| Cursor IDE | `.cursor/skills/<name>.md` | `.cursor/rules/<name>.mdc` | Flat file, .mdc for rules |
| Gemini CLI | — | — | Uses GEMINI.md (skipped) |
| Codex CLI | — | — | Uses AGENTS.md (skipped) |

Memories always install to the local `memories/` directory regardless of agent.

### Pulling for multiple agents

```bash
# First pull asks which agent(s) — preference saved to ~/.ihubrc
ihub pull skill lint-check

# Explicit agent selection
ihub pull skill lint-check --agent claude
ihub pull skill lint-check --agent claude --agent cursor   # both at once

# Env var for CI
IHUB_AGENT=claude,cursor ihub pull skill lint-check -l
```

When pulling for Cursor, rules get `.mdc` frontmatter (`description`, `globs`, `alwaysApply`). When pulling for Claude/Qwen/OpenCode, skills are installed as `<name>/SKILL.md` directories with simplified frontmatter.

### Importing from any agent

```bash
ihub import skill ~/.claude/skills/docx/           # auto-detects Claude
ihub import rule .cursor/rules/no-console.mdc      # auto-detects Cursor
ihub import skill ~/.qwen/skills/my-skill/         # auto-detects Qwen
```

The import command detects the source agent from the path, maps agent-specific frontmatter to ihub format (e.g., Cursor `alwaysApply: true` → ihub `scope: global`), and prompts only for missing required fields.

## Registry server

```bash
npm run server                                  # start on :3000
docker compose up -d                            # full stack with Prometheus + Grafana
```

The server stores artifacts in SQLite and exposes a REST API. Deploy with Docker, docker-compose, or Kubernetes (see `k8s/README.md`). See `ihub man` for the full API reference, or the [API endpoints table](#api-endpoints) below.

### Server configuration

`ihub.config.json` enables optional features on startup:

```json
{
  "server": { "port": 3000, "db_path": "./ihub.db" },
  "admin": { "username": "admin", "password": "admin" },
  "auth0": { "enabled": false, "domain": "", "client_id": "", "audience": "ihub-api" },
  "slack": { "enabled": false, "webhook_url": "", "digest_interval_hours": 168 },
  "metrics": { "enabled": true },
  "audit": { "enabled": true, "log_anonymous": true }
}
```

Environment variables override config file values. Config file is optional.

### API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/ping` | No | Health check |
| `POST` | `/api/register` | No | Create user account |
| `GET` | `/api/whoami` | Yes | Current user and role |
| `POST` | `/api/account/password` | Yes | Change API key |
| `GET` | `/api/:type` | No | List entries |
| `GET` | `/api/:type/:name` | No | Get entry (optional `?version=`) |
| `GET` | `/api/:type/:name/versions` | No | Version history |
| `POST` | `/api/:type/:name` | Yes | Push (with attachments) |
| `DELETE` | `/api/:type/:name` | Yes | Remove (owner only) |
| `GET` | `/api/search?q=` | No | Full-text search |
| `GET` | `/api/:type/:name/comments` | No | List comments + rating |
| `POST` | `/api/:type/:name/comments` | Yes | Add comment (rating 1-5) |
| `DELETE` | `/api/:type/:name/comments/:id` | Yes | Delete own comment |
| `GET` | `/api/:type/:name/attachments` | No | List attachments |
| `GET` | `/api/:type/:name/attachments/:path` | No | Download attachment |
| `GET` | `/api/config` | Admin | Server configuration |
| `GET` | `/api/audit` | Admin | Audit log (paginated) |
| `GET` | `/api/backup` | Admin | Download DB backup |
| `POST` | `/api/users/:username/role` | Admin | Set user role |
| `POST` | `/api/digest` | Admin | Trigger Slack digest |
| `GET` | `/api/metrics` | No | Prometheus metrics |

## Project structure

```
agents/            working directory for agent entries
skills/            working directory for skill entries
rules/             working directory for rule entries
memories/          working directory for memory entries
prompts/           working directory for prompt entries
examples/          sample entries (4 agents, 6 skills, 4 rules, 3 memories, 5 prompts)
templates/         scaffolding templates for each type
cli/               CLI tool (ESM, zero external dependencies)
server/            registry API server (Node.js + SQLite)
tests/             228 tests (node:test)
completions/       bash and zsh shell completions
man/               manual page source
grafana/           Grafana dashboard + Prometheus config
Dockerfile         multi-stage server image
docker-compose.yml ihub + Prometheus + Grafana
k8s/               Kubernetes manifests (kustomize)
ihub.config.json   server config file
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code conventions, and how to add new commands or registry types.

## License

MIT — see [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES) for dependency licenses.
