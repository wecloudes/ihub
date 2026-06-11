---
name: 
description: 
version: 0.1.0
author: 
project: 
tags: []
compatible_agents: [claude]
---

# {{name}}

## Config

The exact Claude Code `settings.json` hooks fragment — used verbatim on install. Events: PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact.

```json
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        { "type": "command", "command": "<shell command>", "timeout": 30 }
      ]
    }
  ]
}
```

## Purpose

_What does this hook do, and on which event?_

## Command

_What does the shell command run? Hooks execute on the user's machine — document side effects._

## Requirements

_Tools that must be installed for the command to work._
