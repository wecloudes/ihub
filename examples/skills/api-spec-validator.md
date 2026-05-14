---
name: api-spec-validator
description: Validates API implementations against OpenAPI/Swagger specifications
version: 1.0.0
author: ihub
project: ci-toolkit
tags: [api, openapi, swagger, validation]
triggers: [ci, on-demand]
args: [spec-file, base-url]
compatible_agents: [code-reviewer]
---

# API Spec Validator

## Purpose

Compares a running API or source code against its OpenAPI specification. Detects missing endpoints, wrong response types, undocumented fields, and schema mismatches.

## Triggers

- `ci` — validate on every pipeline run
- `on-demand` — manual validation against a running server

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| spec-file | string | yes | Path to OpenAPI spec (JSON or YAML) |
| base-url | string | no | Running API URL (for live validation) |

## Example

```bash
ihub run api-spec-validator --spec-file openapi.yaml --base-url http://localhost:3000
```
