import { readFileSync, writeFileSync, existsSync } from "fs";
import { parseFilters, parsePrometheus, renderDashboard } from "./dashboard.js";
import {
  fetchAuditLog,
  fetchMetrics,
  downloadBackup,
  setRole,
  triggerDigest,
  loadConfig,
} from "./registry.js";

export async function audit(args) {
  const jsonMode = args.includes("--json");
  const opts = { limit: 50, offset: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") continue;
    if (args[i] === "--user" && args[i + 1]) opts.user = args[++i];
    else if (args[i] === "--action" && args[i + 1]) opts.action = args[++i];
    else if (args[i] === "--page" && args[i + 1]) {
      const page = parseInt(args[++i], 10);
      if (page > 1) opts.offset = (page - 1) * opts.limit;
    }
    else if (args[i] === "--limit" && args[i + 1]) opts.limit = parseInt(args[++i], 10);
  }

  const data = await fetchAuditLog(opts);

  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const totalPages = Math.ceil(data.total / data.limit);
  const currentPage = Math.floor(data.offset / data.limit) + 1;

  console.log("");
  console.log(`\x1b[1m\x1b[46m\x1b[30m Audit Trail \x1b[0m  \x1b[2m${data.total} records  |  page ${currentPage}/${totalPages || 1}\x1b[0m`);

  const activeFilters = [];
  if (opts.user) activeFilters.push(`user=${opts.user}`);
  if (opts.action) activeFilters.push(`action=${opts.action}`);
  if (activeFilters.length > 0) {
    console.log(`\x1b[2mFilters: ${activeFilters.join("  ")}\x1b[0m`);
  }

  console.log(`\x1b[2m${"─".repeat(90)}\x1b[0m`);

  if (data.entries.length === 0) {
    console.log("\x1b[2m  No records found.\x1b[0m");
  }

  for (const entry of data.entries) {
    const isAdmin = entry.role === "admin";
    const roleColor = isAdmin ? "\x1b[31m" : "\x1b[36m";
    const roleBadge = isAdmin ? `\x1b[41m\x1b[37m ADMIN \x1b[0m` : `\x1b[44m\x1b[37m USER \x1b[0m`;
    const actionColor = getActionColor(entry.action);

    const time = `\x1b[2m${entry.created_at}\x1b[0m`;
    const user = `${roleColor}\x1b[1m${entry.username || "anonymous"}\x1b[0m`;
    const action = `${actionColor}\x1b[1m${entry.action.toUpperCase().padEnd(15)}\x1b[0m`;

    let target = "";
    if (entry.type && entry.name) {
      target = `\x1b[33m${entry.type}/${entry.name}\x1b[0m`;
    } else if (entry.type) {
      target = `\x1b[33m${entry.type}\x1b[0m`;
    }

    const detail = entry.detail ? `\x1b[2m(${entry.detail})\x1b[0m` : "";
    const ip = entry.ip ? `\x1b[90m${entry.ip.padEnd(15)}\x1b[0m` : `\x1b[90m${"—".padEnd(15)}\x1b[0m`;

    console.log(`  ${time}  ${ip}  ${user}  ${roleBadge}  ${action} ${target} ${detail}`);
  }

  console.log(`\x1b[2m${"─".repeat(90)}\x1b[0m`);

  // Pagination hint
  if (totalPages > 1) {
    const hints = [];
    if (currentPage < totalPages) hints.push(`--page ${currentPage + 1} (next)`);
    if (currentPage > 1) hints.push(`--page ${currentPage - 1} (prev)`);
    console.log(`\x1b[2mPages: ${hints.join("  |  ")}\x1b[0m`);
  }
  console.log("");
}

export function getActionColor(action) {
  const colors = {
    push: "\x1b[32m",            // green
    pull: "\x1b[32m",            // green
    view: "\x1b[34m",            // blue
    list: "\x1b[34m",            // blue
    search: "\x1b[34m",          // blue
    versions: "\x1b[34m",        // blue
    "view-comments": "\x1b[34m", // blue
    comment: "\x1b[35m",         // magenta
    "delete-comment": "\x1b[35m",
    remove: "\x1b[31m",          // red
    register: "\x1b[33m",        // yellow
    backup: "\x1b[31m",          // red
    "set-role": "\x1b[31m",      // red
    "sensitive-detected": "\x1b[43m\x1b[30m", // yellow bg
  };
  return colors[action] || "\x1b[37m";
}

export async function metrics(args) {
  const jsonMode = args.includes("--json");
  const filteredMetricArgs = args.filter((a) => a !== "--json");
  const filters = parseFilters(filteredMetricArgs);
  const raw = await fetchMetrics();

  if (jsonMode) {
    const parsed = parsePrometheus(raw);
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }

  const parsed = parsePrometheus(raw);
  console.log(renderDashboard(parsed, filters));
}

export async function backup(args) {
  const isFull = args.includes("--full");
  const filtered = args.filter(a => a !== "--full");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  if (isFull) {
    // Full JSON backup — works with any storage adapter (S3, R2, etc.)
    const outputPath = filtered[0] || `ihub-backup-${timestamp}.json`;
    const config = loadConfig();
    const base = (config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
    const token = config.token || process.env.IHUB_TOKEN || "";
    const authHeaders = token ? { "Authorization": `Bearer ${token}` } : {};
    const res = await fetch(`${base}/api/backup/full`, { headers: authHeaders });
    if (!res.ok) { const e = await res.json().catch(() => ({})); console.error(`Backup failed: ${e.error || res.status}`); process.exit(1); }
    const data = await res.text();
    writeFileSync(outputPath, data);
    const bundle = JSON.parse(data);
    console.log(`Full backup saved to: ${outputPath}`);
    console.log(`  ${bundle.artifacts?.length || 0} artifacts, ${bundle.comments?.length || 0} comments, ${bundle.users?.length || 0} users`);
  } else {
    // SQLite backup — only works when storage adapter is sqlite
    const outputPath = filtered[0] || `ihub-backup-${timestamp}.db`;
    await downloadBackup(outputPath);
    console.log(`Backup saved to: ${outputPath}`);
    console.log(`  (Use --full for a complete backup that works with any storage adapter)`);
  }
}

export async function restore(args) {
  const filePath = args[0];
  if (!filePath) {
    console.error("Usage: ihub restore <backup-file>");
    console.error("  Supports .db (SQLite) and .json (full) backups.");
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const config = loadConfig();
  const base = (config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
  const token = config.token || process.env.IHUB_TOKEN || "";
  const authHeaders = token ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` } : {};
  const buf = readFileSync(filePath);

  // Detect format
  const isJson = filePath.endsWith(".json") || buf.slice(0, 1).toString() === "{";
  const isSqlite = buf.slice(0, 16).toString("ascii").startsWith("SQLite format 3");

  if (isJson) {
    // Full JSON restore — works with any storage adapter
    let bundle;
    try { bundle = JSON.parse(buf.toString()); } catch { console.error("Invalid JSON backup file."); process.exit(1); }
    if (!bundle.artifacts) { console.error("Invalid backup — missing artifacts."); process.exit(1); }
    console.log(`Restoring full backup from ${filePath}...`);
    console.log(`  ${bundle.artifacts.length} artifacts, ${bundle.comments?.length || 0} comments`);
    const res = await fetch(`${base}/api/backup/full`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: buf,
    });
    const data = await res.json();
    if (!res.ok) { console.error(`Restore failed: ${data.error}`); process.exit(1); }
    console.log(`Restored: ${data.imported} artifacts, ${data.comments} comments${data.errors ? `, ${data.errors} errors` : ""}`);
  } else if (isSqlite) {
    // SQLite restore — only works when storage adapter is sqlite
    console.log(`Restoring SQLite backup from ${filePath} (${buf.length} bytes)...`);
    const res = await fetch(`${base}/api/backup`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/octet-stream" },
      body: buf,
    });
    const data = await res.json();
    if (!res.ok) { console.error(`Restore failed: ${data.error}`); process.exit(1); }
    console.log(`Database restored successfully (${data.size} bytes).`);
  } else {
    console.error("Unrecognized backup format. Use a .db (SQLite) or .json (full) file.");
    process.exit(1);
  }
}

export async function admin(args) {
  const [subcommand, ...subArgs] = args;

  if (subcommand === "set-role") {
    const [username, role] = subArgs;
    if (!username || !role) {
      console.error("Usage: ihub admin set-role <username> <role>");
      console.error("  Roles: user, admin");
      process.exit(1);
    }
    const result = await setRole(username, role);
    console.log(`Role updated: ${result.username} is now ${result.role}`);
    return;
  }

  if (subcommand === "digest") {
    const result = await triggerDigest();
    console.log(result.message);
    return;
  }

  if (subcommand === "approve") {
    const target = subArgs[0]; // type/name
    if (!target || !target.includes("/")) {
      console.error("Usage: ihub admin approve <type>/<name>");
      process.exit(1);
    }
    const [aType, aName] = target.split("/");
    const base = loadConfig().registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
    const token = loadConfig().token || process.env.IHUB_TOKEN;
    const res = await fetch(`${base}/api/${aType}/${aName}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Approve failed");
    console.log(`\x1b[32m✓ Approved: ${aType}/${aName} → available\x1b[0m`);
    return;
  }

  if (subcommand === "blocked") {
    const base = loadConfig().registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
    const token = loadConfig().token || process.env.IHUB_TOKEN;
    const res = await fetch(`${base}/api/blocked`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list blocked");
    if (data.length === 0) {
      console.log("No blocked artifacts.");
      return;
    }
    console.log(`\n\x1b[33m${data.length} blocked artifact(s):\x1b[0m\n`);
    for (const e of data) {
      console.log(`  \x1b[31m✗\x1b[0m ${e.type}/${e.name}@${e.version}  \x1b[2mby ${e.owner}\x1b[0m`);
    }
    console.log(`\n\x1b[2mApprove with: ihub admin approve <type>/<name>\x1b[0m\n`);
    return;
  }

  console.error("Usage: ihub admin <subcommand>");
  console.error("  set-role <username> <role>   Set user role (admin only)");
  console.error("  approve <type>/<name>        Approve a blocked artifact (admin only)");
  console.error("  blocked                      List blocked artifacts (admin only)");
  console.error("  digest                       Send weekly digest to Slack (admin only)");
  process.exit(1);
}

export async function webhook(args) {
  const [subcommand, ...subArgs] = args;
  const config = loadConfig();
  const base = (config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
  const token = config.token || process.env.IHUB_TOKEN;

  if (!token) {
    console.error("Not logged in. Run: ihub login <url>");
    process.exit(1);
  }

  const authHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };

  if (subcommand === "list") {
    const res = await fetch(`${base}/api/webhooks`, { headers: authHeaders });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list webhooks");
    if (data.length === 0) {
      console.log("No webhooks configured.");
      return;
    }
    console.log(`\n${data.length} webhook(s):\n`);
    for (const wh of data) {
      console.log(`  [${wh.id}] ${wh.url}  events: ${wh.events}  (${wh.created_at})`);
    }
    console.log("");
    return;
  }

  if (subcommand === "add") {
    const url = subArgs[0];
    if (!url) {
      console.error("Usage: ihub webhook add <url> [--events push,comment] [--secret s]");
      process.exit(1);
    }
    let events = ["push", "pull", "comment", "remove", "approve", "register"];
    let secret = null;
    for (let i = 1; i < subArgs.length; i++) {
      if (subArgs[i] === "--events" && subArgs[i + 1]) {
        events = subArgs[++i].split(",").map((e) => e.trim());
      } else if (subArgs[i] === "--secret" && subArgs[i + 1]) {
        secret = subArgs[++i];
      }
    }
    const body = { url, events };
    if (secret) body.secret = secret;
    const res = await fetch(`${base}/api/webhooks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add webhook");
    console.log(`Webhook added (id: ${data.id}) — ${url} [${events.join(", ")}]`);
    return;
  }

  if (subcommand === "remove") {
    const id = subArgs[0];
    if (!id) {
      console.error("Usage: ihub webhook remove <id>");
      process.exit(1);
    }
    const res = await fetch(`${base}/api/webhooks/${id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to remove webhook");
    console.log(`Webhook ${id} removed.`);
    return;
  }

  console.error("Usage: ihub webhook <list|add|remove>");
  console.error("  list                         List registered webhooks");
  console.error("  add <url> [--events ...] [--secret s]  Add a webhook");
  console.error("  remove <id>                  Remove a webhook");
  process.exit(1);
}

export async function federation(args) {
  const [subcommand] = args;
  const config = loadConfig();
  const base = config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
  const token = config.token || process.env.IHUB_TOKEN;

  if (subcommand === "sync") {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/federation/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Federation sync failed");
    console.log("\x1b[32m✓ Federation sync complete\x1b[0m");
    for (const r of data.results) {
      console.log(`  ${r.url}: ${r.synced} synced, ${r.errors.length} errors`);
      for (const err of r.errors) {
        console.log(`    \x1b[31m✗\x1b[0m ${err}`);
      }
    }
    return;
  }

  if (subcommand === "status") {
    const res = await fetch(`${base.replace(/\/+$/, "")}/api/federation/status`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to get federation status");
    console.log(`Federation: ${data.enabled ? "\x1b[32menabled\x1b[0m" : "\x1b[33mdisabled\x1b[0m"}`);
    if (data.upstreams.length === 0) {
      console.log("  No upstreams configured.");
    } else {
      for (const u of data.upstreams) {
        console.log(`  ${u.url}`);
        console.log(`    Types: ${u.types.join(", ")}`);
        console.log(`    Interval: ${u.interval_hours}h`);
        console.log(`    Last sync: ${u.lastSync || "never"}`);
        if (u.lastSynced) console.log(`    Last synced: ${u.lastSynced} artifacts`);
        if (u.lastErrors) console.log(`    Last errors: ${u.lastErrors}`);
      }
    }
    return;
  }

  console.error("Usage: ihub federation sync|status");
  process.exit(1);
}
