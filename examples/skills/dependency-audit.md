---
name: dependency-audit
description: Audits project dependencies for known vulnerabilities and license issues
version: 1.0.0
author: ihub
project: ci-toolkit
tags: [security, dependencies, audit, npm, pip]
triggers: [pre-commit, ci, on-demand]
args: [package-manager, severity]
compatible_agents: [security-scanner]
---

# Dependency Audit

## Purpose

Checks project dependencies against vulnerability databases (NVD, GitHub Advisory) and license policies. Reports CVEs, outdated packages, and license conflicts.

## Triggers

- `pre-commit` — quick check of changed dependency files
- `ci` — full audit on every pipeline run
- `on-demand` — manual deep scan

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| package-manager | string | no | npm, pip, cargo, go (auto-detected if omitted) |
| severity | string | no | Minimum severity to report: low, medium, high, critical (default: medium) |

## Example

```bash
ihub run dependency-audit --package-manager npm --severity high
```
