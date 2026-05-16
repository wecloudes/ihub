import {
  upsertEntry,
  getEntry,
  getEntryOwner,
  listEntries,
  listVersions,
  deleteEntry,
  searchEntries,
  registerUser,
  authenticateKey,
  getUser,
  getUserCount,
  setUserRole,
  backupDb,
  restoreDb,
  addComment,
  getComments,
  deleteComment,
  getAverageRating,
  logAction as _logAction,
  getAuditLog,
  changeApiKey,
  upsertAttachment,
  getAttachments,
  getAttachmentContent,
  deleteAttachments,
  setEntryStatus,
  listBlockedEntries,
  getDb,
  addWebhook,
  getWebhooks,
  deleteWebhook,
} from "./db.js";
import { sendWebhook } from "./webhooks.js";
import { inc, gauge, serialize } from "./metrics.js";
import { loadServerConfig } from "./config.js";
import { maskSensitiveData } from "./sensitive.js";
import { isAuth0Enabled, verifyAuth0Token, getAuth0Username } from "./auth0.js";
import { notifyPush, sendWeeklyDigest, isSlackEnabled } from "./slack.js";
import { sendSecurityAlert } from "./security-alert.js";
import { runBeforePush, runAfterPush, runBeforePull } from "./plugins.js";
import { enforcePolicy } from "./versioning.js";
import { handleUiRequest } from "./ui.js";
import { randomBytes } from "crypto";
import { createReadStream, unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { syncFromUpstream, listUpstreams } from "./federation.js";
import { signArtifact, verifySignature, getSignatureHeader, getSigningKey, isSigningEnabled } from "./signing.js";

function logAction(entry) {
  const cfg = loadServerConfig();
  if (!cfg.audit.enabled) return;
  if (!cfg.audit.log_anonymous && (entry.username === "anonymous" || !entry.username)) return;
  _logAction(entry);
}

const VALID_TYPES = ["agents", "skills", "rules", "memories", "prompts"];
const VALID_ROLES = ["user", "admin"];

function refreshGauges() {
  const db = getDb();

  // Entries by type
  for (const type of VALID_TYPES) {
    const row = db.prepare("SELECT COUNT(DISTINCT name) as c FROM entries WHERE type = ?").get(type);
    gauge("ihub_entries_count", { type }, row.c);
  }

  // Entries by project and type
  const byProject = db.prepare(
    "SELECT COALESCE(owner, 'unknown') as owner, type, COUNT(DISTINCT name) as c FROM entries GROUP BY owner, type"
  ).all();
  // Use meta for project — query entries that have a project in their meta JSON
  const allEntries = db.prepare(
    "SELECT type, name, meta FROM entries GROUP BY type, name"
  ).all();
  const projectCounts = {};
  for (const e of allEntries) {
    let project = "(none)";
    try {
      const meta = JSON.parse(e.meta || "{}");
      if (meta.project) project = meta.project;
    } catch {}
    const key = `${project}|${e.type}`;
    projectCounts[key] = (projectCounts[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(projectCounts)) {
    const [project, type] = key.split("|");
    gauge("ihub_entries_by_project_count", { project, type }, count);
  }

  // Entries by name (version count per artifact)
  const byName = db.prepare(
    "SELECT type, name, COUNT(*) as c FROM entries GROUP BY type, name"
  ).all();
  for (const row of byName) {
    gauge("ihub_entries_by_name_count", { type: row.type, name: row.name }, row.c);
  }

  // Comments by artifact
  const commentsByArtifact = db.prepare(
    "SELECT type, name, COUNT(*) as c FROM comments GROUP BY type, name"
  ).all();
  for (const row of commentsByArtifact) {
    gauge("ihub_comments_by_artifact_count", { type: row.type, name: row.name }, row.c);
  }

  // Comments by user
  const commentsByUser = db.prepare(
    "SELECT username, COUNT(*) as c FROM comments GROUP BY username"
  ).all();
  for (const row of commentsByUser) {
    gauge("ihub_comments_by_user_count", { user: row.username }, row.c);
  }

  gauge("ihub_users_count", {}, getUserCount());
  const commentsRow = db.prepare("SELECT COUNT(*) as c FROM comments").get();
  gauge("ihub_comments_count", {}, commentsRow.c);
}

// Firewall config — loaded once, immutable for the lifetime of the process
let _firewallConfig = null;

function getFirewallConfig() {
  if (!_firewallConfig) {
    const cfg = loadServerConfig();
    _firewallConfig = Object.freeze({
      enabled: cfg.firewall.enabled,
      whitelist: Object.freeze([...cfg.firewall.whitelist]),
    });
  }
  return _firewallConfig;
}

function normalizeIp(ip) {
  if (!ip) return "";
  // Strip IPv6 prefix for IPv4-mapped addresses (::ffff:192.168.1.1 → 192.168.1.1)
  return ip.replace(/^::ffff:/, "");
}

function isIpAllowed(ip) {
  const fw = getFirewallConfig();
  if (!fw.enabled) return true;
  const normalized = normalizeIp(ip);
  return fw.whitelist.some((allowed) => {
    // Exact match
    if (normalized === allowed) return true;
    // CIDR support: 10.0.0.0/8, 192.168.0.0/16, etc.
    if (allowed.includes("/")) return matchCidr(normalized, allowed);
    // Wildcard: 192.168.1.*
    if (allowed.includes("*")) {
      const regex = new RegExp("^" + allowed.replace(/\./g, "\\.").replace(/\*/g, "\\d{1,3}") + "$");
      return regex.test(normalized);
    }
    return false;
  });
}

function matchCidr(ip, cidr) {
  const [range, bits] = cidr.split("/");
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1) >>> 0;
  const ipNum = ipToInt(ip);
  const rangeNum = ipToInt(range);
  if (ipNum === null || rangeNum === null) return false;
  return (ipNum & mask) === (rangeNum & mask);
}

function ipToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  return parts.reduce((sum, octet) => (sum << 8) + parseInt(octet, 10), 0) >>> 0;
}

export async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  // Firewall — check before anything else
  const clientIp = getClientIp(req);
  if (!isIpAllowed(clientIp)) {
    inc("ihub_firewall_blocked_total", { ip: normalizeIp(clientIp) });
    logAction({ ip: clientIp, action: "firewall-blocked", username: null, role: null, detail: `${req.method} /${parts.join("/")}` });
    return sendError(res, 403, "Forbidden — IP not whitelisted");
  }

  inc("ihub_http_requests_total", { method: req.method, path: `/${parts[0] || ""}` });

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return send(res, 204);
  }

  // Web UI
  if (url.pathname.startsWith("/ui")) {
    return handleUiRequest(req, res, url);
  }

  // GET /api/config — admin only, show active server config
  if (parts[0] === "config" && req.method === "GET") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");
    const cfg = loadServerConfig();
    // Redact sensitive values
    const safe = {
      server: { port: cfg.server.port, db_path: cfg.server.db_path },
      admin: { username: cfg.admin.username || "(first registered user)" },
      auth0: { enabled: cfg.auth0.enabled, domain: cfg.auth0.domain, audience: cfg.auth0.audience },
      slack: { enabled: cfg.slack.enabled, digest_interval_hours: cfg.slack.digest_interval_hours },
      metrics: cfg.metrics,
      audit: cfg.audit,
      firewall: { enabled: cfg.firewall.enabled, whitelist_count: cfg.firewall.whitelist.length },
    };
    return sendJson(res, 200, safe);
  }

  // GET /api/ping — health check
  if (parts[0] === "ping" && req.method === "GET") {
    return sendJson(res, 200, { pong: true, timestamp: new Date().toISOString() });
  }

  // GET /metrics — Prometheus endpoint
  if (parts[0] === "metrics" && req.method === "GET") {
    const cfg = loadServerConfig();
    if (!cfg.metrics.enabled) return sendError(res, 404, "Metrics disabled");
    refreshGauges();
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
    return res.end(serialize());
  }

  // POST /api/register — create a new user
  if (parts[0] === "register" && req.method === "POST") {
    return readBody(req).then((data) => {
      if (!data.username) return sendError(res, 400, "Missing username");
      if (getUser(data.username)) return sendError(res, 409, `User "${data.username}" already exists`);

      const cfg = loadServerConfig();
      // Admin from config is already seeded at startup — new registrations get "user"
      // If no admin configured, first user still becomes admin (backward compat)
      const role = (!cfg.admin.username && getUserCount() === 0) ? "admin" : "user";
      const apiKey = randomBytes(24).toString("hex");
      registerUser(data.username, apiKey, role);
      inc("ihub_register_total", { role });
      logAction({ ip: getClientIp(req), action: "register", username: data.username, role });
      sendWebhook("register", { type: null, name: null, version: null, username: data.username });
      return sendJson(res, 201, { ok: true, username: data.username, api_key: apiKey, role });
    }).catch(() => sendError(res, 400, "Invalid JSON body"));
  }

  // GET /api/whoami — show current user + role
  if (parts[0] === "whoami" && req.method === "GET") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    return sendJson(res, 200, { username: user.username, role: user.role });
  }

  // POST /api/account/password — change API key (password)
  if (parts[0] === "account" && parts[1] === "password" && req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");

    return readBody(req).then((data) => {
      if (!data.new_password || data.new_password.length < 8) {
        return sendError(res, 400, "New password must be at least 8 characters");
      }
      changeApiKey(user.username, data.new_password);
      logAction({ ip: getClientIp(req), action: "change-password", username: user.username, role: user.role });
      return sendJson(res, 200, { ok: true, message: "Password updated" });
    }).catch(() => sendError(res, 400, "Invalid JSON body"));
  }

  // GET /api/backup — admin only, download DB
  if (parts[0] === "backup" && req.method === "GET") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    const tmpPath = join(tmpdir(), `ihub-backup-${Date.now()}.db`);
    return backupDb(tmpPath).then(() => {
      inc("ihub_backup_total", { user: user.username });
      logAction({ ip: getClientIp(req), action: "backup", username: user.username, role: user.role });
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="ihub-backup.db"`,
      });
      const stream = createReadStream(tmpPath);
      stream.pipe(res);
      stream.on("end", () => { try { unlinkSync(tmpPath); } catch {} });
      stream.on("error", () => { try { unlinkSync(tmpPath); } catch {} });
    }).catch((err) => sendError(res, 500, `Backup failed: ${err.message}`));
  }

  // POST /api/backup — admin only, restore DB from uploaded file
  if (parts[0] === "backup" && req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    return new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 100) {
          resolve(sendError(res, 400, "Invalid backup file — too small"));
          return;
        }
        // SQLite magic bytes: "SQLite format 3\0"
        const header = buf.slice(0, 16).toString("ascii");
        if (!header.startsWith("SQLite format 3")) {
          resolve(sendError(res, 400, "Invalid backup file — not a SQLite database"));
          return;
        }
        const tmpPath = join(tmpdir(), `ihub-restore-${Date.now()}.db`);
        writeFileSync(tmpPath, buf);
        try {
          restoreDb(tmpPath);
          try { unlinkSync(tmpPath); } catch {}
          logAction({ ip: getClientIp(req), action: "restore", username: user.username, role: user.role, detail: `${buf.length} bytes` });
          resolve(sendJson(res, 200, { ok: true, message: "Database restored", size: buf.length }));
        } catch (err) {
          try { unlinkSync(tmpPath); } catch {}
          resolve(sendError(res, 500, `Restore failed: ${err.message}`));
        }
      });
    });
  }

  // POST /api/users/:username/role — admin only, set user role
  if (parts[0] === "users" && parts[2] === "role" && req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    const targetUsername = parts[1];
    return readBody(req).then((data) => {
      if (!data.role || !VALID_ROLES.includes(data.role)) {
        return sendError(res, 400, `Role must be one of: ${VALID_ROLES.join(", ")}`);
      }
      if (!getUser(targetUsername)) return sendError(res, 404, `User "${targetUsername}" not found`);
      setUserRole(targetUsername, data.role);
      inc("ihub_role_change_total", { target: targetUsername, role: data.role, by: user.username });
      logAction({ ip: getClientIp(req), action: "set-role", username: user.username, role: user.role, detail: `${targetUsername} -> ${data.role}` });
      return sendJson(res, 200, { ok: true, username: targetUsername, role: data.role });
    }).catch(() => sendError(res, 400, "Invalid JSON body"));
  }

  // GET /api/audit — admin only, paginated audit log
  if (parts[0] === "audit" && req.method === "GET") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const filterUser = url.searchParams.get("user") || undefined;
    const filterAction = url.searchParams.get("action") || undefined;

    const result = getAuditLog({ limit, offset, username: filterUser, action: filterAction });
    return sendJson(res, 200, result);
  }

  // POST /api/digest — admin only, trigger weekly digest to Slack
  if (parts[0] === "digest" && req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");
    if (!isSlackEnabled()) return sendError(res, 400, "Slack not configured (set SLACK_WEBHOOK_URL)");

    await sendWeeklyDigest(getDb());
    logAction({ ip: getClientIp(req), action: "digest", username: user.username, role: user.role });
    return sendJson(res, 200, { ok: true, message: "Weekly digest sent to Slack" });
  }

  // POST /api/federation/sync — admin only, trigger manual federation sync
  if (parts[0] === "federation" && parts[1] === "sync" && req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    const cfg = loadServerConfig();
    if (!cfg.federation.enabled) return sendError(res, 400, "Federation not enabled");

    const upstreams = listUpstreams();
    if (upstreams.length === 0) return sendError(res, 400, "No upstreams configured");

    const results = [];
    for (const upstream of upstreams) {
      const result = await syncFromUpstream(upstream.url, upstream.types);
      results.push({ url: upstream.url, ...result });
    }
    logAction({ ip: getClientIp(req), action: "federation-sync", username: user.username, role: user.role, detail: `${results.reduce((s, r) => s + r.synced, 0)} synced` });
    return sendJson(res, 200, { ok: true, results });
  }

  // GET /api/federation/status — admin only, show upstream status
  if (parts[0] === "federation" && parts[1] === "status" && req.method === "GET") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    const cfg = loadServerConfig();
    return sendJson(res, 200, { enabled: cfg.federation.enabled, upstreams: listUpstreams() });
  }

  // GET /api/webhooks — admin only, list webhooks
  if (parts[0] === "webhooks" && req.method === "GET") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");
    return sendJson(res, 200, getWebhooks());
  }

  // POST /api/webhooks — admin only, create webhook
  if (parts[0] === "webhooks" && req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    return readBody(req).then((data) => {
      if (!data.url) return sendError(res, 400, "Missing url");
      if (!data.events || !Array.isArray(data.events) || data.events.length === 0) {
        return sendError(res, 400, "Missing or invalid events array");
      }
      const id = addWebhook(data.url, data.events, data.secret);
      return sendJson(res, 201, { ok: true, id, url: data.url, events: data.events });
    }).catch(() => sendError(res, 400, "Invalid JSON body"));
  }

  // DELETE /api/webhooks/:id — admin only, delete webhook
  if (parts[0] === "webhooks" && parts[1] && req.method === "DELETE") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    const id = parseInt(parts[1], 10);
    const deleted = deleteWebhook(id);
    if (!deleted) return sendError(res, 404, "Webhook not found");
    return sendJson(res, 200, { ok: true, deleted: id });
  }

  // GET /api/blocked — admin only, list blocked artifacts
  if (parts[0] === "blocked" && req.method === "GET") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");
    return sendJson(res, 200, listBlockedEntries());
  }

  // POST /api/:type/:name/approve — admin only, unblock artifact
  if (parts[2] === "approve" && req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");
    if (user.role !== "admin") return sendError(res, 403, "Admin access required");

    const artType = parts[0];
    const artName = parts[1];
    const entry = await getEntry(artType, artName);
    if (!entry) return sendError(res, 404, `Not found: ${artType}/${artName}`);
    if (entry.status === "available") return sendJson(res, 200, { ok: true, message: "Already available" });

    setEntryStatus(artType, artName, "available");
    logAction({
      ip: getClientIp(req),
      action: "approve",
      username: user.username,
      role: user.role,
      type: artType,
      name: artName,
      detail: "UNBLOCKED — admin approved",
    });
    sendWebhook("approve", { type: artType, name: artName, version: entry.version, username: user.username });
    return sendJson(res, 200, { ok: true, type: artType, name: artName, status: "available" });
  }

  // GET /api/search?q=...
  if (parts[0] === "search" && req.method === "GET") {
    const q = url.searchParams.get("q");
    if (!q) return sendError(res, 400, "Missing query parameter ?q=");
    inc("ihub_search_total", {});
    const user = await authenticate(req);
    logAction({ ip: getClientIp(req), action: "search", username: user?.username || "anonymous", role: user?.role, detail: q });
    const results = searchEntries(q);
    return sendJson(res, 200, results);
  }

  const type = parts[0];
  const name = parts[1];
  const sub = parts[2]; // "versions" | "comments"
  const subId = parts[3]; // comment id for DELETE

  if (!type || !VALID_TYPES.includes(type)) {
    return sendError(res, 400, `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`);
  }

  // GET /api/:type — list all
  if (!name && req.method === "GET") {
    inc("ihub_list_total", { type });
    const user = await authenticate(req);
    logAction({ ip: getClientIp(req), action: "list", username: user?.username || "anonymous", role: user?.role, type });
    const entries = listEntries(type);
    return sendJson(res, 200, entries);
  }

  if (!name) {
    return sendError(res, 400, "Missing entry name");
  }

  // GET /api/:type/:name/versions
  if (sub === "versions" && req.method === "GET") {
    const user = await authenticate(req);
    logAction({ ip: getClientIp(req), action: "versions", username: user?.username || "anonymous", role: user?.role, type, name });
    const versions = listVersions(type, name);
    return sendJson(res, 200, versions);
  }

  // GET /api/:type/:name/comments — list comments
  if (sub === "comments" && req.method === "GET") {
    const user = await authenticate(req);
    logAction({ ip: getClientIp(req), action: "view-comments", username: user?.username || "anonymous", role: user?.role, type, name });
    const comments = getComments(type, name);
    const rating = getAverageRating(type, name);
    return sendJson(res, 200, { comments, rating });
  }

  // POST /api/:type/:name/comments — add comment
  if (sub === "comments" && req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");

    const entry = await getEntry(type, name);
    if (!entry) return sendError(res, 404, `Not found: ${type}/${name}`);

    return readBody(req).then((data) => {
      if (!data.body) return sendError(res, 400, "Missing comment body");
      const rating = parseInt(data.rating, 10);
      if (!rating || rating < 1 || rating > 5) return sendError(res, 400, "Rating must be 1-5");

      addComment({ type, name, username: user.username, rating, body: data.body });
      inc("ihub_comment_total", { type, name, user: user.username });
      logAction({ ip: getClientIp(req), action: "comment", username: user.username, role: user.role, type, name, detail: `${rating}/5` });
      sendWebhook("comment", { type, name, version: null, username: user.username });
      return sendJson(res, 201, { ok: true, username: user.username, rating });
    }).catch(() => sendError(res, 400, "Invalid JSON body"));
  }

  // DELETE /api/:type/:name/comments/:id — delete own comment
  if (sub === "comments" && subId && req.method === "DELETE") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");

    const result = deleteComment(parseInt(subId, 10), user.username);
    if (result.error === "not_found") return sendError(res, 404, "Comment not found");
    if (result.error === "forbidden") return sendError(res, 403, `Only "${result.owner}" can delete this comment`);
    inc("ihub_comment_delete_total", { type, name, user: user.username });
    logAction({ ip: getClientIp(req), action: "delete-comment", username: user.username, role: user.role, type, name, detail: `comment #${subId}` });
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/:type/:name/attachments/:filepath — download a single attachment
  if (sub === "attachments" && req.method === "GET") {
    const filepath = parts.slice(3).join("/");
    if (!filepath) {
      // List attachments
      const attachments = await getAttachments(type, name);
      return sendJson(res, 200, { attachments });
    }
    const content = await getAttachmentContent(type, name, filepath);
    if (!content) return sendError(res, 404, `Attachment not found: ${filepath}`);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filepath.split("/").pop()}"`,
      "Content-Length": content.length,
    });
    return res.end(content);
  }

  // GET /api/:type/:name
  if (req.method === "GET") {
    const version = url.searchParams.get("version");
    const entry = await getEntry(type, name, version);
    if (!entry) return sendError(res, 404, `Not found: ${type}/${name}`);
    const user = await authenticate(req);

    // Blocked artifacts: only visible to admin or owner
    if (entry.status === "blocked") {
      if (!user || (user.role !== "admin" && user.username !== entry.owner)) {
        return sendError(res, 403, `Artifact ${type}/${name} is blocked — pending admin approval`);
      }
    }

    const isPull = req.headers["x-ihub-action"] === "pull";
    const action = isPull ? "pull" : "view";
    inc("ihub_view_total", { type, name, user: user?.username || "anonymous" });
    if (isPull) {
      inc("ihub_pull_total", { type, name, user: user?.username || "anonymous" });
      sendWebhook("pull", { type, name, version: entry.version, username: user?.username || "anonymous" });
    }
    logAction({ ip: getClientIp(req), action, username: user?.username || "anonymous", role: user?.role, type, name });

    // Plugin: beforePull hook — may transform body/meta
    const transformed = await runBeforePull({ type, name, body: entry.body, meta: entry.meta });
    const responseEntry = { ...entry, body: transformed.body, meta: transformed.meta };

    // Signing: verify signature if enabled
    let verified;
    if (isSigningEnabled()) {
      const sigKey = getSigningKey();
      const signature = getSignatureHeader(responseEntry);
      if (signature) {
        verified = verifySignature(responseEntry.body, signature, sigKey).valid;
      } else {
        verified = false; // No signature present but signing is enabled
      }
    }

    const attachments = await getAttachments(type, name);
    const response = { ...responseEntry, attachments };
    if (verified !== undefined) response.verified = verified;
    return sendJson(res, 200, response);
  }

  // POST /api/:type/:name — push
  if (req.method === "POST") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");

    return readBody(req).then(async (data) => {
      if (!data.version) return sendError(res, 400, "Missing version");

      // Plugin: beforePush hook
      const pluginResult = await runBeforePush({ type, name, version: data.version, body: data.body || "", meta: data.meta || {}, tags: data.tags || [] });
      if (pluginResult.error) return sendError(res, 400, pluginResult.error);

      // Versioning policy enforcement
      const cfg = loadServerConfig();
      let versioningWarnings;
      if (cfg.versioning.enforce_semver || cfg.versioning.require_major_for_breaking) {
        const currentEntry = await getEntry(type, name);
        const policyResult = enforcePolicy(currentEntry, { version: data.version, body: data.body || "" }, cfg.versioning);
        if (policyResult.error) return sendError(res, 400, policyResult.error);
        if (policyResult.warnings && policyResult.warnings.length > 0) {
          versioningWarnings = policyResult.warnings;
        }
      }

      // Server-side sensitive data scan and mask
      let body = data.body || "";
      let sensitiveCount = 0;
      const sensitiveTypes = [];
      const { maskedContent, findings } = maskSensitiveData(body);
      if (findings.length > 0) {
        body = maskedContent;
        sensitiveCount = findings.length;
        const uniqueTypes = [...new Set(findings.map((f) => f.type))];
        sensitiveTypes.push(...uniqueTypes);
        // Track per finding type
        for (const f of findings) {
          inc("ihub_sensitive_detected_total", { type, sensitive_type: f.type, user: user.username });
        }
      }

      // Signing: compute HMAC signature and store in meta
      let meta = data.meta || {};
      if (isSigningEnabled()) {
        const sigKey = getSigningKey();
        const signature = signArtifact(body, sigKey);
        meta = { ...meta, _signature: signature };
      }

      const result = await upsertEntry({
        type,
        name,
        version: data.version,
        description: data.description || "",
        tags: data.tags || [],
        meta,
        body,
        author: data.author || "",
        owner: user.username,
      });
      if (result.error === "forbidden") {
        return sendError(res, 403, `Only the owner "${result.existingOwner}" can update ${type}/${name}`);
      }

      // Handle attachments
      const attachmentCount = Array.isArray(data.attachments) ? data.attachments.length : 0;
      if (data.attachments) {
        for (const att of data.attachments) {
          if (!att.filepath || !att.content) continue;
          await upsertAttachment({ type, name, filepath: att.filepath, content: att.content });
        }
      }

      inc("ihub_push_total", { type, name, user: user.username });
      const detail = `v${data.version}` + (attachmentCount ? ` +${attachmentCount} files` : "") + (sensitiveCount ? ` [SENSITIVE:${sensitiveCount} masked]` : "");
      logAction({ ip: getClientIp(req), action: "push", username: user.username, role: user.role, type, name, detail });

      // Sensitive data: block artifact + alert security team
      if (sensitiveCount > 0) {
        setEntryStatus(type, name, "blocked");
        logAction({
          ip: getClientIp(req),
          action: "sensitive-blocked",
          username: user.username,
          role: user.role,
          type,
          name,
          detail: `BLOCKED — ${sensitiveCount} finding(s): ${sensitiveTypes.join(", ")}`,
        });
        // Send security alert (async, non-blocking)
        sendSecurityAlert({ type, name, username: user.username, findings }).catch(() => {});
      }

      sendWebhook("push", { type, name, version: data.version, username: user.username });
      notifyPush({ type, name, version: data.version, owner: user.username });

      // Plugin: afterPush hook (fire-and-forget)
      runAfterPush({ type, name, version: data.version, owner: user.username });

      return sendJson(res, 200, {
        ok: true, type, name, version: data.version, owner: user.username,
        attachments: attachmentCount,
        status: sensitiveCount > 0 ? "blocked" : "available",
        sensitive: sensitiveCount > 0 ? { masked: sensitiveCount, types: sensitiveTypes } : undefined,
        warnings: versioningWarnings || undefined,
      });
    }).catch(() => sendError(res, 400, "Invalid JSON body"));
  }

  // DELETE /api/:type/:name — remove
  if (req.method === "DELETE") {
    const user = await authenticate(req);
    if (!user) return sendError(res, 401, "Invalid or missing API key");

    const owner = getEntryOwner(type, name);
    if (owner && owner !== user.username) {
      return sendError(res, 403, `Only the owner "${owner}" can remove ${type}/${name}`);
    }

    const deleted = await deleteEntry(type, name);
    if (!deleted) return sendError(res, 404, `Not found: ${type}/${name}`);
    await deleteAttachments(type, name);
    inc("ihub_remove_total", { type, name, user: user.username });
    logAction({ ip: getClientIp(req), action: "remove", username: user.username, role: user.role, type, name });
    sendWebhook("remove", { type, name, version: null, username: user.username });
    return sendJson(res, 200, { ok: true, deleted: `${type}/${name}` });
  }

  return sendError(res, 405, "Method not allowed");
}

async function authenticate(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/i, "");

  // Try API key first (fast, synchronous)
  const apiKeyUser = authenticateKey(token);
  if (apiKeyUser) return apiKeyUser;

  // Try Auth0 JWT if enabled
  if (isAuth0Enabled()) {
    const payload = await verifyAuth0Token(token);
    if (payload) {
      const username = getAuth0Username(payload);
      // Auto-provision user on first Auth0 login
      let dbUser = getUser(username);
      if (!dbUser) {
        const cfg = loadServerConfig();
        const role = (!cfg.admin.username && getUserCount() === 0) ? "admin" : "user";
        registerUser(username, `auth0:${payload.sub}`, role);
        dbUser = getUser(username);
      }
      return { username: dbUser.username, role: dbUser.role };
    }
  }

  return null;
}

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function send(res, status) {
  res.writeHead(status);
  res.end();
}
