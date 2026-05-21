import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "http";
import { initVLogs, isVLogsEnabled, shipLog } from "../server/vlogs.js";

describe("VictoriaLogs client", () => {
  let server;
  let receivedLogs = [];

  before(async () => {
    // Mock VictoriaLogs server
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const lines = body.trim().split("\n").filter(Boolean);
          lines.forEach((line) => receivedLogs.push(JSON.parse(line)));
        } catch {}
        res.writeHead(200);
        res.end("ok");
      });
    });
    await new Promise((resolve) => server.listen(0, resolve));
  });

  after(() => {
    server.close();
  });

  it("isVLogsEnabled returns false before init", () => {
    assert.equal(isVLogsEnabled(), false);
  });

  it("initVLogs enables the client", () => {
    const port = server.address().port;
    initVLogs(`http://localhost:${port}`);
    assert.equal(isVLogsEnabled(), true);
  });

  it("shipLog sends structured JSON to the mock server", async () => {
    receivedLogs = [];
    shipLog({
      action: "push",
      username: "alice",
      role: "admin",
      ip: "127.0.0.1",
      type: "agents",
      name: "code-reviewer",
      detail: "v1.0.0",
    });

    // Wait for async delivery
    await new Promise((r) => setTimeout(r, 500));

    assert.equal(receivedLogs.length, 1);
    const log = receivedLogs[0];
    assert.equal(log.service, "ihub");
    assert.equal(log.action, "push");
    assert.equal(log.username, "alice");
    assert.equal(log.ip, "127.0.0.1");
    assert.equal(log.type, "agents");
    assert.equal(log.name, "code-reviewer");
    assert.ok(log._time);
    assert.ok(log.message.includes("push"));
    assert.ok(log.message.includes("code-reviewer"));
  });

  it("shipLog includes level field", async () => {
    receivedLogs = [];
    shipLog({ action: "firewall-blocked", ip: "10.0.0.1", level: "warn" });

    await new Promise((r) => setTimeout(r, 500));

    assert.equal(receivedLogs.length, 1);
    assert.equal(receivedLogs[0].level, "warn");
  });

  it("shipLog handles missing fields gracefully", async () => {
    receivedLogs = [];
    shipLog({ action: "test" });

    await new Promise((r) => setTimeout(r, 500));

    assert.equal(receivedLogs.length, 1);
    assert.equal(receivedLogs[0].action, "test");
    assert.equal(receivedLogs[0].username, "");
    assert.equal(receivedLogs[0].ip, "");
  });
});
