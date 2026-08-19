# dev-mcps

## Overview

Bundles three commonly used MCP servers into one installable plugin, plus a
hook that formats files as they are written. All secrets are referenced through
`${VAR}` placeholders and read from your environment — nothing sensitive is
stored in the plugin.

## Components

- **MCP servers** (`.mcp.json`)
  - `azure` — manage and query Azure resources (auth via `az login` / `AZURE_*`)
  - `context7` — up-to-date, version-specific library documentation (HTTP; needs `${CONTEXT7_API_KEY}`)
  - `github` — repos, issues, PRs, and code search (needs `${GITHUB_TOKEN}`)
- **Hooks** (`hooks/hooks.json`)
  - `format-on-save` — runs Prettier on every file Write/Edit

## Setup

| Variable | Used by | Description |
|----------|---------|-------------|
| `CONTEXT7_API_KEY` | context7 | API key from context7.com (free tier available) |
| `GITHUB_TOKEN` | github | GitHub personal access token with `repo` scope |
| `AZURE_SUBSCRIPTION_ID` | azure | Optional default subscription (auth otherwise via `az login`) |

## Usage

```bash
ihub pull dev-mcps --install
```
