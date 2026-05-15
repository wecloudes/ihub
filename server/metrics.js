// In-memory Prometheus metrics collector — no external dependencies.
// Exports counters/gauges and a serialize() function that produces
// Prometheus text exposition format for /metrics endpoint.

const counters = {};
const gauges = {};

/**
 * Increment a counter.
 * @param {string} name   Metric name (e.g. "ihub_push_total")
 * @param {object} labels Key-value labels (e.g. { type: "agents", user: "alice" })
 * @param {number} value  Increment amount (default 1)
 */
export function inc(name, labels = {}, value = 1) {
  const key = serializeKey(name, labels);
  if (!counters[name]) counters[name] = {};
  counters[name][key] = (counters[name][key] || 0) + value;
}

/**
 * Set a gauge value.
 * @param {string} name   Metric name
 * @param {object} labels Key-value labels
 * @param {number} value  Gauge value
 */
export function gauge(name, labels = {}, value) {
  const key = serializeKey(name, labels);
  if (!gauges[name]) gauges[name] = {};
  gauges[name][key] = value;
}

/**
 * Register metric metadata (HELP + TYPE lines).
 */
const metadata = {};

export function register(name, type, help) {
  metadata[name] = { type, help };
}

/**
 * Serialize all metrics to Prometheus text format.
 */
export function serialize() {
  const lines = [];

  const allNames = new Set([...Object.keys(counters), ...Object.keys(gauges)]);

  for (const name of [...allNames].sort()) {
    const meta = metadata[name];
    if (meta) {
      lines.push(`# HELP ${name} ${meta.help}`);
      lines.push(`# TYPE ${name} ${meta.type}`);
    }

    if (counters[name]) {
      for (const [key, value] of Object.entries(counters[name])) {
        lines.push(`${key} ${value}`);
      }
    }

    if (gauges[name]) {
      for (const [key, value] of Object.entries(gauges[name])) {
        lines.push(`${key} ${value}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Reset all metrics (for testing).
 */
export function reset() {
  for (const k of Object.keys(counters)) delete counters[k];
  for (const k of Object.keys(gauges)) delete gauges[k];
}

// --- Internal ---

function serializeKey(name, labels) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return name;
  const labelStr = entries
    .map(([k, v]) => `${k}="${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",");
  return `${name}{${labelStr}}`;
}

// --- Register default metrics ---

register("ihub_http_requests_total", "counter", "Total HTTP requests");
register("ihub_push_total", "counter", "Artifacts pushed");
register("ihub_pull_total", "counter", "Artifacts pulled");
register("ihub_view_total", "counter", "Artifact detail views");
register("ihub_list_total", "counter", "Artifact list requests");
register("ihub_search_total", "counter", "Search requests");
register("ihub_comment_total", "counter", "Comments added");
register("ihub_comment_delete_total", "counter", "Comments deleted");
register("ihub_remove_total", "counter", "Artifacts removed");
register("ihub_register_total", "counter", "User registrations");
register("ihub_backup_total", "counter", "Database backups");
register("ihub_role_change_total", "counter", "User role changes");
register("ihub_sensitive_detected_total", "counter", "Sensitive data detected and masked");
register("ihub_entries_count", "gauge", "Current number of entries by type");
register("ihub_entries_by_project_count", "gauge", "Current number of entries by project and type");
register("ihub_entries_by_name_count", "gauge", "Current number of entry versions by type and name");
register("ihub_comments_by_artifact_count", "gauge", "Current number of comments per artifact");
register("ihub_comments_by_user_count", "gauge", "Current number of comments per user");
register("ihub_users_count", "gauge", "Current number of registered users");
register("ihub_comments_count", "gauge", "Current number of comments");
