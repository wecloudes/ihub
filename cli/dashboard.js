// Terminal dashboard renderer for Prometheus metrics

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";
const RED = "\x1b[31m";
const WHITE = "\x1b[37m";
const BG_CYAN = "\x1b[46m";
const BLACK = "\x1b[30m";

/**
 * Parse Prometheus text format into structured metrics.
 */
export function parsePrometheus(text) {
  const metrics = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([a-zA-Z_]+)(?:\{(.+?)\})?\s+(.+)$/);
    if (!match) continue;

    const [, name, labelsStr, valueStr] = match;
    const value = parseFloat(valueStr);
    const labels = {};

    if (labelsStr) {
      for (const pair of labelsStr.match(/[a-zA-Z_]+="[^"]*"/g) || []) {
        const eq = pair.indexOf("=");
        labels[pair.slice(0, eq)] = pair.slice(eq + 2, -1);
      }
    }

    if (!metrics[name]) metrics[name] = [];
    metrics[name].push({ labels, value });
  }
  return metrics;
}

/**
 * Parse CLI filter flags from args.
 * Supported: --type, --user, --name, --project
 */
export function parseFilters(args) {
  const filters = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--type" && args[i + 1]) filters.type = args[++i];
    else if (arg === "--user" && args[i + 1]) filters.user = args[++i];
    else if (arg === "--name" && args[i + 1]) filters.name = args[++i];
    else if (arg === "--project" && args[i + 1]) filters.project = args[++i];
  }
  return filters;
}

/**
 * Filter metric entries by labels matching the filters.
 */
function filterEntries(entries, filters) {
  if (!entries || Object.keys(filters).length === 0) return entries || [];
  return entries.filter((e) => {
    for (const [key, val] of Object.entries(filters)) {
      if (e.labels[key] !== undefined && e.labels[key] !== val) return false;
    }
    return true;
  });
}

/**
 * Render a terminal dashboard from parsed metrics with optional filters.
 */
export function renderDashboard(metrics, filters = {}) {
  const lines = [];
  const width = Math.min(process.stdout.columns || 80, 100);
  const hr = `${DIM}${"─".repeat(width)}${RESET}`;
  const hasFilters = Object.keys(filters).length > 0;

  // Title
  lines.push("");
  lines.push(`${BOLD}${BG_CYAN}${BLACK} ihub Registry Dashboard ${RESET}`);
  if (hasFilters) {
    const filterStr = Object.entries(filters).map(([k, v]) => `${k}=${v}`).join("  ");
    lines.push(`${DIM}Filters: ${filterStr}${RESET}`);
  }
  lines.push(hr);

  // --- Stats row ---
  const users = getGaugeValue(metrics, "ihub_users_count");
  const entries = sumFiltered(metrics, "ihub_entries_count", filters);
  const comments = hasFilters
    ? sumFiltered(metrics, "ihub_comments_by_artifact_count", filters)
    : getGaugeValue(metrics, "ihub_comments_count");
  const totalPushes = sumFiltered(metrics, "ihub_push_total", filters);
  const totalViews = sumFiltered(metrics, "ihub_view_total", filters);
  const totalSearches = sumValues(metrics, "ihub_search_total");
  const totalBackups = sumValues(metrics, "ihub_backup_total");
  const totalRemoves = sumFiltered(metrics, "ihub_remove_total", filters);

  lines.push("");
  lines.push(
    statBox("Users", users, CYAN) + "  " +
    statBox("Entries", entries, GREEN) + "  " +
    statBox("Comments", comments, MAGENTA) + "  " +
    statBox("Pushes", totalPushes, YELLOW) + "  " +
    statBox("Views", totalViews, BLUE) + "  " +
    statBox("Searches", totalSearches, WHITE) + "  " +
    statBox("Removes", totalRemoves, RED) + "  " +
    statBox("Backups", totalBackups, RED)
  );
  lines.push("");
  lines.push(hr);

  // --- Entries by type ---
  renderSection(lines, metrics, "ihub_entries_count", "Entries by Type", "type", YELLOW, filters);

  // --- Entries by project ---
  renderSection(lines, metrics, "ihub_entries_by_project_count", "Entries by Project", "project", CYAN, filters);

  // --- Per-artifact versions ---
  const artifactEntries = filterEntries(metrics["ihub_entries_by_name_count"], filters);
  if (artifactEntries.length > 0) {
    lines.push(`${BOLD}${GREEN}Artifacts (versions)${RESET}`);
    const sorted = artifactEntries.sort((a, b) => b.value - a.value);
    const maxVal = Math.max(...sorted.map((e) => e.value), 1);
    for (const e of sorted.slice(0, 20)) {
      const label = `${e.labels.type}/${e.labels.name}`;
      const bar = renderBar(e.value, maxVal, 25);
      lines.push(`  ${label.padEnd(30)} ${bar} ${e.value} ver`);
    }
    if (sorted.length > 20) lines.push(`  ${DIM}... and ${sorted.length - 20} more${RESET}`);
    lines.push("");
  }

  // --- Pushes by user ---
  renderSection(lines, metrics, "ihub_push_total", "Pushes by User", "user", GREEN, filters);

  // --- Pushes by artifact ---
  renderGrouped(lines, metrics, "ihub_push_total", "Pushes by Artifact", ["type", "name"], YELLOW, filters);

  // --- Views by user ---
  renderSection(lines, metrics, "ihub_view_total", "Views by User", "user", BLUE, filters);

  // --- Views by artifact ---
  renderGrouped(lines, metrics, "ihub_view_total", "Views by Artifact", ["type", "name"], CYAN, filters);

  // --- Comments by user ---
  renderSection(lines, metrics, "ihub_comments_by_user_count", "Comments by User", "user", MAGENTA, filters);

  // --- Comments by artifact ---
  renderGrouped(lines, metrics, "ihub_comments_by_artifact_count", "Comments by Artifact", ["type", "name"], MAGENTA, filters);

  // --- Removes by user ---
  renderSection(lines, metrics, "ihub_remove_total", "Removes by User", "user", RED, filters);

  // --- HTTP requests by method ---
  if (!hasFilters) {
    renderSection(lines, metrics, "ihub_http_requests_total", "HTTP Requests by Method", "method", WHITE, filters);
  }

  // --- Footer ---
  const regs = sumValues(metrics, "ihub_register_total");
  if (regs > 0 && !hasFilters) {
    lines.push(`${DIM}Registrations: ${regs}${RESET}`);
  }

  lines.push(hr);
  lines.push(`${DIM}Source: /api/metrics  |  ${new Date().toISOString()}${RESET}`);
  if (!hasFilters) {
    lines.push(`${DIM}Tip: filter with --type agents --user alice --name code-reviewer --project ci-toolkit${RESET}`);
  }
  lines.push("");

  return lines.join("\n");
}

// --- Helpers ---

function getGaugeValue(metrics, name) {
  const entries = metrics[name] || [];
  if (entries.length === 0) return 0;
  if (entries.length === 1 && Object.keys(entries[0].labels).length === 0) return entries[0].value;
  return entries.reduce((sum, e) => sum + e.value, 0);
}

function sumValues(metrics, name) {
  return (metrics[name] || []).reduce((sum, e) => sum + e.value, 0);
}

function sumFiltered(metrics, name, filters) {
  return filterEntries(metrics[name], filters).reduce((sum, e) => sum + e.value, 0);
}

function groupByLabel(entries, labelKey) {
  const result = {};
  for (const entry of entries) {
    const key = entry.labels[labelKey] || "unknown";
    result[key] = (result[key] || 0) + entry.value;
  }
  return result;
}

function groupByLabels(entries, labelKeys) {
  const result = {};
  for (const entry of entries) {
    const key = labelKeys.map((k) => entry.labels[k] || "?").join("/");
    result[key] = (result[key] || 0) + entry.value;
  }
  return result;
}

function statBox(label, value, color) {
  return `${color}${BOLD}${value}${RESET} ${DIM}${label}${RESET}`;
}

function renderBar(value, max, maxWidth) {
  const filled = max > 0 ? Math.round((value / max) * maxWidth) : 0;
  return `${GREEN}${"█".repeat(filled)}${DIM}${"░".repeat(maxWidth - filled)}${RESET}`;
}

function renderBarColor(value, max, maxWidth, color) {
  const filled = max > 0 ? Math.round((value / max) * maxWidth) : 0;
  return `${color}${"█".repeat(filled)}${DIM}${"░".repeat(maxWidth - filled)}${RESET}`;
}

function renderSection(lines, metrics, metricName, title, groupLabel, color, filters) {
  const filtered = filterEntries(metrics[metricName], filters);
  const grouped = groupByLabel(filtered, groupLabel);
  if (Object.keys(grouped).length === 0) return;

  lines.push(`${BOLD}${color}${title}${RESET}`);
  const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...sorted.map(([, v]) => v), 1);
  for (const [key, value] of sorted.slice(0, 20)) {
    const bar = renderBarColor(value, maxVal, 25, color);
    lines.push(`  ${key.padEnd(20)} ${bar} ${value}`);
  }
  if (sorted.length > 20) lines.push(`  ${DIM}... and ${sorted.length - 20} more${RESET}`);
  lines.push("");
}

function renderGrouped(lines, metrics, metricName, title, labelKeys, color, filters) {
  const filtered = filterEntries(metrics[metricName], filters);
  const grouped = groupByLabels(filtered, labelKeys);
  if (Object.keys(grouped).length === 0) return;

  lines.push(`${BOLD}${color}${title}${RESET}`);
  const sorted = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const maxVal = Math.max(...sorted.map(([, v]) => v), 1);
  for (const [key, value] of sorted.slice(0, 20)) {
    const bar = renderBarColor(value, maxVal, 25, color);
    lines.push(`  ${key.padEnd(30)} ${bar} ${value}`);
  }
  if (sorted.length > 20) lines.push(`  ${DIM}... and ${sorted.length - 20} more${RESET}`);
  lines.push("");
}
