import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "cli", "index.js");
const tmpDir = mkdtempSync(join(tmpdir(), "ihub-tui-test-"));
const DB_PATH = join(tmpDir, "test.db");
const PORT = 19876 + Math.floor(Math.random() * 1000);
const REGISTRY = `http://localhost:${PORT}`;

let serverProc;
let userToken;

/**
 * Spawn ihub browse as a child process, send keystrokes, capture output.
 * Returns a controller with send(), waitFor(), and kill().
 */
function spawnTui(env = {}) {
  const proc = spawn("node", [CLI, "browse"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH,
      HOME: tmpDir,
      TERM: "xterm-256color",
      COLUMNS: "120",
      LINES: "40",
      IHUB_REGISTRY: REGISTRY,
      IHUB_TOKEN: userToken || "",
      IHUB_AGENT: "ihub",
      ...env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  let stderr = "";
  proc.stdout.on("data", (d) => { output += d.toString(); });
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  return {
    proc,
    send(keys, delay = 100) {
      return new Promise((resolve) => {
        setTimeout(() => {
          proc.stdin.write(keys);
          resolve();
        }, delay);
      });
    },
    async waitFor(pattern, timeoutMs = 3000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (typeof pattern === "string" ? output.includes(pattern) : pattern.test(output)) {
          return output;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`Timeout waiting for "${pattern}" after ${timeoutMs}ms.\nOutput: ${output.slice(-500)}\nStderr: ${stderr.slice(-500)}`);
    },
    getOutput() { return output; },
    getStderr() { return stderr; },
    clearOutput() { output = ""; },
    async kill() {
      proc.stdin.end();
      proc.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(() => { proc.kill("SIGKILL"); resolve(); }, 2000);
        proc.on("exit", () => { clearTimeout(timeout); resolve(); });
      });
    },
  };
}

async function apiPost(path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${REGISTRY}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  return res.json();
}

describe("TUI integration tests", () => {
  before(async () => {
    // Start server
    serverProc = spawn("node", [join(ROOT, "server", "index.js")], {
      env: {
        PATH: process.env.PATH,
        IHUB_DB_PATH: DB_PATH,
        IHUB_CONFIG: join(tmpDir, "nonexistent.json"),
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

    // Register admin user
    const data = await apiPost("/api/register", { username: "tuiuser" });
    userToken = data.api_key;

    // Push some test artifacts
    for (const name of ["test-skill-1", "test-skill-2", "test-skill-3"]) {
      await apiPost(`/api/skills/${name}`, {
        version: "1.0.0",
        description: `Test skill ${name}`,
        tags: ["test"],
        meta: { name },
        body: `# ${name}\nTest content.`,
        author: "tuiuser",
      }, userToken);
    }

    // Push an agent and a rule
    await apiPost("/api/agents/test-agent", {
      version: "1.0.0", description: "Test agent", tags: [], meta: { name: "test-agent" }, body: "# Agent", author: "tuiuser",
    }, userToken);

    await apiPost("/api/rules/test-rule", {
      version: "1.0.0", description: "Test rule", tags: [], meta: { name: "test-rule" }, body: "# Rule", author: "tuiuser",
    }, userToken);

    // Add a comment
    await apiPost("/api/skills/test-skill-1/comments", { rating: 5, body: "Great skill!" }, userToken);
  });

  after(() => {
    if (serverProc) serverProc.kill();
    rmSync(tmpDir, { recursive: true, force: true });
    // Clean up any files the TUI pull tests created in working dirs
    for (const dir of ["agents", "skills", "rules", "memories", "prompts"]) {
      const d = join(ROOT, dir);
      try {
        for (const f of require("fs").readdirSync(d)) {
          if (f.endsWith(".md")) require("fs").unlinkSync(join(d, f));
        }
      } catch {}
    }
  });

  // --- Basic startup & navigation ---

  it("starts and shows types view", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      const out = tui.getOutput();
      assert.ok(out.includes("skills"));
      assert.ok(out.includes("rules"));
    } finally {
      await tui.kill();
    }
  });

  it("navigates to list view with Enter", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\r"); // Enter on agents
      await tui.waitFor("test-agent", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("navigates down with arrow keys", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B"); // Down arrow
      await tui.waitFor("skills");
      await tui.send("\r"); // Enter on skills
      await tui.waitFor("test-skill-1", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("goes back with Escape", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\r"); // Enter
      await tui.waitFor("test-agent");
      await tui.send("\x1b"); // Escape
      await tui.waitFor("skills"); // Back to types view showing all types
    } finally {
      await tui.kill();
    }
  });

  it("goes back with q", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\r");
      await tui.waitFor("test-agent");
      await tui.send("q");
      await tui.waitFor("skills"); // Back to types
    } finally {
      await tui.kill();
    }
  });

  // --- Detail view ---

  it("drills into detail view", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\r"); // Enter on agents
      await tui.waitFor("test-agent");
      await tui.send("\r"); // Enter on test-agent
      await tui.waitFor("Test agent", 3000); // Description in detail view
    } finally {
      await tui.kill();
    }
  });

  it("returns from detail with Escape", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\r");
      await tui.waitFor("test-agent");
      await tui.send("\r");
      await tui.waitFor("Test agent");
      await tui.send("\x1b"); // Back to list
      await tui.waitFor("entries"); // List view shows "entries"
    } finally {
      await tui.kill();
    }
  });

  // --- Comments ---

  it("toggles comments view with c", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B"); // Down to skills
      await tui.send("\r"); // Enter skills
      await tui.waitFor("test-skill-1");
      await tui.send("\r"); // Enter detail
      await tui.waitFor("Test skill", 3000);
      await tui.send("c"); // Toggle comments
      await tui.waitFor("Reviews", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("returns from comments with c", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100); // Down to skills, enter
      await tui.waitFor("test-skill-1");
      await tui.send("\r"); // Detail
      await tui.waitFor("Test skill", 3000);
      await tui.send("c"); // To comments
      await tui.waitFor("Reviews", 3000);
      await tui.send("c"); // Back to detail
      await tui.waitFor("Test skill", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Multi-select ---

  it("selects items with space bar", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100); // Skills list
      await tui.waitFor("test-skill-1");
      await tui.send(" "); // Select first
      await tui.waitFor("1 selected", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("select all with a", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100); // Skills list
      await tui.waitFor("test-skill-1");
      await tui.send("a"); // Select all
      await tui.waitFor("3 selected", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("deselect all with a twice", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100);
      await tui.waitFor("test-skill-1");
      await tui.send("a"); // Select all
      await tui.waitFor("3 selected");
      await tui.send("a"); // Deselect all
      // After deselect, "selected" badge should disappear
      await new Promise((r) => setTimeout(r, 200));
      const out = tui.getOutput();
      // The latest render should not have "3 selected"
      const lastRender = out.slice(out.lastIndexOf("\x1b[2J")); // Last clear screen
      assert.ok(!lastRender.includes("3 selected"));
    } finally {
      await tui.kill();
    }
  });

  // --- Agent select + scope select flow ---

  it("opens agent select on p, cancels with Escape", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100); // Skills list
      await tui.waitFor("test-skill-1");
      await tui.send(" "); // Select one
      await tui.waitFor("1 selected");
      await tui.send("p"); // Pull
      await tui.waitFor("Select coding agent", 3000);
      await tui.send("\x1b"); // Cancel
      await tui.waitFor("test-skill-1", 3000); // Back to list
    } finally {
      await tui.kill();
    }
  });

  it("toggles agent selection with number keys", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100);
      await tui.waitFor("test-skill-1");
      await tui.send("a"); // Select all
      await tui.waitFor("3 selected");
      await tui.send("p"); // Pull
      await tui.waitFor("Select coding agent");
      await tui.send("7"); // Toggle ihub
      await tui.waitFor("1 agent", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("proceeds to scope select after confirming agents", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100);
      await tui.waitFor("test-skill-1");
      await tui.send(" "); // Select one
      await tui.waitFor("1 selected");
      await tui.send("p");
      await tui.waitFor("Select coding agent");
      await tui.send("7"); // ihub
      await tui.waitFor("1 agent");
      await tui.send("\r"); // Confirm
      await tui.waitFor("Install scope", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("cancels scope select with Escape", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100);
      await tui.waitFor("test-skill-1");
      await tui.send(" ");
      await tui.waitFor("1 selected");
      await tui.send("p");
      await tui.waitFor("Select coding agent");
      await tui.send("7", 100); await tui.send("\r", 100); // ihub + confirm
      await tui.waitFor("Install scope");
      await tui.send("\x1b"); // Cancel
      await tui.waitFor("test-skill-1", 3000); // Back to list
    } finally {
      await tui.kill();
    }
  });

  it("completes full bulk pull flow", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100); // Skills list
      await tui.waitFor("test-skill-1");
      await tui.send(" "); // Select one
      await tui.waitFor("1 selected");
      await tui.send("p"); // Pull
      await tui.waitFor("Select coding agent");
      await tui.send("7"); // ihub
      await tui.send("\r"); // Confirm agents
      await tui.waitFor("Install scope");
      await tui.send("l"); // Local scope
      await tui.waitFor("processed", 5000); // Wait for pull to finish
    } finally {
      await tui.kill();
    }
  });

  it("returns from pulling view with any key", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[B", 100); await tui.send("\r", 100);
      await tui.waitFor("test-skill-1");
      await tui.send(" ");
      await tui.waitFor("1 selected");
      await tui.send("p");
      await tui.waitFor("Select coding agent");
      await tui.send("7", 100); await tui.send("\r", 100); // ihub + confirm
      await tui.waitFor("Install scope");
      await tui.send("l"); // Pull
      await tui.waitFor("processed", 5000);
      await tui.send(" "); // Any key to go back
      await tui.waitFor("test-skill-1", 3000); // Back to list
    } finally {
      await tui.kill();
    }
  });

  // --- Search ---

  it("does not freeze on search flow", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      // Search requires cooked mode stdin — we simulate by sending / then query + newline
      await tui.send("/");
      await new Promise((r) => setTimeout(r, 200));
      await tui.send("test\n");
      await tui.waitFor("test-skill", 5000);
    } finally {
      await tui.kill();
    }
  });

  // --- Quit ---

  it("quits cleanly with q from types", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      tui.send("q");
      await new Promise((resolve) => {
        const timeout = setTimeout(() => { assert.fail("TUI did not exit"); }, 3000);
        tui.proc.on("exit", () => { clearTimeout(timeout); resolve(); });
      });
    } finally {
      try { await tui.kill(); } catch {}
    }
  });

  it("quits cleanly with Ctrl+C", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      tui.send("\x03"); // Ctrl+C
      await new Promise((resolve) => {
        const timeout = setTimeout(() => { assert.fail("TUI did not exit"); }, 3000);
        tui.proc.on("exit", () => { clearTimeout(timeout); resolve(); });
      });
    } finally {
      try { await tui.kill(); } catch {}
    }
  });
});
