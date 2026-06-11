---
name: azure
description: Azure MCP server — manage and query Azure resources from your coding agent
version: 1.0.0
author: ihub
tags: [azure, cloud]
compatible_agents: [claude, cursor, gemini, qwen, opencode]
---

# azure

## Config

```json
{
  "azure": {
    "command": "npx",
    "args": ["-y", "@azure/mcp@latest", "server", "start"]
  }
}
```

## Purpose

Full Azure toolbelt: list subscriptions and resource groups, query resources, AKS/App Service/Storage/Key Vault/Cosmos operations, Azure Monitor queries, best-practices guidance.

## Tools

Grouped Azure tools (`acr`, `aks`, `appservice`, `keyvault`, `monitor`, `storage`, `sql`, `role`, `subscription_list`, ...) — the server exposes one tool per Azure service area.

## Setup

Authenticates via Azure CLI credentials (`az login`) or standard `AZURE_*` environment variables — no secrets stored in this artifact.

| Variable | Description |
|----------|-------------|
| `AZURE_SUBSCRIPTION_ID` | Optional default subscription. Reference as `${AZURE_SUBSCRIPTION_ID}` in `env` if you pin one. |
