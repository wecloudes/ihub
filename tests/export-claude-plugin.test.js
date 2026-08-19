// Tests for `ihub export --format claude-plugin --out <dir>` — the Claude Code
// plugin-marketplace export. Source is now plugin entries, 1:1: each plugin
// becomes one marketplace listing + a plugins/<name>/ directory rebuilt from
// its attachments. Also covers the marketplace helpers in publish.js and the
// export CLI flag validation.
import { describe, it, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync, cpSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import { marketplacePluginEntry, writeMarketplaceJson } from "../cli/publish.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "cli", "index.js");
const EXAMPLES = join(ROOT, "examples", "plugins");
const PLUGINS = join(ROOT, "plugins");

const tmpDir = mkdtempSync(join(tmpdir(), "ihub-export-test-"));
const fakeHome = join(tmpDir, "home");
mkdirSync(fakeHome, { recursive: true });
const DB_PATH = join(tmpDir, "test.db");
const PORT = 9987 + Math.floor(Math.random() * 500);
const REGISTRY = `http://localhost:${PORT}`;
const EXAMPLE_NAMES = ["code-quality", "dev-mcps", "docs-tools"];

let serverProc;
let userToken;

function ihub(args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    input: "",
    env: { PATH: process.env.PATH, HOME: fakeHome, IHUB_REGISTRY: REGISTRY, IHUB_TOKEN: userToken || "", ...env },
    encoding: "utf-8",
    timeout: 15000,
  });
}

function ihubFail(args) {
  try {
    ihub(args);
    assert.fail("Expected command to fail");
  } catch (err) {
    return err.stderr || err.stdout || err.message;
  }
}

function readJson(p) { return JSON.parse(readFileSync(p, "utf-8")); }

describe("marketplace helpers (publish.js)", () => {
  it("marketplacePluginEntry builds a listing with a relative source path", () => {
    const e = marketplacePluginEntry("my-plugin", { description: "d", version: "2.0.0", author: { name: "alice" } });
    assert.equal(e.name, "my-plugin");
    assert.equal(e.source, "./plugins/my-plugin");
    assert.equal(e.description, "d");
    assert.equal(e.version, "2.0.0");
    assert.deepEqual(e.author, { name: "alice" });
  });

  it("marketplacePluginEntry coerces a string author and omits an empty one", () => {
    assert.deepEqual(marketplacePluginEntry("p", { author: "bob" }).author, { name: "bob" });
    assert.equal(marketplacePluginEntry("p", {}).author, undefined);
  });

  it("writeMarketplaceJson upserts entries and preserves the rest", () => {
    const dest = join(tmpDir, "mkt-helper");
    writeMarketplaceJson(dest, { name: "m", ownerName: "me" }, [marketplacePluginEntry("a", { version: "1.0.0" })]);
    writeMarketplaceJson(dest, { name: "m", ownerName: "me" }, [
      marketplacePluginEntry("a", { version: "2.0.0" }),
      marketplacePluginEntry("b", { version: "1.0.0" }),
    ]);
    const mp = readJson(join(dest, ".claude-plugin", "marketplace.json"));
    assert.equal(mp.name, "m");
    assert.equal(mp.owner.name, "me");
    assert.equal(mp.plugins.length, 2);
    assert.equal(mp.plugins.find((p) => p.name === "a").version, "2.0.0");
  });
});

describe("export --format claude-plugin (flag validation)", () => {
  it("errors when --out is missing", () => {
    const err = ihubFail(["export", "--format", "claude-plugin"]);
    assert.ok(err.includes("--out"));
    assert.ok(err.includes("Usage: ihub export --format claude-plugin"));
  });

  it("errors on an unknown --format", () => {
    const err = ihubFail(["export", "--format", "tarball", "--out", join(tmpDir, "x")]);
    assert.ok(err.includes("Unknown format: tarball"));
  });
});

describe("export --format claude-plugin (marketplace build)", () => {
  beforeAll(async () => {
    serverProc = spawn(process.execPath, [join(ROOT, "server", "index.js")], {
      env: { PATH: process.env.PATH, IHUB_DB_PATH: DB_PATH, IHUB_CONFIG: join(tmpDir, "none.json"), IHUB_PORT: String(PORT) },
      stdio: "pipe",
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Server start timeout")), 8000);
      serverProc.stdout.on("data", (d) => { if (d.toString().includes("ihub registry running")) { clearTimeout(t); resolve(); } });
      serverProc.on("error", reject);
    });
    const reg = await fetch(`${REGISTRY}/api/register`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "exporter" }),
    }).then((r) => r.json());
    userToken = reg.api_key;

    mkdirSync(PLUGINS, { recursive: true });
    for (const name of EXAMPLE_NAMES) {
      rmSync(join(PLUGINS, name), { recursive: true, force: true });
      cpSync(join(EXAMPLES, name), join(PLUGINS, name), { recursive: true });
      ihub(["push", name, "--force"]);
    }
  });

  afterAll(() => {
    if (serverProc) serverProc.kill();
    for (const name of EXAMPLE_NAMES) rmSync(join(PLUGINS, name), { recursive: true, force: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes marketplace.json with one listing per plugin (1:1)", () => {
    const dest = join(tmpDir, "mkt1");
    const out = ihub(["export", "--format", "claude-plugin", "--out", dest]);
    assert.ok(out.includes("Exported 3 plugin(s)"));

    const mp = readJson(join(dest, ".claude-plugin", "marketplace.json"));
    assert.equal(mp.name, "ihub-export");
    assert.equal(typeof mp.owner.name, "string");
    assert.deepEqual(mp.plugins.map((p) => p.name).sort(), EXAMPLE_NAMES.slice().sort());
    for (const p of mp.plugins) {
      assert.equal(p.source, `./plugins/${p.name}`);
      assert.ok(p.version);
    }
  });

  it("rebuilds each plugin's manifest and component files 1:1", () => {
    const dest = join(tmpDir, "mkt2");
    ihub(["export", "--format", "claude-plugin", "--out", dest]);

    // per-plugin plugin.json
    const cq = readJson(join(dest, "plugins", "code-quality", ".claude-plugin", "plugin.json"));
    assert.equal(cq.name, "code-quality");
    assert.ok(cq.version);
    assert.ok(cq.description);

    // skills / commands / agents
    assert.ok(existsSync(join(dest, "plugins", "code-quality", "skills", "lint-check", "SKILL.md")));
    assert.ok(existsSync(join(dest, "plugins", "code-quality", "commands", "commit.md")));
    assert.ok(existsSync(join(dest, "plugins", "code-quality", "agents", "code-reviewer.md")));

    // .mcp.json rebuilt verbatim (Claude-native shape)
    const mcp = readJson(join(dest, "plugins", "dev-mcps", ".mcp.json"));
    assert.deepEqual(mcp.azure, { command: "npx", args: ["-y", "@azure/mcp@latest", "server", "start"] });
    assert.ok(mcp.github && mcp.context7);

    // hooks/hooks.json rebuilt
    const hooks = readJson(join(dest, "plugins", "dev-mcps", "hooks", "hooks.json"));
    assert.equal(hooks.hooks.PostToolUse[0].matcher, "Write|Edit");
  });

  it("uses the project filter in the marketplace name", () => {
    const dest = join(tmpDir, "mkt3");
    ihub(["export", "--project", "developer-tools", "--format", "claude-plugin", "--out", dest]);
    const mp = readJson(join(dest, ".claude-plugin", "marketplace.json"));
    assert.equal(mp.name, "developer-tools-plugins");
    assert.equal(mp.plugins.length, 3);
  });

  it("the marketplace format alias behaves identically", () => {
    const dest = join(tmpDir, "mkt4");
    const out = ihub(["export", "--format", "marketplace", "--out", dest]);
    assert.ok(out.includes("Exported"));
    assert.ok(existsSync(join(dest, ".claude-plugin", "marketplace.json")));
  });
});
