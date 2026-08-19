# Dropped examples

The rework collapses the old nine artifact types into a single unit — the
**plugin** (Claude Code plugin spec). The Claude plugin spec only recognizes
five component kinds: skills, commands, agents, MCP servers, and hooks. Any old
artifact type with no plugin equivalent was dropped rather than shoe-horned in.

## Dropped types (no plugin equivalent)

| Old type | Examples dropped | Why |
|----------|------------------|-----|
| rule | `max-function-length`, `no-console-in-prod`, `no-secrets-in-code`, `require-tests` | Rules have no first-class slot in the Claude plugin spec. Guidance like this belongs in a skill body or the project's `CLAUDE.md`/`AGENTS.md`, not a packaged plugin component. |
| memory | `api-versioning-strategy`, `deployment-checklist`, `error-handling-patterns` | Memories are per-project agent context, not a plugin component. No install target. |
| prompt | `code-review-feedback`, `explain-code`, `refactor-suggestion`, `summarize-pr`, `write-tests` | Standalone prompts are not a plugin component. Equivalent behavior is expressed as a skill or a command inside a plugin. |
| design | `login-page` | Design docs (`DESIGN.md`) are project artifacts, not a plugin component. |

## Skills not carried into an example plugin

| Old skill | Why |
|-----------|-----|
| `api-spec-validator` | Left out of the example plugins to keep `code-quality` focused; the skill format itself is fully supported and could be added back as `skills/api-spec-validator/SKILL.md`. |

## What was kept, and where it went

- **skills** `git-commit-msg`, `lint-check`, `dependency-audit`, `test-generator` → `examples/plugins/code-quality/skills/<name>/SKILL.md`
- **command** `commit` → `examples/plugins/code-quality/commands/commit.md`
- **agent** `code-reviewer` → `examples/plugins/code-quality/agents/code-reviewer.md`
- **mcps** `azure`, `context7`, `github` → merged into `examples/plugins/dev-mcps/.mcp.json`
- **hook** `format-on-save` → `examples/plugins/dev-mcps/hooks/hooks.json`
- **agents** `doc-generator`, `migration-assistant`, `security-scanner` → `examples/plugins/docs-tools/agents/<name>.md`

Frontmatter that referenced dropped types (rules/memories/prompts links, and
`compatible_agents`) was stripped when the artifacts were converted into plugin
components.
