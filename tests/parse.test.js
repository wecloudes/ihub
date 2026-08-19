import { describe, it, beforeEach, afterEach } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseFrontmatter, collectFiles, unwrapConfig, collectPluginComponents,
  loadPlugin, loadPlugins, loadRegistry,
} from "../cli/parse.js";

describe("parseFrontmatter", () => {
  it("parses basic frontmatter", () => {
    const { meta, body } = parseFrontmatter(`---
name: test
description: A test entry
version: 0.1.0
---

# Test`);
    assert.equal(meta.name, "test");
    assert.equal(meta.description, "A test entry");
    assert.equal(meta.version, "0.1.0");
    assert.equal(body, "# Test");
  });

  it("parses inline arrays", () => {
    const { meta } = parseFrontmatter(`---
tags: [a, b, c]
---`);
    assert.deepEqual(meta.tags, ["a", "b", "c"]);
  });

  it("parses booleans", () => {
    const { meta } = parseFrontmatter(`---
enabled: true
disabled: false
---`);
    assert.equal(meta.enabled, true);
    assert.equal(meta.disabled, false);
  });

  it("parses numbers", () => {
    const { meta } = parseFrontmatter(`---
count: 42
---`);
    assert.equal(meta.count, 42);
  });

  it("returns empty meta when no frontmatter", () => {
    const { meta, body } = parseFrontmatter("# Just markdown");
    assert.deepEqual(meta, {});
    assert.equal(body, "# Just markdown");
  });

  it("handles empty arrays", () => {
    const { meta } = parseFrontmatter(`---
tags: []
---`);
    assert.deepEqual(meta.tags, []);
  });
});

// Scaffold a plugin directory under <root>/plugins/<name>.
function scaffoldPlugin(root, name, { manifest, readme, skills = [], commands = [], agents = [], mcp, hooks } = {}) {
  const dir = join(root, "plugins", name);
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  const fullManifest = { name, version: "1.0.0", description: `The ${name} plugin`, ...manifest };
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify(fullManifest, null, 2));
  if (readme !== null) writeFileSync(join(dir, "README.md"), readme ?? `# ${name}\n\nReadme body.`);
  for (const s of skills) {
    mkdirSync(join(dir, "skills", s), { recursive: true });
    writeFileSync(join(dir, "skills", s, "SKILL.md"), `---\ndescription: ${s} skill\n---\n\n# ${s}`);
  }
  for (const c of commands) {
    mkdirSync(join(dir, "commands"), { recursive: true });
    writeFileSync(join(dir, "commands", `${c}.md`), `---\ndescription: ${c}\n---\n\nBody`);
  }
  for (const a of agents) {
    mkdirSync(join(dir, "agents"), { recursive: true });
    writeFileSync(join(dir, "agents", `${a}.md`), `---\nname: ${a}\n---\n\nBody`);
  }
  if (mcp) writeFileSync(join(dir, ".mcp.json"), JSON.stringify(mcp, null, 2));
  if (hooks) {
    mkdirSync(join(dir, "hooks"), { recursive: true });
    writeFileSync(join(dir, "hooks", "hooks.json"), JSON.stringify(hooks, null, 2));
  }
  return dir;
}

describe("collectFiles", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "ihub-collect-")); });
  afterEach(() => { rmSync(tmpDir, { recursive: true }); });

  it("collects every file with plugin-relative POSIX paths", () => {
    mkdirSync(join(tmpDir, "sub"), { recursive: true });
    writeFileSync(join(tmpDir, "a.md"), "a");
    writeFileSync(join(tmpDir, "sub", "b.json"), "{}");
    const files = collectFiles(tmpDir, tmpDir).map((f) => f.filepath).sort();
    assert.deepEqual(files, ["a.md", "sub/b.json"]);
  });

  it("applies the exclude predicate", () => {
    writeFileSync(join(tmpDir, "README.md"), "x");
    writeFileSync(join(tmpDir, "keep.md"), "y");
    const files = collectFiles(tmpDir, tmpDir, [], (rel) => rel === "README.md").map((f) => f.filepath);
    assert.deepEqual(files, ["keep.md"]);
  });

  it("returns an empty array for a missing directory", () => {
    assert.deepEqual(collectFiles(join(tmpDir, "nope"), tmpDir), []);
  });
});

describe("unwrapConfig", () => {
  it("returns the inner object for a wrapped config", () => {
    assert.deepEqual(unwrapConfig({ mcpServers: { a: 1 } }, "mcpServers"), { a: 1 });
    assert.deepEqual(unwrapConfig({ hooks: { PostToolUse: [] } }, "hooks"), { PostToolUse: [] });
  });
  it("returns the object as-is when not wrapped", () => {
    assert.deepEqual(unwrapConfig({ a: { command: "x" } }, "mcpServers"), { a: { command: "x" } });
  });
  it("returns {} for non-objects", () => {
    assert.deepEqual(unwrapConfig(null, "mcpServers"), {});
    assert.deepEqual(unwrapConfig([1, 2], "mcpServers"), {});
  });
});

describe("collectPluginComponents", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "ihub-comp-")); });
  afterEach(() => { rmSync(tmpDir, { recursive: true }); });

  it("summarizes skills, commands, agents, mcp servers and hook events", () => {
    const dir = scaffoldPlugin(tmpDir, "p", {
      skills: ["greet", "farewell"],
      commands: ["hello"],
      agents: ["bot"],
      mcp: { srv: { command: "npx" }, web: { type: "http", url: "https://x" } },
      hooks: { hooks: { PostToolUse: [{ hooks: [{ command: "x" }] }], Stop: [] } },
    });
    const c = collectPluginComponents(dir);
    assert.deepEqual(c.skills.sort(), ["farewell", "greet"]);
    assert.deepEqual(c.commands, ["hello"]);
    assert.deepEqual(c.agents, ["bot"]);
    assert.deepEqual(c.mcpServers.sort(), ["srv", "web"]);
    assert.deepEqual(c.hooks.sort(), ["PostToolUse", "Stop"]);
  });

  it("returns empty arrays for a bare plugin", () => {
    const dir = scaffoldPlugin(tmpDir, "bare");
    const c = collectPluginComponents(dir);
    assert.deepEqual(c, { skills: [], commands: [], agents: [], mcpServers: [], hooks: [] });
  });

  it("reads mcp servers from a flat (unwrapped) .mcp.json", () => {
    const dir = scaffoldPlugin(tmpDir, "flat", { mcp: { onlyServer: { command: "x" } } });
    assert.deepEqual(collectPluginComponents(dir).mcpServers, ["onlyServer"]);
  });
});

describe("loadPlugin", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "ihub-loadplugin-")); });
  afterEach(() => { rmSync(tmpDir, { recursive: true }); });

  it("loads a full plugin into a flat entry", () => {
    const dir = scaffoldPlugin(tmpDir, "sample", {
      manifest: { keywords: ["a", "b"], project: "demo", author: { name: "me", email: "me@x.io" } },
      readme: "# sample\n\nHello.",
      skills: ["greet"],
      commands: ["hello"],
      agents: ["bot"],
      mcp: { srv: { command: "npx" } },
      hooks: { hooks: { PostToolUse: [{ hooks: [{ command: "x" }] }] } },
    });
    const entry = loadPlugin(dir);
    assert.equal(entry.name, "sample");
    assert.equal(entry.dir, "sample");
    assert.equal(entry.path, dir);
    assert.equal(entry.version, "1.0.0");
    assert.equal(entry.project, "demo");
    assert.equal(entry.body, "# sample\n\nHello.");
    // author flattened to a string, raw kept under _author
    assert.equal(entry.author, "me");
    assert.deepEqual(entry._author, { name: "me", email: "me@x.io" });
    // keywords double as tags
    assert.deepEqual(entry.tags, ["a", "b"]);
    // components derived
    assert.deepEqual(entry.components.skills, ["greet"]);
    assert.deepEqual(entry.components.mcpServers, ["srv"]);
    assert.deepEqual(entry.components.hooks, ["PostToolUse"]);
    // files exclude the root README, include the manifest
    const paths = entry.files.map((f) => f.filepath);
    assert.ok(!paths.includes("README.md"));
    assert.ok(paths.includes(".claude-plugin/plugin.json"));
    assert.ok(paths.includes("skills/greet/SKILL.md"));
    assert.equal(entry.manifestError, null);
  });

  it("uses the directory name when the manifest omits name", () => {
    const dir = scaffoldPlugin(tmpDir, "dir-name", { manifest: { name: undefined } });
    // strip name from the manifest file
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ description: "no name" }));
    const entry = loadPlugin(dir);
    assert.equal(entry.name, "dir-name");
  });

  it("reports a manifestError for invalid JSON", () => {
    const dir = scaffoldPlugin(tmpDir, "broken");
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), "{ not json");
    const entry = loadPlugin(dir);
    assert.ok(entry.manifestError);
  });

  it("returns null when there is no manifest", () => {
    mkdirSync(join(tmpDir, "plugins", "nomanifest"), { recursive: true });
    assert.equal(loadPlugin(join(tmpDir, "plugins", "nomanifest")), null);
  });
});

describe("loadPlugins / loadRegistry", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "ihub-loadplugins-")); });
  afterEach(() => { rmSync(tmpDir, { recursive: true }); });

  it("loads every plugin dir under plugins/ and skips non-plugin dirs", () => {
    scaffoldPlugin(tmpDir, "one", { skills: ["s"] });
    scaffoldPlugin(tmpDir, "two");
    mkdirSync(join(tmpDir, "plugins", "junk"), { recursive: true }); // no manifest → skipped
    const plugins = loadPlugins(tmpDir);
    assert.equal(plugins.length, 2);
    assert.deepEqual(plugins.map((p) => p.name).sort(), ["one", "two"]);
  });

  it("returns an empty array when plugins/ is absent", () => {
    assert.deepEqual(loadPlugins(join(tmpDir, "empty-root")), []);
  });

  it("loadRegistry returns a single plugins bucket", () => {
    scaffoldPlugin(tmpDir, "one");
    const reg = loadRegistry(tmpDir);
    assert.ok(Array.isArray(reg.plugins));
    assert.equal(reg.plugins.length, 1);
    assert.equal(Object.keys(reg).length, 1);
  });
});
