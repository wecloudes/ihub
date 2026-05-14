---
name: explain-code
description: Explains what a piece of code does in plain language
version: 1.0.0
author: ihub
project: developer-tools
tags: [explanation, onboarding, learning]
model: 
compatible_agents: []
---

# Explain Code

## Purpose

Takes a code snippet and produces a clear, layered explanation suitable for developers unfamiliar with the codebase.

## Prompt

```
Explain the following code. Structure your explanation as:

1. **One-line summary**: what does this code do, in one sentence?
2. **Step by step**: walk through the logic, line by line or block by block
3. **Key concepts**: explain any non-obvious patterns, algorithms, or language features used
4. **Dependencies**: what does this code depend on? (libraries, other modules, APIs)
5. **Edge cases**: what inputs or conditions could cause unexpected behavior?

Audience: a developer who knows {{language}} but has never seen this codebase.

Code:
```{{language}}
{{code}}
```
```

## Variables

- `{{language}}` — the programming language (e.g. "typescript", "python")
- `{{code}}` — the code to explain

## Example output

```
**One-line summary**: This function retries a failed HTTP request up to 3 times
with exponential backoff.

**Step by step**:
1. Takes a `fetchFn` callback and optional `maxRetries` (default 3)
2. Calls `fetchFn()` inside a try/catch loop
3. On failure, waits `2^attempt * 100ms` before retrying
4. If all retries fail, throws the last error

**Key concepts**:
- Exponential backoff: each retry waits longer (100ms, 200ms, 400ms)
- The `AbortController` ensures the timeout cancels pending requests

**Dependencies**: Native `fetch`, `AbortController`

**Edge cases**:
- Network timeout during the final retry throws immediately
- Non-retryable errors (4xx) are retried unnecessarily — consider checking status
```
