---
name: migration-assistant
description: Assists with database schema migrations and data transformations
version: 1.0.0
author: ihub
project: developer-tools
tags: [database, migration, schema, sql]
inputs: [current-schema, target-schema]
outputs: [migration-script, rollback-script]
skills: []
rules: [require-tests]
---

# Migration Assistant

## Purpose

Compares database schemas, generates migration scripts with proper ordering, handles data transformations, and produces matching rollback scripts. Validates migrations against running databases before applying.

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

```
ihub run migration-assistant --current schema.sql --target schema-v2.sql
```
