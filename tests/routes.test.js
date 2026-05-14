import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "http";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Isolated DB and config for route tests
const tmpDir = mkdtempSync(join(tmpdir(), "ihub-routes-test-"));
process.env.IHUB_DB_PATH = join(tmpDir, "test.db");
process.env.IHUB_CONFIG = join(tmpDir, "nonexistent-config.json");

const { resetConfig } = await import("../server/config.js");
resetConfig();
const { handleRequest } = await import("../server/routes.js");
const { getDb } = await import("../server/db.js");

let server;
let baseUrl;
let aliceKey;
let bobKey;

before(async () => {
  server = createServer(handleRequest);
  await new Promise((resolve) => {
    server.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => {
  server.close();
  getDb().close();
  rmSync(tmpDir, { recursive: true });
});

async function api(method, path, { body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

describe("API routes", () => {
  // --- Registration ---

  it("first user gets admin role", async () => {
    const { status, data } = await api("POST", "/api/register", {
      body: { username: "alice" },
    });
    assert.equal(status, 201);
    assert.equal(data.username, "alice");
    assert.equal(data.role, "admin");
    assert.ok(data.api_key);
    aliceKey = data.api_key;
  });

  it("second user gets user role", async () => {
    const { status, data } = await api("POST", "/api/register", {
      body: { username: "bob" },
    });
    assert.equal(status, 201);
    assert.equal(data.role, "user");
    bobKey = data.api_key;
  });

  it("rejects duplicate username", async () => {
    const { status, data } = await api("POST", "/api/register", {
      body: { username: "alice" },
    });
    assert.equal(status, 409);
    assert.ok(data.error.includes("already exists"));
  });

  it("rejects register without username", async () => {
    const { status } = await api("POST", "/api/register", {
      body: {},
    });
    assert.equal(status, 400);
  });

  // --- Whoami ---

  it("whoami returns username and role", async () => {
    const { status, data } = await api("GET", "/api/whoami", { token: aliceKey });
    assert.equal(status, 200);
    assert.equal(data.username, "alice");
    assert.equal(data.role, "admin");
  });

  it("whoami rejects invalid key", async () => {
    const { status } = await api("GET", "/api/whoami", { token: "bad-key" });
    assert.equal(status, 401);
  });

  // --- Password change ---

  it("changes password", async () => {
    const { status, data } = await api("POST", "/api/account/password", {
      body: { new_password: "new-bob-key-12345" },
      token: bobKey,
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);

    // Old key should no longer work
    const { status: s1 } = await api("GET", "/api/whoami", { token: bobKey });
    assert.equal(s1, 401);

    // New key should work
    const { status: s2, data: d2 } = await api("GET", "/api/whoami", { token: "new-bob-key-12345" });
    assert.equal(s2, 200);
    assert.equal(d2.username, "bob");

    // Update bobKey for remaining tests
    bobKey = "new-bob-key-12345";
  });

  it("rejects short password", async () => {
    const { status, data } = await api("POST", "/api/account/password", {
      body: { new_password: "short" },
      token: bobKey,
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes("8 characters"));
  });

  it("rejects password change without auth", async () => {
    const { status } = await api("POST", "/api/account/password", {
      body: { new_password: "longenoughpassword" },
    });
    assert.equal(status, 401);
  });

  // --- Basic CRUD ---

  it("rejects invalid type", async () => {
    const { status, data } = await api("GET", "/api/invalid");
    assert.equal(status, 400);
    assert.ok(data.error.includes("Invalid type"));
  });

  it("lists empty type", async () => {
    const { status, data } = await api("GET", "/api/agents");
    assert.equal(status, 200);
    assert.deepEqual(data, []);
  });

  it("rejects push without auth", async () => {
    const { status } = await api("POST", "/api/agents/my-agent", {
      body: { version: "1.0.0" },
    });
    assert.equal(status, 401);
  });

  it("rejects push with wrong key", async () => {
    const { status } = await api("POST", "/api/agents/my-agent", {
      body: { version: "1.0.0" },
      token: "wrong-key",
    });
    assert.equal(status, 401);
  });

  it("pushes an entry (alice)", async () => {
    const { status, data } = await api("POST", "/api/agents/my-agent", {
      body: {
        version: "1.0.0",
        description: "My agent",
        tags: ["test"],
        meta: { name: "my-agent" },
        body: "# My Agent",
        author: "alice",
      },
      token: aliceKey,
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.owner, "alice");
  });

  it("rejects push without version", async () => {
    const { status, data } = await api("POST", "/api/agents/bad-agent", {
      body: { description: "no version" },
      token: aliceKey,
    });
    assert.equal(status, 400);
    assert.ok(data.error.includes("version"));
  });

  it("gets an entry", async () => {
    const { status, data } = await api("GET", "/api/agents/my-agent");
    assert.equal(status, 200);
    assert.equal(data.name, "my-agent");
    assert.equal(data.version, "1.0.0");
    assert.equal(data.owner, "alice");
  });

  it("returns 404 for nonexistent entry", async () => {
    const { status } = await api("GET", "/api/agents/nope");
    assert.equal(status, 404);
  });

  it("alice pushes a second version", async () => {
    const { status } = await api("POST", "/api/agents/my-agent", {
      body: {
        version: "2.0.0",
        description: "Updated agent",
        tags: ["test", "v2"],
        meta: { name: "my-agent" },
        body: "# My Agent v2",
        author: "alice",
      },
      token: aliceKey,
    });
    assert.equal(status, 200);
  });

  it("lists versions", async () => {
    const { status, data } = await api("GET", "/api/agents/my-agent/versions");
    assert.equal(status, 200);
    assert.ok(data.length >= 2);
  });

  it("gets specific version", async () => {
    const { status, data } = await api("GET", "/api/agents/my-agent?version=1.0.0");
    assert.equal(status, 200);
    assert.equal(data.version, "1.0.0");
  });

  it("lists entries (latest per name)", async () => {
    const { status, data } = await api("GET", "/api/agents");
    assert.equal(status, 200);
    assert.equal(data.length, 1);
  });

  it("searches entries", async () => {
    const { status, data } = await api("GET", "/api/search?q=agent");
    assert.equal(status, 200);
    assert.ok(data.some((r) => r.name === "my-agent"));
  });

  it("rejects search without query", async () => {
    const { status } = await api("GET", "/api/search");
    assert.equal(status, 400);
  });

  // --- Ownership ---

  it("bob cannot update alice's entry", async () => {
    const { status, data } = await api("POST", "/api/agents/my-agent", {
      body: {
        version: "3.0.0",
        description: "Hijacked",
        tags: [],
        meta: {},
        body: "",
        author: "bob",
      },
      token: bobKey,
    });
    assert.equal(status, 403);
    assert.ok(data.error.includes("alice"));
  });

  it("bob cannot remove alice's entry", async () => {
    const { status, data } = await api("DELETE", "/api/agents/my-agent", {
      token: bobKey,
    });
    assert.equal(status, 403);
    assert.ok(data.error.includes("alice"));
  });

  it("bob can push his own entry", async () => {
    const { status, data } = await api("POST", "/api/skills/bob-skill", {
      body: {
        version: "1.0.0",
        description: "Bob's skill",
        tags: [],
        meta: {},
        body: "",
        author: "bob",
      },
      token: bobKey,
    });
    assert.equal(status, 200);
    assert.equal(data.owner, "bob");
  });

  it("alice cannot remove bob's entry", async () => {
    const { status } = await api("DELETE", "/api/skills/bob-skill", {
      token: aliceKey,
    });
    assert.equal(status, 403);
  });

  it("bob can remove his own entry", async () => {
    const { status, data } = await api("DELETE", "/api/skills/bob-skill", {
      token: bobKey,
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
  });

  // --- Other types ---

  it("pushes entries of different types", async () => {
    for (const type of ["skills", "rules", "memories", "prompts"]) {
      const { status } = await api("POST", `/api/${type}/test-${type}`, {
        body: { version: "1.0.0", description: `Test ${type}`, tags: [], meta: {}, body: "", author: "" },
        token: aliceKey,
      });
      assert.equal(status, 200, `Failed to push ${type}`);
    }
  });

  it("rejects delete without auth", async () => {
    const { status } = await api("DELETE", "/api/skills/test-skills");
    assert.equal(status, 401);
  });

  it("owner deletes an entry", async () => {
    const { status, data } = await api("DELETE", "/api/skills/test-skills", {
      token: aliceKey,
    });
    assert.equal(status, 200);
    assert.equal(data.ok, true);
  });

  it("returns 404 when deleting nonexistent entry", async () => {
    const { status } = await api("DELETE", "/api/skills/nope", {
      token: aliceKey,
    });
    assert.equal(status, 404);
  });

  // --- Comments ---

  it("no comments initially", async () => {
    const { status, data } = await api("GET", "/api/agents/my-agent/comments");
    assert.equal(status, 200);
    assert.deepEqual(data.comments, []);
    assert.equal(data.rating.count, 0);
    assert.equal(data.rating.average, null);
  });

  it("rejects comment without auth", async () => {
    const { status } = await api("POST", "/api/agents/my-agent/comments", {
      body: { rating: 5, body: "Great!" },
    });
    assert.equal(status, 401);
  });

  it("rejects comment without body", async () => {
    const { status } = await api("POST", "/api/agents/my-agent/comments", {
      body: { rating: 5 },
      token: aliceKey,
    });
    assert.equal(status, 400);
  });

  it("rejects comment with invalid rating", async () => {
    const { status } = await api("POST", "/api/agents/my-agent/comments", {
      body: { rating: 6, body: "Too high" },
      token: aliceKey,
    });
    assert.equal(status, 400);
    assert.ok((await api("POST", "/api/agents/my-agent/comments", {
      body: { rating: 0, body: "Too low" }, token: aliceKey,
    })).status === 400);
  });

  it("rejects comment on nonexistent entry", async () => {
    const { status } = await api("POST", "/api/agents/nope/comments", {
      body: { rating: 3, body: "Does not exist" },
      token: aliceKey,
    });
    assert.equal(status, 404);
  });

  it("alice adds a comment", async () => {
    const { status, data } = await api("POST", "/api/agents/my-agent/comments", {
      body: { rating: 5, body: "Excellent agent!" },
      token: aliceKey,
    });
    assert.equal(status, 201);
    assert.equal(data.username, "alice");
    assert.equal(data.rating, 5);
  });

  it("bob adds a comment", async () => {
    const { status, data } = await api("POST", "/api/agents/my-agent/comments", {
      body: { rating: 3, body: "It's okay" },
      token: bobKey,
    });
    assert.equal(status, 201);
    assert.equal(data.username, "bob");
  });

  it("lists comments with average rating", async () => {
    const { status, data } = await api("GET", "/api/agents/my-agent/comments");
    assert.equal(status, 200);
    assert.equal(data.comments.length, 2);
    assert.equal(data.rating.count, 2);
    assert.equal(data.rating.average, 4); // (5+3)/2 = 4
    const usernames = data.comments.map((c) => c.username);
    assert.ok(usernames.includes("alice"));
    assert.ok(usernames.includes("bob"));
  });

  it("bob cannot delete alice's comment", async () => {
    const { data: commentsData } = await api("GET", "/api/agents/my-agent/comments");
    const aliceComment = commentsData.comments.find((c) => c.username === "alice");
    const { status } = await api("DELETE", `/api/agents/my-agent/comments/${aliceComment.id}`, {
      token: bobKey,
    });
    assert.equal(status, 403);
  });

  it("alice deletes her own comment", async () => {
    const { data: commentsData } = await api("GET", "/api/agents/my-agent/comments");
    const aliceComment = commentsData.comments.find((c) => c.username === "alice");
    const { status } = await api("DELETE", `/api/agents/my-agent/comments/${aliceComment.id}`, {
      token: aliceKey,
    });
    assert.equal(status, 200);

    // Verify only bob's comment remains
    const { data } = await api("GET", "/api/agents/my-agent/comments");
    assert.equal(data.comments.length, 1);
    assert.equal(data.comments[0].username, "bob");
    assert.equal(data.rating.average, 3);
  });

  // --- Admin: Backup ---

  it("admin can download backup", async () => {
    const res = await fetch(`${baseUrl}/api/backup`, {
      headers: { "Authorization": `Bearer ${aliceKey}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/octet-stream");
    const buf = await res.arrayBuffer();
    assert.ok(buf.byteLength > 0);
  });

  it("non-admin cannot download backup", async () => {
    const { status, data } = await api("GET", "/api/backup", { token: bobKey });
    assert.equal(status, 403);
    assert.ok(data.error.includes("Admin"));
  });

  it("unauthenticated cannot download backup", async () => {
    const { status } = await api("GET", "/api/backup");
    assert.equal(status, 401);
  });

  // --- Admin: Role management ---

  it("admin can set user role", async () => {
    const { status, data } = await api("POST", "/api/users/bob/role", {
      body: { role: "admin" },
      token: aliceKey,
    });
    assert.equal(status, 200);
    assert.equal(data.role, "admin");
  });

  it("non-admin cannot set user role", async () => {
    // Reset bob to user first
    await api("POST", "/api/users/bob/role", {
      body: { role: "user" },
      token: aliceKey,
    });
    const { status } = await api("POST", "/api/users/bob/role", {
      body: { role: "admin" },
      token: bobKey,
    });
    assert.equal(status, 403);
  });

  it("rejects invalid role", async () => {
    const { status } = await api("POST", "/api/users/bob/role", {
      body: { role: "superuser" },
      token: aliceKey,
    });
    assert.equal(status, 400);
  });

  it("rejects role for nonexistent user", async () => {
    const { status } = await api("POST", "/api/users/nobody/role", {
      body: { role: "admin" },
      token: aliceKey,
    });
    assert.equal(status, 404);
  });

  // --- Metrics ---

  it("GET /metrics returns Prometheus format", async () => {
    const res = await fetch(`${baseUrl}/api/metrics`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type").includes("text/plain"));
    const text = await res.text();
    // Should have push metrics from earlier tests
    assert.ok(text.includes("ihub_push_total"));
    assert.ok(text.includes("ihub_register_total"));
    assert.ok(text.includes("ihub_entries_count"));
    assert.ok(text.includes("ihub_users_count"));
    assert.ok(text.includes("ihub_http_requests_total"));
  });

  // --- Audit trail ---

  it("admin can view audit log", async () => {
    const { status, data } = await api("GET", "/api/audit", { token: aliceKey });
    assert.equal(status, 200);
    assert.ok(data.total > 0);
    assert.ok(data.entries.length > 0);
    assert.ok(data.entries[0].action);
    assert.ok(data.entries[0].created_at);
  });

  it("non-admin cannot view audit log", async () => {
    const { status } = await api("GET", "/api/audit", { token: bobKey });
    assert.equal(status, 403);
  });

  it("audit log contains push actions", async () => {
    const { data } = await api("GET", "/api/audit?action=push", { token: aliceKey });
    assert.ok(data.entries.some((e) => e.action === "push"));
  });

  it("audit log contains register actions", async () => {
    const { data } = await api("GET", "/api/audit?action=register", { token: aliceKey });
    assert.ok(data.entries.some((e) => e.action === "register"));
  });

  it("audit log filters by user", async () => {
    const { data } = await api("GET", "/api/audit?user=alice", { token: aliceKey });
    assert.ok(data.entries.every((e) => e.username === "alice"));
  });

  it("audit log supports pagination", async () => {
    const { data: page1 } = await api("GET", "/api/audit?limit=2&offset=0", { token: aliceKey });
    assert.equal(page1.entries.length, 2);
    assert.equal(page1.limit, 2);
    assert.equal(page1.offset, 0);

    const { data: page2 } = await api("GET", "/api/audit?limit=2&offset=2", { token: aliceKey });
    assert.equal(page2.entries.length, 2);
    assert.equal(page2.offset, 2);

    // Pages should have different entries
    assert.notEqual(page1.entries[0].id, page2.entries[0].id);
  });

  it("audit log records view actions", async () => {
    // Trigger a view
    await api("GET", "/api/agents/my-agent", { token: aliceKey });
    const { data } = await api("GET", "/api/audit?action=view", { token: aliceKey });
    assert.ok(data.entries.some((e) => e.action === "view" && e.name === "my-agent"));
  });

  it("audit logs anonymous actions with IP", async () => {
    // Anonymous view (no token)
    await api("GET", "/api/agents/my-agent");
    const { data } = await api("GET", "/api/audit?user=anonymous", { token: aliceKey });
    const anonView = data.entries.find((e) => e.username === "anonymous" && e.action === "view");
    assert.ok(anonView);
    assert.ok(anonView.ip); // IP should be captured
  });

  it("audit logs pull as distinct action from view", async () => {
    // Pull with X-Ihub-Action header
    await fetch(`${baseUrl}/api/agents/my-agent`, {
      headers: { "X-Ihub-Action": "pull", "Authorization": `Bearer ${aliceKey}` },
    });
    const { data } = await api("GET", "/api/audit?action=pull", { token: aliceKey });
    assert.ok(data.entries.some((e) => e.action === "pull" && e.name === "my-agent"));
  });

  it("audit entries include IP address", async () => {
    const { data } = await api("GET", "/api/audit?limit=1", { token: aliceKey });
    assert.ok(data.entries[0].ip);
  });

  it("audit logs versions and view-comments actions", async () => {
    await api("GET", "/api/agents/my-agent/versions");
    await api("GET", "/api/agents/my-agent/comments");
    const { data } = await api("GET", "/api/audit", { token: aliceKey });
    assert.ok(data.entries.some((e) => e.action === "versions"));
    assert.ok(data.entries.some((e) => e.action === "view-comments"));
  });

  // --- Config ---

  it("admin can view server config", async () => {
    const { status, data } = await api("GET", "/api/config", { token: aliceKey });
    assert.equal(status, 200);
    assert.ok(data.server);
    assert.ok(data.metrics);
    assert.ok(data.audit);
    assert.equal(typeof data.server.port, "number");
  });

  it("non-admin cannot view config", async () => {
    const { status } = await api("GET", "/api/config", { token: bobKey });
    assert.equal(status, 403);
  });

  it("config does not expose webhook URL", async () => {
    const { data } = await api("GET", "/api/config", { token: aliceKey });
    assert.equal(data.slack.webhook_url, undefined);
  });

  // --- Digest ---

  it("digest fails when Slack is not configured", async () => {
    const { status, data } = await api("POST", "/api/digest", { token: aliceKey });
    assert.equal(status, 400);
    assert.ok(data.error.includes("Slack not configured"));
  });

  it("non-admin cannot trigger digest", async () => {
    const { status } = await api("POST", "/api/digest", { token: bobKey });
    assert.equal(status, 403);
  });

  // --- Attachments ---

  it("push with attachments", async () => {
    const { status, data } = await api("POST", "/api/skills/scripted-skill", {
      body: {
        version: "1.0.0",
        description: "A skill with scripts",
        tags: [],
        meta: {},
        body: "# Scripted",
        author: "alice",
        attachments: [
          { filepath: "scripts/run.sh", content: Buffer.from("#!/bin/bash\necho hello").toString("base64") },
          { filepath: "scripts/lib/util.py", content: Buffer.from("def hello(): pass").toString("base64") },
        ],
      },
      token: aliceKey,
    });
    assert.equal(status, 200);
    assert.equal(data.attachments, 2);
  });

  it("GET entry includes attachment list", async () => {
    const { status, data } = await api("GET", "/api/skills/scripted-skill");
    assert.equal(status, 200);
    assert.equal(data.attachments.length, 2);
    assert.ok(data.attachments.some((a) => a.filepath === "scripts/run.sh"));
    assert.ok(data.attachments.some((a) => a.filepath === "scripts/lib/util.py"));
  });

  it("list attachments", async () => {
    const { status, data } = await api("GET", "/api/skills/scripted-skill/attachments");
    assert.equal(status, 200);
    assert.equal(data.attachments.length, 2);
  });

  it("download single attachment", async () => {
    const res = await fetch(`${baseUrl}/api/skills/scripted-skill/attachments/scripts/run.sh`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes("echo hello"));
  });

  it("404 for nonexistent attachment", async () => {
    const { status } = await api("GET", "/api/skills/scripted-skill/attachments/nope.txt");
    assert.equal(status, 404);
  });

  it("remove deletes attachments too", async () => {
    await api("DELETE", "/api/skills/scripted-skill", { token: aliceKey });
    const { status } = await api("GET", "/api/skills/scripted-skill/attachments");
    // Entry is gone, so attachments route hits 'missing entry name' or returns empty
    const res = await fetch(`${baseUrl}/api/skills/scripted-skill/attachments/scripts/run.sh`);
    assert.equal(res.status, 404);
  });

  // --- Ping ---

  it("GET /ping returns pong", async () => {
    const { status, data } = await api("GET", "/api/ping");
    assert.equal(status, 200);
    assert.equal(data.pong, true);
    assert.ok(data.timestamp);
  });
});
