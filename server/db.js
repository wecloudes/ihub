import Database from "better-sqlite3";
import { join } from "path";
import { copyFileSync } from "fs";

const DB_PATH = process.env.IHUB_DB_PATH || join(process.cwd(), "ihub.db");

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    init(db);
  }
  return db;
}

function init(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT,
      tags TEXT,
      meta TEXT,
      body TEXT,
      author TEXT,
      owner TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(type, name, version)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      filepath TEXT NOT NULL,
      content BLOB NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(type, name, filepath)
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_type_name ON attachments(type, name);

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      body TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      username TEXT,
      role TEXT,
      ip TEXT,
      type TEXT,
      name TEXT,
      detail TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      events TEXT NOT NULL,
      secret TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_entries_type_name ON entries(type, name);
    CREATE INDEX IF NOT EXISTS idx_entries_tags ON entries(tags);
    CREATE INDEX IF NOT EXISTS idx_comments_type_name ON comments(type, name);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
  `);

  // Migrations for old schemas
  try {
    db.prepare("SELECT owner FROM entries LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE entries ADD COLUMN owner TEXT");
  }
  try {
    db.prepare("SELECT role FROM users LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }
  try {
    db.prepare("SELECT status FROM entries LIMIT 1").get();
  } catch {
    try { db.exec("ALTER TABLE entries ADD COLUMN status TEXT NOT NULL DEFAULT 'available'"); } catch {}
  }
  try {
    db.prepare("SELECT ip FROM audit_log LIMIT 1").get();
  } catch {
    try { db.exec("ALTER TABLE audit_log ADD COLUMN ip TEXT"); } catch {}
  }
}

// --- Users ---

export function registerUser(username, apiKey, role = "user") {
  const db = getDb();
  db.prepare("INSERT INTO users (username, api_key, role) VALUES (?, ?, ?)").run(username, apiKey, role);
}

export function authenticateKey(apiKey) {
  const db = getDb();
  const row = db.prepare("SELECT username, role FROM users WHERE api_key = ?").get(apiKey);
  return row || null;
}

export function getUser(username) {
  const db = getDb();
  return db.prepare("SELECT username, role, created_at FROM users WHERE username = ?").get(username);
}

export function changeApiKey(username, newApiKey) {
  const db = getDb();
  const result = db.prepare("UPDATE users SET api_key = ? WHERE username = ?").run(newApiKey, username);
  return result.changes > 0;
}

export function getUserCount() {
  const db = getDb();
  return db.prepare("SELECT COUNT(*) as count FROM users").get().count;
}

export function setUserRole(username, role) {
  const db = getDb();
  const result = db.prepare("UPDATE users SET role = ? WHERE username = ?").run(role, username);
  return result.changes > 0;
}

export function backupDb(destPath) {
  const db = getDb();
  return db.backup(destPath);
}

export function restoreDb(sourcePath) {
  const currentDb = getDb();
  currentDb.close();
  db = null;
  copyFileSync(sourcePath, DB_PATH);
  // Reopen and re-init
  getDb();
}

// --- Entries ---

export async function upsertEntry({ type, name, version, description, tags, meta, body, author, owner }) {
  const { getStorage } = await import("./storage.js");
  const storage = getStorage();
  const db = getDb();
  const existing = db.prepare(
    "SELECT id, owner FROM entries WHERE type = ? AND name = ? AND version = ?"
  ).get(type, name, version);

  if (existing) {
    if (existing.owner && owner && existing.owner !== owner) {
      return { error: "forbidden", existingOwner: existing.owner };
    }
    const storeBody = storage.isExternal ? null : body;
    const storeMeta = storage.isExternal ? null : JSON.stringify(meta);
    db.prepare(`
      UPDATE entries SET description = ?, tags = ?, meta = ?, body = ?, author = ?, owner = COALESCE(?, owner), created_at = datetime('now')
      WHERE type = ? AND name = ? AND version = ?
    `).run(description, JSON.stringify(tags), storeMeta, storeBody, author, owner, type, name, version);
  } else {
    const anyVersion = db.prepare(
      "SELECT owner FROM entries WHERE type = ? AND name = ? AND owner IS NOT NULL LIMIT 1"
    ).get(type, name);
    if (anyVersion && owner && anyVersion.owner !== owner) {
      return { error: "forbidden", existingOwner: anyVersion.owner };
    }
    const storeBody = storage.isExternal ? null : body;
    const storeMeta = storage.isExternal ? null : JSON.stringify(meta);
    db.prepare(`
      INSERT INTO entries (type, name, version, description, tags, meta, body, author, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(type, name, version, description, JSON.stringify(tags), storeMeta, storeBody, author, owner);
  }

  // Store content externally if configured
  if (storage.isExternal) {
    await storage.putEntry({ type, name, version, body, meta });
  }

  return { ok: true };
}

export function getEntryOwner(type, name) {
  const db = getDb();
  const row = db.prepare(
    "SELECT owner FROM entries WHERE type = ? AND name = ? AND owner IS NOT NULL LIMIT 1"
  ).get(type, name);
  return row ? row.owner : null;
}

export async function getEntry(type, name, version) {
  const { getStorage } = await import("./storage.js");
  const storage = getStorage();
  const db = getDb();
  let row;
  if (version) {
    row = db.prepare("SELECT * FROM entries WHERE type = ? AND name = ? AND version = ?").get(type, name, version);
  } else {
    row = db.prepare("SELECT * FROM entries WHERE type = ? AND name = ? ORDER BY created_at DESC LIMIT 1").get(type, name);
  }
  if (!row) return null;
  const entry = deserializeRow(row);
  // Hydrate body/meta from external storage
  if (storage.isExternal) {
    const content = await storage.getEntryContent(type, name, entry.version);
    if (content) {
      entry.body = content.body;
      entry.meta = content.meta || entry.meta;
    }
  }
  return entry;
}

export function listEntries(type, includeBlocked = false) {
  const db = getDb();
  const statusFilter = includeBlocked ? "" : "AND status = 'available'";
  const rows = db.prepare(
    `SELECT * FROM entries WHERE type = ? ${statusFilter} GROUP BY name HAVING created_at = MAX(created_at) ORDER BY name`
  ).all(type);
  return rows.map(deserializeRow);
}

export function setEntryStatus(type, name, status) {
  const db = getDb();
  const result = db.prepare("UPDATE entries SET status = ? WHERE type = ? AND name = ?").run(status, type, name);
  return result.changes > 0;
}

export function listBlockedEntries() {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM entries WHERE status = 'blocked' GROUP BY type, name HAVING created_at = MAX(created_at) ORDER BY created_at DESC"
  ).all();
  return rows.map(deserializeRow);
}

export function listVersions(type, name) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT version, created_at FROM entries WHERE type = ? AND name = ? ORDER BY created_at DESC"
  ).all(type, name);
  return rows;
}

export async function deleteEntry(type, name) {
  const { getStorage } = await import("./storage.js");
  const storage = getStorage();
  const db = getDb();
  const result = db.prepare("DELETE FROM entries WHERE type = ? AND name = ?").run(type, name);
  if (result.changes > 0 && storage.isExternal) {
    await storage.deleteEntryContent(type, name);
  }
  return result.changes > 0;
}

export function searchEntries(query) {
  const db = getDb();
  const pattern = `%${query}%`;
  const rows = db.prepare(`
    SELECT * FROM entries
    WHERE name LIKE ? OR description LIKE ? OR tags LIKE ? OR body LIKE ?
    GROUP BY type, name HAVING created_at = MAX(created_at)
    ORDER BY name
  `).all(pattern, pattern, pattern, pattern);
  return rows.map(deserializeRow);
}

// --- Comments ---

export function addComment({ type, name, username, rating, body }) {
  const db = getDb();
  db.prepare(
    "INSERT INTO comments (type, name, username, rating, body) VALUES (?, ?, ?, ?, ?)"
  ).run(type, name, username, rating, body);
}

export function getComments(type, name) {
  const db = getDb();
  return db.prepare(
    "SELECT id, username, rating, body, created_at FROM comments WHERE type = ? AND name = ? ORDER BY created_at DESC"
  ).all(type, name);
}

export function deleteComment(id, username) {
  const db = getDb();
  const row = db.prepare("SELECT username FROM comments WHERE id = ?").get(id);
  if (!row) return { error: "not_found" };
  if (row.username !== username) return { error: "forbidden", owner: row.username };
  db.prepare("DELETE FROM comments WHERE id = ?").run(id);
  return { ok: true };
}

export function getAverageRating(type, name) {
  const db = getDb();
  const row = db.prepare(
    "SELECT AVG(rating) as avg, COUNT(*) as count FROM comments WHERE type = ? AND name = ?"
  ).get(type, name);
  return { average: row.avg ? Math.round(row.avg * 10) / 10 : null, count: row.count };
}

// --- Attachments (delegated to storage adapter) ---

export async function upsertAttachment({ type, name, filepath, content }) {
  const { getStorage } = await import("./storage.js");
  const storage = getStorage();
  await storage.putAttachment({ type, name, filepath, content });
}

export async function getAttachments(type, name) {
  const { getStorage } = await import("./storage.js");
  const storage = getStorage();
  return await storage.getAttachments(type, name);
}

export async function getAttachmentContent(type, name, filepath) {
  const { getStorage } = await import("./storage.js");
  const storage = getStorage();
  return await storage.getAttachmentContent(type, name, filepath);
}

export async function deleteAttachments(type, name) {
  const { getStorage } = await import("./storage.js");
  const storage = getStorage();
  await storage.deleteAttachments(type, name);
}

// --- Audit log ---

export function logAction({ action, username, role, ip, type, name, detail }) {
  const db = getDb();
  db.prepare(
    "INSERT INTO audit_log (action, username, role, ip, type, name, detail) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(action, username || null, role || null, ip || null, type || null, name || null, detail || null);
}

export function getAuditLog({ limit = 50, offset = 0, username, action } = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (username) { conditions.push("username = ?"); params.push(username); }
  if (action) { conditions.push("action = ?"); params.push(action); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM audit_log ${where}`).get(...params);

  return { entries: rows, total: countRow.total, limit, offset };
}

// --- Webhooks ---

export function addWebhook(url, events, secret) {
  const db = getDb();
  const eventsStr = Array.isArray(events) ? events.join(",") : events;
  const result = db.prepare(
    "INSERT INTO webhooks (url, events, secret) VALUES (?, ?, ?)"
  ).run(url, eventsStr, secret || null);
  return result.lastInsertRowid;
}

export function getWebhooks() {
  const db = getDb();
  return db.prepare("SELECT id, url, events, created_at FROM webhooks ORDER BY created_at DESC").all();
}

export function deleteWebhook(id) {
  const db = getDb();
  const result = db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getWebhooksForEvent(event) {
  const db = getDb();
  const rows = db.prepare("SELECT id, url, events, secret FROM webhooks").all();
  return rows.filter((row) => {
    const events = row.events.split(",").map((e) => e.trim());
    return events.includes(event) || events.includes("*");
  });
}

function deserializeRow(row) {
  return {
    ...row,
    tags: safeJsonParse(row.tags, []),
    meta: safeJsonParse(row.meta, {}),
  };
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
