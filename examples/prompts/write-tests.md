---
name: write-tests
description: Generates comprehensive unit tests from a function implementation
version: 1.0.0
author: ihub
project: developer-tools
tags: [testing, unit-tests, code-generation]
model: 
compatible_agents: [code-reviewer]
---

# Write Tests

## Purpose

Given a function implementation, generates a comprehensive test suite covering happy paths, edge cases, error handling, and boundary conditions.

## Prompt

```
Write unit tests for the following {{language}} function using {{framework}}.

Requirements:
- Cover the happy path (normal expected usage)
- Cover edge cases (empty inputs, null/undefined, boundary values)
- Cover error handling (invalid inputs, thrown exceptions)
- Each test should have a descriptive name explaining what it verifies
- Use arrange/act/assert structure
- Mock external dependencies, not the function under test
- Aim for {{coverage}}% code coverage

Function:
```{{language}}
{{code}}
```

Output only the test file content, ready to run.
```

## Variables

- `{{language}}` — programming language
- `{{framework}}` — test framework (jest, vitest, pytest, go test)
- `{{coverage}}` — target coverage percentage (e.g. "90")
- `{{code}}` — the function to test

## Example output

```typescript
import { describe, it, expect } from 'vitest';
import { parseVersion } from './version';

describe('parseVersion', () => {
  it('parses semver string into components', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('handles version with v prefix', () => {
    expect(parseVersion('v1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  it('throws on invalid format', () => {
    expect(() => parseVersion('not-a-version')).toThrow('Invalid version');
  });

  it('handles zero version', () => {
    expect(parseVersion('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
  });
});
```
