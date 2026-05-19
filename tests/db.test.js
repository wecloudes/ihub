import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Set DB path before importing db module
const tmpDir = mkdtempSync(join(tmpdir(), "ihub-db-test-"));
process.env.IHUB_DB_PATH = join(tmpDir, "test.db");

const {
  getDb, upsertEntry, getEntry, getEntryOwner, listEntries, listVersions,
  deleteEntry, searchEntries, registerUser, authenticateKey, getUser,
  getUserCount, setUserRole, changeApiKey, backupDb, restoreDb, logAction, getAuditLog,
  addComment, getComments, deleteComment, getAverageRating,
  addWebhook, getWebhooks, deleteWebhook, getWebhooksForEvent,
} = await import("../server/db.js");

describe("database", () => {
  after(() => {
    getDb().close();
    rmSync(tmpDir, { recursive: true });
  });

  // --- Users ---

  it("registers and authenticates a user with default role", () => {
    registerUser("alice", "alice-key-123");
    const user = authenticateKey("alice-key-123");
    assert.equal(user.username, "alice");
    assert.equal(user.role, "user");
  });

  it("registers a user with admin role", () => {
    registerUser("superadmin", "admin-key-999", "admin");
    const user = authenticateKey("admin-key-999");
    assert.equal(user.username, "superadmin");
    assert.equal(user.role, "admin");
  });

  it("returns null for invalid key", () => {
    assert.equal(authenticateKey("bad-key"), null);
  });

  it("gets user by username with role", () => {
    const user = getUser("alice");
    assert.equal(user.username, "alice");
    assert.equal(user.role, "user");
  });

  it("returns undefined for nonexistent user", () => {
    assert.equal(getUser("nobody"), undefined);
  });

  it("counts users", () => {
    assert.ok(getUserCount() >= 2);
  });

  it("sets user role", () => {
    assert.equal(setUserRole("alice", "admin"), true);
    assert.equal(getUser("alice").role, "admin");
    setUserRole("alice", "user"); // restore
  });

  it("returns false when setting role for nonexistent user", () => {
    assert.equal(setUserRole("nobody", "admin"), false);
  });

  it("changes API key", () => {
    registerUser("charlie", "charlie-old-key");
    assert.equal(changeApiKey("charlie", "charlie-new-key"), true);
    // Old key fails
    assert.equal(authenticateKey("charlie-old-key"), null);
    // New key works
    const user = authenticateKey("charlie-new-key");
    assert.equal(user.username, "charlie");
  });

  it("changeApiKey returns false for nonexistent user", () => {
    assert.equal(changeApiKey("nobody", "whatever"), false);
  });

  it("backs up the database", async () => {
    const backupPath = join(tmpDir, "backup-test.db");
    await backupDb(backupPath);
    const { existsSync } = await import("fs");
    assert.ok(existsSync(backupPath));
  });

  // --- Entries with ownership ---

  it("upserts and retrieves an entry with owner", async () => {
    const result = await upsertEntry({
      type: "agents", name: "test-agent", version: "0.1.0",
      description: "A test agent", tags: ["test"], meta: { name: "test-agent" },
      body: "# Test", author: "tester", owner: "alice",
    });
    assert.equal(result.ok, true);

    const entry = await getEntry("agents", "test-agent");
    assert.equal(entry.name, "test-agent");
    assert.equal(entry.owner, "alice");
  });

  it("owner can update their own entry", async () => {
    const result = await upsertEntry({
      type: "agents", name: "test-agent", version: "0.2.0",
      description: "Updated", tags: ["test", "v2"], meta: { name: "test-agent" },
      body: "# Test v2", author: "tester", owner: "alice",
    });
    assert.equal(result.ok, true);
  });

  it("non-owner cannot push new version", async () => {
    registerUser("bob", "bob-key-456");
    const result = await upsertEntry({
      type: "agents", name: "test-agent", version: "0.3.0",
      description: "Hijacked", tags: [], meta: {},
      body: "", author: "bob", owner: "bob",
    });
    assert.equal(result.error, "forbidden");
    assert.equal(result.existingOwner, "alice");
  });

  it("non-owner cannot overwrite existing version", async () => {
    const result = await upsertEntry({
      type: "agents", name: "test-agent", version: "0.1.0",
      description: "Overwritten", tags: [], meta: {},
      body: "", author: "bob", owner: "bob",
    });
    assert.equal(result.error, "forbidden");
  });

  it("getEntryOwner returns the owner", () => {
    assert.equal(getEntryOwner("agents", "test-agent"), "alice");
  });

  it("getEntryOwner returns null for unowned entry", () => {
    assert.equal(getEntryOwner("agents", "nonexistent"), null);
  });

  it("retrieves by specific version", async () => {
    const v1 = await getEntry("agents", "test-agent", "0.1.0");
    assert.equal(v1.version, "0.1.0");
    const v2 = await getEntry("agents", "test-agent", "0.2.0");
    assert.equal(v2.version, "0.2.0");
  });

  it("returns null for nonexistent entry", async () => {
    assert.equal(await getEntry("agents", "nonexistent"), null);
  });

  it("lists entries (latest version per name)", async () => {
    await upsertEntry({
      type: "skills", name: "skill-a", version: "1.0.0",
      description: "Skill A", tags: [], meta: {}, body: "", author: "", owner: "alice",
    });
    await upsertEntry({
      type: "skills", name: "skill-b", version: "1.0.0",
      description: "Skill B", tags: [], meta: {}, body: "", author: "", owner: "bob",
    });

    const entries = listEntries("skills");
    assert.equal(entries.length, 2);
  });

  it("lists versions for an entry", () => {
    const versions = listVersions("agents", "test-agent");
    assert.ok(versions.length >= 2);
  });

  it("searches entries", () => {
    const results = searchEntries("test");
    assert.ok(results.some((r) => r.name === "test-agent"));
  });

  it("deletes an entry (all versions)", async () => {
    assert.equal(await deleteEntry("skills", "skill-b"), true);
    assert.equal(await getEntry("skills", "skill-b"), null);
  });

  it("returns false when deleting nonexistent entry", async () => {
    assert.equal(await deleteEntry("skills", "nonexistent"), false);
  });

  it("upserts same version (updates in place)", async () => {
    await upsertEntry({
      type: "rules", name: "test-rule", version: "1.0.0",
      description: "Original", tags: [], meta: {}, body: "", author: "", owner: "alice",
    });
    await upsertEntry({
      type: "rules", name: "test-rule", version: "1.0.0",
      description: "Updated", tags: [], meta: {}, body: "", author: "", owner: "alice",
    });
    const entry = await getEntry("rules", "test-rule", "1.0.0");
    assert.equal(entry.description, "Updated");
    assert.equal(listVersions("rules", "test-rule").length, 1);
  });

  // --- Comments ---

  it("adds and retrieves comments", () => {
    addComment({ type: "agents", name: "test-agent", username: "alice", rating: 5, body: "Great!" });
    addComment({ type: "agents", name: "test-agent", username: "bob", rating: 3, body: "Okay" });

    const comments = getComments("agents", "test-agent");
    assert.equal(comments.length, 2);
    const usernames = comments.map((c) => c.username);
    assert.ok(usernames.includes("alice"));
    assert.ok(usernames.includes("bob"));
  });

  it("calculates average rating", () => {
    const { average, count } = getAverageRating("agents", "test-agent");
    assert.equal(count, 2);
    assert.equal(average, 4); // (5+3)/2
  });

  it("returns null average for no comments", () => {
    const { average, count } = getAverageRating("agents", "no-comments");
    assert.equal(count, 0);
    assert.equal(average, null);
  });

  it("owner can delete their own comment", () => {
    const comments = getComments("agents", "test-agent");
    const bobComment = comments.find((c) => c.username === "bob");
    const result = deleteComment(bobComment.id, "bob");
    assert.equal(result.ok, true);
    assert.equal(getComments("agents", "test-agent").length, 1);
  });

  it("non-owner cannot delete comment", () => {
    const comments = getComments("agents", "test-agent");
    const result = deleteComment(comments[0].id, "bob");
    assert.equal(result.error, "forbidden");
  });

  it("deleting nonexistent comment returns not_found", () => {
    const result = deleteComment(99999, "alice");
    assert.equal(result.error, "not_found");
  });

  // --- Audit log ---

  it("logs and retrieves actions with IP", () => {
    logAction({ action: "push", username: "alice", role: "admin", ip: "10.0.0.1", type: "agents", name: "test-agent", detail: "v1.0.0" });
    logAction({ action: "view", username: "bob", role: "user", ip: "10.0.0.2", type: "agents", name: "test-agent" });
    logAction({ action: "pull", username: "anonymous", ip: "192.168.1.100", type: "agents", name: "test-agent" });
    logAction({ action: "search", username: "bob", role: "user", ip: "10.0.0.2", detail: "test query" });

    const result = getAuditLog();
    assert.ok(result.total >= 4);
    const push = result.entries.find((e) => e.action === "push" && e.username === "alice");
    assert.ok(push);
    assert.equal(push.ip, "10.0.0.1");
    assert.ok(result.entries.some((e) => e.action === "pull" && e.username === "anonymous"));
  });

  it("filters audit by username", () => {
    const result = getAuditLog({ username: "alice" });
    assert.ok(result.entries.every((e) => e.username === "alice"));
  });

  it("filters audit by action", () => {
    const result = getAuditLog({ action: "view" });
    assert.ok(result.entries.every((e) => e.action === "view"));
  });

  it("paginates audit log", () => {
    const page1 = getAuditLog({ limit: 1, offset: 0 });
    const page2 = getAuditLog({ limit: 1, offset: 1 });
    assert.equal(page1.entries.length, 1);
    assert.equal(page2.entries.length, 1);
    assert.notEqual(page1.entries[0].id, page2.entries[0].id);
  });

  it("audit entries have timestamps", () => {
    const result = getAuditLog({ limit: 1 });
    assert.ok(result.entries[0].created_at);
  });

  // --- Webhooks ---

  it("adds webhook with array events", () => {
    const id = addWebhook("https://example.com/hook1", ["push", "pull"], null);
    assert.ok(id > 0);
  });

  it("adds webhook with string events", () => {
    const id = addWebhook("https://example.com/hook2", "push,comment", "secret123");
    assert.ok(id > 0);
  });

  it("lists all webhooks", () => {
    const hooks = getWebhooks();
    assert.ok(hooks.length >= 2);
    assert.ok(hooks[0].url);
    assert.ok(hooks[0].events);
    assert.ok(hooks[0].created_at);
  });

  it("deletes existing webhook", () => {
    const hooks = getWebhooks();
    const result = deleteWebhook(hooks[0].id);
    assert.equal(result, true);
  });

  it("returns false deleting nonexistent webhook", () => {
    const result = deleteWebhook(99999);
    assert.equal(result, false);
  });

  it("filters webhooks by event", () => {
    const hooks = getWebhooksForEvent("comment");
    assert.ok(hooks.length >= 1);
    assert.ok(hooks.every((h) => h.events.includes("comment")));
  });

  it("returns empty for unmatched event", () => {
    const hooks = getWebhooksForEvent("nonexistent-event");
    assert.deepEqual(hooks, []);
  });

  it("matches wildcard event", () => {
    addWebhook("https://example.com/wildcard", "*", null);
    const hooks = getWebhooksForEvent("anything");
    assert.ok(hooks.some((h) => h.url === "https://example.com/wildcard"));
  });

  // --- Restore DB ---

  it("restores database from backup", async () => {
    const backupPath = join(tmpDir, "backup-for-restore.db");
    await backupDb(backupPath);
    restoreDb(backupPath);
    // DB should still be functional after restore
    const count = getUserCount();
    assert.ok(count >= 2);
  });
});
