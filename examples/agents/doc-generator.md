---
name: doc-generator
description: Generates documentation from code, comments, and type signatures
version: 1.0.0
author: ihub
project: developer-tools
tags: [documentation, api-docs, jsdoc, typedoc]
inputs: [source-code, existing-docs]
outputs: [markdown-docs, api-reference]
skills: []
rules: []
memories: []
prompts: []
---

# Doc Generator

## Purpose

Reads source code, extracts type signatures, JSDoc/docstring comments, and function signatures to produce structured markdown documentation. Fills gaps where documentation is missing by inferring purpose from code patterns.

## Capabilities

- Extracts function signatures and type annotations
- Parses JSDoc, docstrings, and inline comments
- Generates API reference in markdown format
- Identifies undocumented public functions
- Produces a table of contents with cross-links

## Configuration

```yaml
languages: [javascript, typescript, python]
output_format: markdown
include_private: false
include_examples: true
```

## Usage

```
ihub run doc-generator --input "src/" --output "docs/api.md"
```
