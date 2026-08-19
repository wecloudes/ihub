---
description: Generates unit tests from function signatures and docstrings
---

# Test Generator

## Purpose

Reads function signatures, type annotations, and docstrings to generate
comprehensive unit tests. Covers happy paths, edge cases, error handling, and
boundary conditions.

## Usage

Generate tests for a specific file or function on demand.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| file | string | yes | Path to the source file |
| framework | string | no | jest, vitest, pytest, go-test (auto-detected) |
| coverage-target | number | no | Target coverage percentage (default: 80) |

## Example

```
test-generator --file src/auth.ts --framework vitest
```
