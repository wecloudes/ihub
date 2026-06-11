---
name: login-page
description: Login page wireframe with OAuth and email/password flows
version: 1.0.0
author: ihub
project: web-app
tags: [auth, login, wireframe, web]
platform: web
component_type: page
design_system: minimal-ui
format: html
---

# Login Page

## Layout

```
+----------------------------------+
|            Logo + Title           |
+----------------------------------+
|                                  |
|   [  Continue with Google  ]     |
|   [  Continue with GitHub  ]     |
|                                  |
|   ────── or ──────               |
|                                  |
|   Email:    [________________]   |
|   Password: [________________]   |
|                                  |
|   [ Forgot password? ]          |
|   [      Sign In       ]        |
|                                  |
|   Don't have an account? Sign up |
+----------------------------------+
```

## Component Spec

| Component | Variant | States |
|-----------|---------|--------|
| OAuthButton | google, github | default, hover, loading, disabled |
| TextInput | email, password | empty, filled, error, focused |
| Button | primary | default, hover, loading, disabled |
| Link | inline | default, hover |

## Design Tokens

- `--login-max-width`: 400px
- `--login-padding`: 2rem
- `--oauth-gap`: 0.75rem
- `--divider-color`: var(--border)
