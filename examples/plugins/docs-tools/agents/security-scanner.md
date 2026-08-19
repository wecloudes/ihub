---
description: Scans code for security vulnerabilities and OWASP top 10 issues
tools: Read, Grep, Glob, Bash
---

# Security Scanner

## Purpose

Analyzes source code and dependencies for security vulnerabilities, hardcoded
secrets, injection risks, and OWASP top 10 issues. Designed to run in CI
pipelines or as a pre-commit check.

## Capabilities

- Detects hardcoded API keys, tokens, and passwords
- Identifies SQL injection, XSS, and command injection patterns
- Audits dependencies for known CVEs
- Validates input sanitization practices
- Reports findings with severity levels (critical, high, medium, low)

## Configuration

```yaml
scan_paths:
  - "src/**/*"
  - "lib/**/*"
ignore_patterns:
  - "**/*.test.*"
  - "**/fixtures/**"
severity_threshold: medium
fail_on: high
```

## Usage

Point the agent at a source tree to receive a severity-ranked vulnerability
report.
