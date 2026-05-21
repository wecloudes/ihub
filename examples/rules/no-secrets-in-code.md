---
name: no-secrets-in-code
description: No API keys, tokens, passwords, or secrets in source code
version: 1.0.0
author: ihub
project: ci-toolkit
tags: [security, secrets, credentials]
scope: global
severity: error
globs: "**/*.{js,ts,py,rb,go,env,yml,yaml,json}"
applies_to: [code-reviewer, security-scanner]
---

# No Secrets in Code

## Rule

Source code must never contain hardcoded secrets including API keys, access tokens, passwords, private keys, connection strings with credentials, or webhook URLs.

## Rationale

Secrets in code end up in git history, CI logs, error messages, and client bundles. Once exposed, they are difficult to rotate and can be exploited immediately.

## Examples

### Correct

```javascript
const apiKey = process.env.API_KEY;
const dbUrl = process.env.DATABASE_URL;
```

### Incorrect

```javascript
const apiKey = "sk-1234567890abcdef";
const dbUrl = "postgres://admin:password123@prod-db:5432/app";
```
