#!/usr/bin/env node

import { createServer } from "http";
import { loadServerConfig, printConfig } from "./config.js";
import { handleRequest } from "./routes.js";
import { sendWeeklyDigest } from "./slack.js";
import { getDb, getUser, registerUser, getUserCount } from "./db.js";
import { randomBytes } from "crypto";

const config = loadServerConfig();

// Set env vars for modules that read them directly (auth0.js, slack.js, db.js)
if (config.server.db_path) process.env.IHUB_DB_PATH = config.server.db_path;
if (config.auth0.domain) process.env.AUTH0_DOMAIN = config.auth0.domain;
if (config.auth0.audience) process.env.AUTH0_AUDIENCE = config.auth0.audience;
if (config.slack.webhook_url) process.env.SLACK_WEBHOOK_URL = config.slack.webhook_url;

// Seed admin user from config if configured and not yet created
if (config.admin.username) {
  getDb(); // ensure DB is initialized
  if (!getUser(config.admin.username)) {
    const apiKey = config.admin.password || randomBytes(24).toString("hex");
    registerUser(config.admin.username, apiKey, "admin");
    console.log(`Admin user "${config.admin.username}" created (API key: ${apiKey})`);
  }
} else if (getUserCount() === 0) {
  // No admin in config and no users exist — first registered user will become admin
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: "Internal server error" }));
  });
});

server.listen(config.server.port, () => {
  console.log(`ihub registry running on http://localhost:${config.server.port}`);
  printConfig(config);

  if (config.slack.enabled && config.slack.webhook_url) {
    const intervalMs = config.slack.digest_interval_hours * 3600000;
    setInterval(() => {
      sendWeeklyDigest(getDb()).catch((err) => console.error("Digest error:", err));
    }, intervalMs);
    console.log(`Slack digest scheduled (every ${config.slack.digest_interval_hours}h)`);
  }
});
