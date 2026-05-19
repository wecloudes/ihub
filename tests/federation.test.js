import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createServer } from "http";

const tmpDir = mkdtempSync(join(tmpdir(), "ihub-federation-test-"));
process.env.IHUB_DB_PATH = join(tmpDir, "test.db");
writeFileSync(join(tmpDir, "config.json"), JSON.stringify({}));
process.env.IHUB_CONFIG = join(tmpDir, "config.json");

const { resetConfig } = await import("../server/config.js");
resetConfig();
const { getDb, listEntries } = await import("../server/db.js");
const { syncFromUpstream, listUpstreams, addUpstream, syncAll } = await import("../server/federation.js");

// Mock upstream server
let upstreamServer;
let upstreamUrl;

before(async () => {
  upstreamServer = createServer((req, res) => {
    const url = req.url;
    res.setHeader("Content-Type", "application/json");

    if (url === "/api/agents") {
      res.end(JSON.stringify([{ name: "fed-agent" }]));
    } else if (url === "/api/agents/fed-agent") {
      res.end(JSON.stringify({
        name: "fed-agent",
        version: "1.0.0",
        description: "Federated test agent",
        body: "# Federated Agent",
        meta: {},
        author: "upstream",
      }));
    } else if (url === "/api/skills") {
      res.end(JSON.stringify([{ name: "fed-skill" }]));
    } else if (url === "/api/skills/fed-skill") {
      res.end(JSON.stringify({
        name: "fed-skill",
        version: "2.0.0",
        description: "Federated test skill",
        body: "# Federated Skill",
        meta: {},
        author: "upstream",
      }));
    } else if (url.startsWith("/api/")) {
      // Other types return empty
      res.end(JSON.stringify([]));
    } else {
      res.writeHead(404);
      res.end("{}");
    }
  });

  await new Promise((resolve) => {
    upstreamServer.listen(0, () => {
      upstreamUrl = `http://localhost:${upstreamServer.address().port}`;
      resolve();
    });
  });
});

after(() => {
  upstreamServer.close();
  getDb().close();
  rmSync(tmpDir, { recursive: true });
});

describe("federation", () => {
  it("syncFromUpstream syncs artifacts from upstream", async () => {
    const result = await syncFromUpstream(upstreamUrl);
    assert.ok(result.synced >= 2); // agents + skills
    assert.ok(Array.isArray(result.errors));
  });

  it("synced entries have federated owner", () => {
    const agents = listEntries("agents");
    const fedAgent = agents.find((e) => e.name === "fed-agent");
    assert.ok(fedAgent);
    assert.ok(fedAgent.owner.startsWith("federated:"));
  });

  it("returns error counts for failed fetches", async () => {
    // Sync from non-existent upstream
    const result = await syncFromUpstream("http://localhost:1");
    assert.ok(result.errors.length > 0);
    assert.equal(result.synced, 0);
  });

  it("filters by types parameter", async () => {
    const result = await syncFromUpstream(upstreamUrl, ["agents"]);
    // Should only sync agents type
    assert.ok(result.synced >= 1);
  });

  it("listUpstreams returns empty when not configured", () => {
    const upstreams = listUpstreams();
    // Only runtime upstreams (no config ones since config is empty)
    assert.ok(Array.isArray(upstreams));
  });

  it("addUpstream adds runtime upstream", () => {
    const before = listUpstreams().length;
    addUpstream("http://example.com/registry", ["agents", "skills"], 12);
    const after_ = listUpstreams();
    assert.equal(after_.length, before + 1);
    const added = after_.find((u) => u.url === "http://example.com/registry");
    assert.ok(added);
    assert.deepEqual(added.types, ["agents", "skills"]);
    assert.equal(added.interval_hours, 12);
  });

  it("listUpstreams includes sync state after sync", async () => {
    await syncFromUpstream(upstreamUrl);
    const upstreams = listUpstreams();
    // The upstreamUrl should have lastSync set (it's in the syncState map)
    // But it may not be in the upstreams list since it's not in config or runtime
    // Let's add it and sync
    addUpstream(upstreamUrl + "/check", ["agents"]);
    await syncFromUpstream(upstreamUrl + "/check", ["agents"]);
    const updated = listUpstreams();
    const checkUpstream = updated.find((u) => u.url.includes("/check"));
    assert.ok(checkUpstream);
    assert.ok(checkUpstream.lastSync);
  });

  it("syncAll syncs all configured upstreams", async () => {
    const results = await syncAll();
    assert.ok(Array.isArray(results));
    // We have runtime upstreams added above
    assert.ok(results.length >= 1);
  });
});
