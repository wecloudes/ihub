// Unified config loader.
// Priority: env vars > ihub.config.json > defaults.
// Config file is optional — env vars alone are sufficient.

import { readFileSync } from "fs";
import { join } from "path";

const DEFAULTS = {
  server: { port: 3000, db_path: "./ihub.db" },
  admin: { username: "", password: "" },
  auth0: { enabled: false, domain: "", client_id: "", audience: "ihub-api" },
  slack: { enabled: false, webhook_url: "", digest_interval_hours: 168 },
  metrics: { enabled: true },
  audit: { enabled: true, log_anonymous: true },
};

let _config = null;

export function loadServerConfig() {
  if (_config) return _config;

  // Load config file
  let fileConfig = {};
  const configPath = process.env.IHUB_CONFIG || join(process.cwd(), "ihub.config.json");
  try {
    fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    // Config file is optional
  }

  // Deep merge: defaults <- file <- env
  _config = {
    server: {
      port: envInt("IHUB_PORT") || fileConfig.server?.port || DEFAULTS.server.port,
      db_path: process.env.IHUB_DB_PATH || fileConfig.server?.db_path || DEFAULTS.server.db_path,
    },
    admin: {
      username: process.env.IHUB_ADMIN_USERNAME || fileConfig.admin?.username || DEFAULTS.admin.username,
      password: process.env.IHUB_ADMIN_PASSWORD || fileConfig.admin?.password || DEFAULTS.admin.password,
    },
    auth0: {
      enabled: envBool("AUTH0_DOMAIN")
        ?? fileConfig.auth0?.enabled
        ?? DEFAULTS.auth0.enabled,
      domain: process.env.AUTH0_DOMAIN || fileConfig.auth0?.domain || DEFAULTS.auth0.domain,
      client_id: process.env.AUTH0_CLIENT_ID || fileConfig.auth0?.client_id || DEFAULTS.auth0.client_id,
      audience: process.env.AUTH0_AUDIENCE || fileConfig.auth0?.audience || DEFAULTS.auth0.audience,
    },
    slack: {
      enabled: envBool("SLACK_WEBHOOK_URL")
        ?? fileConfig.slack?.enabled
        ?? DEFAULTS.slack.enabled,
      webhook_url: process.env.SLACK_WEBHOOK_URL || fileConfig.slack?.webhook_url || DEFAULTS.slack.webhook_url,
      digest_interval_hours: envInt("IHUB_DIGEST_INTERVAL_HOURS")
        || fileConfig.slack?.digest_interval_hours
        || DEFAULTS.slack.digest_interval_hours,
    },
    metrics: {
      enabled: fileConfig.metrics?.enabled ?? DEFAULTS.metrics.enabled,
    },
    audit: {
      enabled: fileConfig.audit?.enabled ?? DEFAULTS.audit.enabled,
      log_anonymous: fileConfig.audit?.log_anonymous ?? DEFAULTS.audit.log_anonymous,
    },
  };

  return _config;
}

/**
 * Print enabled features to stdout on startup.
 */
export function printConfig(config) {
  console.log(`ihub server config:`);
  console.log(`  Port:       ${config.server.port}`);
  console.log(`  Database:   ${config.server.db_path}`);
  console.log(`  Admin:      ${config.admin.username ? config.admin.username : "(first registered user)"}`);
  console.log(`  Auth0:      ${config.auth0.enabled ? `enabled (${config.auth0.domain})` : "disabled"}`);
  console.log(`  Slack:      ${config.slack.enabled ? "enabled" : "disabled"}`);
  console.log(`  Metrics:    ${config.metrics.enabled ? "enabled" : "disabled"}`);
  console.log(`  Audit:      ${config.audit.enabled ? "enabled" : "disabled"} (anonymous: ${config.audit.log_anonymous})`);
}

/**
 * Reset cached config (for testing).
 */
export function resetConfig() {
  _config = null;
}

function envInt(key) {
  const val = process.env[key];
  return val ? parseInt(val, 10) : undefined;
}

function envBool(key) {
  const val = process.env[key];
  if (val === undefined || val === "") return undefined;
  // If the env var exists and has a value, the feature is enabled
  return true;
}
