---
name: summarize-pr
description: Generates a concise summary of a pull request from its diff
version: 0.1.0
author: ihub
project: ci-toolkit
tags: [code-review, summary, git]
model: 
compatible_agents: [code-reviewer]
memories: [api-versioning-strategy]
---

# Summarize PR

## Purpose

Produces a short, structured summary of a pull request suitable for team review channels or changelogs.

## Prompt

```
Given the following pull request diff, write a summary that includes:

1. A one-line title (under 70 characters)
2. A bullet list of what changed and why (2-5 bullets)
3. Any risks or areas that need careful review

Diff:
{{diff}}
```

## Variables

- `{{diff}}` — the full git diff of the pull request

## Example output

```
Title: Add rate limiting to public API endpoints

Changes:
- Added express-rate-limit middleware to /api/v1/* routes
- Default limit: 100 requests per 15-minute window per IP
- Added X-RateLimit-* response headers for client visibility

Risks:
- Shared IP users (corporate NATs) may hit limits prematurely
- No bypass mechanism for authenticated internal services yet
```
