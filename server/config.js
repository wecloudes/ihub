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
  firewall: { enabled: false, whitelist: [] },
  security: { notify_via: "terminal", email: "", slack_webhook_url: "" },
  storage: { adapter: "sqlite" },
  plugins: [],
  versioning: { enforce_semver: false, require_major_for_breaking: false },
  federation: { enabled: false, upstreams: [] },
  signing: { enabled: false, key: "" },
  logs: { vlogs_url: "" },
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
    security: {
      notify_via: process.env.IHUB_SECURITY_NOTIFY_VIA || fileConfig.security?.notify_via || DEFAULTS.security.notify_via,
      email: process.env.IHUB_SECURITY_EMAIL || fileConfig.security?.email || DEFAULTS.security.email,
      slack_webhook_url: process.env.IHUB_SECURITY_SLACK_WEBHOOK || fileConfig.security?.slack_webhook_url || DEFAULTS.security.slack_webhook_url,
    },
    storage: {
      adapter: process.env.IHUB_STORAGE_ADAPTER || fileConfig.storage?.adapter || DEFAULTS.storage.adapter,
      ...(fileConfig.storage || {}),
      ...(process.env.IHUB_STORAGE_ADAPTER ? { adapter: process.env.IHUB_STORAGE_ADAPTER } : {}),
    },
    firewall: {
      enabled: envBool("IHUB_FIREWALL_WHITELIST")
        ?? fileConfig.firewall?.enabled
        ?? DEFAULTS.firewall.enabled,
      whitelist: parseWhitelist(
        process.env.IHUB_FIREWALL_WHITELIST,
        fileConfig.firewall?.whitelist,
        DEFAULTS.firewall.whitelist
      ),
    },
    plugins: fileConfig.plugins || DEFAULTS.plugins,
    versioning: {
      enforce_semver: fileConfig.versioning?.enforce_semver ?? DEFAULTS.versioning.enforce_semver,
      require_major_for_breaking: fileConfig.versioning?.require_major_for_breaking ?? DEFAULTS.versioning.require_major_for_breaking,
    },
    federation: {
      enabled: fileConfig.federation?.enabled ?? DEFAULTS.federation.enabled,
      upstreams: fileConfig.federation?.upstreams || DEFAULTS.federation.upstreams,
    },
    signing: {
      enabled: envBool("IHUB_SIGNING_KEY")
        ?? fileConfig.signing?.enabled
        ?? DEFAULTS.signing.enabled,
      key: process.env.IHUB_SIGNING_KEY || fileConfig.signing?.key || DEFAULTS.signing.key,
    },
    logs: {
      vlogs_url: process.env.IHUB_VLOGS_URL || fileConfig.logs?.vlogs_url || DEFAULTS.logs.vlogs_url,
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
  console.log(`  Storage:    ${config.storage.adapter}${config.storage.adapter !== "sqlite" ? ` (${config.storage.bucket || config.storage.root || ""})` : ""}`);
  console.log(`  Security:   notify via ${config.security.notify_via}`);
  console.log(`  Firewall:   ${config.firewall.enabled ? `enabled (${config.firewall.whitelist.length} IPs)` : "disabled"}`);
  console.log(`  Federation: ${config.federation?.enabled ? `enabled (${config.federation.upstreams.length} upstreams)` : "disabled"}`);
  console.log(`  Signing:    ${config.signing?.enabled ? "enabled" : "disabled"}`);
  console.log(`  Logs:       ${config.logs?.vlogs_url ? `VictoriaLogs (${config.logs.vlogs_url})` : "disabled"}`);
}

const VALID_NOTIFY = ["terminal", "slack", "email"];

/**
 * Validate config at startup. Returns array of error strings.
 */
export function validateConfig(config) {
  const errors = [];

  if (!VALID_NOTIFY.includes(config.security.notify_via)) {
    errors.push(`security.notify_via must be one of: ${VALID_NOTIFY.join(", ")} (got "${config.security.notify_via}")`);
  }

  if (config.security.notify_via === "slack" && !config.security.slack_webhook_url) {
    errors.push(`security.notify_via is "slack" but security.slack_webhook_url is not set. Set it in ihub.config.json or IHUB_SECURITY_SLACK_WEBHOOK env var.`);
  }

  if (config.security.notify_via === "email" && !config.security.email) {
    errors.push(`security.notify_via is "email" but security.email is not set. Set it in ihub.config.json or IHUB_SECURITY_EMAIL env var.`);
  }

  if (config.security.notify_via === "email" && config.security.email && !process.env.SMTP_HOST) {
    errors.push(`security.notify_via is "email" but SMTP_HOST is not set. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars.`);
  }

  return errors;
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

function parseWhitelist(envVal, fileVal, defaultVal) {
  if (envVal) return envVal.split(",").map((ip) => ip.trim()).filter(Boolean);
  if (Array.isArray(fileVal) && fileVal.length > 0) return fileVal;
  return defaultVal;
}

function envBool(key) {
  const val = process.env[key];
  if (val === undefined || val === "") return undefined;
  // If the env var exists and has a value, the feature is enabled
  return true;
}
