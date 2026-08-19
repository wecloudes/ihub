// Tests for 2026 plugin-validation rules in `ihub validate`:
// boolean-like skill fields, the ":" ban in plugin names, and mcp
// protocolVersion date checks. Fixtures are real plugin directories under
// plugins/<name>/ (created + torn down per test).
import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { rmSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "cli", "index.js");

// Run `ihub validate` and return combined output whether it passes or fails.
// Working dirs are shared, so unrelated stray plugins may make the overall run
// fail — each test only asserts on lines about its own plugin.
function runValidate() {
  try {
    return execFileSync(process.execPath, [CLI, "validate"], {
      cwd: ROOT,
      input: "",
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      encoding: "utf-8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (err) {
    return (err.stdout || "") + (err.stderr || "");
  }
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

// Build a plugin dir under plugins/<name>, run fn, then remove the dir.
// `files` maps plugin-relative paths → contents; a manifest is added unless one
// is supplied.
function withPlugin(name, files, fn, manifestOverride) {
  const dir = join(ROOT, "plugins", name);
  try {
    if (!files["/manifest"] && !manifestOverride) {
      writeFile(join(dir, ".claude-plugin", "plugin.json"),
        JSON.stringify({ name, version: "1.0.0", description: `The ${name} plugin` }, null, 2));
    }
    if (manifestOverride) {
      writeFile(join(dir, ".claude-plugin", "plugin.json"), manifestOverride);
    }
    for (const [rel, content] of Object.entries(files)) {
      writeFile(join(dir, rel), content);
    }
    fn();
  } finally {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

describe("validate — 2026 plugin conventions", () => {
  it("accepts yes/no/on/off boolean spellings on skill fields", () => {
    withPlugin("v2026-bool-ok", {
      "skills/bool-ok-skill/SKILL.md":
        "---\ndescription: test\nbackground: yes\ndisable-model-invocation: On\n---\n# Test\n",
    }, () => {
      const out = runValidate();
      assert.ok(!out.includes("bool-ok-skill"), `unexpected validate errors: ${out}`);
    });
  });

  it("accepts numeric 0/1 and plain true/false booleans", () => {
    withPlugin("v2026-bool-num", {
      "skills/bool-num-skill/SKILL.md":
        "---\ndescription: test\nbackground: 1\ndisable-model-invocation: false\n---\n# Test\n",
    }, () => {
      const out = runValidate();
      assert.ok(!out.includes("bool-num-skill"), `unexpected validate errors: ${out}`);
    });
  });

  it("flags a non-boolean value in a skill boolean field", () => {
    withPlugin("v2026-bool-bad", {
      "skills/bool-bad-skill/SKILL.md":
        "---\ndescription: test\nbackground: maybe\n---\n# Test\n",
    }, () => {
      const err = runValidate();
      assert.ok(err.includes('INVALID background "maybe"'));
      assert.ok(err.includes("bool-bad-skill"));
    });
  });

  it("rejects a plugin name containing a colon (plugin namespacing)", () => {
    withPlugin("v2026-colon", {}, () => {
      const err = runValidate();
      assert.ok(err.includes('INVALID name "my-plugin:oops"'));
      assert.ok(err.includes('no ":"'));
    }, JSON.stringify({ name: "my-plugin:oops", version: "1.0.0", description: "x" }));
  });

  it("still accepts a plain kebab-case plugin name", () => {
    withPlugin("v2026-name-ok", {}, () => {
      const out = runValidate();
      assert.ok(!out.includes("v2026-name-ok"), `unexpected validate errors: ${out}`);
    });
  });

  it("accepts a valid mcp protocolVersion spec date", () => {
    withPlugin("v2026-pv-ok", {
      ".mcp.json": JSON.stringify({ srv: { command: "npx", protocolVersion: "2026-07-28" } }, null, 2),
    }, () => {
      const out = runValidate();
      assert.ok(!out.includes("protocolVersion"), `unexpected validate errors: ${out}`);
    });
  });

  it("rejects a malformed mcp protocolVersion", () => {
    withPlugin("v2026-pv-bad", {
      ".mcp.json": JSON.stringify({ srv: { command: "npx", protocolVersion: "v1" } }, null, 2),
    }, () => {
      const err = runValidate();
      assert.ok(err.includes('INVALID protocolVersion "v1"'));
    });
  });

  it("rejects an out-of-range mcp protocolVersion date", () => {
    withPlugin("v2026-pv-range", {
      ".mcp.json": JSON.stringify({ srv: { command: "npx", protocolVersion: "2026-13-40" } }, null, 2),
    }, () => {
      const err = runValidate();
      assert.ok(err.includes('INVALID protocolVersion "2026-13-40"'));
    });
  });

  it("flags an mcp server missing both command and url", () => {
    withPlugin("v2026-mcp-bad", {
      ".mcp.json": JSON.stringify({ srv: { args: ["x"] } }, null, 2),
    }, () => {
      const err = runValidate();
      assert.ok(err.includes('INVALID mcp server "srv"'));
    });
  });

  it("flags an unknown hook event", () => {
    withPlugin("v2026-hook-bad", {
      "hooks/hooks.json": JSON.stringify({ hooks: { OnBananas: [{ hooks: [{ command: "x" }] }] } }, null, 2),
    }, () => {
      const err = runValidate();
      assert.ok(err.includes('INVALID hook event "OnBananas"'));
    });
  });
});
