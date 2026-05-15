// Interactive TUI browser for ihub registry — zero dependencies.
// Uses raw stdin, ANSI escape codes, and native fetch.

import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { CODING_AGENTS, AGENT_NAMES, getInstallPath } from "./agents-config.js";

const ESC = "\x1b";
const CLEAR = `${ESC}[2J${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const CYAN = `${ESC}[36m`;
const YELLOW = `${ESC}[33m`;
const GREEN = `${ESC}[32m`;
const MAGENTA = `${ESC}[35m`;
const BLUE = `${ESC}[34m`;
const RED = `${ESC}[31m`;
const WHITE = `${ESC}[37m`;
const GRAY = `${ESC}[90m`;
const BG_CYAN = `${ESC}[46m`;
const BLACK = `${ESC}[30m`;
const INVERSE = `${ESC}[7m`;
const BG_YELLOW = `${ESC}[43m`;
const BG_GREEN = `${ESC}[42m`;

const TYPE_COLORS = {
  agents: CYAN, skills: GREEN, rules: YELLOW, memories: MAGENTA, prompts: BLUE,
};
const TYPE_ICONS = {
  agents: "A", skills: "S", rules: "R", memories: "M", prompts: "P",
};
const TYPES = ["agents", "skills", "rules", "memories", "prompts"];

export async function startTui(baseUrl, token) {
  const state = {
    view: "types",        // types | list | detail | comments | metrics | pulling
    selectedType: 0,
    selectedItem: 0,
    scrollOffset: 0,
    entries: {},
    detail: null,
    comments: null,
    metrics: null,
    audit: null,
    auditPage: 1,
    auditTotal: 0,
    marked: new Set(),    // "type/name" keys for multi-select
    pullResults: [],
    baseUrl,
    token,
    isAdmin: false,
  };

  process.stdout.write(CLEAR + HIDE_CURSOR);
  process.stdout.write(`${DIM}Loading registry...${RESET}`);

  // Fetch all types and check admin status
  for (const type of TYPES) {
    state.entries[type] = await fetchJson(`${baseUrl}/api/${type}`);
  }
  if (token) {
    const whoami = await fetchJson(`${baseUrl}/api/whoami`, token);
    if (whoami?.role === "admin") state.isAdmin = true;
  }

  const stdin = process.stdin;
  if (stdin.setRawMode) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf-8");

  render(state);

  stdin.on("data", async (key) => {
    // Ctrl+C to quit from anywhere
    if (key === "\x03") {
      cleanup();
      process.exit(0);
    }

    // Agent selection view — handle BEFORE generic ESC/Enter
    if (state.view === "agent-select") {
      const idx = parseInt(key, 10) - 1;
      if (idx >= 0 && idx < AGENT_NAMES.length) {
        if (!state.pullAgents) state.pullAgents = new Set();
        const a = AGENT_NAMES[idx];
        if (state.pullAgents.has(a)) state.pullAgents.delete(a);
        else state.pullAgents.add(a);
      } else if ((key === "\r" || key === "\n") && state.pullAgents?.size > 0) {
        state.view = "scope-select";
      } else if (key === ESC || key === "\x7f" || key === "q") {
        state.pullAgents = null;
        state.view = "list";
      }
      render(state);
      return;
    }

    // Scope selection view — handle BEFORE generic ESC/Enter
    if (state.view === "scope-select") {
      if (key === "l" || key === "p") {
        state.pullScope = "local";
        await executeBulkPull(state, baseUrl, token);
      } else if (key === "g") {
        state.pullScope = "global";
        await executeBulkPull(state, baseUrl, token);
      } else if (key === ESC || key === "\x7f" || key === "q") {
        state.view = "list";
        render(state);
      }
      return;
    }

    // Pulling view — any key goes back
    if (state.view === "pulling") {
      state.view = "list";
      state.pullResults = [];
      render(state);
      return;
    }

    // Audit view — n/b for pagination, ESC to go back
    if (state.view === "audit") {
      if (key === "n" && state.auditPage * 50 < state.auditTotal) {
        state.auditPage++;
        await loadAuditPage(state, baseUrl, token);
        state.scrollOffset = 0;
      } else if (key === "b" && state.auditPage > 1) {
        state.auditPage--;
        await loadAuditPage(state, baseUrl, token);
        state.scrollOffset = 0;
      } else if (key === ESC || key === "\x7f" || key === "q") {
        state.view = "types";
        state.audit = null;
        state.scrollOffset = 0;
      } else if (key === "r") {
        await loadAuditPage(state, baseUrl, token);
      } else if (key === `${ESC}[A`) {
        state.scrollOffset = Math.max(0, state.scrollOffset - 1);
      } else if (key === `${ESC}[B`) {
        state.scrollOffset++;
      }
      render(state);
      return;
    }

    // q at top level to quit
    if (key === "q" && state.view === "types") {
      cleanup();
      process.exit(0);
    }

    // Escape / backspace / q — go back
    if (key === ESC || key === "\x7f" || key === "q") {
      if (state.view === "comments") {
        state.view = "detail";
        state.scrollOffset = 0;
      } else if (state.view === "metrics") {
        state.view = "types";
        state.metrics = null;
        state.scrollOffset = 0;
      } else if (state.view === "detail") {
        state.view = "list";
        state.detail = null;
        state.comments = null;
      } else if (state.view === "list") {
        state.view = "types";
        state.selectedItem = 0;
        state.scrollOffset = 0;
        state.isSearch = false;
        state.searchResults = null;
        state.marked.clear();
      }
      render(state);
      return;
    }

    // Arrow up
    if (key === `${ESC}[A`) {
      if (state.view === "types") {
        state.selectedType = Math.max(0, state.selectedType - 1);
      } else if (state.view === "list") {
        state.selectedItem = Math.max(0, state.selectedItem - 1);
        adjustScroll(state);
      } else {
        state.scrollOffset = Math.max(0, state.scrollOffset - 1);
      }
      render(state);
      return;
    }

    // Arrow down
    if (key === `${ESC}[B`) {
      if (state.view === "types") {
        state.selectedType = Math.min(TYPES.length - 1, state.selectedType + 1);
      } else if (state.view === "list") {
        const items = getCurrentItems(state);
        state.selectedItem = Math.min(items.length - 1, state.selectedItem + 1);
        adjustScroll(state);
      } else {
        state.scrollOffset++;
      }
      render(state);
      return;
    }

    // Enter — drill in
    if (key === "\r" || key === "\n") {
      if (state.view === "types") {
        state.view = "list";
        state.selectedItem = 0;
        state.scrollOffset = 0;
      } else if (state.view === "list") {
        const items = getCurrentItems(state);
        if (items.length > 0) {
          const item = items[state.selectedItem];
          const type = state.isSearch ? (item.type || TYPES[state.selectedType]) : TYPES[state.selectedType];
          state.detail = await fetchJson(`${baseUrl}/api/${type}/${item.name}`);
          state.comments = await fetchJson(`${baseUrl}/api/${type}/${item.name}/comments`);
          state.view = "detail";
          state.scrollOffset = 0;
        }
      }
      render(state);
      return;
    }

    // Space — toggle selection in list view
    if (key === " " && state.view === "list") {
      const items = getCurrentItems(state);
      if (items.length > 0) {
        const item = items[state.selectedItem];
        const type = state.isSearch ? (item.type || TYPES[state.selectedType]) : TYPES[state.selectedType];
        const itemKey = `${type}/${item.name}`;
        if (state.marked.has(itemKey)) {
          state.marked.delete(itemKey);
        } else {
          state.marked.add(itemKey);
        }
        // Move down after toggling
        state.selectedItem = Math.min(items.length - 1, state.selectedItem + 1);
        adjustScroll(state);
      }
      render(state);
      return;
    }

    // a — select all / deselect all in list view
    if (key === "a" && state.view === "list") {
      const items = getCurrentItems(state);
      const type = TYPES[state.selectedType];
      const allKeys = items.map((item) => {
        const t = state.isSearch ? (item.type || type) : type;
        return `${t}/${item.name}`;
      });
      const allSelected = allKeys.every((k) => state.marked.has(k));
      if (allSelected) {
        allKeys.forEach((k) => state.marked.delete(k));
      } else {
        allKeys.forEach((k) => state.marked.add(k));
      }
      render(state);
      return;
    }

    // p — bulk pull selected (from list view)
    if (key === "p" && state.view === "list" && state.marked.size > 0) {
      state.pullAgents = null;
      state.pullScope = null;
      state.view = "agent-select";
      render(state);
      return;
    }

    // c — toggle comments view (from detail)
    if (key === "c" && (state.view === "detail" || state.view === "comments")) {
      if (state.view === "comments") {
        state.view = "detail";
      } else {
        state.view = "comments";
      }
      state.scrollOffset = 0;
      render(state);
      return;
    }

    // m — metrics (admin only, from types view)
    if (key === "m" && state.view === "types" && state.isAdmin) {
      process.stdout.write(CLEAR + `${DIM}Loading metrics...${RESET}`);
      state.metrics = await fetchText(`${baseUrl}/api/metrics`, token);
      state.view = "metrics";
      state.scrollOffset = 0;
      render(state);
      return;
    }

    // r — refresh
    if (key === "r") {
      process.stdout.write(CLEAR + `${DIM}Refreshing...${RESET}`);
      for (const type of TYPES) {
        state.entries[type] = await fetchJson(`${baseUrl}/api/${type}`);
      }
      if (state.view === "detail" && state.detail) {
        const type = TYPES[state.selectedType];
        state.detail = await fetchJson(`${baseUrl}/api/${type}/${state.detail.name}`);
        state.comments = await fetchJson(`${baseUrl}/api/${type}/${state.detail.name}/comments`);
      }
      if (state.view === "metrics") {
        state.metrics = await fetchText(`${baseUrl}/api/metrics`, token);
      }
      if (state.view === "audit") {
        await loadAuditPage(state, baseUrl, token);
      }
      render(state);
      return;
    }

    // / — search
    if (key === "/" && (state.view === "types" || state.view === "list")) {
      cleanup();
      process.stdout.write(`${CLEAR}${BOLD}Search: ${RESET}`);
      if (stdin.setRawMode) stdin.setRawMode(false);
      const query = await new Promise((resolve) => {
        stdin.once("data", (d) => resolve(d.toString().trim()));
      });
      if (stdin.setRawMode) stdin.setRawMode(true);
      if (query) {
        state.searchResults = await fetchJson(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
        state.view = "list";
        state.selectedItem = 0;
        state.scrollOffset = 0;
        state.isSearch = true;
        state.searchQuery = query;
      }
      process.stdout.write(HIDE_CURSOR);
      render(state);
      return;
    }
  });
}

function getCurrentItems(state) {
  if (state.isSearch && state.searchResults) return state.searchResults;
  return state.entries[TYPES[state.selectedType]] || [];
}

// --- Rendering ---

function render(state) {
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  const contentRows = rows - 4;

  let output = CLEAR;

  // Header
  output += `${BG_CYAN}${BLACK}${BOLD} ihub browser ${RESET}`;
  output += `  ${DIM}${state.baseUrl}${RESET}`;
  if (state.isAdmin) output += `  ${BG_GREEN}${BLACK} ADMIN ${RESET}`;
  if (state.marked.size > 0) output += `  ${BG_YELLOW}${BLACK} ${state.marked.size} selected ${RESET}`;
  if (state.isSearch) output += `  ${YELLOW}search: "${state.searchQuery}"${RESET}`;
  output += "\n";
  output += `${DIM}${"─".repeat(cols)}${RESET}\n`;

  if (state.view === "types") output += renderTypes(state, contentRows);
  else if (state.view === "list") output += renderList(state, contentRows, cols);
  else if (state.view === "detail") output += renderDetail(state, contentRows, cols);
  else if (state.view === "comments") output += renderComments(state, contentRows, cols);
  else if (state.view === "metrics") output += renderMetrics(state, contentRows, cols);
  else if (state.view === "audit") output += renderAudit(state, contentRows, cols);
  else if (state.view === "agent-select") output += renderAgentSelect(state, contentRows);
  else if (state.view === "scope-select") output += renderScopeSelect(state, contentRows);
  else if (state.view === "pulling") output += renderPulling(state, contentRows, cols);

  // Footer
  output += `\n${DIM}${"─".repeat(cols)}${RESET}\n`;
  const footers = {
    types: ` ↑↓ navigate  ⏎ select  / search  ${state.isAdmin ? "m metrics  t audit  " : ""}r refresh  q quit`,
    audit: ` ↑↓ scroll  n next page  b prev page  r refresh  esc back`,
    list: ` ↑↓ navigate  ⏎ view  space select  a all  ${state.marked.size > 0 ? "p pull selected  " : ""}/ search  esc back`,
    "agent-select": ` 1-${AGENT_NAMES.length} toggle  ⏎ confirm  esc cancel`,
    "scope-select": ` l project  g personal  esc cancel`,
    pulling: ` Press any key to continue`,
    detail: ` ↑↓ scroll  c comments  r refresh  esc back`,
    comments: ` ↑↓ scroll  c back to detail  esc back`,
    metrics: ` ↑↓ scroll  r refresh  esc back`,
  };
  output += `${DIM}${footers[state.view] || ""}${RESET}`;

  process.stdout.write(output);
}

function renderTypes(state, maxRows) {
  let out = "";
  for (let i = 0; i < TYPES.length; i++) {
    const type = TYPES[i];
    const count = (state.entries[type] || []).length;
    const color = TYPE_COLORS[type];
    const icon = TYPE_ICONS[type];
    const selected = i === state.selectedType;

    if (selected) {
      out += `  ${INVERSE} ${icon} ${RESET} ${color}${BOLD}${type}${RESET}`;
    } else {
      out += `    ${color}${icon}${RESET} ${type}`;
    }
    out += `  ${DIM}(${count})${RESET}\n`;

    if (selected) {
      const entries = state.entries[type] || [];
      const preview = entries.slice(0, Math.min(5, maxRows - TYPES.length - 2));
      for (const e of preview) {
        const ver = e.version ? `${GRAY}@${e.version}${RESET}` : "";
        out += `      ${DIM}├─${RESET} ${e.name}${ver}\n`;
      }
      if (entries.length > 5) out += `      ${DIM}└─ ...and ${entries.length - 5} more${RESET}\n`;
      else if (entries.length === 0) out += `      ${DIM}└─ (empty)${RESET}\n`;
    }
  }
  return out;
}

function renderList(state, maxRows, cols) {
  const type = TYPES[state.selectedType];
  const color = TYPE_COLORS[type];
  const items = getCurrentItems(state);

  let out = `  ${color}${BOLD}${state.isSearch ? "Search results" : type}${RESET}`;
  out += `  ${DIM}(${items.length} entries)${RESET}\n\n`;

  if (items.length === 0) return out + `  ${DIM}No entries found.${RESET}\n`;

  const visible = Math.min(items.length, maxRows - 3);
  for (let i = state.scrollOffset; i < Math.min(items.length, state.scrollOffset + visible); i++) {
    const item = items[i];
    const selected = i === state.selectedItem;
    const ver = item.version ? `${GRAY}@${item.version}${RESET}` : "";
    const desc = item.description || "";
    const maxDesc = cols - 40;
    const truncDesc = desc.length > maxDesc ? desc.slice(0, maxDesc) + "..." : desc;
    const itemType = state.isSearch ? (item.type || TYPES[state.selectedType]) : TYPES[state.selectedType];
    const itemKey = `${itemType}/${item.name}`;
    const isMarked = state.marked.has(itemKey);
    const checkbox = isMarked ? `${GREEN}\u25c9${RESET}` : `${DIM}\u25cb${RESET}`;
    const typeLabel = state.isSearch ? `${TYPE_COLORS[item.type] || ""}[${(item.type || "?").replace(/s$/, "")}]${RESET} ` : "";

    if (selected) {
      out += `  ${INVERSE} > ${RESET} ${checkbox} ${typeLabel}${BOLD}${item.name}${RESET}${ver}\n`;
      out += `        ${DIM}${truncDesc}${RESET}\n`;
      const tags = Array.isArray(item.tags) ? item.tags : [];
      if (tags.length > 0) out += `        ${tags.map((t) => `${CYAN}#${t}${RESET}`).join(" ")}\n`;
    } else {
      out += `    ${checkbox} ${typeLabel}${item.name}${ver} ${DIM}${truncDesc.slice(0, maxDesc - 10)}${RESET}\n`;
    }
  }

  if (items.length > visible) out += `\n  ${DIM}${state.scrollOffset + visible}/${items.length} shown${RESET}`;
  return out;
}

function renderDetail(state, maxRows, cols) {
  const entry = state.detail;
  if (!entry) return `  ${DIM}Loading...${RESET}\n`;

  const type = TYPES[state.selectedType];
  const color = TYPE_COLORS[type] || WHITE;
  const lines = [];

  // Title + rating
  let titleLine = `  ${color}${BOLD}${entry.name}${RESET} ${GRAY}@${entry.version || "?"}${RESET}`;
  if (state.comments?.rating?.count > 0) {
    const r = state.comments.rating;
    const stars = "\u2605".repeat(Math.round(r.average)) + "\u2606".repeat(5 - Math.round(r.average));
    titleLine += `  ${YELLOW}${stars} ${r.average}/5${RESET} ${DIM}(${r.count} review${r.count !== 1 ? "s" : ""})${RESET}`;
  }
  lines.push(titleLine);
  lines.push(`  ${DIM}${entry.description || ""}${RESET}`);
  lines.push("");

  // Metadata
  const metaPairs = [
    ["Owner", entry.owner],
    ["Author", entry.author || entry.meta?.author],
    ["Project", entry.meta?.project || entry.project],
    ["Type", type],
  ].filter(([, v]) => v);
  for (const [key, val] of metaPairs) lines.push(`  ${CYAN}${key}:${RESET} ${val}`);

  // Tags
  const tags = entry.tags || entry.meta?.tags || [];
  if (Array.isArray(tags) && tags.length > 0) {
    lines.push(`  ${CYAN}Tags:${RESET} ${tags.map((t) => `${GREEN}#${t}${RESET}`).join(" ")}`);
  }

  // Type-specific fields
  const metaObj = entry.meta || {};
  const typeFields = {
    agents: ["inputs", "outputs", "skills", "rules"],
    skills: ["triggers", "args", "compatible_agents"],
    rules: ["scope", "severity", "applies_to"],
    memories: ["scope", "context_type", "related"],
    prompts: ["model", "compatible_agents"],
  };
  for (const field of (typeFields[type] || [])) {
    const val = metaObj[field] || entry[field];
    if (val && (!Array.isArray(val) || val.length > 0)) {
      lines.push(`  ${CYAN}${field}:${RESET} ${Array.isArray(val) ? val.join(", ") : val}`);
    }
  }

  // Attachments
  if (entry.attachments?.length > 0) {
    lines.push("");
    lines.push(`  ${YELLOW}${BOLD}Attachments (${entry.attachments.length})${RESET}`);
    for (const att of entry.attachments.slice(0, 8)) {
      lines.push(`    ${DIM}├─${RESET} ${att.filepath} ${GRAY}(${att.size}B)${RESET}`);
    }
    if (entry.attachments.length > 8) lines.push(`    ${DIM}└─ ...and ${entry.attachments.length - 8} more${RESET}`);
  }

  // Recent comments preview
  if (state.comments?.comments?.length > 0) {
    lines.push("");
    lines.push(`  ${MAGENTA}${BOLD}Recent reviews${RESET}  ${DIM}(press c for all)${RESET}`);
    for (const c of state.comments.comments.slice(0, 3)) {
      const stars = `${YELLOW}${"★".repeat(c.rating)}${"☆".repeat(5 - c.rating)}${RESET}`;
      lines.push(`    ${stars}  ${CYAN}@${c.username}${RESET}  ${DIM}${c.created_at}${RESET}`);
      const preview = c.body.length > cols - 10 ? c.body.slice(0, cols - 13) + "..." : c.body;
      lines.push(`    ${preview}`);
    }
    if (state.comments.comments.length > 3) {
      lines.push(`    ${DIM}...and ${state.comments.comments.length - 3} more (press c)${RESET}`);
    }
  }

  // Body
  if (entry.body) {
    lines.push("");
    lines.push(`  ${DIM}${"─".repeat(cols - 4)}${RESET}`);
    for (const line of entry.body.split("\n")) {
      if (line.startsWith("# ")) lines.push(`  ${BOLD}${MAGENTA}${line.slice(2)}${RESET}`);
      else if (line.startsWith("## ")) lines.push(`  ${BOLD}${YELLOW}${line.slice(3)}${RESET}`);
      else if (line.startsWith("### ")) lines.push(`  ${BOLD}${CYAN}${line.slice(4)}${RESET}`);
      else if (line.startsWith("- ")) lines.push(`  ${CYAN}\u2022${RESET} ${line.slice(2)}`);
      else if (line.startsWith("```")) lines.push(`  ${DIM}${line}${RESET}`);
      else lines.push(`  ${line}`);
    }
  }

  return scrollView(lines, state.scrollOffset, maxRows);
}

function renderComments(state, maxRows, cols) {
  const entry = state.detail;
  const data = state.comments;
  if (!entry || !data) return `  ${DIM}No data.${RESET}\n`;

  const lines = [];
  const type = TYPES[state.selectedType];
  const color = TYPE_COLORS[type] || WHITE;

  // Header
  lines.push(`  ${color}${BOLD}${entry.name}${RESET} — Reviews`);

  if (data.rating?.count > 0) {
    const r = data.rating;
    const stars = `${YELLOW}${"★".repeat(Math.round(r.average))}${"☆".repeat(5 - Math.round(r.average))}${RESET}`;
    lines.push(`  ${stars}  ${BOLD}${r.average}/5${RESET}  ${DIM}(${r.count} review${r.count !== 1 ? "s" : ""})${RESET}`);

    // Rating distribution
    lines.push("");
    for (let s = 5; s >= 1; s--) {
      const count = data.comments.filter((c) => c.rating === s).length;
      const pct = Math.round((count / r.count) * 100);
      const barLen = Math.round((count / r.count) * 20);
      lines.push(`  ${s}★ ${YELLOW}${"█".repeat(barLen)}${DIM}${"░".repeat(20 - barLen)}${RESET} ${count} (${pct}%)`);
    }
  } else {
    lines.push(`  ${DIM}No reviews yet.${RESET}`);
  }

  lines.push("");
  lines.push(`  ${DIM}${"─".repeat(cols - 4)}${RESET}`);

  // All comments
  for (const c of (data.comments || [])) {
    lines.push("");
    const stars = `${YELLOW}${"★".repeat(c.rating)}${"☆".repeat(5 - c.rating)}${RESET}`;
    lines.push(`  ${stars}  ${CYAN}${BOLD}@${c.username}${RESET}  ${DIM}${c.created_at}${RESET}`);
    // Wrap body
    for (const bodyLine of c.body.split("\n")) {
      lines.push(`  ${bodyLine}`);
    }
  }

  return scrollView(lines, state.scrollOffset, maxRows);
}

function renderMetrics(state, maxRows, cols) {
  if (!state.metrics) return `  ${DIM}No metrics available.${RESET}\n`;

  const lines = [];
  lines.push(`  ${BG_YELLOW}${BLACK}${BOLD} Metrics Dashboard ${RESET}`);
  lines.push("");

  // Parse the prometheus text
  const parsed = {};
  for (const line of state.metrics.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_]+)(?:\{(.+?)\})?\s+(.+)$/);
    if (!m) continue;
    const [, name, labelsStr, valStr] = m;
    if (!parsed[name]) parsed[name] = [];
    const labels = {};
    if (labelsStr) {
      for (const pair of labelsStr.match(/[a-zA-Z_]+="[^"]*"/g) || []) {
        const eq = pair.indexOf("=");
        labels[pair.slice(0, eq)] = pair.slice(eq + 2, -1);
      }
    }
    parsed[name].push({ labels, value: parseFloat(valStr) });
  }

  // Summary stats
  const users = sumGauge(parsed, "ihub_users_count");
  const entries = sumGauge(parsed, "ihub_entries_count");
  const comments = sumGauge(parsed, "ihub_comments_count");
  const pushes = sumGauge(parsed, "ihub_push_total");
  const views = sumGauge(parsed, "ihub_view_total");
  const searches = sumGauge(parsed, "ihub_search_total");

  lines.push(`  ${CYAN}${BOLD}${users}${RESET} ${DIM}Users${RESET}   ${GREEN}${BOLD}${entries}${RESET} ${DIM}Entries${RESET}   ${MAGENTA}${BOLD}${comments}${RESET} ${DIM}Comments${RESET}   ${YELLOW}${BOLD}${pushes}${RESET} ${DIM}Pushes${RESET}   ${BLUE}${BOLD}${views}${RESET} ${DIM}Views${RESET}   ${WHITE}${BOLD}${searches}${RESET} ${DIM}Searches${RESET}`);
  lines.push("");

  // Entries by type
  const entryTypes = parsed["ihub_entries_count"] || [];
  if (entryTypes.length > 0) {
    lines.push(`  ${BOLD}${YELLOW}Entries by Type${RESET}`);
    const maxV = Math.max(...entryTypes.map((e) => e.value), 1);
    for (const e of entryTypes) {
      const bar = `${GREEN}${"█".repeat(Math.round((e.value / maxV) * 20))}${DIM}${"░".repeat(20 - Math.round((e.value / maxV) * 20))}${RESET}`;
      lines.push(`    ${(e.labels.type || "?").padEnd(12)} ${bar} ${e.value}`);
    }
    lines.push("");
  }

  // Pushes by user
  const pushByUser = groupMetric(parsed, "ihub_push_total", "user");
  if (Object.keys(pushByUser).length > 0) {
    lines.push(`  ${BOLD}${GREEN}Pushes by User${RESET}`);
    renderMetricBars(lines, pushByUser, GREEN);
    lines.push("");
  }

  // Views by artifact
  const viewByName = groupMetric(parsed, "ihub_view_total", "name");
  if (Object.keys(viewByName).length > 0) {
    lines.push(`  ${BOLD}${BLUE}Top Viewed Artifacts${RESET}`);
    renderMetricBars(lines, viewByName, BLUE, 10);
    lines.push("");
  }

  // Comments by artifact
  const commentByArt = groupMetric(parsed, "ihub_comments_by_artifact_count", "name");
  if (Object.keys(commentByArt).length > 0) {
    lines.push(`  ${BOLD}${MAGENTA}Comments by Artifact${RESET}`);
    renderMetricBars(lines, commentByArt, MAGENTA, 10);
    lines.push("");
  }

  // HTTP by method
  const httpByMethod = groupMetric(parsed, "ihub_http_requests_total", "method");
  if (Object.keys(httpByMethod).length > 0) {
    lines.push(`  ${BOLD}${WHITE}HTTP by Method${RESET}`);
    renderMetricBars(lines, httpByMethod, WHITE);
    lines.push("");
  }

  lines.push(`  ${DIM}Source: /api/metrics  |  ${new Date().toISOString()}${RESET}`);

  return scrollView(lines, state.scrollOffset, maxRows);
}

function renderAgentSelect(state, maxRows) {
  const selected = state.pullAgents || new Set();
  let out = `  ${BOLD}Select coding agent(s)${RESET}  ${DIM}(toggle with number keys, ⏎ to confirm)${RESET}\n\n`;
  for (let i = 0; i < AGENT_NAMES.length; i++) {
    const a = AGENT_NAMES[i];
    const config = CODING_AGENTS[a];
    const check = selected.has(a) ? `${GREEN}\u25c9${RESET}` : `${DIM}\u25cb${RESET}`;
    out += `  ${check} ${CYAN}[${i + 1}]${RESET} ${BOLD}${config.name}${RESET}\n`;
  }
  out += `\n  ${DIM}${state.marked.size} artifact(s) × ${selected.size || 0} agent(s)${RESET}\n`;
  return out;
}

function renderScopeSelect(state, maxRows) {
  const agents = state.pullAgents ? [...state.pullAgents] : [];
  const names = agents.map((a) => CODING_AGENTS[a]?.name || a).join(", ");
  let out = `  ${BOLD}Install scope for ${names}${RESET}\n\n`;
  out += `  ${GREEN}[l]${RESET} ${BOLD}Project${RESET}  — install to project directory\n`;
  out += `  ${BLUE}[g]${RESET} ${BOLD}Personal${RESET} — install to home directory\n`;
  out += `\n  ${DIM}${state.marked.size} artifact(s) × ${agents.length} agent(s)${RESET}\n`;
  return out;
}

async function executeBulkPull(state, baseUrl, token) {
  state.view = "pulling";
  state.pullResults = [];
  render(state);

  const agents = [...(state.pullAgents || ["ihub"])];
  const scope = state.pullScope || "local";
  const toPull = [...state.marked];

  for (const itemKey of toPull) {
    const [type, name] = itemKey.split("/");

    // Fetch entry once
    state.pullResults.push({ type, name, status: "pulling" });
    render(state);

    let data;
    try {
      const h = {};
      if (token) h["Authorization"] = `Bearer ${token}`;
      h["X-Ihub-Action"] = "pull";
      const res = await fetch(`${baseUrl}/api/${type}/${name}`, { headers: h });
      if (!res.ok) {
        state.pullResults[state.pullResults.length - 1].status = "error";
        state.pullResults[state.pullResults.length - 1].error = `HTTP ${res.status}`;
        render(state);
        continue;
      }
      data = await res.json();
    } catch (err) {
      state.pullResults[state.pullResults.length - 1].status = "error";
      state.pullResults[state.pullResults.length - 1].error = err.message;
      render(state);
      continue;
    }

    const ver = data.version || data.meta?.version || "?";

    // Build markdown
    const meta = data.meta || {};
    const mdLines = ["---"];
    for (const [k, v] of Object.entries(meta)) {
      if (Array.isArray(v)) mdLines.push(`${k}: [${v.join(", ")}]`);
      else mdLines.push(`${k}: ${v}`);
    }
    mdLines.push("---", "");
    if (data.body) mdLines.push(data.body);
    const markdown = mdLines.join("\n");

    // Memories always go to local working directory
    if (type === "memories") {
      const targetDir = "memories";
      mkdirSync(targetDir, { recursive: true });
      const targetPath = resolve(targetDir, `${name}.md`);
      writeFileSync(targetPath, markdown);

      const r = state.pullResults[state.pullResults.length - 1];
      r.status = "done";
      r.version = ver;
      r.target = targetPath;
      r.attachments = 0;
      render(state);
      continue;
    }

    // Install for each selected agent
    const targets = [];
    const isSkillType = (type === "skills" || type === "agents" || type === "prompts");

    for (const agent of agents) {
      try {
        const installInfo = getInstallPath(agent, type, scope);

        if (!installInfo?.path) {
          // Not supported for this agent — skip silently
          continue;
        }

        const targetDir = installInfo.path;
        let targetPath;

        if (installInfo.skillAsDir && installInfo.skillFilename && isSkillType) {
          // Directory-based: <dir>/<name>/SKILL.md
          const skillDir = resolve(targetDir, name);
          mkdirSync(skillDir, { recursive: true });
          targetPath = resolve(skillDir, installInfo.skillFilename);
        } else {
          // Flat file: <dir>/<name>.md or <name>.mdc
          const ext = installInfo.ext || ".md";
          mkdirSync(targetDir, { recursive: true });
          targetPath = resolve(targetDir, `${name}${ext}`);
        }

        writeFileSync(targetPath, markdown);
        targets.push(targetPath);

        // Download attachments
        if (data.attachments?.length > 0) {
          const attachDir = resolve(dirname(targetPath), name);
          for (const att of data.attachments) {
            try {
              const attRes = await fetch(`${baseUrl}/api/${type}/${name}/attachments/${att.filepath}`);
              if (attRes.ok) {
                const buf = Buffer.from(await attRes.arrayBuffer());
                const attPath = resolve(attachDir, att.filepath);
                mkdirSync(dirname(attPath), { recursive: true });
                writeFileSync(attPath, buf);
              }
            } catch {}
          }
        }
      } catch (agentErr) {
        // Don't let one agent failure stop the rest
        targets.push(`ERROR: ${CODING_AGENTS[agent]?.name || agent}: ${agentErr.message}`);
      }
    }

    const r = state.pullResults[state.pullResults.length - 1];
    r.status = "done";
    r.version = ver;
    r.attachments = data.attachments?.length || 0;
    r.target = targets.length === 1 ? targets[0] : `${targets.length} locations`;
    render(state);
  }

  const agentNames = agents.map((a) => CODING_AGENTS[a]?.name || a).join(", ");
  state.pullResults.push({
    type: "—", name: "Pull complete", status: "summary",
    total: toPull.length, agent: agentNames, scope,
  });
  state.marked.clear();
  state.pullAgents = null;
  state.pullScope = null;
  render(state);
}

async function loadAuditPage(state, baseUrl, token) {
  const offset = (state.auditPage - 1) * 50;
  process.stdout.write(CLEAR + `${DIM}Loading audit trail...${RESET}`);
  const data = await fetchJson(`${baseUrl}/api/audit?limit=50&offset=${offset}`, token);
  state.audit = data?.entries || [];
  state.auditTotal = data?.total || 0;
}

function renderAudit(state, maxRows, cols) {
  if (!state.audit) return `  ${DIM}No audit data.${RESET}\n`;

  const totalPages = Math.ceil(state.auditTotal / 50) || 1;
  const lines = [];

  lines.push(`  ${BG_YELLOW}${BLACK}${BOLD} Audit Trail ${RESET}  ${DIM}${state.auditTotal} records  |  page ${state.auditPage}/${totalPages}${RESET}`);
  lines.push("");

  if (state.audit.length === 0) {
    lines.push(`  ${DIM}No records found.${RESET}`);
    return scrollView(lines, state.scrollOffset, maxRows);
  }

  const ACTION_COLORS = {
    push: GREEN, pull: GREEN,
    view: BLUE, list: BLUE, search: BLUE, versions: BLUE, "view-comments": BLUE,
    comment: MAGENTA, "delete-comment": MAGENTA,
    remove: RED, backup: RED, "set-role": RED, "change-password": YELLOW,
    register: YELLOW, digest: YELLOW,
  };

  for (const entry of state.audit) {
    const isAdmin = entry.role === "admin";
    const roleBadge = isAdmin
      ? `${ESC}[41m${ESC}[37m ADMIN ${RESET}`
      : `${ESC}[44m${ESC}[37m USER  ${RESET}`;

    const time = `${DIM}${entry.created_at || ""}${RESET}`;
    const ip = entry.ip ? `${GRAY}${entry.ip.padEnd(15)}${RESET}` : `${GRAY}${"—".padEnd(15)}${RESET}`;
    const userColor = isAdmin ? RED : CYAN;
    const user = `${userColor}${BOLD}${(entry.username || "anonymous").padEnd(12)}${RESET}`;
    const actionColor = ACTION_COLORS[entry.action] || WHITE;
    const action = `${actionColor}${BOLD}${(entry.action || "").toUpperCase().padEnd(15)}${RESET}`;

    let target = "";
    if (entry.type && entry.name) {
      target = `${YELLOW}${entry.type}/${entry.name}${RESET}`;
    } else if (entry.type) {
      target = `${YELLOW}${entry.type}${RESET}`;
    }

    const detail = entry.detail ? `${DIM}(${entry.detail})${RESET}` : "";

    lines.push(`  ${time}  ${ip}  ${user} ${roleBadge} ${action} ${target} ${detail}`);
  }

  if (totalPages > 1) {
    lines.push("");
    const hints = [];
    if (state.auditPage < totalPages) hints.push(`n → page ${state.auditPage + 1}`);
    if (state.auditPage > 1) hints.push(`b → page ${state.auditPage - 1}`);
    lines.push(`  ${DIM}${hints.join("  |  ")}${RESET}`);
  }

  return scrollView(lines, state.scrollOffset, maxRows);
}

function renderPulling(state, maxRows, cols) {
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Pulling artifacts ${RESET}`);
  lines.push("");

  for (const r of state.pullResults) {
    if (r.status === "summary") {
      lines.push("");
      lines.push(`  ${BOLD}${GREEN}\u2714 ${r.total} artifact(s) processed${RESET}`);
      if (r.agent) lines.push(`  ${DIM}Agent: ${r.agent}  |  Scope: ${r.scope}${RESET}`);
      lines.push(`  ${DIM}Press any key to continue${RESET}`);
    } else if (r.status === "pulling") {
      lines.push(`  ${YELLOW}\u25cf${RESET} ${r.type}/${r.name} ${DIM}pulling...${RESET}`);
    } else if (r.status === "done") {
      const ver = r.version ? `@${r.version}` : "";
      const att = r.attachments > 0 ? ` (+${r.attachments} files)` : "";
      lines.push(`  ${GREEN}\u2714${RESET} ${r.type}/${r.name}${GRAY}${ver}${att}${RESET}`);
      if (r.target) lines.push(`    ${DIM}→ ${r.target}${RESET}`);
    } else if (r.status === "error") {
      lines.push(`  ${RED}\u2718${RESET} ${r.type}/${r.name} ${RED}${r.error}${RESET}`);
    }
  }

  return scrollView(lines, state.scrollOffset, maxRows);
}

// --- Helpers ---

function scrollView(lines, offset, maxRows) {
  const visible = lines.slice(offset, offset + maxRows);
  let out = visible.join("\n") + "\n";
  if (lines.length > maxRows) {
    out += `\n  ${DIM}${offset + 1}-${Math.min(offset + maxRows, lines.length)} of ${lines.length} lines${RESET}`;
  }
  return out;
}

function sumGauge(parsed, name) {
  return (parsed[name] || []).reduce((s, e) => s + e.value, 0);
}

function groupMetric(parsed, name, label) {
  const result = {};
  for (const e of (parsed[name] || [])) {
    const k = e.labels[label] || "?";
    result[k] = (result[k] || 0) + e.value;
  }
  return result;
}

function renderMetricBars(lines, data, color, limit = 20) {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const maxV = Math.max(...sorted.map(([, v]) => v), 1);
  for (const [key, value] of sorted) {
    const barLen = Math.max(1, Math.round((value / maxV) * 20));
    lines.push(`    ${key.padEnd(20)} ${color}${"█".repeat(barLen)}${DIM}${"░".repeat(20 - barLen)}${RESET} ${value}`);
  }
}

function adjustScroll(state) {
  const rows = (process.stdout.rows || 24) - 6;
  if (state.selectedItem < state.scrollOffset) state.scrollOffset = state.selectedItem;
  else if (state.selectedItem >= state.scrollOffset + rows) state.scrollOffset = state.selectedItem - rows + 1;
}

function cleanup() {
  process.stdout.write(SHOW_CURSOR + CLEAR);
  try { process.stdin.setRawMode(false); } catch {}
}

// --- API ---

async function fetchJson(url, token) {
  try {
    const h = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) return Array.isArray(await res.json().catch(() => null)) ? [] : null;
    return await res.json();
  } catch { return null; }
}

async function fetchText(url, token) {
  try {
    const h = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    const res = await fetch(url, { headers: h });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}
