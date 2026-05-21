---
name: require-tests
description: All new functionality must include corresponding tests
version: 0.1.0
author: ihub
project: ci-toolkit
tags: [testing, quality]
scope: global
severity: error
globs: "src/**/*"
applies_to: [code-reviewer]
---

# Require Tests

## Rule

Any PR that adds or modifies functional code must include at least one new or updated test covering the change.

## Rationale

Untested code is a liability. Tests document intent, catch regressions, and enable confident refactoring.

## Examples

### Correct

```
src/auth.ts        ← new login function
tests/auth.test.ts ← tests for login function
```

### Incorrect

```
src/auth.ts        ← new login function
                   ← no test file added or modified
```
