import { describe, it, beforeAll, afterAll, beforeEach } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createServer } from "http";

const tmpDir = mkdtempSync(join(tmpdir(), "ihub-fed-mcp-test-"));
process.env.IHUB_DB_PATH = join(tmpDir, "test.db");
writeFileSync(join(tmpDir, "config.json"), JSON.stringify({}));
process.env.IHUB_CONFIG = join(tmpDir, "config.json");

const { resetConfig, loadServerConfig, validateConfig } = await import("../server/config.js");
resetConfig();
const { getDb, resetDb, listEntries, getEntry, getAttachments, getAttachmentContent } = await import("../server/db.js");

function clearEntries() {
  getDb().prepare("DELETE FROM entries").run();
}

async function attachmentJson(name, filepath) {
  const content = await getAttachmentContent("plugins", name, filepath);
  assert.ok(content, `missing attachment ${filepath} for ${name}`);
  // SQLite BLOBs come back as Uint8Array — wrap in Buffer to decode as UTF-8.
  return JSON.parse(Buffer.from(content).toString("utf8"));
}

const { syncFromMcpRegistry, syncUpstream, mapMcpServerToEntry, addUpstream, listUpstreams } = await import("../server/federation.js");

// Sample records mirroring the real registry.modelcontextprotocol.io v0 API shape
// (verified live: GET /v0/servers?version=latest&limit&cursor&search).
const RECORDS = [
  {
    server: {
      name: "io.github.acme/remote-tool",
      title: "Remote Tool",
      description: "A remote MCP server",
      version: "1.2.0",
      repository: { url: "https://github.com/acme/remote-tool", source: "github" },
      remotes: [
        {
          type: "streamable-http",
          url: "https://mcp.example.com/mcp",
          headers: [
            { name: "Authorization", value: "Bearer {acme_api_key}", isSecret: true, isRequired: true },
            { name: "X-Secret-Token", isSecret: true },
          ],
        },
      ],
    },
    _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true } },
  },
  {
    server: {
      name: "io.github.acme/npm-tool",
      description: "An npm-packaged MCP server",
      version: "0.3.1",
      packages: [
        {
          registryType: "npm",
          registryBaseUrl: "https://registry.npmjs.org",
          identifier: "@acme/npm-tool-mcp",
          version: "0.3.1",
          runtimeHint: "npx",
          transport: { type: "stdio" },
          runtimeArguments: [{ type: "positional", value: "-y" }],
          packageArguments: [
            { type: "positional", value: "--stdio" },
            { type: "named", name: "--region", value: "eu" },
          ],
          environmentVariables: [
            { name: "ACME_TOKEN", isSecret: true, isRequired: true, description: "API token" },
            { name: "ACME_REGION", description: "Region" },
          ],
        },
      ],
    },
  },
  {
    // Unmappable: only a pypi package
    server: {
      name: "io.github.acme/pypi-only",
      description: "Python-only server",
      version: "1.0.0",
      packages: [{ registryType: "pypi", identifier: "acme-mcp" }],
    },
  },
  {
    // Unmappable: neither remotes nor packages
    server: { name: "io.github.acme/empty", description: "Nothing usable", version: "1.0.0" },
  },
  {
    server: {
      name: "io.github.acme/sse-tool",
      description: "An SSE remote server",
      version: "2.0.0",
      remotes: [{ type: "sse", url: "https://sse.example.com/mcp" }],
    },
  },
];

let registryServer;
let registryUrl;
let requestLog = [];

beforeAll(async () => {
  registryServer = createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    requestLog.push(u.pathname + u.search);
    res.setHeader("Content-Type", "application/json");

    if (u.pathname === "/v0/servers") {
      const limit = parseInt(u.searchParams.get("limit") || "30", 10);
      const offset = parseInt(u.searchParams.get("cursor") || "0", 10);
      let records = RECORDS;
      const search = u.searchParams.get("search");
      if (search) records = records.filter((r) => r.server.name.includes(search));
      const page = records.slice(offset, offset + limit);
      const next = offset + limit < records.length ? String(offset + limit) : undefined;
      res.end(JSON.stringify({
        servers: page,
        metadata: { count: page.length, ...(next ? { nextCursor: next } : {}) },
      }));
    } else {
      res.writeHead(404);
      res.end("{}");
    }
  });

  await new Promise((resolve) => {
    registryServer.listen(0, () => {
      registryUrl = `http://localhost:${registryServer.address().port}`;
      resolve();
    });
  });
});

afterAll(() => {
  registryServer.close();
  resetDb();
  rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  requestLog = [];
});

function jsonBlock(body) {
  const match = body.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(match, "body must contain a fenced json block");
  return JSON.parse(match[1]);
}

describe("federation mcp-registry", () => {
  it("syncs remote and npm records into plugin entries, skips unmappable ones", async () => {
    const result = await syncFromMcpRegistry(registryUrl);
    assert.equal(result.synced, 3); // remote-tool, npm-tool, sse-tool
    assert.equal(result.skipped, 2); // pypi-only, empty
    assert.deepEqual(result.errors, []);
    // Every synced record is stored under the single "plugins" type.
    const plugins = listEntries("plugins");
    assert.equal(plugins.length, 3);
  });

  it("maps a remote record to a plugin with .mcp.json + plugin.json attachments (placeholder headers)", async () => {
    const entry = await getEntry("plugins", "io-github-acme-remote-tool", "1.2.0");
    assert.ok(entry);
    assert.equal(entry.owner, `federated:${registryUrl}`);
    assert.equal(entry.description, "A remote MCP server");
    // meta.components declares the single bundled MCP server.
    assert.deepEqual(entry.meta.components.mcpServers, ["remote-tool"]);

    // Body carries a Claude-native json block for humans.
    const bodyConfig = jsonBlock(entry.body);
    assert.equal(bodyConfig["remote-tool"].type, "http");
    assert.ok(!entry.body.includes("{acme_api_key}"), "no raw template values in body");

    // Canonical config lives in the .mcp.json attachment.
    const mcp = await attachmentJson("io-github-acme-remote-tool", ".mcp.json");
    const server = mcp["remote-tool"];
    assert.ok(server, "block key must be the sanitized shortname");
    assert.equal(server.type, "http");
    assert.equal(server.url, "https://mcp.example.com/mcp");
    // Template value → ${VAR}; secret with no value → ${NAME}
    assert.equal(server.headers.Authorization, "Bearer ${ACME_API_KEY}");
    assert.equal(server.headers["X-Secret-Token"], "${X_SECRET_TOKEN}");

    // Generated Claude plugin manifest.
    const manifest = await attachmentJson("io-github-acme-remote-tool", ".claude-plugin/plugin.json");
    assert.equal(manifest.name, "io-github-acme-remote-tool");
    assert.equal(manifest.version, "1.2.0");
  });

  it("maps an npm record to npx command with ${VAR} env placeholders", async () => {
    const entry = await getEntry("plugins", "io-github-acme-npm-tool", "0.3.1");
    assert.ok(entry);
    assert.deepEqual(entry.meta.components.mcpServers, ["npm-tool"]);
    const mcp = await attachmentJson("io-github-acme-npm-tool", ".mcp.json");
    const server = mcp["npm-tool"];
    assert.ok(server);
    assert.equal(server.command, "npx");
    assert.deepEqual(server.args, ["-y", "@acme/npm-tool-mcp", "--stdio", "--region", "eu"]);
    assert.deepEqual(server.env, { ACME_TOKEN: "${ACME_TOKEN}", ACME_REGION: "${ACME_REGION}" });
  });

  it("maps sse remotes to type sse", async () => {
    const entry = await getEntry("plugins", "io-github-acme-sse-tool", "2.0.0");
    assert.ok(entry);
    const mcp = await attachmentJson("io-github-acme-sse-tool", ".mcp.json");
    assert.equal(mcp["sse-tool"].type, "sse");
  });

  it("enforces the limit — never syncs more than `limit` records", async () => {
    clearEntries();
    const result = await syncFromMcpRegistry(registryUrl, { limit: 2 });
    assert.ok(result.synced + result.skipped <= 2);
    const plugins = listEntries("plugins");
    assert.ok(plugins.length <= 2);
    // Requested page size must not exceed the remaining limit
    assert.ok(requestLog.every((r) => /limit=2/.test(r) || !/limit=/.test(r)));
  });

  it("follows cursor pagination up to the limit", async () => {
    clearEntries();
    const result = await syncFromMcpRegistry(registryUrl, { limit: 3 });
    // Mock pages by numeric cursor: limit 3 → page of 3, then stop (limit reached)
    assert.equal(result.synced + result.skipped, 3);
  });

  it("passes search through to the upstream API", async () => {
    clearEntries();
    const result = await syncFromMcpRegistry(registryUrl, { search: "npm-tool", limit: 10 });
    assert.ok(requestLog.some((r) => r.includes("search=npm-tool")));
    assert.equal(result.synced, 1);
    assert.equal(result.skipped, 0);
  });

  it("re-sync is idempotent — same name+version entries are updated, not duplicated", async () => {
    clearEntries();
    const first = await syncFromMcpRegistry(registryUrl);
    const countAfterFirst = listEntries("plugins").length;
    const second = await syncFromMcpRegistry(registryUrl);
    assert.equal(second.synced, first.synced);
    assert.deepEqual(second.errors, []);
    assert.equal(listEntries("plugins").length, countAfterFirst);
  });

  it("returns errors for unreachable registry", async () => {
    const result = await syncFromMcpRegistry("http://localhost:1");
    assert.equal(result.synced, 0);
    assert.ok(result.errors.length > 0);
  });

  it("syncUpstream dispatches by upstream type", async () => {
    clearEntries();
    const result = await syncUpstream({ url: registryUrl, type: "mcp-registry", limit: 10 });
    assert.equal(result.synced, 3);
    assert.ok(requestLog.some((r) => r.startsWith("/v0/servers")));
  });

  it("listUpstreams reports type, search and limit for mcp-registry upstreams", () => {
    addUpstream(registryUrl, null, 24, { type: "mcp-registry", search: "acme", limit: 5 });
    const upstream = listUpstreams().find((u) => u.url === registryUrl);
    assert.ok(upstream);
    assert.equal(upstream.type, "mcp-registry");
    assert.equal(upstream.search, "acme");
    assert.equal(upstream.limit, 5);
    assert.deepEqual(upstream.types, ["plugins"]);
  });

  it("ihub upstreams default to type ihub in listUpstreams", () => {
    addUpstream("http://example.com/ihub-upstream", ["plugins"]);
    const upstream = listUpstreams().find((u) => u.url === "http://example.com/ihub-upstream");
    assert.equal(upstream.type, "ihub");
    assert.deepEqual(upstream.types, ["plugins"]);
  });
});

describe("mapMcpServerToEntry", () => {
  it("returns null for records without usable remotes or npm packages", () => {
    assert.equal(mapMcpServerToEntry({ name: "x.y/z" }, "http://r"), null);
    assert.equal(mapMcpServerToEntry({ name: "x.y/z", packages: [{ registryType: "oci", identifier: "img" }] }, "http://r"), null);
    assert.equal(mapMcpServerToEntry({}, "http://r"), null);
  });

  it("emits a plugin entry with plugin.json + .mcp.json attachments", () => {
    const entry = mapMcpServerToEntry({
      name: "io.github.acme/remote-tool",
      version: "1.2.0",
      description: "A remote MCP server",
      remotes: [{ type: "streamable-http", url: "https://mcp.example.com/mcp" }],
    }, "http://r");
    assert.ok(entry);
    assert.equal(entry.type, "plugins");
    assert.deepEqual(entry.meta.components.mcpServers, ["remote-tool"]);
    const files = Object.fromEntries(entry.attachments.map((a) => [a.filepath, a]));
    assert.ok(files[".claude-plugin/plugin.json"]);
    assert.ok(files[".mcp.json"]);
    const manifest = JSON.parse(Buffer.from(files[".claude-plugin/plugin.json"].content, "base64").toString("utf8"));
    assert.equal(manifest.name, "io-github-acme-remote-tool");
    const mcp = JSON.parse(Buffer.from(files[".mcp.json"].content, "base64").toString("utf8"));
    assert.equal(mcp["remote-tool"].type, "http");
    assert.equal(mcp["remote-tool"].url, "https://mcp.example.com/mcp");
  });

  it("supports legacy snake_case package fields", () => {
    const entry = mapMcpServerToEntry({
      name: "io.github.legacy/old-tool",
      version: "1.0.0",
      packages: [{
        registry_type: "npm",
        identifier: "old-tool-mcp",
        runtime_hint: "npx",
        package_arguments: [{ type: "positional", value: "--flag" }],
        environment_variables: [{ name: "OLD_KEY", is_secret: true }],
      }],
    }, "http://r");
    assert.ok(entry);
    const files = Object.fromEntries(entry.attachments.map((a) => [a.filepath, a]));
    const mcp = JSON.parse(Buffer.from(files[".mcp.json"].content, "base64").toString("utf8"));
    assert.deepEqual(mcp["old-tool"].args, ["-y", "old-tool-mcp", "--flag"]);
    assert.deepEqual(mcp["old-tool"].env, { OLD_KEY: "${OLD_KEY}" });
  });

  it("uses the sanitized full reverse-DNS name as the plugin name", () => {
    const entry = mapMcpServerToEntry({
      name: "io.github.owner/My_Server",
      version: "1.0.0",
      remotes: [{ type: "streamable-http", url: "https://x.example/mcp" }],
    }, "http://r");
    assert.equal(entry.name, "io-github-owner-my-server");
    assert.equal(entry.type, "plugins");
    assert.equal(entry.author, "io.github.owner");
    assert.ok(entry.body.includes('"my-server"'));
  });
});

describe("federation upstream config validation", () => {
  function baseConfig(upstreams) {
    resetConfig();
    const cfg = loadServerConfig();
    return { ...cfg, federation: { enabled: true, upstreams } };
  }

  it("accepts valid ihub and mcp-registry upstreams", () => {
    const errors = validateConfig(baseConfig([
      { url: "https://hub.example.com" },
      { url: "https://hub2.example.com", type: "ihub" },
      { url: "https://registry.modelcontextprotocol.io", type: "mcp-registry", search: "github", limit: 25 },
    ]));
    assert.deepEqual(errors, []);
  });

  it("rejects unknown upstream type", () => {
    const errors = validateConfig(baseConfig([{ url: "https://x.example", type: "npm" }]));
    assert.ok(errors.some((e) => e.includes("upstreams[0].type")));
  });

  it("rejects missing url and invalid limit", () => {
    const errors = validateConfig(baseConfig([
      { type: "mcp-registry" },
      { url: "https://x.example", type: "mcp-registry", limit: -3 },
    ]));
    assert.ok(errors.some((e) => e.includes('upstreams[0] must have a "url"')));
    assert.ok(errors.some((e) => e.includes("upstreams[1].limit")));
  });
});
