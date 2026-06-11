---
name: format-on-save
description: Run Prettier on every file Claude Code writes or edits
version: 1.0.0
author: ihub
tags: [formatting, prettier]
event: PostToolUse
matcher: Write|Edit
command: npx prettier --write "$CLAUDE_FILE_PATHS" 2>/dev/null || true
timeout: 30
compatible_agents: [claude]
---

# format-on-save

## Purpose

Keeps the working tree formatted: after every `Write` or `Edit` tool call, Prettier rewrites the touched files in place. Failures are swallowed (`|| true`) so unformattable files never block the agent.

## Command

Runs `npx prettier --write` on the file paths Claude Code passes via `$CLAUDE_FILE_PATHS`. No network access, no side effects outside the edited files.

## Requirements

Node.js with `npx` on PATH; Prettier resolves from the project's `node_modules` or is fetched by npx.
