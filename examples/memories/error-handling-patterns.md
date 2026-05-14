---
name: error-handling-patterns
description: Team conventions for error handling across services
version: 1.0.0
author: ihub
project: developer-tools
tags: [errors, patterns, conventions]
scope: global
context_type: decision
related: [code-reviewer]
---

# Error Handling Patterns

## Context

The team standardized error handling after a production incident where unstructured errors caused cascading failures across microservices. This memory captures the agreed patterns.

## When to recall

- When writing try/catch blocks
- When designing error responses for APIs
- When reviewing code that handles failures
- When creating new services or endpoints

## Content

### API errors

Always return structured error responses:

```json
{
  "error": {
    "code": "PAYMENT_FAILED",
    "message": "Card declined by issuer",
    "details": { "card_last4": "4242" }
  }
}
```

### Internal errors

Use custom error classes with error codes:

```javascript
class AppError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
```

### Rules

1. Never swallow errors silently — always log or rethrow
2. Use error codes, not message string matching
3. Include correlation IDs in all error logs
4. Distinguish between operational errors (retry) and programmer errors (crash)
