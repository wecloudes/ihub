# Tasks — add `mcp` and `hook` artifact types

## 1. Type system plumbing

- [x] 1.1 Add `mcp`/`mcps` and `hook`/`hooks` to every canonical type list: `cli/index.js` (TYPES at 659 and 763, validTypes at 1411, PLURAL_MAP/SINGULAR_MAP/TYPE_ALIASES at 219-232), `cli/tui.js:43`, `cli/pinning.js:32`, `cli/agents-config.js` typeMap, `cli/parse.js` loadRegistry dirs, `server/routes.js:61`, `server/federation.js:6`, `server/ui.js:366` (+ TYPE_DESC, color map)
- [x] 1.2 Add `mcp` and `hook` entries to TYPE_FIELDS in `cli/index.js` (fields per specs)
- [x] 1.3 Extend agent TYPE_FIELDS with `mcps` and `hooks` array fields
- [x] 1.4 Add `mcps` and `hooks` working dirs to .gitignore pattern block and create `templates/mcp.md`, `templates/hook.md`; add both types to create's validTypes (also add the missing `command`/`design` there)

## 2. Config-merge installer

- [x] 2.1 Create `cli/config-merge.js`: `mergeJsonConfig(filePath, keyPath, entryValue, { arrayMarker })` — create-if-absent, parse-error abort, object-key replace, marker-keyed array replace/append, pretty-print write
- [x] 2.2 Add `configTargets` to each agent in `CODING_AGENTS` (`cli/agents-config.js`): mcp targets for claude/cursor/gemini/qwen/opencode (codex = note only), hook targets for claude (others = note)
- [x] 2.3 Implement entry shape transforms: `standard` mcpServers entry (command/args/env/url/headers from frontmatter, env array → object), `opencode` mcp entry (type local/remote, command array, environment object), `claude-hooks` event-array entry with `_ihub` marker
- [x] 2.4 Write `tests/config-merge.test.js`: fresh file, preserve unrelated keys, replace on re-merge, corrupt JSON abort, marker-keyed array replace, user entry untouched

## 3. Pull/install integration

- [x] 3.1 Wire `mcp` install branch into pull (`cli/index.js` ~1462): resolve configTargets per agent/scope, build entry via shape transform, merge, save `.md` to `mcps/`, skip-with-note for unsupported agents
- [x] 3.2 Wire `hook` install branch: display event/matcher/command, y/N confirmation, `--yes` flag, signature verification gate (verify when `meta._signature` present or signing enabled; abort on invalid; warn on missing), merge into settings, save `.md` to `hooks/`
- [x] 3.3 Extend agent transitive-dep resolution (`cli/index.js:1582-1626`) with `mcps` and `hooks` arrays (hooks go through the gate; respect `--no-deps` and pins)
- [x] 3.4 Validate command: transport/command/url requirements for mcp, valid `event` list for hook, cross-ref checks for agent `mcps:`/`hooks:` arrays (`cli/index.js:595-642` pattern)

## 4. Server, UI, TUI

- [x] 4.1 Verify server routes accept the new plurals end-to-end (push/list/show/comments/metrics) — extend `tests/routes.test.js`
- [x] 4.2 Web UI: tabs, descriptions, type colors for mcp/hook in `server/ui.js`
- [x] 4.3 TUI: new types appear in type tabs and guide view (`cli/tui.js`)

## 5. Examples, completions, docs

- [x] 5.1 Add `examples/mcps/` (e.g. github stdio server, one http server) and `examples/hooks/` (e.g. format-on-save) with placeholder env vars
- [x] 5.2 Update `completions/ihub.bash` and `completions/ihub.zsh` type lists
- [x] 5.3 Update CLAUDE.md (nine types, key conventions for config-merge install + hook gate), README.md, CONTRIBUTING.md, man/ihub.1.md, CHANGELOG.md (0.7.0); bump package.json to 0.7.0

## 6. Tests & verification

- [x] 6.1 Extend `tests/cli.test.js`: mcp pull merges into .mcp.json/.cursor/mcp.json, idempotent re-pull, codex skip note, hook pull with --yes, hook confirmation cancel, validate errors (missing command/url, bad event, broken mcps/hooks refs), sensitive block on literal env secret
- [x] 6.2 Full `bun test` green; `bun run server` smoke: push + pull an mcp and a hook against a live local server
- [x] 6.3 Docker build verification (server code changed)
