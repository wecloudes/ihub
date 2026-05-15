import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "child_process";
import { mkdtempSync, rmSync, readdirSync, unlinkSync } from "fs";
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
    async switchToSkills() {
      // Navigate right until skills tab is active, then wait for skill items
      await this.send("\x1b[C", 150);
      await this.waitFor("test-skill-1", 3000);
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
        for (const f of readdirSync(d)) {
          if (f.endsWith(".md")) unlinkSync(join(d, f));
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

  it("starts directly in list view with agents", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent", 3000); // starts in list, shows agents
    } finally {
      await tui.kill();
    }
  });

  it("switches types with right arrow", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("\x1b[C"); // Right arrow to skills
      await tui.waitFor("test-skill-1", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("goes back from detail with Escape to list", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent");
      await tui.send("\r"); // Enter detail
      await tui.waitFor("Test agent", 3000);
      await tui.send("\x1b"); // Back to list
      await tui.waitFor("test-agent", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("goes back from detail with q", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent");
      await tui.send("\r"); // detail
      await tui.waitFor("Test agent", 3000);
      await tui.send("q");
      await tui.waitFor("test-agent", 3000); // Back to list
    } finally {
      await tui.kill();
    }
  });

  // --- Detail view ---

  it("drills into detail view", async () => {
    const tui = spawnTui();
    try {
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
      await tui.waitFor("test-agent");
      await tui.send("\r");
      await tui.waitFor("Test agent", 3000);
      await tui.send("\x1b"); // Back to list
      await tui.waitFor("test-agent", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Comments ---

  it("toggles comments view with c", async () => {
    const tui = spawnTui();
    try {
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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
      await tui.switchToSkills();
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

  // === NEW: Comprehensive feature tests ===

  // --- Breadcrumb (#3) ---

  it("shows breadcrumb when navigating into list", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.switchToSkills();
      await tui.waitFor("test-skill-1");
      const out = tui.getOutput();
      const last = out.slice(out.lastIndexOf("\x1b[2J"));
      assert.ok(last.includes("skills")); // breadcrumb shows type
    } finally { await tui.kill(); }
  });

  // --- Tab navigation (#6) ---

  it("switches types with left/right arrows", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent"); // starts in agents list
      await tui.send("\x1b[C"); // right arrow → skills
      await tui.waitFor("test-skill-1", 3000);
      await tui.send("\x1b[D"); // left arrow → back to agents
      await tui.waitFor("test-agent", 3000);
    } finally { await tui.kill(); }
  });

  // --- Fuzzy filter (#2) ---

  it("filters list by typing characters", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.switchToSkills();
      await tui.waitFor("test-skill-1");
      await tui.send("3"); // type "3" to filter
      await tui.waitFor("filter: 3", 3000);
      const out = tui.getOutput();
      const last = out.slice(out.lastIndexOf("\x1b[2J"));
      assert.ok(last.includes("test-skill-3"));
    } finally { await tui.kill(); }
  });

  // --- Sort (#8) ---

  it("cycles sort with s key", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.switchToSkills();
      await tui.send("s");
      await tui.waitFor("sort: date", 3000);
      await tui.send("s");
      await tui.waitFor("sort: rating", 3000);
    } finally { await tui.kill(); }
  });

  // --- Help overlay (#10) ---

  it("shows help with ? and dismisses with any key", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("?");
      await tui.waitFor("Keyboard Shortcuts", 3000);
      await tui.send(" "); // dismiss
      await tui.waitFor("agents", 3000); // back to types
    } finally { await tui.kill(); }
  });

  // --- Quick pull P (#12) ---

  it("quick pulls single item with P", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.switchToSkills();
      await tui.send("P"); // quick pull
      await tui.waitFor("Select coding agent", 3000);
      await tui.send("\x1b"); // cancel
      await tui.waitFor("test-skill-1", 3000); // back to list
    } finally { await tui.kill(); }
  });

  // --- Detail view: dependency graph (#13) ---

  it("shows dependency graph with g", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent");
      await tui.send("\r"); // detail
      await tui.waitFor("Test agent", 3000);
      await tui.send("g"); // graph
      await tui.waitFor("Dependency Graph", 3000);
      await tui.send("\x1b"); // back
      await tui.waitFor("Test agent", 3000);
    } finally { await tui.kill(); }
  });

  // --- Detail view: version history (#7) ---

  it("shows version history with v", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent");
      await tui.send("\r");
      await tui.waitFor("Test agent", 3000);
      await tui.send("v"); // versions
      await tui.waitFor("Version History", 3000);
      await tui.send("\x1b"); // back
      await tui.waitFor("agents", 3000); // back to types (versions goes to types)
    } finally { await tui.kill(); }
  });

  // --- Detail view: bookmark (#11) ---

  it("bookmarks and unbookmarks with f", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent");
      await tui.send("\r");
      await tui.waitFor("Test agent", 3000);
      await tui.send("f"); // bookmark
      await tui.waitFor("Bookmarked", 3000);
      await tui.send("f"); // unbookmark
      await tui.waitFor("Unbookmarked", 3000);
    } finally { await tui.kill(); }
  });

  // --- Bookmarks list (#11) ---

  it("shows bookmarks list with F", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("F"); // bookmarks list
      await tui.waitFor("Bookmarks", 3000);
      await tui.send("\x1b"); // back
      await tui.waitFor("agents", 3000);
    } finally { await tui.kill(); }
  });

  // --- Projects view ---

  it("shows projects with j", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.send("j"); // projects
      await tui.waitFor("Projects", 3000);
      await tui.send("\x1b"); // back
      await tui.waitFor("agents", 3000);
    } finally { await tui.kill(); }
  });

  // --- Blocked view clears properly ---

  it("blocked view clears when going back", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent"); // starts in agents list
      await tui.send("B"); // blocked (admin)
      await tui.waitFor("Blocked", 3000);
      await tui.send("\x1b"); // back to normal list
      await tui.waitFor("test-agent", 3000); // should see agents, NOT blocked
    } finally { await tui.kill(); }
  });

  // --- Write review from detail ---

  it("does not freeze on write review flow", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.switchToSkills();
      await tui.waitFor("test-skill-1");
      await tui.send("\r"); // detail
      await tui.waitFor("Test skill", 3000);
      await tui.send("w"); // write review
      await new Promise((r) => setTimeout(r, 300));
      await tui.send("5\n"); // rating
      await new Promise((r) => setTimeout(r, 100));
      await tui.send("Great!\n"); // comment
      await tui.waitFor("Review added", 5000);
    } finally { await tui.kill(); }
  });

  // --- Delete from detail ---

  it("removes artifact with d and returns to list", async () => {
    // Push a disposable artifact first
    await apiPost("/api/skills/disposable", {
      version: "1.0.0", description: "To be deleted", tags: [],
      meta: { name: "disposable" }, body: "# Delete me", author: "tuiuser",
    }, userToken);

    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      await tui.switchToSkills();
      await tui.waitFor("disposable", 3000);
      // Navigate to disposable
      for (let i = 0; i < 5; i++) await tui.send("\x1b[B", 50);
      await tui.send("\r"); // open it
      await new Promise((r) => setTimeout(r, 500));
      await tui.send("d"); // delete
      await tui.waitFor("Removed", 3000);
    } finally { await tui.kill(); }
  });

  // --- Clipboard copy (#14) ---

  it("copies pull command with y", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("test-agent");
      await tui.send("\r");
      await tui.waitFor("Test agent", 3000);
      await tui.send("y"); // copy
      await tui.waitFor("ihub pull", 3000); // status shows the command
    } finally { await tui.kill(); }
  });

  // --- Multiple operations without freezing ---

  it("survives rapid navigation without freezing", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      // Rapid: down, down, enter, down, enter, esc, esc, down, enter
      for (const k of ["\x1b[B", "\x1b[B", "\r"]) await tui.send(k, 50);
      await new Promise((r) => setTimeout(r, 300));
      await tui.send("\r", 100); // enter detail
      await new Promise((r) => setTimeout(r, 300));
      await tui.send("\x1b", 100); // back
      await tui.send("\x1b", 100); // back to types
      await tui.waitFor("agents", 3000); // still responsive
    } finally { await tui.kill(); }
  });

  it("survives entering and leaving all admin views", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("agents");
      // metrics
      await tui.send("m"); await tui.waitFor("Metrics", 3000);
      await tui.send("\x1b"); await tui.waitFor("agents", 3000);
      // audit
      await tui.send("t"); await tui.waitFor("Audit", 3000);
      await tui.send("\x1b"); await tui.waitFor("agents", 3000);
      // config
      await tui.send("i"); await tui.waitFor("Configuration", 3000);
      await tui.send("\x1b"); await tui.waitFor("agents", 3000);
      // projects
      await tui.send("j"); await tui.waitFor("Projects", 3000);
      await tui.send("\x1b"); await tui.waitFor("agents", 3000);
      // blocked
      await tui.send("B"); await tui.waitFor("Blocked", 3000);
      await tui.send("\x1b"); await tui.waitFor("agents", 3000);
      // bookmarks
      await tui.send("F"); await tui.waitFor("Bookmarks", 3000);
      await tui.send("\x1b"); await tui.waitFor("agents", 3000);
    } finally { await tui.kill(); }
  });
});
