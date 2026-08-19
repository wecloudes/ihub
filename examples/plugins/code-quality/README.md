# code-quality

## Overview

A bundle of code-quality helpers for day-to-day development: generate
conventional commit messages, run linters, audit dependencies for
vulnerabilities, generate unit tests, and review diffs with a dedicated agent.

## Components

- **Skills**
  - `git-commit-msg` — conventional commit messages from staged changes
  - `lint-check` — run configured linters and return structured diagnostics
  - `dependency-audit` — audit dependencies for known vulnerabilities and license issues
  - `test-generator` — generate unit tests from signatures and docstrings
- **Commands**
  - `/commit` — generate and apply a conventional commit message
- **Agents**
  - `code-reviewer` — review diffs for quality, bugs, and rule violations

## Usage

```bash
ihub pull code-quality --install
```
