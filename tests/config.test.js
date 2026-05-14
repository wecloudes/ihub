import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadServerConfig, resetConfig } from "../server/config.js";

describe("config", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ihub-config-test-"));
    resetConfig();
    // Clear env vars that affect config
    delete process.env.IHUB_PORT;
    delete process.env.IHUB_DB_PATH;
    delete process.env.AUTH0_DOMAIN;
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.IHUB_CONFIG;
    delete process.env.IHUB_ADMIN_USERNAME;
    delete process.env.IHUB_ADMIN_PASSWORD;
  });

  it("loads defaults when no config file", () => {
    process.env.IHUB_CONFIG = join(tmpDir, "nonexistent.json");
    const cfg = loadServerConfig();
    assert.equal(cfg.server.port, 3000);
    assert.equal(cfg.server.db_path, "./ihub.db");
    assert.equal(cfg.admin.username, "");
    assert.equal(cfg.admin.password, "");
    assert.equal(cfg.auth0.enabled, false);
    assert.equal(cfg.slack.enabled, false);
    assert.equal(cfg.metrics.enabled, true);
    assert.equal(cfg.audit.enabled, true);
    assert.equal(cfg.audit.log_anonymous, true);
  });

  it("loads from config file", () => {
    const configPath = join(tmpDir, "ihub.config.json");
    writeFileSync(configPath, JSON.stringify({
      server: { port: 8080, db_path: "/data/test.db" },
      admin: { username: "root", password: "secret-key-123" },
      auth0: { enabled: true, domain: "test.auth0.com" },
      slack: { enabled: true, webhook_url: "https://hooks.slack.com/test" },
      metrics: { enabled: false },
      audit: { enabled: true, log_anonymous: false },
    }));
    process.env.IHUB_CONFIG = configPath;
    resetConfig();

    const cfg = loadServerConfig();
    assert.equal(cfg.server.port, 8080);
    assert.equal(cfg.server.db_path, "/data/test.db");
    assert.equal(cfg.admin.username, "root");
    assert.equal(cfg.admin.password, "secret-key-123");
    assert.equal(cfg.auth0.enabled, true);
    assert.equal(cfg.auth0.domain, "test.auth0.com");
    assert.equal(cfg.slack.enabled, true);
    assert.equal(cfg.metrics.enabled, false);
    assert.equal(cfg.audit.log_anonymous, false);
  });

  it("env vars override config file", () => {
    const configPath = join(tmpDir, "ihub.config.json");
    writeFileSync(configPath, JSON.stringify({
      server: { port: 8080 },
    }));
    process.env.IHUB_CONFIG = configPath;
    process.env.IHUB_PORT = "9090";
    resetConfig();

    const cfg = loadServerConfig();
    assert.equal(cfg.server.port, 9090);
  });

  it("IHUB_ADMIN env vars override config", () => {
    process.env.IHUB_CONFIG = join(tmpDir, "nope.json");
    process.env.IHUB_ADMIN_USERNAME = "superadmin";
    process.env.IHUB_ADMIN_PASSWORD = "env-key-456";
    resetConfig();

    const cfg = loadServerConfig();
    assert.equal(cfg.admin.username, "superadmin");
    assert.equal(cfg.admin.password, "env-key-456");
  });

  it("AUTH0_DOMAIN env enables auth0", () => {
    process.env.IHUB_CONFIG = join(tmpDir, "nope.json");
    process.env.AUTH0_DOMAIN = "myapp.auth0.com";
    resetConfig();

    const cfg = loadServerConfig();
    assert.equal(cfg.auth0.enabled, true);
    assert.equal(cfg.auth0.domain, "myapp.auth0.com");
  });

  it("SLACK_WEBHOOK_URL env enables slack", () => {
    process.env.IHUB_CONFIG = join(tmpDir, "nope.json");
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
    resetConfig();

    const cfg = loadServerConfig();
    assert.equal(cfg.slack.enabled, true);
  });

  it("handles partial config file", () => {
    const configPath = join(tmpDir, "partial.json");
    writeFileSync(configPath, JSON.stringify({
      server: { port: 4000 },
    }));
    process.env.IHUB_CONFIG = configPath;
    resetConfig();

    const cfg = loadServerConfig();
    assert.equal(cfg.server.port, 4000);
    assert.equal(cfg.server.db_path, "./ihub.db"); // default
    assert.equal(cfg.auth0.enabled, false); // default
    assert.equal(cfg.metrics.enabled, true); // default
  });
});
