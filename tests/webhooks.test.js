import { describe, it, beforeAll, afterAll, beforeEach } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createServer } from "http";
import { createHmac } from "crypto";

const tmpDir = mkdtempSync(join(tmpdir(), "ihub-webhooks-test-"));
process.env.IHUB_DB_PATH = join(tmpDir, "test.db");
process.env.IHUB_CONFIG = join(tmpDir, "nonexistent.json");

const { resetConfig } = await import("../server/config.js");
resetConfig();
const { getDb, resetDb, addWebhook, getWebhooks, deleteWebhook, getWebhooksForEvent } = await import("../server/db.js");
const { sendWebhook } = await import("../server/webhooks.js");

let hookServer;
let hookServerUrl;
let receivedRequests = [];

beforeAll(async () => {
  hookServer = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      receivedRequests.push({
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      res.writeHead(200);
      res.end("ok");
    });
  });
  await new Promise((resolve) => {
    hookServer.listen(0, () => {
      hookServerUrl = `http://localhost:${hookServer.address().port}`;
      resolve();
    });
  });
});

afterAll(() => {
  hookServer.close();
  resetDb();
  rmSync(tmpDir, { recursive: true });
});

describe("webhook delivery", () => {
  it("sendWebhook delivers to matching webhooks", async () => {
    receivedRequests = [];
    addWebhook(hookServerUrl + "/test", ["push"], null);
    sendWebhook("push", { type: "agents", name: "test-agent", username: "alice" });
    // Wait for async delivery
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(receivedRequests.length >= 1);
    const body = JSON.parse(receivedRequests[0].body);
    assert.equal(body.event, "push");
    assert.equal(body.name, "test-agent");
  });

  it("sendWebhook includes HMAC signature when secret configured", async () => {
    receivedRequests = [];
    addWebhook(hookServerUrl + "/signed", ["comment"], "my-secret");
    sendWebhook("comment", { type: "skills", name: "test-skill", username: "bob" });
    await new Promise((r) => setTimeout(r, 200));
    const req = receivedRequests.find((r) => r.headers["x-ihub-signature"]);
    assert.ok(req, "Should have X-Ihub-Signature header");
    // Verify signature
    const expected = createHmac("sha256", "my-secret").update(req.body).digest("hex");
    assert.equal(req.headers["x-ihub-signature"], expected);
  });

  it("sendWebhook does not deliver for non-matching event", async () => {
    receivedRequests = [];
    // Only "push" and "comment" webhooks exist — "remove" should not match
    sendWebhook("remove", { type: "agents", name: "test-agent", username: "alice" });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(receivedRequests.length, 0);
  });

  it("sendWebhook does not crash on unreachable URL", () => {
    addWebhook("http://localhost:1/unreachable", ["pull"], null);
    // Should not throw
    sendWebhook("pull", { type: "agents", name: "x", username: "y" });
  });

  it("sendWebhook handles non-2xx responses and increments failure metric", async () => {
    // Start a server that returns 500
    const { reset, serialize } = await import("../server/metrics.js");
    reset();
    const errServer = createServer((req, res) => { res.writeHead(500); res.end("error"); });
    await new Promise((resolve) => errServer.listen(0, resolve));
    const errUrl = `http://localhost:${errServer.address().port}`;
    addWebhook(errUrl + "/err", ["approve"], null);
    sendWebhook("approve", { type: "agents", name: "x", username: "y" });
    // Wait for initial attempt (10s timeout won't fire but non-2xx is instant)
    await new Promise((r) => setTimeout(r, 500));
    const metrics = serialize();
    // Either delivery or retry should have incremented failed counter
    assert.ok(metrics.includes("ihub_webhook_failed_total"), "Expected failure metric");
    errServer.close();
  });

  it("sendWebhook handles timeout gracefully", async () => {
    // Start a server that never responds
    const slowServer = createServer(() => { /* hang */ });
    await new Promise((resolve) => slowServer.listen(0, resolve));
    const slowUrl = `http://localhost:${slowServer.address().port}`;
    addWebhook(slowUrl + "/slow", ["register"], null);
    // Should not throw or block — it returns immediately and delivers asynchronously
    const start = Date.now();
    sendWebhook("register", { type: "agents", name: "x", username: "y" });
    assert.ok(Date.now() - start < 100, "sendWebhook should return immediately");
    slowServer.close();
  });
});
