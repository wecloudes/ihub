import { describe, it, before, after } from "node:test";
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
  return execFileSync("node", [CLI, ...args], {
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
  before(async () => {
    serverProc = spawn("node", [join(ROOT, "server", "index.js")], {
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
    const TYPES = ["agents", "skills", "rules", "memories", "prompts"];
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

  after(() => {
    if (serverProc) serverProc.kill();
    rmSync(tmpDir, { recursive: true, force: true });
    // Clean up copied example entries
    const TYPES = ["agents", "skills", "rules", "memories", "prompts"];
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

  it("projects shows tree view", () => {
    const out = ihub(["projects"]);
    assert.ok(out.includes("ci-toolkit"));
    assert.ok(out.includes("agents"));
    assert.ok(out.includes("code-reviewer"));
    assert.ok(out.includes("skills"));
    assert.ok(out.includes("lint-check"));
    assert.ok(out.includes("rules"));
    assert.ok(out.includes("require-tests"));
  });

  it("projects filters by name", () => {
    const out = ihub(["projects", "ci-toolkit"]);
    assert.ok(out.includes("ci-toolkit"));
    assert.ok(out.includes("code-reviewer"));
  });

  it("projects fails for nonexistent", () => {
    const err = ihubFail(["projects", "nonexistent"]);
    assert.ok(err.includes("Project not found"));
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
      const out = execFileSync("node", [CLI, "create", "agent", "interactive-test", "-i"], {
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
      const out = execFileSync("node", [CLI, "create", "-i"], {
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
    execFileSync("node", ["-e", `
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
    const out = execFileSync("node", [CLI, "comment", "agent", "code-reviewer"], {
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

  // --- Remote: remove ---

  it("remove deletes from remote", () => {
    const out = ihub(["remove", "agent", "code-reviewer"]);
    assert.ok(out.includes("Removed"));

    const searchOut = ihub(["search", "--remote", "code-reviewer"]);
    assert.ok(searchOut.includes("No remote results"));
  });
});
