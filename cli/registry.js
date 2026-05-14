import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { join, dirname, relative } from "path";
import { homedir } from "os";

const CONFIG_PATH = join(homedir(), ".ihubrc");

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

function getBaseUrl() {
  const config = loadConfig();
  const url = config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

function getToken() {
  const config = loadConfig();
  return config.token || process.env.IHUB_TOKEN || "";
}

function headers(auth = false) {
  const h = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (!token) throw new Error("Not logged in. Run: ihub login <url>");
    h["Authorization"] = `Bearer ${token}`;
  }
  return h;
}

export async function pushEntry(type, entry) {
  const base = getBaseUrl();
  const name = entry.name || entry.file;
  const { body, file, path: entryPath, ...meta } = entry;

  // Scan for companion directory with attachments
  const attachments = [];
  if (entryPath) {
    const entryDir = dirname(entryPath);
    const companionDir = join(entryDir, name);
    if (existsSync(companionDir) && statSync(companionDir).isDirectory()) {
      collectFiles(companionDir, companionDir, attachments);
    }
  }

  const res = await fetch(`${base}/api/${type}/${name}`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({
      version: meta.version || "0.1.0",
      description: meta.description || "",
      tags: meta.tags || [],
      meta,
      body: body || "",
      author: meta.author || "",
      attachments,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Push failed: ${res.status}`);
  return data;
}

function collectFiles(dir, baseDir, result) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, baseDir, result);
    } else {
      const filepath = relative(baseDir, full);
      const content = readFileSync(full).toString("base64");
      result.push({ filepath, content });
    }
  }
}

export async function pullEntry(type, name, version) {
  const base = getBaseUrl();
  const url = version
    ? `${base}/api/${type}/${name}?version=${version}`
    : `${base}/api/${type}/${name}`;

  const h = headers(false);
  h["X-Ihub-Action"] = "pull";
  const res = await fetch(url, { headers: h });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Pull failed: ${res.status}`);
  return data;
}

export async function downloadAttachment(type, name, filepath) {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/${type}/${name}/attachments/${filepath}`, {
    headers: headers(false),
  });
  if (!res.ok) throw new Error(`Attachment download failed: ${filepath}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function removeEntry(type, name) {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/${type}/${name}`, {
    method: "DELETE",
    headers: headers(true),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Unpublish failed: ${res.status}`);
  return data;
}

export async function remoteSearch(query) {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/search?q=${encodeURIComponent(query)}`, {
    headers: headers(false),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Search failed: ${res.status}`);
  return data;
}

export async function commentEntry(type, name, { rating, body }) {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/${type}/${name}/comments`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ rating, body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Comment failed: ${res.status}`);
  return data;
}

export async function getEntryComments(type, name) {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/${type}/${name}/comments`, {
    headers: headers(false),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Failed to get comments: ${res.status}`);
  return data;
}

export async function downloadBackup(outputPath) {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/backup`, { headers: headers(true) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Backup failed: ${res.status}`);
  }
  await pipeline(res.body, createWriteStream(outputPath));
}

export async function setRole(username, role) {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/users/${username}/role`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Set role failed: ${res.status}`);
  return data;
}

export async function fetchAuditLog({ limit = 50, offset = 0, user, action } = {}) {
  const base = getBaseUrl();
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (user) params.set("user", user);
  if (action) params.set("action", action);

  const res = await fetch(`${base}/api/audit?${params}`, { headers: headers(true) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Audit failed: ${res.status}`);
  return data;
}

export async function changePassword(newPassword) {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/account/password`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ new_password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Password change failed: ${res.status}`);
  return data;
}

export async function fetchServerConfig() {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/config`, { headers: headers(true) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Config failed: ${res.status}`);
  return data;
}

export async function triggerDigest() {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/digest`, {
    method: "POST",
    headers: headers(true),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Digest failed: ${res.status}`);
  return data;
}

export async function fetchMetrics() {
  const base = getBaseUrl();
  const res = await fetch(`${base}/api/metrics`, { headers: headers(true) });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Metrics failed: ${res.status}`);
  }
  return res.text();
}

export function entryToMarkdown(entry) {
  const meta = entry.meta || {};
  const lines = ["---"];
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  lines.push("");
  if (entry.body) lines.push(entry.body);
  return lines.join("\n");
}
