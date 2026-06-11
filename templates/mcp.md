---
name: 
description: 
version: 0.1.0
author: 
project: 
tags: []
compatible_agents: []
---

# {{name}}

## Config

The exact `.mcp.json` server entry (Claude-native shape — used verbatim on install, transformed for other agents). Always use `${VAR}` placeholders for secrets, never literal values.

```json
{
  "{{name}}": {
    "command": "npx",
    "args": ["-y", "<package>"],
    "env": { "MY_TOKEN": "${MY_TOKEN}" }
  }
}
```

For a remote server use: `{ "{{name}}": { "type": "http", "url": "https://...", "headers": { "X-Key": "${KEY}" } } }`

## Purpose

_What does this MCP server provide?_

## Tools

_Which tools does it expose?_

## Setup

| Variable | Description |
|----------|-------------|
