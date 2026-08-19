---
description: Generate a conventional commit message from staged changes
---

# /commit

## Purpose

Analyzes staged git changes and generates a conventional commit message.
Optionally lets the user provide a scope and flag breaking changes.

## Usage

```
/commit
/commit -m "optional hint about what changed"
/commit --scope auth --breaking
```

## Behavior

1. Read staged diff (`git diff --cached`)
2. Analyze the nature of changes (feature, fix, refactor, docs, test, chore)
3. Generate a conventional commit message: `type(scope): description`
4. Present to the user for approval or editing
5. Execute `git commit` with the approved message

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| message | string | no | Hint to guide commit message generation |
| scope | string | no | Override the auto-detected scope |
| breaking | boolean | no | Flag as a breaking change |
