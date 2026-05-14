import Database from "better-sqlite3";
import { join } from "path";

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

// --- Entries ---

export function upsertEntry({ type, name, version, description, tags, meta, body, author, owner }) {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id, owner FROM entries WHERE type = ? AND name = ? AND version = ?"
  ).get(type, name, version);

  if (existing) {
    // Only the owner (or entries with no owner) can update
    if (existing.owner && owner && existing.owner !== owner) {
      return { error: "forbidden", existingOwner: existing.owner };
    }
    db.prepare(`
      UPDATE entries SET description = ?, tags = ?, meta = ?, body = ?, author = ?, owner = COALESCE(?, owner), created_at = datetime('now')
      WHERE type = ? AND name = ? AND version = ?
    `).run(description, JSON.stringify(tags), JSON.stringify(meta), body, author, owner, type, name, version);
  } else {
    // New entry — check if another version exists with a different owner
    const anyVersion = db.prepare(
      "SELECT owner FROM entries WHERE type = ? AND name = ? AND owner IS NOT NULL LIMIT 1"
    ).get(type, name);
    if (anyVersion && owner && anyVersion.owner !== owner) {
      return { error: "forbidden", existingOwner: anyVersion.owner };
    }
    db.prepare(`
      INSERT INTO entries (type, name, version, description, tags, meta, body, author, owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(type, name, version, description, JSON.stringify(tags), JSON.stringify(meta), body, author, owner);
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

export function getEntry(type, name, version) {
  const db = getDb();
  let row;
  if (version) {
    row = db.prepare("SELECT * FROM entries WHERE type = ? AND name = ? AND version = ?").get(type, name, version);
  } else {
    // latest version
    row = db.prepare("SELECT * FROM entries WHERE type = ? AND name = ? ORDER BY created_at DESC LIMIT 1").get(type, name);
  }
  return row ? deserializeRow(row) : null;
}

export function listEntries(type) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM entries WHERE type = ? GROUP BY name HAVING created_at = MAX(created_at) ORDER BY name"
  ).all(type);
  return rows.map(deserializeRow);
}

export function listVersions(type, name) {
  const db = getDb();
  const rows = db.prepare(
    "SELECT version, created_at FROM entries WHERE type = ? AND name = ? ORDER BY created_at DESC"
  ).all(type, name);
  return rows;
}

export function deleteEntry(type, name) {
  const db = getDb();
  const result = db.prepare("DELETE FROM entries WHERE type = ? AND name = ?").run(type, name);
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

// --- Attachments ---

export function upsertAttachment({ type, name, filepath, content }) {
  const db = getDb();
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "base64");
  const existing = db.prepare(
    "SELECT id FROM attachments WHERE type = ? AND name = ? AND filepath = ?"
  ).get(type, name, filepath);

  if (existing) {
    db.prepare(
      "UPDATE attachments SET content = ?, size = ?, created_at = datetime('now') WHERE id = ?"
    ).run(buf, buf.length, existing.id);
  } else {
    db.prepare(
      "INSERT INTO attachments (type, name, filepath, content, size) VALUES (?, ?, ?, ?, ?)"
    ).run(type, name, filepath, buf, buf.length);
  }
}

export function getAttachments(type, name) {
  const db = getDb();
  return db.prepare(
    "SELECT id, filepath, size, created_at FROM attachments WHERE type = ? AND name = ? ORDER BY filepath"
  ).all(type, name);
}

export function getAttachmentContent(type, name, filepath) {
  const db = getDb();
  const row = db.prepare(
    "SELECT content FROM attachments WHERE type = ? AND name = ? AND filepath = ?"
  ).get(type, name, filepath);
  return row ? row.content : null;
}

export function deleteAttachments(type, name) {
  const db = getDb();
  db.prepare("DELETE FROM attachments WHERE type = ? AND name = ?").run(type, name);
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
