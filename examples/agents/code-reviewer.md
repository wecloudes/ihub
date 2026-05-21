---
name: code-reviewer
description: Reviews code changes for quality, bugs, and adherence to project rules
version: 0.1.0
author: ihub
project: ci-toolkit
tags: [code-quality, review, ci]
inputs: [diff, file-list]
outputs: [review-comments, approval-status]
skills: [lint-check]
rules: [require-tests]
memories: [error-handling-patterns]
prompts: [code-review-feedback, summarize-pr]
---

# Code Reviewer

## Purpose

Analyzes code diffs and provides structured feedback on quality, potential bugs, security issues, and rule violations. Designed to run as part of a CI pipeline or on-demand.

## Capabilities

- Detects common bug patterns and anti-patterns
- Validates adherence to linked rules
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

```
ihub run code-reviewer --input "git diff HEAD~1"
```