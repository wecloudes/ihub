---
name: test-generator
description: Generates unit tests from function signatures and docstrings
version: 1.0.0
author: ihub
project: developer-tools
tags: [testing, unit-tests, tdd, code-generation]
triggers: [on-demand]
args: [file, framework, coverage-target]
compatible_agents: [code-reviewer]
---

# Test Generator

## Purpose

Reads function signatures, type annotations, and docstrings to generate comprehensive unit tests. Covers happy paths, edge cases, error handling, and boundary conditions.

## Triggers

- `on-demand` — generate tests for a specific file or function

## Arguments

| Name | Type | Required | Description |
|------|------|----------|-------------|
| file | string | yes | Path to the source file |
| framework | string | no | jest, vitest, pytest, go-test (auto-detected) |
| coverage-target | number | no | Target coverage percentage (default: 80) |

## Example

```bash
ihub run test-generator --file src/auth.ts --framework vitest
```
