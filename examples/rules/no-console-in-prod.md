---
name: no-console-in-prod
description: No console.log statements in production code
version: 1.0.0
author: ihub
project: ci-toolkit
tags: [code-quality, logging, cleanup]
scope: global
severity: warning
globs: "src/**/*.{js,ts}"
applies_to: [code-reviewer]
---

# No Console in Production

## Rule

Production code must not contain `console.log`, `console.warn`, `console.error`, or `console.debug` statements. Use a structured logger instead.

## Rationale

Console statements bypass log aggregation, lack structured metadata (timestamps, levels, correlation IDs), cannot be filtered in production, and may leak sensitive data to browser devtools.

## Examples

### Correct

```javascript
import { logger } from "./logger.js";
logger.info("User logged in", { userId, method: "oauth" });
logger.error("Payment failed", { orderId, error: err.message });
```

### Incorrect

```javascript
console.log("User logged in:", userId);
console.error("Payment failed:", err);
```
