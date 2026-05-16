// Storage abstraction layer.
// Delegates artifact content (body/meta) and attachments to either SQLite or files-sdk.
// SQLite remains for users, comments, audit_log, and entry index rows.

import { getDb } from "./db.js";
import { loadServerConfig } from "./config.js";

let _storage = null;

/**
 * Get the storage adapter singleton. Call after config is loaded.
 */
export function getStorage() {
  if (_storage) return _storage;
  let cfg;
  try {
    cfg = loadServerConfig().storage || { adapter: "sqlite" };
  } catch {
    cfg = { adapter: "sqlite" };
  }
  if (cfg.adapter === "sqlite" || !cfg.adapter) {
    _storage = new SqliteStorage();
  } else {
    _storage = new FilesSdkStorage(cfg);
  }
  return _storage;
}

/**
 * Reset storage singleton (for testing).
 */
export function resetStorage() {
  _storage = null;
}

// --- SQLite Storage (default) ---

class SqliteStorage {
  get isExternal() { return false; }

  async putEntry({ type, name, version, body, meta }) {
    // No-op: SQLite entries store body/meta inline in the entries table
  }

  async getEntryContent(type, name, version) {
    // No-op: body/meta are already in the SQLite row
    return null;
  }

  async deleteEntryContent(type, name) {
    // No-op
  }

  async putAttachment({ type, name, filepath, content }) {
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

  async getAttachmentContent(type, name, filepath) {
    const db = getDb();
    const row = db.prepare(
      "SELECT content FROM attachments WHERE type = ? AND name = ? AND filepath = ?"
    ).get(type, name, filepath);
    return row ? row.content : null;
  }

  async getAttachments(type, name) {
    const db = getDb();
    return db.prepare(
      "SELECT id, filepath, size, created_at FROM attachments WHERE type = ? AND name = ? ORDER BY filepath"
    ).all(type, name);
  }

  async deleteAttachments(type, name) {
    const db = getDb();
    db.prepare("DELETE FROM attachments WHERE type = ? AND name = ?").run(type, name);
  }
}

// --- Files SDK Storage ---

class FilesSdkStorage {
  constructor(cfg) {
    this.adapterName = cfg.adapter;
    this.cfg = cfg;
    this._client = null;
  }

  get isExternal() { return true; }

  async _getClient() {
    if (this._client) return this._client;
    const { Files } = await import("files-sdk");
    const adapterMod = await import(`files-sdk/${this.adapterName}`);
    // The adapter function is named after the adapter (e.g., s3, r2, gcs, fs)
    const adapterFn = adapterMod[this.adapterName] || adapterMod.default;
    if (typeof adapterFn !== "function") {
      throw new Error(`Storage adapter "${this.adapterName}" not found in files-sdk/${this.adapterName}`);
    }
    const { adapter: _, ...opts } = this.cfg;
    this._client = new Files({ adapter: adapterFn(opts) });
    return this._client;
  }

  async putEntry({ type, name, version, body, meta }) {
    const client = await this._getClient();
    const key = `${type}/${name}/${version}.json`;
    await client.upload(key, JSON.stringify({ body, meta }));
  }

  async getEntryContent(type, name, version) {
    const client = await this._getClient();
    const key = `${type}/${name}/${version}.json`;
    try {
      if (!(await client.exists(key))) return null;
      const file = await client.download(key);
      // files-sdk returns a File/Blob — read as text
      const text = typeof file.text === "function" ? await file.text() : file.toString();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async deleteEntryContent(type, name) {
    const client = await this._getClient();
    try {
      const { items } = await client.list({ prefix: `${type}/${name}/` });
      for (const item of items || []) {
        await client.delete(item.key || item.name);
      }
    } catch {
      // Best effort
    }
  }

  async putAttachment({ type, name, filepath, content }) {
    const client = await this._getClient();
    const key = `${type}/${name}/attachments/${filepath}`;
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "base64");
    await client.upload(key, buf);

    // Keep metadata in SQLite for fast listing (no blob content)
    const db = getDb();
    const existing = db.prepare(
      "SELECT id FROM attachments WHERE type = ? AND name = ? AND filepath = ?"
    ).get(type, name, filepath);
    if (existing) {
      db.prepare(
        "UPDATE attachments SET content = '', size = ?, created_at = datetime('now') WHERE id = ?"
      ).run(buf.length, existing.id);
    } else {
      db.prepare(
        "INSERT INTO attachments (type, name, filepath, content, size) VALUES (?, ?, ?, '', ?)"
      ).run(type, name, filepath, buf.length);
    }
  }

  async getAttachmentContent(type, name, filepath) {
    const client = await this._getClient();
    const key = `${type}/${name}/attachments/${filepath}`;
    try {
      if (!(await client.exists(key))) return null;
      const file = await client.download(key);
      if (file.arrayBuffer) {
        return Buffer.from(await file.arrayBuffer());
      }
      return Buffer.isBuffer(file) ? file : Buffer.from(file);
    } catch {
      return null;
    }
  }

  async getAttachments(type, name) {
    // Use SQLite metadata index for fast listing
    const db = getDb();
    return db.prepare(
      "SELECT id, filepath, size, created_at FROM attachments WHERE type = ? AND name = ? ORDER BY filepath"
    ).all(type, name);
  }

  async deleteAttachments(type, name) {
    // Delete from external storage
    const client = await this._getClient();
    try {
      const { items } = await client.list({ prefix: `${type}/${name}/attachments/` });
      for (const item of items || []) {
        await client.delete(item.key || item.name);
      }
    } catch {
      // Best effort
    }
    // Delete metadata from SQLite
    const db = getDb();
    db.prepare("DELETE FROM attachments WHERE type = ? AND name = ?").run(type, name);
  }
}
