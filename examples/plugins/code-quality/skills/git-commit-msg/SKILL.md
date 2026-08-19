---
description: Generates conventional commit messages from staged changes
---

# Git Commit Message

## Purpose

Analyzes staged git changes and generates a commit message following the
Conventional Commits specification. Detects the type of change (feat, fix,
refactor, docs, etc.) and summarizes the intent.

## Usage

Run against the current staged changes to suggest a message before committing.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| format | string | no | conventional, simple, detailed (default: conventional) |
| scope | string | no | Override the detected scope (e.g. "auth", "api") |

## Example

```
# Output: feat(auth): add OAuth2 device flow for CLI login
```
