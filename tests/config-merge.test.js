import { describe, it, afterAll } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  mergeObjectEntry,
  mergeArrayEntry,
  parseKeyValueArray,
  buildMcpEntry,
  buildClaudeHookEntry,
} from "../cli/config-merge.js";
import { getConfigTarget } from "../cli/agents-config.js";

const tmpDir = mkdtempSync(join(tmpdir(), "ihub-config-merge-test-"));
let counter = 0;
function tmpFile() {
  return join(tmpDir, `config-${counter++}.json`);
}

describe("config-merge", () => {
  afterAll(() => {
    rmSync(tmpDir, { recursive: true });
  });

  // --- mergeObjectEntry ---

  it("creates the file with only the merged entry when absent", () => {
    const file = tmpFile();
    mergeObjectEntry(file, "mcpServers", "github", { command: "npx" });
    const config = JSON.parse(readFileSync(file, "utf-8"));
    assert.deepEqual(config, { mcpServers: { github: { command: "npx" } } });
  });

  it("creates nested parent directories", () => {
    const file = join(tmpDir, "deep", ".claude", "settings.json");
    mergeObjectEntry(file, "mcpServers", "x", { command: "y" });
    assert.ok(existsSync(file));
  });

  it("preserves unrelated keys and entries", () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify({ theme: "dark", mcpServers: { other: { command: "uvx" } } }));
    mergeObjectEntry(file, "mcpServers", "github", { command: "npx" });
    const config = JSON.parse(readFileSync(file, "utf-8"));
    assert.equal(config.theme, "dark");
    assert.deepEqual(config.mcpServers.other, { command: "uvx" });
    assert.deepEqual(config.mcpServers.github, { command: "npx" });
  });

  it("replaces the entry on re-merge instead of duplicating", () => {
    const file = tmpFile();
    mergeObjectEntry(file, "mcpServers", "github", { command: "npx", args: ["v1"] });
    mergeObjectEntry(file, "mcpServers", "github", { command: "npx", args: ["v2"] });
    const config = JSON.parse(readFileSync(file, "utf-8"));
    assert.equal(Object.keys(config.mcpServers).length, 1);
    assert.deepEqual(config.mcpServers.github.args, ["v2"]);
  });

  it("aborts without writing when the target contains invalid JSON", () => {
    const file = tmpFile();
    writeFileSync(file, "{ not json !!");
    assert.throws(() => mergeObjectEntry(file, "mcpServers", "x", {}), /Invalid JSON/);
    assert.equal(readFileSync(file, "utf-8"), "{ not json !!");
  });

  it("refuses to clobber an existing non-object value on the key path", () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify({ hooks: "user-string" }));
    assert.throws(() => mergeArrayEntry(file, "hooks.PostToolUse", "hook/x", {}), /not an object/);
    assert.equal(JSON.parse(readFileSync(file, "utf-8")).hooks, "user-string");
  });

  it("refuses to replace a non-array value at an array key", () => {
    const file = tmpFile();
    writeFileSync(file, JSON.stringify({ hooks: { PostToolUse: "oops" } }));
    assert.throws(() => mergeArrayEntry(file, "hooks.PostToolUse", "hook/x", {}), /not an array/);
  });

  it("writes pretty-printed JSON with a trailing newline", () => {
    const file = tmpFile();
    mergeObjectEntry(file, "mcpServers", "x", { command: "y" });
    const raw = readFileSync(file, "utf-8");
    assert.ok(raw.endsWith("}\n"));
    assert.ok(raw.includes("\n  "));
  });

  // --- mergeArrayEntry ---

  it("appends a marked entry to a fresh array", () => {
    const file = tmpFile();
    mergeArrayEntry(file, "hooks.PostToolUse", "hook/fmt", { matcher: "Write", hooks: [] });
    const config = JSON.parse(readFileSync(file, "utf-8"));
    assert.equal(config.hooks.PostToolUse.length, 1);
    assert.equal(config.hooks.PostToolUse[0]._ihub, "hook/fmt");
  });

  it("replaces a marked entry in place and never touches user entries", () => {
    const file = tmpFile();
    const userEntry = { matcher: "Bash", hooks: [{ type: "command", command: "echo user" }] };
    writeFileSync(file, JSON.stringify({ hooks: { PostToolUse: [userEntry] } }));

    mergeArrayEntry(file, "hooks.PostToolUse", "hook/fmt", { matcher: "Write", hooks: [{ command: "v1" }] });
    mergeArrayEntry(file, "hooks.PostToolUse", "hook/fmt", { matcher: "Write", hooks: [{ command: "v2" }] });

    const config = JSON.parse(readFileSync(file, "utf-8"));
    assert.equal(config.hooks.PostToolUse.length, 2);
    assert.deepEqual(config.hooks.PostToolUse[0], userEntry);
    assert.equal(config.hooks.PostToolUse[1].hooks[0].command, "v2");
  });

  it("keeps entries for different artifacts separate", () => {
    const file = tmpFile();
    mergeArrayEntry(file, "hooks.PostToolUse", "hook/a", { hooks: [] });
    mergeArrayEntry(file, "hooks.PostToolUse", "hook/b", { hooks: [] });
    const config = JSON.parse(readFileSync(file, "utf-8"));
    assert.equal(config.hooks.PostToolUse.length, 2);
  });

  // --- parseKeyValueArray ---

  it("splits KEY=value pairs on the first separator only", () => {
    const out = parseKeyValueArray(["TOKEN=${VAR}", "URL=http://x?a=b"]);
    assert.deepEqual(out, { TOKEN: "${VAR}", URL: "http://x?a=b" });
  });

  it("parses headers with colon separator", () => {
    const out = parseKeyValueArray(["Authorization: Bearer ${T}"], ":");
    assert.deepEqual(out, { Authorization: "Bearer ${T}" });
  });

  it("ignores malformed items and non-arrays", () => {
    assert.deepEqual(parseKeyValueArray(["novalue"]), {});
    assert.deepEqual(parseKeyValueArray(undefined), {});
  });

  it("strips surrounding quotes left by the flat frontmatter parser", () => {
    assert.deepEqual(parseKeyValueArray(['"TOKEN=${VAR}"']), { TOKEN: "${VAR}" });
    const entry = buildMcpEntry({ transport: "stdio", command: "npx", args: ["-y", '"@scope/pkg@1.0.0"'] }, "standard");
    assert.deepEqual(entry.args, ["-y", "@scope/pkg@1.0.0"]);
  });

  // --- buildMcpEntry ---

  it("builds a standard stdio entry", () => {
    const entry = buildMcpEntry({ transport: "stdio", command: "npx", args: ["-y", "pkg"], env: ["K=${V}"] }, "standard");
    assert.deepEqual(entry, { command: "npx", args: ["-y", "pkg"], env: { K: "${V}" } });
  });

  it("builds a standard http entry with headers", () => {
    const entry = buildMcpEntry({ transport: "http", url: "https://x/mcp", headers: ["X-Key: ${K}"] }, "standard");
    assert.deepEqual(entry, { type: "http", url: "https://x/mcp", headers: { "X-Key": "${K}" } });
  });

  it("builds an opencode local entry with command array", () => {
    const entry = buildMcpEntry({ transport: "stdio", command: "npx", args: ["pkg"], env: ["K=V"] }, "opencode");
    assert.deepEqual(entry, { type: "local", command: ["npx", "pkg"], enabled: true, environment: { K: "V" } });
  });

  it("builds an opencode remote entry", () => {
    const entry = buildMcpEntry({ transport: "sse", url: "https://x" }, "opencode");
    assert.deepEqual(entry, { type: "remote", url: "https://x", enabled: true });
  });

  // --- buildClaudeHookEntry ---

  it("builds a hook entry with matcher and timeout", () => {
    const entry = buildClaudeHookEntry({ event: "PostToolUse", matcher: "Write|Edit", command: "fmt", timeout: 30 });
    assert.deepEqual(entry, { matcher: "Write|Edit", hooks: [{ type: "command", command: "fmt", timeout: 30 }] });
  });

  it("omits matcher and timeout when unset", () => {
    const entry = buildClaudeHookEntry({ event: "Stop", command: "notify" });
    assert.deepEqual(entry, { hooks: [{ type: "command", command: "notify" }] });
  });

  // --- getConfigTarget ---

  it("resolves claude mcp local target to .mcp.json", () => {
    const t = getConfigTarget("claude", "mcps", "local");
    assert.equal(t.path, ".mcp.json");
    assert.equal(t.key, "mcpServers");
    assert.equal(t.shape, "standard");
  });

  it("resolves claude hook target to settings.json with claude-hooks shape", () => {
    const t = getConfigTarget("claude", "hooks", "local");
    assert.ok(t.path.endsWith("settings.json"));
    assert.equal(t.shape, "claude-hooks");
  });

  it("returns a note for codex mcp (unsupported)", () => {
    const t = getConfigTarget("codex", "mcps", "local");
    assert.equal(t.path, undefined);
    assert.match(t.note, /config\.toml/);
  });

  it("returns a note for cursor hooks (unsupported)", () => {
    const t = getConfigTarget("cursor", "hooks", "local");
    assert.equal(t.path, undefined);
    assert.ok(t.note);
  });

  it("accepts singular type names", () => {
    const t = getConfigTarget("gemini", "mcp", "local");
    assert.equal(t.key, "mcpServers");
  });
});
