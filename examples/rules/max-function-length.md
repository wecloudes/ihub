---
name: max-function-length
description: Functions must not exceed 50 lines of code
version: 1.0.0
author: ihub
project: ci-toolkit
tags: [code-quality, readability, complexity]
scope: global
severity: warning
globs: "**/*.{js,ts,py,rb,go,rs}"
applies_to: [code-reviewer]
---

# Max Function Length

## Rule

No function should exceed 50 lines of executable code (excluding blank lines, comments, and closing braces). Functions exceeding this limit must be broken into smaller, named functions.

## Rationale

Long functions are harder to test, debug, and reason about. They tend to accumulate multiple responsibilities. Shorter functions with descriptive names serve as self-documenting code.

## Examples

### Correct

```javascript
function processOrder(order) {
  validateOrder(order);
  const total = calculateTotal(order.items);
  const payment = chargePayment(order.paymentMethod, total);
  return createConfirmation(order, payment);
}
```

### Incorrect

```javascript
function processOrder(order) {
  // 150 lines of validation, calculation,
  // payment processing, email sending,
  // inventory updates, and logging
  // all in one function
}
```
