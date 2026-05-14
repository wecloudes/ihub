import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseFrontmatter, loadEntries, loadRegistry } from "../cli/parse.js";

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

describe("loadEntries", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ihub-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("loads markdown files from a directory", () => {
    writeFileSync(
      join(tmpDir, "test.md"),
      `---\nname: test\ndescription: desc\nversion: 1.0.0\n---\n\nBody`
    );
    const entries = loadEntries(tmpDir);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].name, "test");
    assert.equal(entries[0].file, "test");
    assert.equal(entries[0].body, "Body");
  });

  it("skips non-markdown files", () => {
    writeFileSync(join(tmpDir, "test.md"), "---\nname: a\n---");
    writeFileSync(join(tmpDir, "test.txt"), "not markdown");
    const entries = loadEntries(tmpDir);
    assert.equal(entries.length, 1);
  });

  it("returns empty array for nonexistent directory", () => {
    const entries = loadEntries(join(tmpDir, "nope"));
    assert.deepEqual(entries, []);
  });
});

describe("loadRegistry", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ihub-test-"));
    for (const dir of ["agents", "skills", "rules", "memories", "prompts"]) {
      mkdirSync(join(tmpDir, dir));
    }
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  it("loads all registry types", () => {
    writeFileSync(join(tmpDir, "agents", "a.md"), "---\nname: a\n---");
    writeFileSync(join(tmpDir, "skills", "s.md"), "---\nname: s\n---");
    writeFileSync(join(tmpDir, "rules", "r.md"), "---\nname: r\n---");
    writeFileSync(join(tmpDir, "memories", "m.md"), "---\nname: m\n---");
    writeFileSync(join(tmpDir, "prompts", "p.md"), "---\nname: p\n---");

    const reg = loadRegistry(tmpDir);
    assert.equal(reg.agents.length, 1);
    assert.equal(reg.skills.length, 1);
    assert.equal(reg.rules.length, 1);
    assert.equal(reg.memories.length, 1);
    assert.equal(reg.prompts.length, 1);
  });

  it("handles empty directories", () => {
    const reg = loadRegistry(tmpDir);
    assert.equal(reg.agents.length, 0);
    assert.equal(reg.skills.length, 0);
    assert.equal(reg.rules.length, 0);
    assert.equal(reg.memories.length, 0);
    assert.equal(reg.prompts.length, 0);
  });
});
