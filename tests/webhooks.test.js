import { describe, it, before, after } from "node:test";
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
const { getDb, addWebhook, getWebhooks, deleteWebhook, getWebhooksForEvent } = await import("../server/db.js");
const { sendWebhook } = await import("../server/webhooks.js");

let hookServer;
let hookServerUrl;
let receivedRequests = [];

before(async () => {
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

after(() => {
  hookServer.close();
  getDb().close();
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
});
