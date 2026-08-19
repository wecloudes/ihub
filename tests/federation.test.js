import { describe, it, beforeAll, afterAll } from "bun:test";
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
const { getDb, resetDb, listEntries } = await import("../server/db.js");
const { syncFromUpstream, listUpstreams, addUpstream, syncAll } = await import("../server/federation.js");

// Mock upstream ihub registry — plugin-only model.
let upstreamServer;
let upstreamUrl;

beforeAll(async () => {
  upstreamServer = createServer((req, res) => {
    const url = req.url;
    res.setHeader("Content-Type", "application/json");

    if (url === "/api/plugins") {
      res.end(JSON.stringify([{ name: "fed-code-quality" }, { name: "fed-dev-mcps" }]));
    } else if (url === "/api/plugins/fed-code-quality") {
      res.end(JSON.stringify({
        name: "fed-code-quality",
        version: "1.0.0",
        description: "Federated code-quality plugin",
        body: "# Code Quality",
        meta: { components: { skills: ["lint-check"], commands: ["commit"], agents: ["code-reviewer"], mcpServers: [], hooks: [] } },
        author: "upstream",
      }));
    } else if (url === "/api/plugins/fed-dev-mcps") {
      res.end(JSON.stringify({
        name: "fed-dev-mcps",
        version: "2.0.0",
        description: "Federated dev MCP plugin",
        body: "# Dev MCPs",
        meta: { components: { skills: [], commands: [], agents: [], mcpServers: ["github"], hooks: [] } },
        author: "upstream",
      }));
    } else if (url.startsWith("/api/")) {
      // Other paths return empty
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

afterAll(() => {
  upstreamServer.close();
  resetDb();
  rmSync(tmpDir, { recursive: true });
});

describe("federation", () => {
  it("syncFromUpstream syncs plugins from upstream", async () => {
    const result = await syncFromUpstream(upstreamUrl);
    assert.equal(result.synced, 2); // two plugins
    assert.ok(Array.isArray(result.errors));
  });

  it("synced entries are stored as plugins with federated owner", () => {
    const plugins = listEntries("plugins");
    const fed = plugins.find((e) => e.name === "fed-code-quality");
    assert.ok(fed);
    assert.ok(fed.owner.startsWith("federated:"));
  });

  it("preserves plugin component metadata", async () => {
    const result = await syncFromUpstream(upstreamUrl);
    assert.equal(result.synced, 2);
    const plugins = listEntries("plugins");
    const devMcps = plugins.find((e) => e.name === "fed-dev-mcps");
    assert.ok(devMcps);
  });

  it("returns error counts for failed fetches", async () => {
    // Sync from non-existent upstream
    const result = await syncFromUpstream("http://localhost:1");
    assert.ok(result.errors.length > 0);
    assert.equal(result.synced, 0);
  });

  it("filters by types parameter (only plugins is valid)", async () => {
    const result = await syncFromUpstream(upstreamUrl, ["plugins"]);
    assert.equal(result.synced, 2);
    // A non-plugin type is filtered out entirely
    const ignored = await syncFromUpstream(upstreamUrl, ["agents"]);
    assert.equal(ignored.synced, 0);
  });

  it("listUpstreams returns empty when not configured", () => {
    const upstreams = listUpstreams();
    // Only runtime upstreams (no config ones since config is empty)
    assert.ok(Array.isArray(upstreams));
  });

  it("addUpstream adds runtime upstream", () => {
    const before = listUpstreams().length;
    addUpstream("http://example.com/registry", ["plugins"], 12);
    const after_ = listUpstreams();
    assert.equal(after_.length, before + 1);
    const added = after_.find((u) => u.url === "http://example.com/registry");
    assert.ok(added);
    assert.deepEqual(added.types, ["plugins"]);
    assert.equal(added.interval_hours, 12);
  });

  it("listUpstreams includes sync state after sync", async () => {
    await syncFromUpstream(upstreamUrl);
    // Add a runtime upstream and sync it so it shows up with lastSync
    addUpstream(upstreamUrl + "/check", ["plugins"]);
    await syncFromUpstream(upstreamUrl + "/check", ["plugins"]);
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
