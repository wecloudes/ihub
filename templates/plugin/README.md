# {{name}}

## Overview

Describe what this plugin does and who it is for. A plugin bundles skills,
commands, agents, MCP servers, and hooks into one installable unit.

## Components

- **Skills** — `skills/<name>/SKILL.md` (see `skills/example-skill/`)
- **Commands** — `commands/<name>.md` (see `commands/example-command.md`)
- **Agents** — `agents/<name>.md` (see `agents/example-agent.md`)
- **MCP servers** — `.mcp.json`
- **Hooks** — `hooks/hooks.json`

Delete any component you do not need.

## Usage

```bash
ihub push {{name}}          # publish to the registry
ihub pull {{name}} --install  # install into your coding agent
```
