---
description: Audits project dependencies for known vulnerabilities and license issues
---

# Dependency Audit

## Purpose

Checks project dependencies against vulnerability databases (NVD, GitHub
Advisory) and license policies. Reports CVEs, outdated packages, and license
conflicts.

## Usage

Run as a quick pre-commit check, a full CI audit, or a manual deep scan.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| package-manager | string | no | npm, pip, cargo, go (auto-detected if omitted) |
| severity | string | no | Minimum severity to report: low, medium, high, critical (default: medium) |

## Example

```
dependency-audit --package-manager npm --severity high
```
