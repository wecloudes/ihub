---
name: github
description: GitHub MCP server — repos, issues, PRs, and code search from your coding agent
version: 1.0.0
author: ihub
tags: [github, git, vcs]
transport: stdio
command: npx
args: [-y, "@modelcontextprotocol/server-github@2025.4.8"]
env: ["GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN}"]
compatible_agents: []
---

# github

## Purpose

Gives the coding agent direct access to the GitHub API: list and search repositories, read and create issues, review and comment on pull requests, and search code across repos.

## Tools

`search_repositories`, `get_issue`, `create_issue`, `list_pull_requests`, `get_pull_request`, `create_pull_request_review`, `search_code`, and more.

## Setup

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | A GitHub personal access token with `repo` scope. Export it in your shell profile — the config references it as `${GITHUB_TOKEN}`, the value is never stored. |
