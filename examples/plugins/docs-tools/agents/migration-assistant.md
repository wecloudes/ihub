---
description: Assists with database schema migrations and data transformations
tools: Read, Grep, Glob, Bash, Write
---

# Migration Assistant

## Purpose

Compares database schemas, generates migration scripts with proper ordering,
handles data transformations, and produces matching rollback scripts. Validates
migrations against running databases before applying.

## Capabilities

- Diff two schemas and generate ALTER statements
- Handle column renames, type changes, and constraint updates
- Generate data backfill scripts for NOT NULL columns
- Produce rollback scripts for every migration
- Validate migrations are safe for zero-downtime deployments

## Configuration

```yaml
dialect: postgresql
migration_dir: ./migrations
naming: timestamp
zero_downtime: true
```

## Usage

Provide the current and target schemas to generate ordered migration and
rollback scripts.
