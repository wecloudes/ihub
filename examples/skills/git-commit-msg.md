---
name: git-commit-msg
description: Generates conventional commit messages from staged changes
version: 1.0.0
author: ihub
project: developer-tools
tags: [git, commit, conventional-commits]
triggers: [pre-commit, on-demand]
args: [format, scope]
compatible_agents: [code-reviewer]
---

# Git Commit Message

## Purpose

Analyzes staged git changes and generates a commit message following the Conventional Commits specification. Detects the type of change (feat, fix, refactor, docs, etc.) and summarizes the intent.

## Triggers

- `pre-commit` — suggest a message before committing
- `on-demand` — generate from current staged changes

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| format | string | no | conventional, simple, detailed (default: conventional) |
| scope | string | no | Override the detected scope (e.g. "auth", "api") |

## Example

```bash
ihub run git-commit-msg
# Output: feat(auth): add OAuth2 device flow for CLI login
```
