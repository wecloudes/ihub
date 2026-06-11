---
name: commit
description: Generate a conventional commit message from staged changes
version: 1.0.0
author: ihub
project: developer-tools
tags: [git, commit, workflow]
trigger: /commit
agent: code-reviewer
skills: [git-commit-msg]
prompts: [code-review-feedback]
args: [message, scope, breaking]
compatible_agents: []
---

# /commit

## Purpose

Analyzes staged git changes and generates a conventional commit message. Optionally allows the user to provide a scope and flag breaking changes.

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
4. Present to user for approval or editing
5. Execute `git commit` with the approved message

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| message | string | no | Hint to guide commit message generation |
| scope | string | no | Override the auto-detected scope |
| breaking | boolean | no | Flag as a breaking change |
