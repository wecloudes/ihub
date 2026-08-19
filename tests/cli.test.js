import { describe, it, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "cli", "index.js");
const EXAMPLES = join(ROOT, "examples", "plugins");
const PLUGINS = join(ROOT, "plugins");

const tmpDir = mkdtempSync(join(tmpdir(), "ihub-cli-test-"));
const fakeHome = join(tmpDir, "home");
mkdirSync(fakeHome, { recursive: true });
const DB_PATH = join(tmpDir, "test.db");
const PORT = 9876 + Math.floor(Math.random() * 1000);
const REGISTRY = `http://localhost:${PORT}`;

// Plugin dirs this suite creates under plugins/ — removed in afterAll.
const createdPlugins = new Set(["code-quality", "dev-mcps", "docs-tools"]);

let serverProc;
let userToken;

function ihub(args, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    input: "",
    env: {
      PATH: process.env.PATH,
      HOME: fakeHome,
      IHUB_REGISTRY: REGISTRY,
      IHUB_TOKEN: userToken || "",
      ...env,
    },
    encoding: "utf-8",
    timeout: 15000,
  });
}

function ihubInput(args, input, env = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    input,
    env: {
      PATH: process.env.PATH,
      HOME: fakeHome,
      IHUB_REGISTRY: REGISTRY,
      IHUB_TOKEN: userToken || "",
      ...env,
    },
    encoding: "utf-8",
    timeout: 15000,
  });
}

function ihubFail(args, env = {}) {
  try {
    ihub(args, env);
    assert.fail("Expected command to fail");
  } catch (err) {
    return err.stderr || err.stdout || err.message;
  }
}

async function apiPost(path, body) {
  const res = await fetch(`${REGISTRY}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function copyExample(name) {
  const dest = join(PLUGINS, name);
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(EXAMPLES, name), dest, { recursive: true });
  createdPlugins.add(name);
}

describe("CLI plugin lifecycle (end-to-end)", () => {
  beforeAll(async () => {
    serverProc = spawn(process.execPath, [join(ROOT, "server", "index.js")], {
      env: {
        PATH: process.env.PATH,
        IHUB_DB_PATH: DB_PATH,
        IHUB_CONFIG: join(tmpDir, "nonexistent-config.json"),
        IHUB_PORT: String(PORT),
      },
      stdio: "pipe",
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server start timeout")), 8000);
      serverProc.stdout.on("data", (data) => {
        if (data.toString().includes("ihub registry running")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProc.stderr.on("data", (d) => { if (/error/i.test(d.toString())) console.error(d.toString()); });
      serverProc.on("error", reject);
    });

    const data = await apiPost("/api/register", { username: "testuser" });
    userToken = data.api_key;

    // Populate the working dir with the example plugins.
    mkdirSync(PLUGINS, { recursive: true });
    for (const name of ["code-quality", "dev-mcps", "docs-tools"]) copyExample(name);
  });

  afterAll(() => {
    if (serverProc) serverProc.kill();
    rmSync(tmpDir, { recursive: true, force: true });
    for (const name of createdPlugins) rmSync(join(PLUGINS, name), { recursive: true, force: true });
  });

  // --- Help / local read ---

  it("help describes the plugin model", () => {
    const out = ihub(["help"]);
    assert.ok(out.includes("registry for Claude Code plugins"));
    assert.ok(out.includes("Commands:"));
    assert.ok(out.includes("push <name>"));
    assert.ok(out.includes("pull <name"));
    assert.ok(out.includes('"plugin" noun'));
  });

  it("list shows local plugins with component summaries", () => {
    const out = ihub(["list"]);
    assert.ok(out.includes("PLUGINS"));
    assert.ok(out.includes("code-quality"));
    assert.ok(out.includes("dev-mcps"));
    assert.ok(/skills/.test(out));
    assert.ok(/mcpServers/.test(out));
  });

  it("validate passes on the example plugins", () => {
    const out = ihub(["validate"]);
    assert.ok(out.includes("Registry is valid"));
  });

  it("show prints the manifest and component tree", () => {
    const out = ihub(["show", "code-quality"]);
    assert.ok(out.includes("code-quality"));
    assert.ok(out.includes("Components:"));
    assert.ok(out.includes("skills"));
    assert.ok(out.includes("lint-check"));
    assert.ok(out.includes("agents"));
  });

  it("show --json emits a structured entry", () => {
    const out = ihub(["show", "code-quality", "--json"]);
    const data = JSON.parse(out);
    assert.equal(data.name, "code-quality");
    assert.ok(data.components);
    assert.ok(Array.isArray(data.components.skills));
    assert.ok(data.components.skills.includes("lint-check"));
  });

  it("show nonexistent fails", () => {
    const err = ihubFail(["show", "nope-nope"]);
    assert.ok(err.includes("Not found"));
  });

  it("preview renders the README and component tree", () => {
    const out = ihub(["preview", "dev-mcps"]);
    assert.ok(out.includes("dev-mcps") || out.includes("Dev MCPs"));
    assert.ok(out.includes("Components:"));
    assert.ok(out.includes("mcpServers"));
  });

  it("search matches by component name", () => {
    const out = ihub(["search", "lint-check"]);
    assert.ok(out.includes("code-quality"));
  });

  it("the plugin noun is accepted for symmetry", () => {
    const out = ihub(["plugin", "show", "code-quality"]);
    assert.ok(out.includes("code-quality"));
    const listOut = ihub(["plugins"]);
    assert.ok(listOut.includes("PLUGINS"));
  });

  // --- create ---

  it("create scaffolds plugins/<name> from the template", () => {
    createdPlugins.add("scaffold-test");
    const dir = join(PLUGINS, "scaffold-test");
    rmSync(dir, { recursive: true, force: true });
    const out = ihub(["create", "scaffold-test"]);
    assert.ok(out.includes("Created"));
    assert.ok(existsSync(join(dir, ".claude-plugin", "plugin.json")));
    const manifest = JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf-8"));
    assert.equal(manifest.name, "scaffold-test");
    // The scaffold validates cleanly.
    const v = ihub(["validate"]);
    assert.ok(v.includes("Registry is valid"));
  });

  it("create rejects a name with a colon", () => {
    const err = ihubFail(["create", "bad:name"]);
    assert.ok(err.includes("kebab-case"));
  });

  // --- push ---

  it("push packs a plugin dir and its component files", () => {
    const out = ihub(["push", "dev-mcps", "--force"]);
    assert.ok(out.includes("Pushed plugins/dev-mcps@1.0.0"));
    assert.ok(/\+\d+ files/.test(out));
  });

  it("push code-quality and docs-tools", () => {
    assert.ok(ihub(["push", "code-quality", "--force"]).includes("Pushed plugins/code-quality"));
    assert.ok(ihub(["push", "docs-tools", "--force"]).includes("Pushed plugins/docs-tools"));
  });

  it("push fails without auth", () => {
    const err = ihubFail(["push", "dev-mcps", "--force"], { IHUB_TOKEN: "" });
    assert.ok(err.includes("Not logged in") || err.includes("Invalid"));
  });

  it("push nonexistent fails", () => {
    const err = ihubFail(["push", "no-such-plugin", "--force"]);
    assert.ok(err.includes("Not found locally"));
  });

  // --- remote read after push ---

  it("search --remote finds a pushed plugin", () => {
    const out = ihub(["search", "--remote", "dev-mcps"]);
    assert.ok(out.includes("dev-mcps"));
  });

  it("list merges the remote registry", () => {
    const out = ihub(["list", "--json"]);
    const data = JSON.parse(out);
    assert.ok(Array.isArray(data));
    assert.ok(data.some((p) => p.name === "dev-mcps"));
  });

  // --- pull recreates the plugin dir ---

  it("pull recreates plugins/<name>/ with every component file", () => {
    rmSync(join(PLUGINS, "dev-mcps"), { recursive: true, force: true });
    const out = ihub(["pull", "dev-mcps", "--yes"]);
    assert.ok(out.includes("Pulled plugins/dev-mcps@1.0.0"));
    const dir = join(PLUGINS, "dev-mcps");
    assert.ok(existsSync(join(dir, ".claude-plugin", "plugin.json")));
    assert.ok(existsSync(join(dir, ".mcp.json")));
    assert.ok(existsSync(join(dir, "hooks", "hooks.json")));
    assert.ok(existsSync(join(dir, "README.md")));
    // .mcp.json survives the round-trip intact.
    const mcp = JSON.parse(readFileSync(join(dir, ".mcp.json"), "utf-8"));
    assert.ok(mcp.azure && mcp.github && mcp.context7);
  });

  it("pull displays hook commands and gates on confirmation", () => {
    rmSync(join(PLUGINS, "dev-mcps"), { recursive: true, force: true });
    // Empty stdin → hook prompt resolves to the default "n" → hooks omitted.
    const out = ihub(["pull", "dev-mcps"]);
    assert.ok(out.includes("run shell command"));
    assert.ok(out.includes("prettier"));
    assert.ok(out.includes("hooks omitted"));
    assert.ok(!existsSync(join(PLUGINS, "dev-mcps", "hooks", "hooks.json")));
  });

  it("pull --install drops the plugin into the Claude plugin dir", () => {
    const out = ihub(["pull", "code-quality", "--install", "--global", "--yes"]);
    assert.ok(out.includes("Installed plugins/code-quality"));
    const installed = join(fakeHome, ".claude", "plugins", "code-quality", ".claude-plugin", "plugin.json");
    assert.ok(existsSync(installed));
  });

  it("pull --marketplace assembles a marketplace directory", () => {
    const mkt = join(tmpDir, "mkt");
    const out = ihub(["pull", "code-quality", "--marketplace", mkt, "--yes"]);
    assert.ok(out.includes("marketplace"));
    const mp = JSON.parse(readFileSync(join(mkt, ".claude-plugin", "marketplace.json"), "utf-8"));
    assert.ok(mp.plugins.some((p) => p.name === "code-quality" && p.source === "./plugins/code-quality"));
    assert.ok(existsSync(join(mkt, "plugins", "code-quality", ".claude-plugin", "plugin.json")));
  });

  it("pull with a :version tag works", () => {
    const out = ihub(["pull", "dev-mcps:1.0.0", "--yes"]);
    assert.ok(out.includes("1.0.0"));
  });

  // --- import a plugin directory ---

  it("import ingests an existing Claude plugin directory", () => {
    // Build a standalone plugin dir outside the repo.
    const src = join(tmpDir, "external-plugin");
    mkdirSync(join(src, ".claude-plugin"), { recursive: true });
    mkdirSync(join(src, "skills", "hello"), { recursive: true });
    writeFileSync(join(src, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "imported-thing", version: "0.2.0", description: "Imported" }, null, 2));
    writeFileSync(join(src, "skills", "hello", "SKILL.md"), "---\ndescription: hi\n---\n# hello");
    writeFileSync(join(src, "README.md"), "# imported-thing\n\nDocs.");

    createdPlugins.add("imported-thing");
    rmSync(join(PLUGINS, "imported-thing"), { recursive: true, force: true });
    const out = ihub(["import", src, "--no-push"]);
    assert.ok(out.includes("Imported plugin imported-thing"));
    const dir = join(PLUGINS, "imported-thing");
    assert.ok(existsSync(join(dir, ".claude-plugin", "plugin.json")));
    assert.ok(existsSync(join(dir, "skills", "hello", "SKILL.md")));
    // Newly imported plugin validates.
    assert.ok(ihub(["validate"]).includes("Registry is valid"));
  });

  it("import wraps a lone SKILL.md directory into a plugin", () => {
    const src = join(tmpDir, "lone-skill");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "SKILL.md"), "---\ndescription: a lone skill\n---\n# lone");

    createdPlugins.add("lone-skill");
    rmSync(join(PLUGINS, "lone-skill"), { recursive: true, force: true });
    const out = ihub(["import", src, "--no-push"]);
    assert.ok(out.includes("Wrapped component into plugin lone-skill"));
    assert.ok(existsSync(join(PLUGINS, "lone-skill", "skills", "lone-skill", "SKILL.md")));
  });

  // --- projects ---

  it("projects groups plugins by their project field (local)", () => {
    const out = ihub(["projects", "--local"]);
    assert.ok(out.includes("developer-tools"));
    assert.ok(out.includes("dev-mcps"));
  });

  it("projects filters by name (local)", () => {
    const out = ihub(["projects", "developer-tools", "--local"]);
    assert.ok(out.includes("developer-tools"));
    assert.ok(out.includes("code-quality"));
  });

  it("projects fails for an unknown project (local)", () => {
    const err = ihubFail(["projects", "no-such-project", "--local"]);
    assert.ok(err.includes("Project not found"));
  });

  // --- comments ---

  it("comments starts empty", () => {
    const out = ihub(["comments", "dev-mcps"]);
    assert.ok(out.includes("No comments"));
  });

  it("comment adds a rating and body", () => {
    const out = ihubInput(["comment", "dev-mcps"], "5\nGreat bundle\n");
    assert.ok(out.includes("Comment added"));
    assert.ok(out.includes("5/5"));
  });

  it("comments shows the review", () => {
    const out = ihub(["comments", "dev-mcps"]);
    assert.ok(out.includes("Great bundle"));
    assert.ok(out.includes("@testuser"));
  });

  // --- export / import bundle ---

  it("export outputs a JSON bundle of plugins", () => {
    const out = ihub(["export"]);
    const bundle = JSON.parse(out);
    assert.ok(bundle.ihub_version);
    assert.ok(Array.isArray(bundle.artifacts));
    assert.ok(bundle.artifacts.length > 0);
    assert.ok(bundle.artifacts.every((a) => a.type === "plugin"));
    const dm = bundle.artifacts.find((a) => a.name === "dev-mcps");
    assert.ok(dm && Array.isArray(dm.attachments) && dm.attachments.length > 0);
  });

  it("export --out writes the bundle to a file", () => {
    const p = join(tmpDir, "bundle.json");
    const out = ihub(["export", "-o", p]);
    assert.ok(out.includes("Exported"));
    assert.ok(existsSync(p));
  });

  it("export --format claude-plugin builds a marketplace", () => {
    const dest = join(tmpDir, "mkt-export");
    const out = ihub(["export", "--format", "claude-plugin", "--out", dest]);
    assert.ok(out.includes("marketplace"));
    const mp = JSON.parse(readFileSync(join(dest, ".claude-plugin", "marketplace.json"), "utf-8"));
    assert.ok(mp.plugins.some((p) => p.name === "dev-mcps"));
    assert.ok(existsSync(join(dest, "plugins", "dev-mcps", ".mcp.json")));
  });

  it("import restores a bundle and pushes it", () => {
    const p = join(tmpDir, "bundle.json");
    assert.ok(existsSync(p));
    const out = ihub(["import", p]);
    assert.ok(out.includes("Import complete"));
  });

  // --- pinning ---

  it("pins starts empty", () => {
    assert.ok(ihub(["pins"]).includes("No pinned"));
  });

  it("pin locks a plugin to a version", () => {
    const out = ihub(["pin", "dev-mcps", "1.0.0"]);
    assert.ok(out.includes("Pinned"));
    assert.ok(out.includes("plugins/dev-mcps"));
  });

  it("pins lists the pinned plugin", () => {
    const out = ihub(["pins"]);
    assert.ok(out.includes("plugins/dev-mcps"));
    assert.ok(out.includes("1.0.0"));
  });

  it("unpin removes the pin", () => {
    assert.ok(ihub(["unpin", "dev-mcps"]).includes("Unpinned"));
    assert.ok(ihub(["pins"]).includes("No pinned"));
  });

  // --- diagnostics ---

  it("doctor runs all checks", () => {
    const out = ihub(["doctor"]);
    assert.ok(out.includes("ihub doctor"));
    assert.ok(out.includes("Server reachable"));
    assert.ok(out.includes("Auth valid"));
    assert.ok(out.includes("Local plugins valid"));
    assert.ok(out.includes("Storage writable"));
  });

  it("outdated compares local vs registry", () => {
    const out = ihub(["outdated"]);
    assert.ok(out.includes("up to date") || out.includes("update available"));
  });

  it("verify checks a plugin signature", () => {
    const out = ihub(["verify", "dev-mcps"]);
    assert.ok(out.includes("no signature") || out.includes("verified"));
  });

  it("verify nonexistent fails", () => {
    const err = ihubFail(["verify", "nope-nope"]);
    assert.ok(err.includes("Not found") || err.includes("404") || err.includes("error"));
  });

  it("diff requires all arguments", () => {
    const err = ihubFail(["diff", "dev-mcps"]);
    assert.ok(err.includes("Usage"));
  });

  it("diff compares two versions", async () => {
    // Push a second version via the API.
    await fetch(`${REGISTRY}/api/plugins/dev-mcps`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ version: "1.1.0", description: "v2", tags: [], meta: { name: "dev-mcps", version: "1.1.0" }, body: "# v2\nchanged" }),
    });
    const out = ihub(["diff", "dev-mcps", "1.0.0", "1.1.0"]);
    assert.ok(out.includes("dev-mcps"));
    assert.ok(out.includes("lines changed"));
  });

  // --- admin ---

  it("metrics shows the dashboard", () => {
    const out = ihub(["metrics"]);
    assert.ok(out.includes("ihub Registry Dashboard"));
    assert.ok(out.includes("Pushes"));
  });

  it("audit shows the trail", () => {
    const out = ihub(["audit"]);
    assert.ok(out.includes("Audit Trail"));
    assert.ok(out.includes("PUSH") || out.includes("push"));
  });

  it("audit --json is valid JSON", () => {
    const data = JSON.parse(ihub(["audit", "--json"]));
    assert.ok(data.entries || data.total !== undefined);
  });

  it("backup downloads a SQLite file", () => {
    const p = join(tmpDir, "backup.db");
    const out = ihub(["backup", p]);
    assert.ok(out.includes("Backup saved"));
    assert.ok(readFileSync(p, "utf-8").slice(0, 15).startsWith("SQLite format 3"));
  });

  it("backup --full downloads a JSON backup, restore reloads it", () => {
    const p = join(tmpDir, "full-backup.json");
    assert.ok(ihub(["backup", "--full", p]).includes("Full backup saved"));
    const bundle = JSON.parse(readFileSync(p, "utf-8"));
    assert.ok(bundle.artifacts && bundle.users);
    assert.ok(ihub(["restore", p]).match(/Restored|artifacts/));
  });

  // --- webhooks / federation ---

  it("webhook add / list / remove", () => {
    assert.ok(ihub(["webhook", "add", "https://example.com/hook", "--events", "push,pull"]).includes("Webhook added"));
    const listOut = ihub(["webhook", "list"]);
    assert.ok(listOut.includes("example.com/hook"));
    const id = listOut.match(/\[(\d+)\]/)[1];
    assert.ok(ihub(["webhook", "remove", id]).includes("removed"));
  });

  it("federation status shows config", () => {
    const out = ihub(["federation", "status"]);
    assert.ok(out.includes("Federation") || out.includes("disabled") || out.includes("enabled"));
  });

  // --- whoami / remove (last, deletes) ---

  it("whoami --json reports the current user", () => {
    writeFileSync(join(fakeHome, ".ihubrc"), JSON.stringify({ registry: REGISTRY, token: userToken, username: "testuser" }));
    const data = JSON.parse(ihub(["whoami", "--json"]));
    assert.equal(data.username, "testuser");
    assert.ok(data.role);
  });

  it("remove deletes a plugin from the registry", () => {
    const out = ihub(["remove", "docs-tools"]);
    assert.ok(out.includes("Removed"));
    assert.ok(ihub(["search", "--remote", "docs-tools"]).includes("No remote results"));
  });
});
