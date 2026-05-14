---
name: refactor-suggestion
description: Suggests refactoring opportunities with before/after code examples
version: 1.0.0
author: ihub
project: developer-tools
tags: [refactoring, code-quality, improvement]
model: 
compatible_agents: [code-reviewer]
---

# Refactor Suggestion

## Purpose

Analyzes code for refactoring opportunities and produces concrete before/after examples with explanations.

## Prompt

```
Analyze the following code for refactoring opportunities. For each suggestion:

1. **What**: name the refactoring pattern (extract function, replace conditional with polymorphism, etc.)
2. **Why**: explain the benefit (readability, testability, performance, maintainability)
3. **Before**: the current code
4. **After**: the refactored code
5. **Risk**: what could break (low/medium/high) and what to test

Only suggest refactorings that provide clear value. Do not suggest changes that are purely cosmetic or that would make the code harder to understand.

Code:
```{{language}}
{{code}}
```
```

## Variables

- `{{language}}` — programming language
- `{{code}}` — the code to analyze

## Example output

```
## Suggestion 1: Extract validation logic

**What**: Extract Function
**Why**: The validation block (lines 12-35) is independent logic that can be tested in isolation
**Risk**: Low — pure function, no side effects

**Before**:
```javascript
function createUser(data) {
  if (!data.email || !data.email.includes('@')) throw new Error('Invalid email');
  if (!data.name || data.name.length < 2) throw new Error('Name too short');
  if (data.age && (data.age < 0 || data.age > 150)) throw new Error('Invalid age');
  // ... 20 more lines of creation logic
}
```

**After**:
```javascript
function validateUserData(data) {
  if (!data.email || !data.email.includes('@')) throw new Error('Invalid email');
  if (!data.name || data.name.length < 2) throw new Error('Name too short');
  if (data.age && (data.age < 0 || data.age > 150)) throw new Error('Invalid age');
}

function createUser(data) {
  validateUserData(data);
  // ... creation logic
}
```
```
