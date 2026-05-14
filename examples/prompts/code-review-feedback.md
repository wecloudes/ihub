---
name: code-review-feedback
description: Generates structured code review feedback from a diff
version: 1.0.0
author: ihub
project: ci-toolkit
tags: [code-review, feedback, quality]
model: 
compatible_agents: [code-reviewer]
---

# Code Review Feedback

## Purpose

Produces actionable, categorized code review feedback with severity levels and inline suggestions.

## Prompt

```
Review the following code diff. For each issue found, provide:

1. **Category**: bug, security, performance, style, or suggestion
2. **Severity**: critical, major, minor, or nitpick
3. **Location**: file and line number
4. **Issue**: what's wrong
5. **Fix**: how to fix it (include code if possible)

Focus on:
- Logic errors and edge cases
- Security vulnerabilities (injection, auth bypass, data exposure)
- Performance issues (N+1 queries, unnecessary allocations)
- Violations of project conventions

Do NOT flag:
- Personal style preferences
- Minor formatting issues handled by linters
- TODOs that are intentionally left

Diff:
{{diff}}
```

## Variables

- `{{diff}}` — the full git diff to review

## Example output

```
## Review: 3 issues found

### 1. [critical/security] src/auth.ts:42
**Issue**: User input passed directly to SQL query without parameterization
**Fix**:
  ```typescript
  // Before
  db.query(`SELECT * FROM users WHERE id = '${userId}'`);
  // After
  db.query('SELECT * FROM users WHERE id = $1', [userId]);
  ```

### 2. [major/bug] src/api.ts:18
**Issue**: Missing null check — `user.profile` can be undefined for new accounts
**Fix**: Add optional chaining: `user.profile?.avatar`

### 3. [minor/suggestion] src/utils.ts:7
**Issue**: `Array.from(new Set(items))` can be simplified
**Fix**: Use `[...new Set(items)]`
```
