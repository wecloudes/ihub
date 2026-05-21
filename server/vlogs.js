// VictoriaLogs client — ships structured JSON logs via HTTP.
// Uses the /insert/jsonline endpoint (JSON Lines format).
// Logs are sent asynchronously (fire-and-forget) to avoid blocking requests.

let _url = null;

/**
 * Initialize VictoriaLogs client.
 * @param {string} baseUrl  VictoriaLogs base URL (e.g. "http://victorialogs:9428")
 */
export function initVLogs(baseUrl) {
  if (!baseUrl) return;
  _url = baseUrl.replace(/\/+$/, "") + "/insert/jsonline?_stream_fields=service,action&_msg_field=message&_time_field=_time";
}

/**
 * Check if VictoriaLogs is configured.
 */
export function isVLogsEnabled() {
  return !!_url;
}

/**
 * Ship a structured log entry to VictoriaLogs.
 * Non-blocking — errors are silently ignored.
 * @param {object} entry  Log fields (action, username, ip, type, name, detail, etc.)
 */
export function shipLog(entry) {
  if (!_url) return;

  const record = {
    _time: new Date().toISOString(),
    service: "ihub",
    level: entry.level || "info",
    action: entry.action || "",
    username: entry.username || "",
    role: entry.role || "",
    ip: entry.ip || "",
    type: entry.type || "",
    name: entry.name || "",
    detail: entry.detail || "",
    message: formatMessage(entry),
  };

  // Fire-and-forget
  fetch(_url, {
    method: "POST",
    headers: { "Content-Type": "application/stream+json" },
    body: JSON.stringify(record) + "\n",
  }).catch(() => {});
}

function formatMessage(entry) {
  const parts = [entry.action];
  if (entry.type && entry.name) parts.push(`${entry.type}/${entry.name}`);
  if (entry.username) parts.push(`by ${entry.username}`);
  if (entry.detail) parts.push(`— ${entry.detail}`);
  return parts.filter(Boolean).join(" ");
}
