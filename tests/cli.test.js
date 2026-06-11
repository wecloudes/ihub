import { describe, it, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync, spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "cli", "index.js");
const tmpDir = mkdtempSync(join(tmpdir(), "ihub-cli-test-"));
const fakeHome = join(tmpDir, "home");
mkdirSync(fakeHome, { recursive: true });
const DB_PATH = join(tmpDir, "test.db");
const PORT = 9876 + Math.floor(Math.random() * 1000);
const REGISTRY = `http://localhost:${PORT}`;

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
      IHUB_AGENT: "ihub",
      ...env,
    },
    encoding: "utf-8",
    timeout: 10000,
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

describe("CLI end-to-end", () => {
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
      const timeout = setTimeout(() => reject(new Error("Server start timeout")), 5000);
      serverProc.stdout.on("data", (data) => {
        if (data.toString().includes("ihub registry running")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProc.on("error", reject);
    });

    // Register a test user
    const data = await apiPost("/api/register", { username: "testuser" });
    userToken = data.api_key;

    // Copy example entries into working directories
    const TYPES = ["agents", "commands", "designs", "memories", "prompts", "rules", "skills"];
    for (const type of TYPES) {
      const exDir = join(ROOT, "examples", type);
      const workDir = join(ROOT, type);
      mkdirSync(workDir, { recursive: true });
      if (existsSync(exDir)) {
        for (const f of readdirSync(exDir)) {
          if (f.endsWith(".md")) copyFileSync(join(exDir, f), join(workDir, f));
        }
      }
    }
  });

  afterAll(() => {
    if (serverProc) serverProc.kill();
    rmSync(tmpDir, { recursive: true, force: true });
    // Clean up copied example entries
    const TYPES = ["agents", "commands", "designs", "memories", "prompts", "rules", "skills"];
    for (const type of TYPES) {
      const exDir = join(ROOT, "examples", type);
      const workDir = join(ROOT, type);
      if (existsSync(exDir)) {
        for (const f of readdirSync(exDir)) {
          const target = join(workDir, f);
          if (existsSync(target)) rmSync(target);
        }
      }
    }
  });

  // --- Local ---

  it("help shows all sections", () => {
    const out = ihub(["help"]);
    assert.ok(out.includes("Commands:"));
    assert.ok(out.includes("Type-first syntax"));
    assert.ok(out.includes("remove"));
    assert.ok(out.includes("--local"));
    assert.ok(out.includes("--global"));
  });

  it("list agents", () => {
    const out = ihub(["list", "agents"]);
    assert.ok(out.includes("code-reviewer"));
  });

  it("list all types", () => {
    const out = ihub(["list"]);
    assert.ok(out.includes("AGENTS"));
    assert.ok(out.includes("SKILLS"));
    assert.ok(out.includes("RULES"));
    assert.ok(out.includes("MEMORIES"));
    assert.ok(out.includes("PROMPTS"));
  });

  it("validate passes", () => {
    const out = ihub(["validate"]);
    assert.ok(out.includes("Registry is valid"));
  });

  it("show agent", () => {
    const out = ihub(["show", "agent", "code-reviewer"]);
    assert.ok(out.includes("code-reviewer"));
  });

  it("preview renders markdown", () => {
    const out = ihub(["preview", "agent", "code-reviewer"]);
    // Should contain the entry name and headings (rendered with ANSI)
    assert.ok(out.includes("code-reviewer"));
    assert.ok(out.includes("Purpose"));
    assert.ok(out.includes("Capabilities"));
    // Should NOT contain raw markdown markers
    assert.ok(!out.includes("## Purpose"));
    assert.ok(!out.includes("---\nname:"));
  });

  it("agent preview (type-first)", () => {
    const out = ihub(["agent", "preview", "code-reviewer"]);
    assert.ok(out.includes("code-reviewer"));
    assert.ok(out.includes("Purpose"));
  });

  it("preview nonexistent fails", () => {
    const err = ihubFail(["preview", "agent", "nonexistent"]);
    assert.ok(err.includes("Not found"));
  });

  // --- Projects ---

  it("projects shows tree view (local)", () => {
    const out = ihub(["projects", "--local"]);
    assert.ok(out.includes("ci-toolkit"));
    assert.ok(out.includes("agents"));
    assert.ok(out.includes("code-reviewer"));
    assert.ok(out.includes("skills"));
    assert.ok(out.includes("lint-check"));
    assert.ok(out.includes("rules"));
    assert.ok(out.includes("require-tests"));
  });

  it("projects filters by name (local)", () => {
    const out = ihub(["projects", "ci-toolkit", "--local"]);
    assert.ok(out.includes("ci-toolkit"));
    assert.ok(out.includes("code-reviewer"));
  });

  it("projects fails for nonexistent (local)", () => {
    const err = ihubFail(["projects", "nonexistent", "--local"]);
    assert.ok(err.includes("Project not found"));
  });

  it("projects reads from remote by default", () => {
    // Push something first so remote has data
    ihub(["push", "agent", "code-reviewer"]);
    const out = ihub(["projects"]);
    // Should show at least the pushed artifact's project
    assert.ok(out.includes("ci-toolkit") || out.includes("code-reviewer") || out.includes("(unassigned)"));
  });

  it("search local", () => {
    const out = ihub(["search", "lint"]);
    assert.ok(out.includes("lint-check"));
  });

  it("show nonexistent fails", () => {
    const err = ihubFail(["show", "agent", "nonexistent"]);
    assert.ok(err.includes("Not found"));
  });

  // --- Type-first syntax ---

  it("agents list (type-first)", () => {
    const out = ihub(["agents", "list"]);
    assert.ok(out.includes("code-reviewer"));
  });

  it("agent show (type-first)", () => {
    const out = ihub(["agent", "show", "code-reviewer"]);
    assert.ok(out.includes("code-reviewer"));
    assert.ok(out.includes("Reviews code changes"));
  });

  it("skills list (type-first)", () => {
    const out = ihub(["skills", "list"]);
    assert.ok(out.includes("lint-check"));
  });

  it("skill show (type-first)", () => {
    const out = ihub(["skill", "show", "lint-check"]);
    assert.ok(out.includes("lint-check"));
  });

  it("rules (type-first, defaults to list)", () => {
    const out = ihub(["rules"]);
    assert.ok(out.includes("require-tests"));
  });

  it("memories list (type-first)", () => {
    const out = ihub(["memories", "list"]);
    assert.ok(out.includes("MEMORIES"));
    assert.ok(out.includes("api-versioning-strategy"));
  });

  // --- Interactive create ---

  it("new -i creates entry with all fields", () => {
    const input = [
      "My test agent",   // description
      "1.0.0",           // version
      "tester",          // author
      "test-project",    // project
      "test, interactive", // tags
      "code",            // inputs
      "report",          // outputs
      "",                // skills (empty)
      "",                // rules (empty)
    ].join("\n") + "\n";

    const agentPath = join(ROOT, "agents", "interactive-test.md");
    try {
      const out = execFileSync(process.execPath, [CLI, "create", "agent", "interactive-test", "-i"], {
        cwd: ROOT,
        input,
        env: { PATH: process.env.PATH, HOME: fakeHome },
        encoding: "utf-8",
        timeout: 10000,
      });
      assert.ok(out.includes("Created"));
      assert.ok(existsSync(agentPath));

      const content = readFileSync(agentPath, "utf-8");
      assert.ok(content.includes("name: interactive-test"));
      assert.ok(content.includes("description: My test agent"));
      assert.ok(content.includes("version: 1.0.0"));
      assert.ok(content.includes("author: tester"));
      assert.ok(content.includes("tags: [test, interactive]"));
      assert.ok(content.includes("inputs: [code]"));
      assert.ok(content.includes("outputs: [report]"));
    } finally {
      if (existsSync(agentPath)) rmSync(agentPath);
    }
  });

  it("new -i prompts for type and name when omitted", () => {
    const input = [
      "memory",          // type
      "my-memory",       // name
      "A test memory",   // description
      "",                // version (default)
      "",                // author
      "",                // project
      "test",            // tags
      "",                // scope (default)
      "",                // context_type (default)
      "",                // related
    ].join("\n") + "\n";

    const memPath = join(ROOT, "memories", "my-memory.md");
    try {
      const out = execFileSync(process.execPath, [CLI, "create", "-i"], {
        cwd: ROOT,
        input,
        env: { PATH: process.env.PATH, HOME: fakeHome },
        encoding: "utf-8",
        timeout: 10000,
      });
      assert.ok(out.includes("Created"));
      assert.ok(existsSync(memPath));

      const content = readFileSync(memPath, "utf-8");
      assert.ok(content.includes("name: my-memory"));
      assert.ok(content.includes("description: A test memory"));
      assert.ok(content.includes("context_type: memory"));
    } finally {
      if (existsSync(memPath)) rmSync(memPath);
    }
  });

  it("new without -i still works (template mode)", () => {
    const agentPath = join(ROOT, "agents", "plain-test.md");
    try {
      const out = ihub(["create", "agent", "plain-test"]);
      assert.ok(out.includes("Created"));
      assert.ok(existsSync(agentPath));
      const content = readFileSync(agentPath, "utf-8");
      assert.ok(content.includes("name: plain-test"));
      // Template mode leaves description empty
      assert.ok(content.includes("description:"));
    } finally {
      if (existsSync(agentPath)) rmSync(agentPath);
    }
  });

  // --- Remote: push ---

  it("push agent", () => {
    const out = ihub(["push", "agent", "code-reviewer"]);
    assert.ok(out.includes("Pushed agents/code-reviewer"));
  });

  it("push skill and rule", () => {
    ihub(["push", "skill", "lint-check"]);
    ihub(["push", "rule", "require-tests"]);
  });

  it("push fails without auth", () => {
    const err = ihubFail(["push", "agent", "code-reviewer"], { IHUB_TOKEN: "" });
    assert.ok(err.includes("Not logged in") || err.includes("Invalid"));
  });

  it("push nonexistent fails", () => {
    const err = ihubFail(["push", "agent", "nonexistent"]);
    assert.ok(err.includes("Not found locally"));
  });

  // --- Remote: search ---

  it("search remote", () => {
    const out = ihub(["search", "--remote", "code"]);
    assert.ok(out.includes("code-reviewer"));
  });

  // --- Remote: pull with flags ---

  it("pull --local overwrites local file", () => {
    const filePath = join(ROOT, "agents", "code-reviewer.md");
    const backup = readFileSync(filePath, "utf-8");

    try {
      rmSync(filePath);
      const out = ihub(["pull", "agent", "code-reviewer", "--local"]);
      assert.ok(out.includes("(project)") || out.includes("(local)"));
      assert.ok(existsSync(filePath));
      assert.ok(readFileSync(filePath, "utf-8").includes("name: code-reviewer"));
    } finally {
      // Restore original file content
      writeFileSync(filePath, backup);
    }
  });

  it("pull -l shorthand", () => {
    const out = ihub(["pull", "skill", "lint-check", "-l"]);
    assert.ok(out.includes("(project)") || out.includes("(local)"));
  });

  it("pull --global installs to ~/.claude", () => {
    const fakeHome = join(tmpDir, "fakehome");
    mkdirSync(fakeHome, { recursive: true });

    const out = ihub(["pull", "agent", "code-reviewer", "--global"], {
      HOME: fakeHome,
    });
    assert.ok(out.includes("(personal)") || out.includes("(global)"));

    const globalFile = join(fakeHome, ".claude", "agents", "code-reviewer.md");
    assert.ok(existsSync(globalFile));
    assert.ok(readFileSync(globalFile, "utf-8").includes("name: code-reviewer"));
  });

  it("pull -g shorthand", () => {
    const fakeHome = join(tmpDir, "fakehome2");
    const out = ihub(["pull", "rule", "require-tests", "-g"], {
      HOME: fakeHome,
    });
    assert.ok(out.includes("(personal)") || out.includes("(global)"));
  });

  it("pull defaults to local on empty stdin", () => {
    const out = ihub(["pull", "agent", "code-reviewer"]);
    assert.ok(out.includes("(project)") || out.includes("(local)"));
  });

  it("pull with :version tag", () => {
    const out = ihub(["pull", "agent", "code-reviewer:0.1.0", "-l"]);
    assert.ok(out.includes("(project)") || out.includes("(local)"));
    assert.ok(out.includes("0.1.0"));
  });

  it("pull with :latest tag", () => {
    const out = ihub(["pull", "agent", "code-reviewer:latest", "-l"]);
    assert.ok(out.includes("(project)") || out.includes("(local)"));
  });

  it("pull memory is always local (no prompt)", () => {
    // Push memory directly via API
    execFileSync(process.execPath, ["-e", `
      fetch("http://localhost:${PORT}/api/memories/test-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.TEST_TOKEN },
        body: JSON.stringify({ version: "1.0.0", description: "A memory", tags: [], meta: { name: "test-memory" }, body: "# Memory", author: "" })
      }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(console.log);
    `], { encoding: "utf-8", timeout: 5000, env: { ...process.env, TEST_TOKEN: userToken } });

    const memPath = join(ROOT, "memories", "test-memory.md");
    try {
      const out = ihub(["pull", "memory", "test-memory"]);
      assert.ok(out.includes("Pulled memories/test-memory"));
      assert.ok(existsSync(memPath));
    } finally {
      if (existsSync(memPath)) rmSync(memPath);
    }
  });

  // --- Comments ---

  it("comments shows no comments initially", () => {
    const out = ihub(["comments", "agent", "code-reviewer"]);
    assert.ok(out.includes("No comments"));
  });

  it("comment adds a review (piped input)", () => {
    const out = execFileSync(process.execPath, [CLI, "comment", "agent", "code-reviewer"], {
      cwd: ROOT,
      input: "4\nWorks well for PRs\n",
      env: { PATH: process.env.PATH, HOME: fakeHome, IHUB_REGISTRY: REGISTRY, IHUB_TOKEN: userToken },
      encoding: "utf-8",
      timeout: 10000,
    });
    assert.ok(out.includes("Comment added"));
    assert.ok(out.includes("4/5"));
  });

  it("comments shows the review", () => {
    const out = ihub(["comments", "agent", "code-reviewer"]);
    assert.ok(out.includes("Works well for PRs"));
    assert.ok(out.includes("@testuser"));
    assert.ok(out.includes("4/5"));
  });

  it("agent comments (type-first)", () => {
    const out = ihub(["agent", "comments", "code-reviewer"]);
    assert.ok(out.includes("Works well for PRs"));
  });

  // --- Admin: backup ---

  it("backup downloads DB file", () => {
    const backupPath = join(tmpDir, "cli-backup.db");
    const out = ihub(["backup", backupPath]);
    assert.ok(out.includes("Backup saved"));
    assert.ok(existsSync(backupPath));
    // Should be a valid SQLite file (starts with "SQLite format 3")
    const header = readFileSync(backupPath, "utf-8").slice(0, 15);
    assert.ok(header.startsWith("SQLite format 3"));
  });

  // --- Admin: metrics dashboard ---

  it("metrics shows terminal dashboard", () => {
    const out = ihub(["metrics"]);
    assert.ok(out.includes("ihub Registry Dashboard"));
    assert.ok(out.includes("Users"));
    assert.ok(out.includes("Entries"));
    assert.ok(out.includes("Pushes"));
  });

  // --- Admin: audit ---

  it("audit shows trail with pagination info", () => {
    const out = ihub(["audit"]);
    assert.ok(out.includes("Audit Trail"));
    assert.ok(out.includes("page"));
    // Should have logged the push actions from earlier
    assert.ok(out.includes("PUSH") || out.includes("push"));
  });

  it("audit filters by action", () => {
    const out = ihub(["audit", "--action", "push"]);
    assert.ok(out.includes("PUSH"));
  });

  it("audit filters by user", () => {
    const out = ihub(["audit", "--user", "testuser"]);
    assert.ok(out.includes("testuser"));
  });

  // --- Doctor ---

  it("doctor runs all checks", () => {
    const out = ihub(["doctor"]);
    assert.ok(out.includes("ihub doctor"));
    assert.ok(out.includes("Server reachable"));
    assert.ok(out.includes("Auth valid"));
    assert.ok(out.includes("Local artifacts valid"));
    assert.ok(out.includes("Storage writable"));
  });

  // --- Outdated ---

  it("outdated compares local vs registry", () => {
    const out = ihub(["outdated"]);
    // Either "up to date" or shows updates — both are valid
    assert.ok(out.includes("up to date") || out.includes("update available") || out.includes("artifact"));
  });

  // --- Verify ---

  it("verify checks artifact signature", () => {
    // Re-push an agent first so it exists on registry
    ihub(["push", "agent", "code-reviewer"]);
    const out = ihub(["verify", "agent", "code-reviewer"]);
    // Signing not enabled on test server, so should show "no signature"
    assert.ok(out.includes("no signature") || out.includes("verified"));
  });

  it("verify fails for nonexistent", () => {
    const err = ihubFail(["verify", "agent", "nonexistent"]);
    assert.ok(err.includes("Not found") || err.includes("404") || err.includes("error"));
  });

  // --- JSON output ---

  it("list --json outputs valid JSON", () => {
    const out = ihub(["list", "agents", "--json"]);
    const data = JSON.parse(out);
    // list outputs { agents: [...] } when filtered by type
    assert.ok(data.agents || typeof data === "object");
  });

  it("show --json outputs valid JSON", () => {
    const out = ihub(["show", "agent", "code-reviewer", "--json"]);
    const data = JSON.parse(out);
    assert.ok(data.name || data.meta);
  });

  it("comments --json outputs valid JSON", () => {
    const out = ihub(["comments", "agent", "code-reviewer", "--json"]);
    const data = JSON.parse(out);
    assert.ok(data.comments !== undefined || Array.isArray(data));
  });

  it("whoami --json outputs valid JSON", () => {
    // whoami reads ~/.ihubrc, so we need to write one in the fake home
    const rcPath = join(fakeHome, ".ihubrc");
    writeFileSync(rcPath, JSON.stringify({ registry: REGISTRY, token: userToken, username: "testuser" }));
    const out = ihub(["whoami", "--json"]);
    const data = JSON.parse(out);
    assert.equal(data.username, "testuser");
    assert.ok(data.role);
  });

  it("search --remote --json outputs valid JSON", () => {
    const out = ihub(["search", "--remote", "code", "--json"]);
    const data = JSON.parse(out);
    assert.ok(Array.isArray(data));
  });

  it("audit --json outputs valid JSON", () => {
    const out = ihub(["audit", "--json"]);
    const data = JSON.parse(out);
    assert.ok(data.entries || data.total !== undefined);
  });

  // --- Webhooks CLI ---

  it("webhook list shows empty initially", () => {
    const out = ihub(["webhook", "list"]);
    assert.ok(out.includes("No webhooks") || out.includes("webhook"));
  });

  it("webhook add creates a webhook", () => {
    const out = ihub(["webhook", "add", "https://example.com/hook", "--events", "push,pull"]);
    assert.ok(out.includes("Webhook added"));
    assert.ok(out.includes("example.com"));
  });

  it("webhook list shows created webhook", () => {
    const out = ihub(["webhook", "list"]);
    assert.ok(out.includes("example.com/hook"));
    assert.ok(out.includes("webhook"));
  });

  it("webhook remove deletes it", () => {
    // Get the webhook list to find the ID
    const listOut = ihub(["webhook", "list"]);
    const match = listOut.match(/\[(\d+)\]/);
    assert.ok(match, "Should find webhook ID in list output");
    const id = match[1];
    const out = ihub(["webhook", "remove", id]);
    assert.ok(out.includes("removed"));
  });

  it("webhook add without url fails", () => {
    const err = ihubFail(["webhook", "add"]);
    assert.ok(err.includes("Usage") || err.includes("url"));
  });

  // --- Federation CLI ---

  it("federation status shows config", () => {
    const out = ihub(["federation", "status"]);
    assert.ok(out.includes("Federation") || out.includes("disabled") || out.includes("enabled"));
  });

  it("federation without subcommand fails", () => {
    const err = ihubFail(["federation"]);
    assert.ok(err.includes("Usage") || err.includes("sync|status"));
  });

  // --- Pinning ---

  it("pins shows empty initially", () => {
    const out = ihub(["pins"]);
    assert.ok(out.includes("No pinned"));
  });

  it("pin locks artifact to version", () => {
    const out = ihub(["pin", "agent", "code-reviewer", "1.0.0"]);
    assert.ok(out.includes("Pinned"));
    assert.ok(out.includes("1.0.0"));
  });

  it("pins shows pinned artifact", () => {
    const out = ihub(["pins"]);
    assert.ok(out.includes("agents/code-reviewer"));
    assert.ok(out.includes("1.0.0"));
  });

  it("unpin removes the pin", () => {
    const out = ihub(["unpin", "agent", "code-reviewer"]);
    assert.ok(out.includes("Unpinned"));
  });

  it("pins is empty after unpin", () => {
    const out = ihub(["pins"]);
    assert.ok(out.includes("No pinned"));
  });

  it("pin without args fails", () => {
    const err = ihubFail(["pin"]);
    assert.ok(err.includes("Usage"));
  });

  it("unpin non-pinned fails", () => {
    const err = ihubFail(["unpin", "agent", "nonexistent"]);
    assert.ok(err.includes("Not pinned"));
  });

  // --- Export ---

  it("export outputs JSON to stdout", () => {
    const out = ihub(["export"]);
    const bundle = JSON.parse(out);
    assert.ok(bundle.ihub_version);
    assert.ok(bundle.exported_at);
    assert.ok(Array.isArray(bundle.artifacts));
    assert.ok(bundle.artifacts.length > 0);
  });

  it("export --output writes to file", () => {
    const exportPath = join(tmpDir, "export-test.json");
    const out = ihub(["export", "--output", exportPath]);
    assert.ok(out.includes("Exported"));
    assert.ok(existsSync(exportPath));
    const bundle = JSON.parse(readFileSync(exportPath, "utf-8"));
    assert.ok(bundle.artifacts.length > 0);
  });

  it("export -o shorthand writes to file", () => {
    const exportPath = join(tmpDir, "export-short.json");
    const out = ihub(["export", "-o", exportPath]);
    assert.ok(out.includes("Exported"));
    assert.ok(existsSync(exportPath));
  });

  it("export --type filters by type", () => {
    const out = ihub(["export", "--type", "agents"]);
    const bundle = JSON.parse(out);
    assert.ok(bundle.artifacts.every((a) => a.type === "agents"));
  });

  it("export --name filters by name", () => {
    const out = ihub(["export", "--name", "code-reviewer"]);
    const bundle = JSON.parse(out);
    assert.ok(bundle.artifacts.length > 0);
    assert.ok(bundle.artifacts.every((a) => a.name === "code-reviewer"));
  });

  it("export --from reads from another registry", () => {
    // Use the same test registry — just verifying the flag works
    const out = ihub(["export", "--from", REGISTRY, "--type", "agents"]);
    const bundle = JSON.parse(out);
    assert.ok(bundle.source === REGISTRY);
    assert.ok(Array.isArray(bundle.artifacts));
  });

  it("export includes filter metadata", () => {
    const out = ihub(["export", "--project", "ci-toolkit", "--type", "skills"]);
    const bundle = JSON.parse(out);
    assert.ok(bundle.filters);
    assert.equal(bundle.filters.project, "ci-toolkit");
    assert.equal(bundle.filters.type, "skills");
  });

  // --- Import bundle ---

  it("import JSON bundle saves locally and pushes", () => {
    const exportPath = join(tmpDir, "export-test.json");
    // File was created by the export --output test above
    assert.ok(existsSync(exportPath));
    const out = ihub(["import", exportPath]);
    assert.ok(out.includes("Import complete") || out.includes("Saved"));
  });

  it("import JSON bundle with --no-push skips push", () => {
    const exportPath = join(tmpDir, "export-test.json");
    const out = ihub(["import", exportPath, "--no-push"]);
    assert.ok(out.includes("Import complete") || out.includes("Saved"));
  });

  // --- Backup --full (JSON) ---

  it("backup --full downloads JSON", () => {
    const backupPath = join(tmpDir, "cli-full-backup.json");
    const out = ihub(["backup", "--full", backupPath]);
    assert.ok(out.includes("Full backup saved"));
    assert.ok(existsSync(backupPath));
    const bundle = JSON.parse(readFileSync(backupPath, "utf-8"));
    assert.ok(bundle.artifacts);
    assert.ok(bundle.users);
    assert.ok(bundle.ihub_version);
  });

  // --- Restore ---

  it("restore from JSON backup", () => {
    const backupPath = join(tmpDir, "cli-full-backup.json");
    // The backup was created above
    assert.ok(existsSync(backupPath));
    const out = ihub(["restore", backupPath]);
    assert.ok(out.includes("Restored") || out.includes("artifacts"));
  });

  it("restore from SQLite backup", () => {
    const backupPath = join(tmpDir, "cli-backup.db");
    // The .db backup was created in the earlier "backup downloads DB" test
    assert.ok(existsSync(backupPath));
    const out = ihub(["restore", backupPath]);
    assert.ok(out.includes("restored") || out.includes("Database"));
  });

  it("restore without args fails", () => {
    const err = ihubFail(["restore"]);
    assert.ok(err.includes("Usage"));
  });

  it("restore nonexistent file fails", () => {
    const err = ihubFail(["restore", "/tmp/nonexistent-backup-file.db"]);
    assert.ok(err.includes("not found") || err.includes("File not found"));
  });

  // --- New features ---

  it("agent template includes memories and prompts fields", () => {
    const agentPath = join(ROOT, "agents", "field-test.md");
    try {
      ihub(["create", "agent", "field-test"]);
      const content = readFileSync(agentPath, "utf-8");
      assert.ok(content.includes("memories: []"));
      assert.ok(content.includes("prompts: []"));
    } finally {
      if (existsSync(agentPath)) rmSync(agentPath);
    }
  });

  it("prompt template includes memories field", () => {
    const promptPath = join(ROOT, "prompts", "field-test.md");
    try {
      ihub(["create", "prompt", "field-test"]);
      const content = readFileSync(promptPath, "utf-8");
      assert.ok(content.includes("memories: []"));
    } finally {
      if (existsSync(promptPath)) rmSync(promptPath);
    }
  });

  it("validate checks memory cross-references in agents", () => {
    const agentPath = join(ROOT, "agents", "xref-test.md");
    try {
      writeFileSync(agentPath, "---\nname: xref-test\ndescription: test\nversion: 1.0.0\nmemories: [nonexistent-memory]\n---\n# Test\n");
      const err = ihubFail(["validate"]);
      assert.ok(err.includes('BROKEN ref: memory "nonexistent-memory"'));
    } finally {
      if (existsSync(agentPath)) rmSync(agentPath);
    }
  });

  it("validate checks prompt cross-references in agents", () => {
    const agentPath = join(ROOT, "agents", "xref-prompt-test.md");
    try {
      writeFileSync(agentPath, "---\nname: xref-prompt-test\ndescription: test\nversion: 1.0.0\nprompts: [nonexistent-prompt]\n---\n# Test\n");
      const err = ihubFail(["validate"]);
      assert.ok(err.includes('BROKEN ref: prompt "nonexistent-prompt"'));
    } finally {
      if (existsSync(agentPath)) rmSync(agentPath);
    }
  });

  it("validate checks memory cross-references in prompts", () => {
    const promptPath = join(ROOT, "prompts", "xref-test.md");
    try {
      writeFileSync(promptPath, "---\nname: xref-test\ndescription: test\nversion: 1.0.0\nmemories: [nonexistent-memory]\n---\n# Test\n");
      const err = ihubFail(["validate"]);
      assert.ok(err.includes('BROKEN ref: memory "nonexistent-memory"'));
    } finally {
      if (existsSync(promptPath)) rmSync(promptPath);
    }
  });

  it("diff command requires all arguments", () => {
    const err = ihubFail(["diff", "agent", "code-reviewer"]);
    assert.ok(err.includes("Usage"));
  });

  it("diff command compares two versions", () => {
    // Push v1 via API
    execFileSync(process.execPath, ["-e", `
      fetch("http://localhost:${PORT}/api/skills/diff-skill", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.TEST_TOKEN },
        body: JSON.stringify({ version: "1.0.0", description: "Diff test", tags: [], meta: {}, body: "# Version 1\\nOriginal line" })
      }).then(r => r.json()).then(console.log);
    `], { encoding: "utf-8", timeout: 5000, env: { ...process.env, TEST_TOKEN: userToken } });

    // Push v2 via API
    execFileSync(process.execPath, ["-e", `
      fetch("http://localhost:${PORT}/api/skills/diff-skill", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.TEST_TOKEN },
        body: JSON.stringify({ version: "2.0.0", description: "Diff test v2", tags: [], meta: {}, body: "# Version 2\\nChanged line" })
      }).then(r => r.json()).then(console.log);
    `], { encoding: "utf-8", timeout: 5000, env: { ...process.env, TEST_TOKEN: userToken } });

    const out = ihub(["diff", "skill", "diff-skill", "1.0.0", "2.0.0"]);
    assert.ok(out.includes("diff-skill"));
    assert.ok(out.includes("1.0.0"));
    assert.ok(out.includes("2.0.0"));
    assert.ok(out.includes("lines changed"));
  });

  it("open command shows URL", () => {
    // open command tries to launch browser; in CI it falls back to printing URL
    const out = ihub(["open"], { DISPLAY: "" });
    assert.ok(out.includes("localhost") || out.includes("Open") || out.includes("Opened"));
  });

  it("help includes new commands", () => {
    const out = ihub(["help"]);
    assert.ok(out.includes("open"));
    assert.ok(out.includes("diff"));
  });

  // --- MCP and hook artifact types ---

  function ihubIn(cwd, args, env = {}) {
    return execFileSync(process.execPath, [CLI, ...args], {
      cwd,
      input: "",
      env: {
        PATH: process.env.PATH,
        HOME: fakeHome,
        IHUB_REGISTRY: REGISTRY,
        IHUB_TOKEN: userToken || "",
        ...env,
      },
      encoding: "utf-8",
      timeout: 10000,
    });
  }

  async function apiPush(type, name, meta, body) {
    const res = await fetch(`${REGISTRY}/api/${type}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` },
      body: JSON.stringify({ version: meta.version || "1.0.0", description: meta.description || "x", tags: [], meta: { name, ...meta }, body: body || "# x", author: "" }),
    });
    assert.ok(res.ok, `push ${type}/${name} failed: ${res.status}`);
    return res.json();
  }

  it("pull mcp merges into .mcp.json and .cursor/mcp.json", async () => {
    await apiPush("mcps", "gh-test", {
      description: "GitHub MCP", version: "1.0.0", transport: "stdio",
      command: "npx", args: ["-y", "pkg"], env: ["TOKEN=${GH_TOKEN}"],
    });

    const proj = join(tmpDir, "mcp-proj");
    mkdirSync(proj, { recursive: true });
    try {
      const out = ihubIn(proj, ["pull", "mcp", "gh-test", "--local", "--agent", "claude", "--agent", "cursor"]);
      assert.ok(out.includes("Merged mcps/gh-test"));

      const claudeCfg = JSON.parse(readFileSync(join(proj, ".mcp.json"), "utf-8"));
      assert.deepEqual(claudeCfg.mcpServers["gh-test"], { command: "npx", args: ["-y", "pkg"], env: { TOKEN: "${GH_TOKEN}" } });

      const cursorCfg = JSON.parse(readFileSync(join(proj, ".cursor", "mcp.json"), "utf-8"));
      assert.equal(cursorCfg.mcpServers["gh-test"].command, "npx");

      // Tracking copy in the CLI working dir
      assert.ok(existsSync(join(ROOT, "mcps", "gh-test.md")));
    } finally {
      rmSync(join(ROOT, "mcps", "gh-test.md"), { force: true });
    }
  });

  it("pull mcp re-pull is idempotent and preserves user config", async () => {
    const proj = join(tmpDir, "mcp-proj2");
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, ".mcp.json"), JSON.stringify({ mcpServers: { mine: { command: "uvx" } }, other: 1 }));
    try {
      ihubIn(proj, ["pull", "mcp", "gh-test", "--local", "--agent", "claude"]);
      ihubIn(proj, ["pull", "mcp", "gh-test", "--local", "--agent", "claude"]);
      const cfg = JSON.parse(readFileSync(join(proj, ".mcp.json"), "utf-8"));
      assert.equal(Object.keys(cfg.mcpServers).length, 2);
      assert.deepEqual(cfg.mcpServers.mine, { command: "uvx" });
      assert.equal(cfg.other, 1);
    } finally {
      rmSync(join(ROOT, "mcps", "gh-test.md"), { force: true });
    }
  });

  it("pull mcp for codex is skipped with a manual note", async () => {
    const proj = join(tmpDir, "mcp-proj3");
    mkdirSync(proj, { recursive: true });
    try {
      const out = ihubIn(proj, ["pull", "mcp", "gh-test", "--local", "--agent", "codex"]);
      assert.ok(out.includes("config.toml"));
      assert.ok(!existsSync(join(proj, ".mcp.json")));
    } finally {
      rmSync(join(ROOT, "mcps", "gh-test.md"), { force: true });
    }
  });

  it("pull hook with --yes installs into .claude/settings.json", async () => {
    await apiPush("hooks", "fmt-test", {
      description: "Format hook", version: "1.0.0", event: "PostToolUse",
      matcher: "Write|Edit", command: "echo fmt", timeout: 10,
    });

    const proj = join(tmpDir, "hook-proj");
    mkdirSync(proj, { recursive: true });
    try {
      const out = ihubIn(proj, ["pull", "hook", "fmt-test", "--local", "--agent", "claude", "--yes"]);
      assert.ok(out.includes("echo fmt")); // command is always displayed
      const cfg = JSON.parse(readFileSync(join(proj, ".claude", "settings.json"), "utf-8"));
      const entries = cfg.hooks.PostToolUse;
      assert.equal(entries.length, 1);
      assert.equal(entries[0]._ihub, "hook/fmt-test");
      assert.equal(entries[0].matcher, "Write|Edit");
      assert.deepEqual(entries[0].hooks[0], { type: "command", command: "echo fmt", timeout: 10 });

      // Re-pull replaces, not duplicates
      ihubIn(proj, ["pull", "hook", "fmt-test", "--local", "--agent", "claude", "--yes"]);
      const cfg2 = JSON.parse(readFileSync(join(proj, ".claude", "settings.json"), "utf-8"));
      assert.equal(cfg2.hooks.PostToolUse.length, 1);
    } finally {
      rmSync(join(ROOT, "hooks", "fmt-test.md"), { force: true });
    }
  });

  it("pull hook without confirmation is cancelled", async () => {
    const proj = join(tmpDir, "hook-proj2");
    mkdirSync(proj, { recursive: true });
    try {
      // Empty stdin → prompt resolves to default "n"
      const out = ihubIn(proj, ["pull", "hook", "fmt-test", "--local", "--agent", "claude"]);
      assert.ok(out.includes("cancelled"));
      assert.ok(!existsSync(join(proj, ".claude", "settings.json")));
    } finally {
      rmSync(join(ROOT, "hooks", "fmt-test.md"), { force: true });
    }
  });

  it("validate catches mcp and hook field errors and broken refs", () => {
    const mcpPath = join(ROOT, "mcps", "bad-mcp.md");
    const hookPath = join(ROOT, "hooks", "bad-hook.md");
    const agentPath = join(ROOT, "agents", "xref-mcp-agent.md");
    mkdirSync(join(ROOT, "mcps"), { recursive: true });
    mkdirSync(join(ROOT, "hooks"), { recursive: true });
    writeFileSync(mcpPath, "---\nname: bad-mcp\ndescription: x\nversion: 1.0.0\ntransport: stdio\n---\n# x");
    writeFileSync(hookPath, "---\nname: bad-hook\ndescription: x\nversion: 1.0.0\nevent: OnBananas\n---\n# x");
    writeFileSync(agentPath, "---\nname: xref-mcp-agent\ndescription: x\nversion: 1.0.0\nmcps: [nonexistent-mcp]\nhooks: [nonexistent-hook]\n---\n# x");
    try {
      const err = ihubFail(["validate"]);
      assert.ok(err.includes("MISSING command in mcps/bad-mcp"));
      assert.ok(err.includes('INVALID event "OnBananas"'));
      assert.ok(err.includes("MISSING command in hooks/bad-hook"));
      assert.ok(err.includes('BROKEN ref: mcp "nonexistent-mcp"'));
      assert.ok(err.includes('BROKEN ref: hook "nonexistent-hook"'));
    } finally {
      rmSync(mcpPath, { force: true });
      rmSync(hookPath, { force: true });
      rmSync(agentPath, { force: true });
    }
  });

  it("agent pull resolves mcp dependencies into agent config", async () => {
    await apiPush("agents", "mcp-dep-agent", {
      description: "Agent with mcp dep", version: "1.0.0", mcps: ["gh-test"],
    });

    const proj = join(tmpDir, "dep-proj");
    mkdirSync(proj, { recursive: true });
    try {
      const out = ihubIn(proj, ["pull", "agent", "mcp-dep-agent", "--local", "--agent", "claude"]);
      assert.ok(out.includes("mcps/gh-test"));
      const cfg = JSON.parse(readFileSync(join(proj, ".mcp.json"), "utf-8"));
      assert.ok(cfg.mcpServers["gh-test"]);
    } finally {
      rmSync(join(ROOT, "mcps", "gh-test.md"), { force: true });
      rmSync(join(ROOT, "agents", "mcp-dep-agent.md"), { force: true });
    }
  });

  it("push mcp with literal secret is masked and blocked", async () => {
    const mcpPath = join(ROOT, "mcps", "leaky-mcp.md");
    mkdirSync(join(ROOT, "mcps"), { recursive: true });
    writeFileSync(mcpPath, '---\nname: leaky-mcp\ndescription: leaky\nversion: 1.0.0\ntransport: stdio\ncommand: npx\nenv: [GITHUB_TOKEN=ghp_0123456789abcdefghijklmnopqrstuvwxyz]\n---\n# leaky');
    try {
      let out;
      try {
        out = ihub(["push", "mcp", "leaky-mcp"]);
      } catch (err) {
        out = (err.stdout || "") + (err.stderr || "");
      }
      assert.ok(/sensitive|masked|blocked/i.test(out));
    } finally {
      rmSync(mcpPath, { force: true });
    }
  });

  // --- Remote: remove (must be last since it deletes) ---

  it("remove deletes from remote", () => {
    const out = ihub(["remove", "agent", "code-reviewer"]);
    assert.ok(out.includes("Removed"));

    const searchOut = ihub(["search", "--remote", "code-reviewer"]);
    assert.ok(searchOut.includes("No remote results"));
  });
});
