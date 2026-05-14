---
name: lint-check
description: Runs configured linters and returns structured diagnostics
version: 0.1.0
author: ihub
project: ci-toolkit
tags: [linting, code-quality, static-analysis]
triggers: [pre-commit, on-demand]
args: [files, fix]
compatible_agents: [code-reviewer]
---

# Lint Check

## Purpose

Executes project-configured linters against specified files and returns diagnostics in a uniform format.

## Triggers

- `pre-commit` — automatically before each commit
- `on-demand` — when explicitly invoked

## Arguments

| Name  | Type     | Required | Description                          |
|-------|----------|----------|--------------------------------------|
| files | string[] | no       | File paths to lint (default: staged) |
| fix   | boolean  | no       | Auto-fix when possible (default: false) |

## Example

```
ihub run lint-check --files "src/**/*.ts" --fix
```