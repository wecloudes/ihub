---
name: context7
description: Context7 remote MCP server — up-to-date library documentation for any framework
version: 1.1.0
author: ihub
tags: [docs, libraries, http]
compatible_agents: [claude, cursor, gemini, qwen, opencode]
---

# context7

## Config

```json
{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp",
    "headers": { "CONTEXT7_API_KEY": "${CONTEXT7_API_KEY}" }
  }
}
```

## Purpose

Fetches current, version-specific documentation for libraries and frameworks so the agent doesn't rely on stale training data.

## Tools

`resolve-library-id` (find a library), `query-docs` (fetch docs for a topic).

## Setup

| Variable | Description |
|----------|-------------|
| `CONTEXT7_API_KEY` | API key from context7.com (free tier available). Referenced as `${CONTEXT7_API_KEY}` — never stored in the artifact. |
