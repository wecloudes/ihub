---
description: Reviews code changes for quality, bugs, and adherence to project rules
tools: Read, Grep, Glob, Bash
---

# Code Reviewer

## Purpose

Analyzes code diffs and provides structured feedback on quality, potential
bugs, security issues, and rule violations. Designed to run as part of a CI
pipeline or on demand.

## Capabilities

- Detects common bug patterns and anti-patterns
- Validates adherence to project rules
- Produces inline review comments with severity levels
- Summarizes overall code health

## Configuration

```yaml
max_files: 50
ignore_patterns:
  - "*.lock"
  - "*.generated.*"
severity_threshold: warning  # minimum severity to report
```

## Usage

Delegate a diff to this agent to receive review comments and an approval status.
