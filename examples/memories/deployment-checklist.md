---
name: deployment-checklist
description: Pre-deployment verification steps learned from past incidents
version: 1.0.0
author: ihub
project: ci-toolkit
tags: [deployment, checklist, operations]
scope: global
context_type: insight
related: [security-scanner]
---

# Deployment Checklist

## Context

Compiled from post-mortems and near-misses over the past year. Each item exists because skipping it caused or nearly caused an incident.

## When to recall

- Before any production deployment
- When setting up CI/CD pipelines
- When onboarding engineers to the deploy process

## Content

### Before deploying

1. All tests pass on the exact commit being deployed
2. Database migrations tested against a copy of production data
3. Feature flags in place for any user-facing changes
4. Rollback plan documented and tested
5. No secrets in the diff (`git diff --cached` checked)
6. Dependency audit clean (no critical/high CVEs)
7. Performance benchmarks show no regression > 10%

### During deployment

1. Deploy to staging first, verify for 15 minutes minimum
2. Monitor error rates for the first 30 minutes
3. Keep the deploy channel open until stable

### After deployment

1. Verify key user flows manually
2. Check dashboards: latency, error rate, CPU, memory
3. Update the changelog
