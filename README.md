# ihub

An AI artifact registry for agents, skills, rules, memories, and prompts. Publish once, install everywhere — ihub works with Claude Code, Gemini CLI, Qwen Code, Cursor IDE, Codex CLI, and Open Code, installing artifacts to each coding agent's native path with the correct format.

Each artifact is a `.md` file with YAML frontmatter. No vendor lock-in, no proprietary formats — just files you can edit, version with git, and share across your team and AI toolchain.

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

ihub manages five types of AI artifacts. Each serves a different role in the lifecycle of an AI-assisted workflow. Choosing the right type matters — it determines the frontmatter fields, how the artifact is discovered, and how it connects to other artifacts.

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
- `decision` — Why we chose X over Y. ADRs, trade-off analyses, rationale for technology choices. _Not a rule_ (rules enforce; decisions explain why).
- `architecture` — How the system is structured. Service topology, data models, entity relationships, schemas. _Not a skill_ (skills do things; architecture describes things).
- `incident` — What went wrong. Postmortems, timelines, root cause, impact, action items. _Not a runbook_ (runbooks are skills; incidents are evidence).
- `domain` — Business concepts, glossary, regulatory context, user personas, industry constraints. _Not a constraint_ (rules constrain; domain knowledge informs).
- `context` — Team structure, stakeholders, project state, ownership, priorities, timelines. _Not an agent definition_ (agents act; context describes the environment).
- `learning` — Validated findings from experience. What worked, what didn't, benchmarks, measured results. _Not a policy_ (rules prescribe; learnings provide evidence).

**Use a memory when:**
- A team made an architectural decision and you want to capture _why_ (`decision`)
- You need to document how the system is structured for onboarding (`architecture`)
- An incident happened and you want to preserve the postmortem (`incident`)
- Business rules or domain concepts need to be consistent across the team (`domain`)
- Team structure, priorities, or project state needs to be shared (`context`)
- You learned something valuable from experience that should inform future work (`learning`)

**Key boundary:** Memories store knowledge — things an agent needs to **know**. They don't store actions (skills), constraints (rules), instructions (prompts), or actor definitions (agents).

**Real examples:** `adr-001-database-choice` (PostgreSQL over MongoDB with rationale), `system-topology` (services, databases, queues), `incident-2026-03-redis` (Redis failover postmortem), `domain-payments` (business rules, provider constraints, EU regulations), `team-ownership` (who owns what, escalation paths), `learning-caching-strategy` (what caching approaches worked vs failed)

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

### Artifact type boundaries

| Type | Stores | Question it answers | Does NOT store |
|------|--------|-------------------|----------------|
| **Agent** | Actor definitions, capabilities, orchestration | _"Who does the work?"_ | Knowledge (→ memory), constraints (→ rule) |
| **Skill** | Procedures, automation, how-to | _"How to do X?"_ | Why we do X (→ memory), what X must follow (→ rule) |
| **Rule** | Constraints, policies, standards | _"What must be enforced?"_ | Why it was decided (→ memory), how to implement (→ skill) |
| **Memory** | Knowledge, context, evidence | _"What do we know?"_ | Actions (→ skill), constraints (→ rule), instructions (→ prompt) |
| **Prompt** | Instruction templates for AI models | _"What should the AI say?"_ | Execution logic (→ skill), actor definition (→ agent) |

### Memory context types — when to use each

| context_type | Stores | Boundary |
|---|---|---|
| `decision` | **Why** we chose X over Y | Not a rule (rules enforce; decisions explain) |
| `architecture` | **What** the system looks like | Not a skill (skills do things; architecture describes) |
| `incident` | **What happened** and root cause | Not a runbook (runbooks are skills; incidents are evidence) |
| `domain` | **What things mean** in our context | Not a constraint (rules constrain; domain informs) |
| `context` | **Who/when/where** around the project | Not an agent (agents act; context describes the environment) |
| `learning` | **What we measured** and observed | Not a policy (rules prescribe; learnings provide evidence) |

### Knowledge mapping for IT projects

This table maps every situation where valuable knowledge is generated to the appropriate memory context type and the roles involved.

<details>
<summary><strong>Requirements & Analysis</strong></summary>

| Situation | Valuable Knowledge | context_type | Roles (producer → consumer) |
|---|---|---|---|
| Stakeholder interviews | Business needs, user personas, pain points | `domain` | Product Owner, BA → Developers, Agents |
| Functional requirements | What the system must do, acceptance criteria | `domain` | BA, Product Owner → Developers, QA |
| Non-functional requirements | SLAs, latency targets, availability, compliance | `domain` | Architect, SRE → Developers, Ops |
| Regulatory constraints | GDPR, PSD2, SOC2, HIPAA, local laws | `domain` | Legal, Compliance → All |
| Glossary / Ubiquitous language | "Tenant means X, not Y. Deploy ≠ Release" | `domain` | BA, Tech Lead → All |
| User journey mapping | How users flow through the system, drop-off points | `domain` | UX, Product → Frontend, Agents |
| Integration requirements | Third-party APIs, SLAs from vendors, rate limits | `domain` | Architect, BA → Developers |

</details>

<details>
<summary><strong>Architecture & Design</strong></summary>

| Situation | Valuable Knowledge | context_type | Roles (producer → consumer) |
|---|---|---|---|
| System topology | Services, databases, queues, how they connect | `architecture` | Architect → All |
| Data models / ERDs | Entities, relationships, constraints, indexes | `architecture` | Architect, DBA → Developers |
| API contracts | Endpoints, schemas, versioning strategy, pagination | `architecture` | Architect, Backend → Frontend, QA |
| Network topology | VPCs, subnets, peering, firewall rules, DNS | `architecture` | Cloud Architect, NetOps → SRE, Security |
| Landing zone design | Account structure, OU hierarchy, guardrails, SCPs | `architecture` | Cloud Architect → Platform, FinOps |
| CI/CD pipeline design | Build stages, environments, promotion flow, rollback | `architecture` | DevOps, Platform → Developers |
| Security architecture | Auth flows, encryption at rest/transit, key management | `architecture` | Security Architect → All |
| Disaster recovery design | RPO/RTO targets, backup strategy, failover regions | `architecture` | Architect, SRE → Ops, Management |

</details>

<details>
<summary><strong>Decisions</strong></summary>

| Situation | Valuable Knowledge | context_type | Roles (producer → consumer) |
|---|---|---|---|
| Technology selection | "PostgreSQL over MongoDB because..." | `decision` | Architect, Tech Lead → All |
| Framework/library choice | "Next.js over Remix because..." | `decision` | Tech Lead, Senior Dev → Developers |
| Build vs buy | "Use Auth0 instead of custom auth because..." | `decision` | CTO, Architect → All |
| Repo strategy | Monorepo vs polyrepo, rationale, trade-offs | `decision` | Tech Lead → Developers |
| Cloud provider choice | "AWS over Azure because..." with cost/feature analysis | `decision` | CTO, Cloud Architect → All |
| Migration strategy | Big bang vs strangler fig vs parallel run, why | `decision` | Architect, PM → Developers, Ops |
| Data residency decisions | Where data lives, why (legal, latency, cost) | `decision` | Architect, Legal → Cloud, DBA |
| Vendor selection | "Chose Datadog over Grafana Cloud because..." | `decision` | Platform, Management → SRE, FinOps |
| Deprecation decisions | What's going away, replacement, timeline, why | `decision` | Tech Lead, Architect → All |
| Trade-off records | "We accepted eventual consistency here because..." | `decision` | Architect → Developers, QA |

</details>

<details>
<summary><strong>Incidents & Postmortems</strong></summary>

| Situation | Valuable Knowledge | context_type | Roles (producer → consumer) |
|---|---|---|---|
| Production outage | Timeline, root cause, blast radius, resolution | `incident` | SRE, Oncall → All |
| Security breach | Attack vector, compromised data, containment, disclosure | `incident` | Security, SRE → Management, Legal |
| Data loss event | What was lost, recovery steps, data integrity status | `incident` | DBA, SRE → Management, Developers |
| Failed migration | What broke, rollback steps taken, data state after | `incident` | DBA, DevOps → Developers, PM |
| Failed deployment | What went wrong, why canary/checks didn't catch it | `incident` | DevOps, Developer → SRE, QA |
| Capacity incident | Traffic spike, auto-scaling failure, resource exhaustion | `incident` | SRE, Cloud → FinOps, Architect |
| Third-party outage | Vendor downtime impact, fallback behavior, SLA claim | `incident` | SRE → Management, Legal |
| Near miss | "Almost broke prod but caught it in staging because..." | `incident` | Any → All |

</details>

<details>
<summary><strong>Team & Project Context</strong></summary>

| Situation | Valuable Knowledge | context_type | Roles (producer → consumer) |
|---|---|---|---|
| Team ownership map | Who owns which service, escalation paths | `context` | Engineering Manager → All |
| Quarterly priorities | What the team is focused on and why, what's deprioritized | `context` | PM, Management → Developers, Agents |
| Stakeholder map | Who cares about what, approval chains, RACI | `context` | PM, BA → All |
| Project timeline | Milestones, deadlines, dependencies, blockers | `context` | PM → All |
| Budget constraints | Cloud budget limits, headcount, licensing costs | `context` | FinOps, Management → Architect, PM |
| Vendor relationships | Account managers, contract terms, renewal dates, SLAs | `context` | Procurement, Management → SRE, FinOps |
| Compliance deadlines | Audit dates, certification renewals, regulatory deadlines | `context` | Compliance, Legal → All |
| Onboarding notes | "Things I wish I'd known on day 1" from recent joiners | `context` | New hires → Future hires, Agents |
| Cross-team dependencies | "Team X blocks us on Y, expected by Z date" | `context` | PM, Tech Lead → Developers |

</details>

<details>
<summary><strong>Learnings & Evidence</strong></summary>

| Situation | Valuable Knowledge | context_type | Roles (producer → consumer) |
|---|---|---|---|
| Performance benchmarks | "Caching reduced p99 from 120ms to 8ms" with setup details | `learning` | Senior Dev, SRE → Developers |
| Cost optimization results | "Reserved instances saved 40% vs on-demand" with numbers | `learning` | FinOps, Cloud → Management |
| Testing strategy results | Which test types catch real bugs vs create noise | `learning` | QA, Senior Dev → Developers |
| Migration retrospective | What worked, what didn't, time estimates vs actuals | `learning` | Tech Lead, PM → Future migration teams |
| Tool evaluation results | "Tried X for 2 months, here's what we found" | `learning` | Any → All |
| Scaling findings | "Service handles 10K rps before degrading, bottleneck is X" | `learning` | SRE, Senior Dev → Architect |
| Security audit findings | Penetration test results, remediation effectiveness | `learning` | Security → Developers, SRE |
| FinOps analysis | Cost per customer, cost per transaction, waste identified | `learning` | FinOps → Management, Architect |
| Failed experiment | "We tried X and it didn't work because Y" | `learning` | Any → All |
| Pattern validation | "This design pattern solved problem X in 3 services" | `learning` | Senior Dev, Architect → Developers |
| Landing zone audit | What guardrails worked, which were too restrictive | `learning` | Cloud Architect, Security → Platform |
| DR drill results | Recovery time actual vs target, gaps identified | `learning` | SRE → Management, Architect |

</details>

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
# Interactive TUI — full registry browser
ihub browse
# Keys: ↑↓ navigate, ←→ switch type, ⏎ drill in, / search (Esc/q cancel)
#       space multi-select, a select all, p pull selected, P quick pull
#       c comments, w review, d remove (double-press), j projects
#       {} scroll preview, s sort, f bookmark, F bookmarks, g graph, v versions
#       G guide (artifact types + memory taxonomy + knowledge mapping)
#       m metrics (side-by-side charts), t audit, i config, B blocked (admin)
#       q/esc back — terminal resize re-renders layout automatically
# Split-pane preview appears automatically when terminal >= 120 columns

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

# Create from an existing registry artifact as template
ihub create skill my-skill --from base-skill

# Import from any coding agent — auto-detects source format
ihub import skill ~/.claude/skills/docx/            # from Claude Code
ihub import rule .cursor/rules/no-console.mdc       # from Cursor IDE
ihub import skill ~/.qwen/skills/my-skill/          # from Qwen Code
ihub import skill ~/.config/opencode/skills/lint/   # from Open Code
ihub import skill path/to/SKILL.md -i               # interactive (prompts for ihub metadata)
ihub import skill path/to/skill/ --no-push          # save locally, push later

# Import a JSON bundle
ihub import bundle.json                   # import + push all artifacts
ihub import bundle.json --no-push         # save locally only
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

# Pull directly from any registry URL
ihub pull https://other-registry.com/api/skills/lint-check

# Pull without transitive dependencies
ihub pull agent code-reviewer --no-deps

# Skip prompts
ihub pull agent code-reviewer -l          # project scope
ihub pull skill lint-check -g             # personal scope

# Memories always install to local memories/ directory (no agent, no prompt)
ihub pull memory api-versioning-strategy

# Remove from registry (owner only)
ihub remove agent old-agent

# Watch local dirs and auto-push on save
ihub watch
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

### Version pinning

```bash
# Pin an artifact to a specific version (pulls that version instead of latest)
ihub pin skill lint-check 1.2.0
ihub pin agent code-reviewer            # pin to current local version

# Remove a pin
ihub unpin skill lint-check

# List all pinned artifacts
ihub pins
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

# Download SQLite database backup
ihub backup
ihub backup /backups/ihub-2026-05-14.db

# Full JSON backup (works with any storage adapter — S3, R2, GCS, etc.)
ihub backup --full
ihub backup --full /backups/ihub-2026-05-14.json

# Restore from backup (auto-detects format)
ihub restore /backups/ihub-2026-05-14.json    # full JSON restore
ihub restore /backups/ihub-2026-05-14.db      # SQLite restore

# Manage webhooks
ihub webhook list
ihub webhook add https://example.com/hook --events push,pull
ihub webhook add https://example.com/hook --secret my-hmac-secret
ihub webhook remove <id>

# Federation — sync from upstream registries
ihub federation sync                    # trigger manual sync
ihub federation status                  # show upstream state

# Manage user roles
ihub admin set-role bob admin
ihub admin set-role carol user

# Approve a blocked artifact (unblock after sensitive data review)
ihub admin approve skills/slack-notifier

# List all blocked artifacts
ihub admin blocked

# Trigger weekly Slack digest
ihub admin digest
```

### Utilities

```bash
# Diagnostic checks (server, auth, local artifacts, storage, config)
ihub doctor

# Check for outdated artifacts (local vs registry)
ihub outdated

# Verify artifact signature
ihub verify skill lint-check

# Export artifacts as JSON bundle
ihub export                             # all artifacts
ihub export --project ci-toolkit        # filter by project
ihub export --type skills               # filter by type

# JSON output on any command
ihub list --json
ihub show agent code-reviewer --json
ihub search --remote "lint" --json

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
| Memory | `scope`, `context_type` (decision/architecture/incident/domain/context/learning), `related` |
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

| Agent | Skills (personal) | Skills (project) | Rules (project) | Format |
|-------|-------------------|-----------------|-----------------|--------|
| Claude Code | `~/.claude/skills/` | `.claude/skills/` | `.claude/rules/<name>.md` | SKILL.md dir |
| Gemini CLI | `~/.gemini/skills/` | `.gemini/skills/` | `.gemini/skills/` (as skill) | SKILL.md dir |
| Qwen Code | `~/.qwen/skills/` | `.qwen/skills/` | `.qwen/skills/` (as skill) | SKILL.md dir |
| Open Code | `~/.config/opencode/skills/` | `.opencode/skills/` | `.opencode/rules/<name>.md` | SKILL.md dir |
| Cursor IDE | `~/.cursor/skills/` | `.cursor/skills/` | `.cursor/rules/<name>.mdc` | Flat, .mdc rules |
| Codex CLI | `~/.agents/skills/` | `.agents/skills/` | — (Starlark `.rules`) | SKILL.md dir |

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
  "audit": { "enabled": true, "log_anonymous": true },
  "firewall": { "enabled": false, "whitelist": [] },
  "security": { "notify_via": "terminal", "email": "", "slack_webhook_url": "" },
  "storage": { "adapter": "sqlite" },
  "federation": { "enabled": false, "upstreams": [] },
  "signing": { "enabled": false, "key": "" },
  "versioning": { "enforce_semver": false, "require_major_for_breaking": false },
  "plugins": []
}
```

Environment variables override config file values. Config file is optional.

### Storage backends

By default, ihub stores everything in SQLite. You can store artifact content and attachments on any of 30+ cloud storage providers via [files-sdk](https://files-sdk.dev/). SQLite always keeps index rows (name, version, tags, owner) for queries — only body content and attachment blobs move to external storage.

```json
// SQLite (default — no change needed)
"storage": { "adapter": "sqlite" }

// AWS S3
"storage": { "adapter": "s3", "bucket": "ihub-artifacts", "region": "eu-west-1" }

// Cloudflare R2
"storage": { "adapter": "r2", "bucket": "ihub", "accountId": "abc123" }

// Google Cloud Storage
"storage": { "adapter": "gcs", "bucket": "ihub-artifacts" }

// Azure Blob Storage
"storage": { "adapter": "azure", "container": "ihub" }

// Local filesystem (dev/test)
"storage": { "adapter": "fs", "root": "./storage-data" }

// MinIO (self-hosted S3)
"storage": { "adapter": "minio", "bucket": "ihub", "endpoint": "http://minio:9000" }
```

**Authentication** — each adapter auto-loads credentials from standard environment variables. You don't configure credentials in `ihub.config.json`, you set them in your environment the same way you would for any cloud CLI tool:

| Adapter | Credentials | Environment Variables |
|---------|------------|----------------------|
| `s3` | AWS credential chain | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (or IAM role, `~/.aws/credentials`) |
| `r2` | Cloudflare R2 | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` |
| `gcs` | Google ADC | `GOOGLE_APPLICATION_CREDENTIALS` (or `gcloud auth`, metadata server on GCE/GKE) |
| `azure` | Connection string or key | `AZURE_STORAGE_CONNECTION_STRING` (or account name + key) |
| `minio` | S3-compatible | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` + `endpoint` in config |
| `fs` | None | Just set `root` directory path in config |

All 30+ adapters: S3, R2, GCS, Azure, MinIO, DigitalOcean Spaces, Backblaze B2, Wasabi, Hetzner, Vultr, Scaleway, OVHcloud, Oracle Cloud, IBM COS, Storj, Tigris, Filebase, Akamai, iDrive e2, Exoscale, Vercel Blob, Netlify Blobs, Supabase, Google Drive, OneDrive, Dropbox, Box, UploadThing, Appwrite, local filesystem.

If credentials are missing, the server fails to start with a clear error naming the required environment variable.

**Trade-off**: full-text search on artifact body content only works with SQLite. Search by name, description, and tags works with all adapters.

Or via env: `IHUB_STORAGE_ADAPTER=s3`

### Sensitive data protection

Every artifact push is scanned for sensitive data (CLI + server-side). Detected values are automatically masked with `[MASKED:<type>]` tags. If sensitive data is found, the artifact is **blocked** — it's stored but marked `status: "blocked"`, pulls return `403` ("pending admin approval"), and a security alert is sent. An admin must run `ihub admin approve <type>/<name>` to unblock it.

Covers 80+ patterns: API keys (AWS, Azure, GCP, OpenAI, Anthropic, Stripe, Slack, etc.), private keys, passwords, connection strings, PII (emails, phone numbers, credit cards, IBAN, DNI/NIE), and Kubernetes/ArgoCD tokens. Findings are logged as `sensitive-detected` audit actions and tracked via the `ihub_sensitive_detected_total` Prometheus metric.

### Security alerts

When sensitive data is detected, a security alert is sent via the channel configured in `security.notify_via`:

| Channel | Config | Description |
|---------|--------|-------------|
| `terminal` | Default, no setup | Prints alert to server console |
| `slack` | `security.slack_webhook_url` | Sends Block Kit message to a dedicated Slack channel (separate from push notifications) |
| `email` | `security.email` + SMTP env vars | Sends email via SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) |

The alert includes: artifact name, who pushed it, number of findings, finding types, and an `ihub admin approve` command to unblock.

### IP firewall

Set `firewall.enabled: true` with a whitelist of allowed IPs. Supports exact IPs, CIDR ranges (`10.0.0.0/8`), and wildcards (`192.168.1.*`). Loaded once at startup (immutable). Blocked requests return `403` and are logged to the audit trail. Configure via `IHUB_FIREWALL_WHITELIST` env var (comma-separated).

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
| `GET` | `/api/backup` | Admin | Download SQLite DB backup |
| `POST` | `/api/backup` | Admin | Restore from SQLite backup |
| `GET` | `/api/backup/full` | Admin | Full JSON export (any storage adapter) |
| `POST` | `/api/backup/full` | Admin | Restore from full JSON export |
| `POST` | `/api/users/:username/role` | Admin | Set user role |
| `POST` | `/api/digest` | Admin | Trigger Slack digest |
| `GET` | `/api/blocked` | Admin | List blocked artifacts |
| `POST` | `/api/:type/:name/approve` | Admin | Unblock artifact |
| `GET` | `/api/webhooks` | Admin | List webhooks |
| `POST` | `/api/webhooks` | Admin | Create webhook |
| `DELETE` | `/api/webhooks/:id` | Admin | Delete webhook |
| `POST` | `/api/federation/sync` | Admin | Trigger federation sync |
| `GET` | `/api/federation/status` | Admin | Federation upstream status |
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
  index.js         command dispatcher + all CLI commands
  pinning.js       version pinning, bundle export/import
  parse.js         frontmatter parser, registry loader
  registry.js      HTTP client for remote registry
  render.js        terminal markdown renderer (ANSI)
  dashboard.js     terminal metrics dashboard
  tui.js           interactive TUI browser
  agents-config.js coding agent path configs (6 agents)
server/            registry API server (Node.js + SQLite)
  routes.js        REST handlers (auth, CRUD, backup, webhooks, federation)
  db.js            SQLite (users, entries, attachments, comments, audit, webhooks)
  signing.js       HMAC-SHA256 artifact signing/verification
  versioning.js    semver policy enforcement, breaking change detection
  federation.js    upstream registry sync
  webhooks.js      webhook notification delivery
  plugins.js       extensible push/pull lifecycle hooks
  ui.js            web UI handler
  storage.js       pluggable storage (SQLite, S3, R2, GCS, Azure, 30+)
  sensitive.js     sensitive data detection and masking (80+ patterns)
  security-alert.js security alert notifications
  metrics.js       Prometheus metrics collector
  config.js        config loader (ihub.config.json + env vars)
  auth0.js         Auth0 JWT verification (optional)
  slack.js         Slack webhook (push notifications + digest)
tests/             test suite (node:test)
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
