---
description: Runs configured linters and returns structured diagnostics
---

# Lint Check

## Purpose

Executes project-configured linters against specified files and returns
diagnostics in a uniform format.

## Usage

Run before a commit or on demand.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| files | string[] | no | File paths to lint (default: staged) |
| fix | boolean | no | Auto-fix when possible (default: false) |

## Example

```
lint-check --files "src/**/*.ts" --fix
```
