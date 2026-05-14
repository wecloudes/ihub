---
name: api-versioning-strategy
description: Captures the team's decision on API versioning and backward compatibility
version: 0.1.0
author: ihub
project: ci-toolkit
tags: [api, versioning, architecture]
scope: global
context_type: decision
related: [code-reviewer]
---

# API Versioning Strategy

## Context

The team adopted URL-based versioning (`/api/v1/`, `/api/v2/`) over header-based versioning after evaluating both approaches. This decision was driven by debuggability — URL versions are visible in logs, bookmarks, and curl commands without inspecting headers.

## When to recall

- When designing new API endpoints
- When reviewing PRs that modify API routes or response schemas
- When discussing breaking changes or deprecation timelines
- When onboarding new team members to the API layer

## Content

### Rules

1. New versions are created only for **breaking changes** (field removal, type change, semantic change)
2. Additive changes (new fields, new endpoints) do **not** require a new version
3. Deprecated versions must be supported for at least **6 months** after the successor is stable
4. Every version bump must include a migration guide in the changelog

### Examples

Adding a field — no version bump needed:
```json
// v1 response, before
{ "name": "alice" }

// v1 response, after (additive, non-breaking)
{ "name": "alice", "role": "admin" }
```

Removing a field — requires version bump:
```json
// v1 response
{ "name": "alice", "legacy_id": 42 }

// v2 response (breaking: legacy_id removed)
{ "name": "alice" }
```
