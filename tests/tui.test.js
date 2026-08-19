import { describe, it, beforeAll, afterAll } from "bun:test";
import assert from "node:assert/strict";
import { spawn } from "child_process";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "cli", "index.js");
const tmpDir = mkdtempSync(join(tmpdir(), "ihub-tui-test-"));
// Bulk pull recreates plugins/<name>/ relative to cwd — keep it out of the repo
const workDir = join(tmpDir, "work");
mkdirSync(workDir, { recursive: true });
const DB_PATH = join(tmpDir, "test.db");
const PORT = 19876 + Math.floor(Math.random() * 1000);
const REGISTRY = `http://localhost:${PORT}`;

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

let serverProc;
let userToken;

/**
 * Spawn `ihub browse` as a child process, send keystrokes, capture output.
 * Returns a controller with send(), waitFor(), and kill().
 */
function spawnTui(env = {}) {
  const proc = spawn(process.execPath, [CLI, "browse"], {
    cwd: workDir,
    env: {
      PATH: process.env.PATH,
      HOME: tmpDir,
      TERM: "xterm-256color",
      COLUMNS: "120",
      LINES: "40",
      IHUB_REGISTRY: REGISTRY,
      IHUB_TOKEN: userToken || "",
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
    // Type a string one keystroke at a time (single-char handlers only fire per char)
    async type(str, delay = 40) {
      for (const ch of str) await this.send(ch, delay);
    },
    async waitFor(pattern, timeoutMs = 3000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if (typeof pattern === "string" ? output.includes(pattern) : pattern.test(output)) {
          return output;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error(`Timeout waiting for "${pattern}" after ${timeoutMs}ms.\nOutput: ${output.slice(-600)}\nStderr: ${stderr.slice(-400)}`);
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

async function pushPlugin(name, { description, meta = {}, body = "", attachments } = {}, token) {
  return apiPost(`/api/plugins/${name}`, {
    version: "1.0.0",
    description,
    tags: meta.keywords || [],
    meta: { name, ...meta },
    body: body || `# ${name}\n${description || ""}`,
    author: "tuiuser",
    ...(attachments ? { attachments } : {}),
  }, token);
}

describe("TUI integration tests (plugin model)", () => {
  beforeAll(async () => {
    serverProc = spawn(process.execPath, [join(ROOT, "server", "index.js")], {
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

    // First registered user is admin
    const data = await apiPost("/api/register", { username: "tuiuser" });
    userToken = data.api_key;

    // Push sample plugins. Alphabetical order (default sort):
    //   code-quality, dev-mcps, docs-tools
    await pushPlugin("code-quality", {
      description: "Code quality tooling plugin for linting and reviews",
      meta: {
        project: "devtools",
        keywords: ["git", "lint", "review"],
        license: "MIT",
        author: { name: "tuiuser" },
        components: {
          skills: ["git-commit-msg", "lint-check"],
          commands: ["commit"],
          agents: ["code-reviewer"],
        },
      },
      body: "# code-quality\nQuality tooling.\n## Skills\n- git-commit-msg\n- lint-check",
      attachments: [
        { filepath: ".claude-plugin/plugin.json", content: b64(JSON.stringify({ name: "code-quality", description: "Code quality tooling", version: "1.0.0" })) },
        { filepath: "skills/git-commit-msg/SKILL.md", content: b64("---\ndescription: commit msgs\n---\n# git-commit-msg") },
      ],
    }, userToken);

    await pushPlugin("dev-mcps", {
      description: "MCP servers bundle for development",
      meta: {
        project: "devtools",
        keywords: ["mcp"],
        components: { mcpServers: ["github", "context7"] },
      },
    }, userToken);

    await pushPlugin("docs-tools", {
      description: "Documentation generation plugin",
      meta: {
        keywords: ["docs"],
        components: { agents: ["doc-generator"], skills: ["test-generator"] },
      },
    }, userToken);

    // A review on code-quality
    await apiPost("/api/plugins/code-quality/comments", { rating: 5, body: "Great plugin!" }, userToken);
  });

  afterAll(() => {
    if (serverProc) serverProc.kill();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Startup & flat plugin list ---

  it("starts directly in the flat plugin list", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("Plugins");
      const out = tui.getOutput();
      assert.ok(out.includes("code-quality"));
      assert.ok(out.includes("dev-mcps"));
      assert.ok(out.includes("docs-tools"));
    } finally {
      await tui.kill();
    }
  });

  it("navigates the list with arrow keys", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\x1b[B"); // down
      await tui.send("\x1b[B"); // down
      await tui.send("\x1b[A"); // up
      await tui.waitFor("docs-tools", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Detail view + component tree ---

  it("opens a plugin detail with its component tree", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r"); // enter detail on first plugin (code-quality)
      await tui.waitFor("Owner:", 3000);
      const out = tui.getOutput();
      assert.ok(out.includes("Components"));       // component section header
      assert.ok(out.includes("git-commit-msg"));   // a skill component
      assert.ok(out.includes("code-reviewer"));    // an agent component
    } finally {
      await tui.kill();
    }
  });

  it("returns from detail to list with Escape", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("\x1b"); // back to list
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("returns from detail to list with q", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("q");
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("shows the component containment graph with g", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("g"); // component graph
      await tui.waitFor("Components: code-quality", 3000);
      await tui.send("\x1b"); // back to detail
      await tui.waitFor("Owner:", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("shows version history with v", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("v");
      await tui.waitFor("Version History", 3000);
      await tui.send("\x1b"); // back to detail
      await tui.waitFor("Owner:", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Comments ---

  it("toggles the comments view with c", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("c"); // to comments
      await tui.waitFor("Reviews", 3000);
      await tui.send("c"); // back to detail
      await tui.waitFor("Owner:", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Multi-select ---

  it("selects a plugin with space", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send(" ");
      await tui.waitFor("1 selected", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("selects all plugins with a", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("a");
      await tui.waitFor("3 selected", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("deselects all with a twice", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("a");
      await tui.waitFor("3 selected");
      await tui.send("a");
      await new Promise((r) => setTimeout(r, 200));
      const out = tui.getOutput();
      const lastRender = out.slice(out.lastIndexOf("\x1b[2J"));
      assert.ok(!lastRender.includes("3 selected"));
    } finally {
      await tui.kill();
    }
  });

  // --- Bulk pull (direct — no agent/scope select) ---

  it("bulk pulls selected plugins into plugins/<name>/", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send(" "); // select code-quality
      await tui.waitFor("1 selected");
      await tui.send("p"); // bulk pull directly
      await tui.waitFor("processed", 6000);
      // Plugin dir recreated from README body + attachments
      assert.ok(existsSync(join(workDir, "plugins", "code-quality", "README.md")));
      assert.ok(existsSync(join(workDir, "plugins", "code-quality", ".claude-plugin", "plugin.json")));
      assert.ok(existsSync(join(workDir, "plugins", "code-quality", "skills", "git-commit-msg", "SKILL.md")));
    } finally {
      await tui.kill();
    }
  });

  it("returns from the pulling view with any key", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send(" ");
      await tui.waitFor("1 selected");
      await tui.send("p");
      await tui.waitFor("processed", 6000);
      await tui.send(" "); // any key returns to list
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("quick pulls the selected plugin with P", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("P"); // quick pull selected, no agent prompt
      await tui.waitFor("processed", 6000);
    } finally {
      await tui.kill();
    }
  });

  // --- Fuzzy filter ---

  it("filters the list via filter mode", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("f"); // enter filter mode explicitly
      await tui.type("docs"); // type one char at a time
      await tui.waitFor("filter: docs", 3000);
      const out = tui.getOutput();
      const last = out.slice(out.lastIndexOf("\x1b[2J"));
      assert.ok(last.includes("docs-tools"));
      assert.ok(!last.includes("dev-mcps"));
    } finally {
      await tui.kill();
    }
  });

  // --- Sort ---

  it("cycles sort with s", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("s");
      await tui.waitFor("sort: date", 3000);
      await tui.send("s");
      await tui.waitFor("sort: rating", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Help overlay ---

  it("shows help with ? and dismisses with any key", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("?");
      await tui.waitFor("Keyboard Shortcuts", 3000);
      await tui.send(" ");
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Guide (single concise page) ---

  it("shows the plugin guide with G", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("G");
      await tui.waitFor("ihub Plugin Guide", 3000);
      const out = tui.getOutput();
      assert.ok(out.includes("Component kinds")); // guide explains component types
      await tui.send("\x1b");
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Projects (group by meta.project) ---

  it("shows the projects view with j", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality"); // selected → project "devtools"
      await tui.send("j");
      await tui.waitFor("Projects", 3000);
      const out = tui.getOutput();
      assert.ok(out.includes("devtools"));
      await tui.send("\x1b");
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("shows all projects with A then returns", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("j");
      await tui.waitFor("Projects", 3000);
      await tui.send("A"); // show all projects
      await tui.waitFor("Projects", 3000);
      await tui.send("\x1b");
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Detail view actions: bookmark, clipboard ---

  it("bookmarks and unbookmarks a plugin with f", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("f");
      await tui.waitFor("Bookmarked", 3000);
      await tui.send("f");
      await tui.waitFor("Unbookmarked", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("shows the bookmarks list with F", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("F");
      await tui.waitFor("Bookmarks", 3000);
      await tui.send("\x1b");
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("copies the pull command with y", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("y");
      await tui.waitFor("ihub pull", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Delete flow ---

  it("removes a plugin with d and returns to list", async () => {
    await pushPlugin("disposable", { description: "To be deleted", meta: { components: {} } }, userToken);

    const tui = spawnTui();
    try {
      await tui.waitFor("disposable", 3000);
      // Alphabetical: code-quality, dev-mcps, disposable, docs-tools → index 2
      await tui.send("\x1b[B", 80);
      await tui.send("\x1b[B", 80);
      await tui.send("\r"); // open disposable
      await tui.waitFor("To be deleted", 3000);
      await tui.send("d"); // confirm prompt
      await tui.waitFor("DELETE", 3000);
      await tui.send("d"); // confirm delete
      await tui.waitFor("Removed", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("cancels delete with any other key after first d", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("d");
      await tui.waitFor("DELETE", 3000);
      await tui.send("n"); // cancels
      await tui.waitFor("cancelled", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Write review ---

  it("does not freeze on the write review flow", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      await tui.send("w");
      await new Promise((r) => setTimeout(r, 300));
      await tui.send("5\n");
      await new Promise((r) => setTimeout(r, 100));
      await tui.send("Solid!\n");
      await tui.waitFor("Review added", 5000);
    } finally {
      await tui.kill();
    }
  });

  // --- Search ---

  it("does not freeze on the search flow", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("/");
      await new Promise((r) => setTimeout(r, 200));
      await tui.send("code\n");
      await tui.waitFor("code-quality", 5000);
    } finally {
      await tui.kill();
    }
  });

  it("cancels search with Escape", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("/");
      await new Promise((r) => setTimeout(r, 200));
      await tui.send("\x1b");
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("cancels search with q on empty input", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("/");
      await new Promise((r) => setTimeout(r, 200));
      await tui.send("q");
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Preview scroll keys (wide terminals) ---

  it("handles preview scroll keys without crashing", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("}");
      await new Promise((r) => setTimeout(r, 100));
      await tui.send("{");
      await new Promise((r) => setTimeout(r, 100));
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Admin views ---

  it("enters and leaves all admin views", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      // metrics
      await tui.send("m"); await tui.waitFor("Metrics", 3000);
      await tui.send("\x1b"); await tui.waitFor("code-quality", 3000);
      // audit
      await tui.send("t"); await tui.waitFor("Audit Trail", 3000);
      await tui.send("\x1b"); await tui.waitFor("code-quality", 3000);
      // config
      await tui.send("i"); await tui.waitFor("Configuration", 3000);
      await tui.send("\x1b"); await tui.waitFor("code-quality", 3000);
      // blocked
      await tui.send("B"); await tui.waitFor("Blocked", 3000);
      await tui.send("\x1b"); await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  it("blocked view clears when going back", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("B");
      await tui.waitFor("Blocked plugins", 3000);
      await tui.send("\x1b"); // back to normal list
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Breadcrumb ---

  it("shows the plugins breadcrumb after entering detail", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      await tui.send("\r");
      await tui.waitFor("Owner:", 3000);
      const out = tui.getOutput();
      const last = out.slice(out.lastIndexOf("\x1b[2J"));
      assert.ok(last.includes("plugins")); // breadcrumb root
    } finally {
      await tui.kill();
    }
  });

  // --- Resilience ---

  it("survives rapid navigation without freezing", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("code-quality");
      for (const k of ["\x1b[B", "\x1b[B", "\r"]) await tui.send(k, 50);
      await new Promise((r) => setTimeout(r, 300));
      await tui.send("\x1b", 100);
      await tui.send("\x1b", 100);
      await tui.waitFor("code-quality", 3000);
    } finally {
      await tui.kill();
    }
  });

  // --- Quit ---

  it("quits cleanly with q from the list", async () => {
    const tui = spawnTui();
    try {
      await tui.waitFor("Plugins");
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
      await tui.waitFor("Plugins");
      tui.send("\x03");
      await new Promise((resolve) => {
        const timeout = setTimeout(() => { assert.fail("TUI did not exit"); }, 3000);
        tui.proc.on("exit", () => { clearTimeout(timeout); resolve(); });
      });
    } finally {
      try { await tui.kill(); } catch {}
    }
  });
});
