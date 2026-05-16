// Interactive TUI browser for ihub registry — zero dependencies.
// Features: live preview, fuzzy filter, breadcrumbs, pull indicators,
// blocked tab, tab navigation, sorting, ratings, help overlay,
// bookmarks, quick pull, dependency graph, clipboard, notifications.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { CODING_AGENTS, AGENT_NAMES, getInstallPath } from "./agents-config.js";

const ESC = "\x1b";
const CLEAR = `${ESC}[2J${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

const THEME = process.env.IHUB_THEME || "dark";

const CYAN = `${ESC}[36m`;
const YELLOW = `${ESC}[33m`;
const GREEN = `${ESC}[32m`;
const MAGENTA = `${ESC}[35m`;
const BLUE = `${ESC}[34m`;
const RED = `${ESC}[31m`;
const WHITE = THEME === "light" ? `${ESC}[90m` : `${ESC}[37m`;
const GRAY = THEME === "light" ? `${ESC}[37m` : `${ESC}[90m`;
const BG_CYAN = THEME === "light" ? `${ESC}[106m` : `${ESC}[46m`;
const BLACK = THEME === "light" ? `${ESC}[30m` : `${ESC}[30m`;
const INVERSE = `${ESC}[7m`;
const BG_YELLOW = THEME === "light" ? `${ESC}[103m` : `${ESC}[43m`;
const BG_GREEN = THEME === "light" ? `${ESC}[102m` : `${ESC}[42m`;
const BG_RED = `${ESC}[41m`;

const TYPE_COLORS = { agents: CYAN, skills: GREEN, rules: YELLOW, memories: MAGENTA, prompts: BLUE };
const TYPE_ICONS = { agents: "\u25C6", skills: "\u25B6", rules: "\u25A0", memories: "\u25CF", prompts: "\u25B2" };
const TYPES = ["agents", "skills", "rules", "memories", "prompts"];

// Bookmarks file
const BOOKMARKS_PATH = join(homedir(), ".ihub-bookmarks.json");

function loadBookmarks() {
  try { return JSON.parse(readFileSync(BOOKMARKS_PATH, "utf-8")); } catch { return []; }
}
function saveBookmarks(bm) {
  writeFileSync(BOOKMARKS_PATH, JSON.stringify(bm, null, 2));
}

export async function startTui(baseUrl, token) {
  const state = {
    view: "list",
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
    marked: new Set(),
    pullResults: [],
    pullAgents: null,
    pullScope: null,
    baseUrl,
    token,
    isAdmin: false,
    // New state
    filter: "",           // inline fuzzy filter
    previewScroll: 0,    // right pane scroll offset
    sortBy: "name",       // name | date | rating | pulls
    showHelp: false,
    bookmarks: loadBookmarks(),
    showBookmarks: false,
    blockedCount: 0,
    lastVisit: null,
    newCount: 0,
    statusMsg: null,
    breadcrumb: [],
    projectTree: null,
    serverConfig: null,
    guideTab: 0,
    _previewCache: new Map(),
    _previewKey: null,
    _previewBody: "",
  };

  process.stdout.write(CLEAR + HIDE_CURSOR);
  // Enable SGR mouse tracking
  process.stdout.write("\x1b[?1000h\x1b[?1006h");
  process.stdout.write(`${DIM}Loading registry...${RESET}`);

  for (const type of TYPES) {
    state.entries[type] = await fetchJson(`${baseUrl}/api/${type}`);
  }
  if (token) {
    const whoami = await fetchJson(`${baseUrl}/api/whoami`, token);
    if (whoami?.role === "admin") {
      state.isAdmin = true;
      const blocked = await fetchJson(`${baseUrl}/api/blocked`, token);
      state.blockedCount = Array.isArray(blocked) ? blocked.length : 0;
    }
  }

  // Notification bell — check for new artifacts since last visit
  const configPath = join(homedir(), ".ihub-tui-state.json");
  try {
    const s = JSON.parse(readFileSync(configPath, "utf-8"));
    state.lastVisit = s.lastVisit;
  } catch {}
  if (state.lastVisit) {
    let newCount = 0;
    for (const type of TYPES) {
      for (const e of (state.entries[type] || [])) {
        if (e.created_at && e.created_at > state.lastVisit) newCount++;
      }
    }
    state.newCount = newCount;
  }
  writeFileSync(configPath, JSON.stringify({ lastVisit: new Date().toISOString() }));

  const stdin = process.stdin;
  if (stdin.setRawMode) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf-8");

  render(state);

  // Re-render on terminal resize so layout adapts dynamically
  process.stdout.on("resize", () => render(state));

  stdin.on("data", async (key) => {
    if (key === "\x03") { cleanup(); process.exit(0); }

    // --- Mouse event parsing (SGR mode) ---
    const mouseMatch = key.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (mouseMatch) {
      const button = parseInt(mouseMatch[1], 10);
      const col = parseInt(mouseMatch[2], 10);
      const row = parseInt(mouseMatch[3], 10);
      const isPress = mouseMatch[4] === "M";

      // Scroll wheel works in all views
      if (button === 64) {
        // Scroll up
        if (state.view === "list") {
          state.selectedItem = Math.max(0, state.selectedItem - 1);
          state.previewScroll = 0;
          adjustScroll(state);
        } else {
          state.scrollOffset = Math.max(0, state.scrollOffset - 3);
        }
        render(state);
        return;
      }
      if (button === 65) {
        // Scroll down
        if (state.view === "list") {
          const items = getVisibleItems(state);
          state.selectedItem = Math.min(items.length - 1, state.selectedItem + 1);
          state.previewScroll = 0;
          adjustScroll(state);
        } else {
          const maxOffset = Math.max(0, (state._contentLines || 0) - (state._contentVisibleRows || 1));
          state.scrollOffset = Math.min(state.scrollOffset + 3, maxOffset);
        }
        render(state);
        return;
      }

      // Left click (press only)
      if (button === 0 && isPress) {
        if (state.view === "list") {
          // Check if click is on tab bar (row 3, where tabs are rendered)
          if (!state.isSearch && !state.isBlockedView && row === 3) {
            // Estimate tab positions — tabs are "  type1  type2  ..."
            let pos = 2;
            for (let i = 0; i < TYPES.length; i++) {
              const tabLen = TYPES[i].length + 2; // " type "
              if (col >= pos && col < pos + tabLen) {
                state.selectedType = i;
                state.selectedItem = 0;
                state.scrollOffset = 0;
                state.filter = "";
                state.breadcrumb = buildBreadcrumb(state);
                break;
              }
              pos += tabLen + 2; // gap between tabs
            }
          } else {
            // Click on a list row — header takes ~5 lines (header + breadcrumb + tabs + title + blank)
            const listStartRow = 6;
            const clickedIdx = (row - listStartRow) + state.scrollOffset;
            const items = getVisibleItems(state);
            if (clickedIdx >= 0 && clickedIdx < items.length) {
              state.selectedItem = clickedIdx;
              state.previewScroll = 0;
            }
          }
        } else if (state.view === "guide") {
          // Click on guide tab bar (row 3)
          if (row === 3) {
            const guideTabs = ["overview", "memories", "mapping"];
            let pos = 2;
            for (let i = 0; i < guideTabs.length; i++) {
              const tabLen = guideTabs[i].length + 2;
              if (col >= pos && col < pos + tabLen) {
                state.guideTab = i;
                state.scrollOffset = 0;
                break;
              }
              pos += tabLen + 2;
            }
          }
        }
        render(state);
        return;
      }

      // Consume any other mouse event without processing
      render(state);
      return;
    }

    // Ignore main handler while search input is active
    if (state._searchMode) return;

    // Help overlay — dismiss with any key
    if (state.showHelp) {
      state.showHelp = false;
      render(state);
      return;
    }

    // ? — show help
    if (key === "?") {
      state.showHelp = true;
      render(state);
      return;
    }

    // --- View-specific handlers (before generic) ---

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

    // Projects view — A to show all
    if (state.view === "projects") {
      if (key === "A" || key === "a") {
        state.projectTree = buildProjectTree(state, null);
        state.projectFilter = null;
        state.breadcrumb = ["projects"];
        state.scrollOffset = 0;
      } else if (key === ESC || key === "\x7f" || key === "q") {
        state.view = "list";
        state.scrollOffset = 0;
        state.breadcrumb = [];
      } else if (key === `${ESC}[A`) {
        state.scrollOffset = Math.max(0, state.scrollOffset - 1);
      } else if (key === `${ESC}[B`) {
        state.scrollOffset++;
      } else if (key === "r") {
        for (const type of TYPES) state.entries[type] = await fetchJson(`${baseUrl}/api/${type}`);
        state.projectTree = buildProjectTree(state, state.projectFilter);
      }
      render(state);
      return;
    }

    if (state.view === "pulling") {
      state.view = "list";
      state.pullResults = [];
      render(state);
      return;
    }

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
        state.view = "list";
        state.audit = null;
        state.scrollOffset = 0;
        state.breadcrumb = [];
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

    // q to quit from list (home) or types
    if (key === "q" && (state.view === "list" || state.view === "types") && !state.showBookmarks && !state.detail) {
      cleanup();
      process.exit(0);
    }

    // Escape / q — go back
    if (key === ESC || key === "\x7f" || key === "q") {
      if (state.showBookmarks) {
        state.showBookmarks = false;
        state.view = "types";
      } else if (state.view === "comments" || state.view === "graph") {
        state.view = "detail";
        state.scrollOffset = 0;
      } else if (state.view === "metrics" || state.view === "projects" || state.view === "config" || state.view === "versions" || state.view === "guide") {
        state.view = "list";
        state.scrollOffset = 0;
      } else if (state.view === "detail") {
        state.view = "list";
        state.detail = null;
        state.comments = null;
      } else if (state.view === "list") {
        if (state.isSearch || state.isBlockedView) {
          // Clear search/blocked and go back to normal list
          state.isSearch = false;
          state.isBlockedView = false;
          state.searchResults = null;
          state.blockedList = null;
          state.selectedItem = 0;
          state.scrollOffset = 0;
          state.filter = "";
          state.marked.clear();
        } else {
          // From normal list — quit
          cleanup();
          process.exit(0);
        }
      }
      state.breadcrumb = buildBreadcrumb(state);
      render(state);
      return;
    }

    // Arrow up
    if (key === `${ESC}[A`) {
      if (state.view === "types") {
        state.selectedType = Math.max(0, state.selectedType - 1);
      } else if (state.view === "list" || state.showBookmarks) {
        state.selectedItem = Math.max(0, state.selectedItem - 1);
        state.previewScroll = 0;
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
      } else if (state.view === "list" || state.showBookmarks) {
        const items = getVisibleItems(state);
        state.selectedItem = Math.min(items.length - 1, state.selectedItem + 1);
        state.previewScroll = 0;
        adjustScroll(state);
      } else {
        const maxOffset = Math.max(0, (state._contentLines || 0) - (state._contentVisibleRows || 1));
        if (state.scrollOffset < maxOffset) state.scrollOffset++;
      }
      render(state);
      return;
    }

    // Left/Right arrows — tab between types from list view (#6)
    if (key === `${ESC}[D` && state.view === "list" && !state.isSearch && !state.isBlockedView) {
      state.selectedType = (state.selectedType - 1 + TYPES.length) % TYPES.length;
      state.selectedItem = 0;
      state.scrollOffset = 0;
      state.filter = "";
      state.breadcrumb = buildBreadcrumb(state);
      render(state);
      return;
    }
    if (key === `${ESC}[C` && state.view === "list" && !state.isSearch && !state.isBlockedView) {
      state.selectedType = (state.selectedType + 1) % TYPES.length;
      state.selectedItem = 0;
      state.scrollOffset = 0;
      state.filter = "";
      state.breadcrumb = buildBreadcrumb(state);
      render(state);
      return;
    }

    // Enter
    if (key === "\r" || key === "\n") {
      if (state.showBookmarks) {
        const items = state.bookmarks;
        if (items.length > 0) {
          const bm = items[state.selectedItem];
          const [t, n] = bm.split("/");
          state.detail = await fetchJson(`${baseUrl}/api/${t}/${n}`);
          state.comments = await fetchJson(`${baseUrl}/api/${t}/${n}/comments`);
          state.view = "detail";
          state.scrollOffset = 0;
          state.showBookmarks = false;
          state.breadcrumb = ["bookmarks", bm];
        }
      } else if (state.view === "types") {
        state.view = "list";
        state.selectedItem = 0;
        state.scrollOffset = 0;
        state.filter = "";
        state.breadcrumb = buildBreadcrumb(state);
      } else if (state.view === "list") {
        const items = getVisibleItems(state);
        if (items.length > 0) {
          const item = items[state.selectedItem];
          const type = (state.isSearch || state.isBlockedView) ? (item.type || TYPES[state.selectedType]) : TYPES[state.selectedType];
          state.detail = await fetchJson(`${baseUrl}/api/${type}/${item.name}`, token);
          state.comments = await fetchJson(`${baseUrl}/api/${type}/${item.name}/comments`);
          state.view = "detail";
          state.scrollOffset = 0;
          state.breadcrumb = buildBreadcrumb(state, item.name);
        }
      }
      render(state);
      return;
    }

    // --- List view keys ---
    if (state.view === "list") {
      // Space — toggle select
      if (key === " ") {
        const items = getVisibleItems(state);
        if (items.length > 0) {
          const item = items[state.selectedItem];
          const type = (state.isSearch || state.isBlockedView) ? (item.type || TYPES[state.selectedType]) : TYPES[state.selectedType];
          const k = `${type}/${item.name}`;
          if (state.marked.has(k)) state.marked.delete(k);
          else state.marked.add(k);
          state.selectedItem = Math.min(items.length - 1, state.selectedItem + 1);
          adjustScroll(state);
        }
        render(state);
        return;
      }

      // a — select/deselect all
      if (key === "a") {
        const items = getVisibleItems(state);
        const type = TYPES[state.selectedType];
        const keys = items.map((i) => `${(state.isSearch || state.isBlockedView) ? (i.type || type) : type}/${i.name}`);
        const allSel = keys.every((k) => state.marked.has(k));
        if (allSel) keys.forEach((k) => state.marked.delete(k));
        else keys.forEach((k) => state.marked.add(k));
        render(state);
        return;
      }

      // p — bulk pull
      if (key === "p" && state.marked.size > 0) {
        state.pullAgents = null;
        state.pullScope = null;
        state.view = "agent-select";
        render(state);
        return;
      }

      // P — quick pull single item (#12)
      if (key === "P") {
        const items = getVisibleItems(state);
        if (items.length > 0) {
          const item = items[state.selectedItem];
          const type = (state.isSearch || state.isBlockedView) ? (item.type || TYPES[state.selectedType]) : TYPES[state.selectedType];
          state.marked.add(`${type}/${item.name}`);
          state.pullAgents = null;
          state.pullScope = null;
          state.view = "agent-select";
        }
        render(state);
        return;
      }

      // s — cycle sort (#8)
      if (key === "s") {
        const sorts = ["name", "date", "rating", "pulls"];
        const idx = sorts.indexOf(state.sortBy);
        state.sortBy = sorts[(idx + 1) % sorts.length];
        state.statusMsg = `Sort: ${state.sortBy}`;
        render(state);
        return;
      }

      // Fuzzy filter — printable chars (#2)
      const reserved = "aApPsfFjBmticrqdgvyG?/{}>";

      // { and } — scroll preview pane
      if (key === "{") {
        state.previewScroll = Math.max(0, state.previewScroll - 3);
        render(state);
        return;
      }
      if (key === "}") {
        const maxScroll = Math.max(0, (state._previewTotalLines || 0) - (state._previewVisibleRows || 1));
        state.previewScroll = Math.min(state.previewScroll + 3, maxScroll);
        render(state);
        return;
      }
      if (key.length === 1 && key >= " " && key <= "~" && !reserved.includes(key)) {
        state.filter += key;
        state.selectedItem = 0;
        state.scrollOffset = 0;
        render(state);
        return;
      }

      // Backspace clears filter
      if (key === "\x7f" && state.filter) {
        state.filter = state.filter.slice(0, -1);
        state.selectedItem = 0;
        state.scrollOffset = 0;
        render(state);
        return;
      }
    }

    // --- Detail view keys ---
    if (state.view === "detail" && state.detail) {
      // c — comments
      if (key === "c") {
        state.view = "comments";
        state.scrollOffset = 0;
        state.breadcrumb = buildBreadcrumb(state, state.detail.name, "comments");
        render(state);
        return;
      }

      // w — write review (#add comment)
      if (key === "w" && token) {
        const type = TYPES[state.selectedType];
        const name = state.detail.name;
        cleanup();
        process.stdout.write(`${CLEAR}${BOLD}Rate ${type}/${name}${RESET}\n\n`);
        if (stdin.setRawMode) stdin.setRawMode(false);
        const ratingStr = await new Promise((r) => { process.stdout.write("Rating (1-5): "); stdin.once("data", (d) => r(d.toString().trim())); });
        const body = await new Promise((r) => { process.stdout.write("Comment: "); stdin.once("data", (d) => r(d.toString().trim())); });
        if (stdin.setRawMode) stdin.setRawMode(true);
        process.stdout.write(HIDE_CURSOR);
        const rating = parseInt(ratingStr, 10);
        if (rating >= 1 && rating <= 5 && body) {
          const h = { "Content-Type": "application/json" };
          if (token) h["Authorization"] = `Bearer ${token}`;
          await fetch(`${baseUrl}/api/${type}/${name}/comments`, { method: "POST", headers: h, body: JSON.stringify({ rating, body }) });
          state.comments = await fetchJson(`${baseUrl}/api/${type}/${name}/comments`);
          state.statusMsg = `Review added (${rating}/5)`;
        }
        render(state);
        return;
      }

      // d — remove (with confirmation)
      if (key === "d") {
        if (state.confirmDelete) {
          // Second d — execute delete
          state.confirmDelete = false;
          const type = TYPES[state.selectedType];
          const name = state.detail.name;
          const h = { "Content-Type": "application/json" };
          if (token) h["Authorization"] = `Bearer ${token}`;
          const res = await fetch(`${baseUrl}/api/${type}/${name}`, { method: "DELETE", headers: h });
          if (res.ok) {
            state.entries[type] = await fetchJson(`${baseUrl}/api/${type}`);
            state.view = "list";
            state.detail = null;
            state.selectedItem = 0;
            state.statusMsg = `Removed ${type}/${name}`;
          } else {
            const d = await res.json().catch(() => ({}));
            state.statusMsg = d.error || "Remove failed — only owners and admins can delete";
          }
          state.breadcrumb = buildBreadcrumb(state);
        } else {
          // First d — ask confirmation
          state.confirmDelete = true;
          state.statusMsg = `\x1b[41m\x1b[37m DELETE ${TYPES[state.selectedType]}/${state.detail.name}? Press d to confirm, any other key to cancel \x1b[0m`;
        }
        render(state);
        return;
      }
      // Any other key cancels delete confirmation
      if (state.confirmDelete) {
        state.confirmDelete = false;
        state.statusMsg = "Delete cancelled";
        render(state);
        return;
      }

      // f — toggle bookmark (#11)
      if (key === "f") {
        const type = TYPES[state.selectedType];
        const k = `${type}/${state.detail.name}`;
        const idx = state.bookmarks.indexOf(k);
        if (idx >= 0) { state.bookmarks.splice(idx, 1); state.statusMsg = `Unbookmarked ${k}`; }
        else { state.bookmarks.push(k); state.statusMsg = `Bookmarked ${k}`; }
        saveBookmarks(state.bookmarks);
        render(state);
        return;
      }

      // y — copy pull command to clipboard (#14)
      if (key === "y") {
        const type = TYPES[state.selectedType];
        const cmd = `ihub pull ${type.slice(0, -1)} ${state.detail.name}`;
        try { execSync(`echo ${JSON.stringify(cmd)} | pbcopy 2>/dev/null || echo ${JSON.stringify(cmd)} | xclip -sel clip 2>/dev/null || echo ${JSON.stringify(cmd)} | xsel --clipboard 2>/dev/null`, { stdio: "ignore" }); state.statusMsg = `Copied: ${cmd}`; }
        catch { state.statusMsg = cmd; }
        render(state);
        return;
      }

      // g — dependency graph (#13)
      if (key === "g") {
        state.view = "graph";
        state.scrollOffset = 0;
        state.breadcrumb = buildBreadcrumb(state, state.detail.name, "graph");
        render(state);
        return;
      }

      // v — version history (#7)
      if (key === "v") {
        const type = TYPES[state.selectedType];
        state.versionList = await fetchJson(`${baseUrl}/api/${type}/${state.detail.name}/versions`);
        state.view = "versions";
        state.scrollOffset = 0;
        state.breadcrumb = buildBreadcrumb(state, state.detail.name, "versions");
        render(state);
        return;
      }

      // > — navigate to related artifact
      if (key === ">") {
        const meta = state.detail.meta || {};
        const related = meta.related || state.detail.related;
        if (Array.isArray(related) && related.length > 0) {
          // Navigate to the first related artifact — try each type until found
          const targetName = related[0];
          let found = null;
          for (const t of TYPES) {
            const entry = await fetchJson(`${baseUrl}/api/${t}/${targetName}`, token);
            if (entry && entry.name) {
              found = entry;
              state.selectedType = TYPES.indexOf(t);
              break;
            }
          }
          if (found) {
            state.detail = found;
            const type = TYPES[state.selectedType];
            state.comments = await fetchJson(`${baseUrl}/api/${type}/${found.name}/comments`);
            state.scrollOffset = 0;
            state.breadcrumb = buildBreadcrumb(state, found.name);
            state.statusMsg = `Navigated to ${found.name}`;
          } else {
            state.statusMsg = `Related artifact "${targetName}" not found`;
          }
          render(state);
          return;
        } else {
          state.statusMsg = "No related artifacts";
          render(state);
          return;
        }
      }
    }

    // Guide view — tab switching
    if (state.view === "guide") {
      const guideTabs = ["overview", "memories", "mapping"];
      if (key === `${ESC}[C` || key === "\t") {
        state.guideTab = (state.guideTab + 1) % guideTabs.length;
        state.scrollOffset = 0;
        render(state);
        return;
      }
      if (key === `${ESC}[D`) {
        state.guideTab = (state.guideTab - 1 + guideTabs.length) % guideTabs.length;
        state.scrollOffset = 0;
        render(state);
        return;
      }
    }

    // Comments view — c to go back
    if (key === "c" && state.view === "comments") {
      state.view = "detail";
      state.scrollOffset = 0;
      state.breadcrumb = buildBreadcrumb(state, state.detail?.name);
      render(state);
      return;
    }

    // --- Global shortcuts (from list or types) ---
    if (state.view === "types" || state.view === "list") {
      // m — metrics
      if (key === "m" && state.isAdmin) {
        state.metrics = await fetchText(`${baseUrl}/api/metrics`, token);
        state.view = "metrics";
        state.scrollOffset = 0;
        state.breadcrumb = ["metrics"];
        render(state);
        return;
      }
      // t — audit
      if (key === "t" && state.isAdmin) {
        state.auditPage = 1;
        await loadAuditPage(state, baseUrl, token);
        state.view = "audit";
        state.scrollOffset = 0;
        state.breadcrumb = ["audit"];
        render(state);
        return;
      }
      // j — projects
      if (key === "j") {
        // Show project of the currently selected/viewed artifact
        let filterProject = null;
        if (state.view === "list") {
          const items = getVisibleItems(state);
          if (items.length > 0 && state.selectedItem < items.length) {
            filterProject = items[state.selectedItem].meta?.project || items[state.selectedItem].project;
          }
        }
        state.projectTree = buildProjectTree(state, filterProject);
        state.projectFilter = filterProject;
        state.view = "projects";
        state.scrollOffset = 0;
        state.breadcrumb = filterProject ? ["projects", filterProject] : ["projects"];
        render(state);
        return;
      }
      // i — config
      if (key === "i" && state.isAdmin) {
        state.serverConfig = await fetchJson(`${baseUrl}/api/config`, token);
        state.view = "config";
        state.scrollOffset = 0;
        state.breadcrumb = ["config"];
        render(state);
        return;
      }
      // B — blocked list (#5)
      if (key === "B" && state.isAdmin) {
        state.blockedList = await fetchJson(`${baseUrl}/api/blocked`, token);
        state.view = "list";
        state.isBlockedView = true;
        state.selectedItem = 0;
        state.scrollOffset = 0;
        state.breadcrumb = ["blocked"];
        render(state);
        return;
      }
      // G — artifact guide
      if (key === "G") {
        state.view = "guide";
        state.scrollOffset = 0;
        state.guideTab = 0;
        state.breadcrumb = ["guide"];
        render(state);
        return;
      }
      // F — show bookmarks (#11)
      if (key === "F") {
        state.showBookmarks = true;
        state.selectedItem = 0;
        state.scrollOffset = 0;
        render(state);
        return;
      }
    }

    // r — refresh
    if (key === "r") {
      process.stdout.write(CLEAR + `${DIM}Refreshing...${RESET}`);
      for (const type of TYPES) state.entries[type] = await fetchJson(`${baseUrl}/api/${type}`);
      if (state.view === "detail" && state.detail) {
        const type = TYPES[state.selectedType];
        state.detail = await fetchJson(`${baseUrl}/api/${type}/${state.detail.name}`);
        state.comments = await fetchJson(`${baseUrl}/api/${type}/${state.detail.name}/comments`);
      }
      if (state.view === "metrics") state.metrics = await fetchText(`${baseUrl}/api/metrics`, token);
      if (state.view === "audit") await loadAuditPage(state, baseUrl, token);
      render(state);
      return;
    }

    // / — search
    if (key === "/" && (state.view === "types" || state.view === "list")) {
      // Inline search prompt — stays in raw mode so Esc/q can cancel
      state._searchInput = "";
      state._searchMode = true;
      process.stdout.write(`${CLEAR}${BOLD}Search: ${RESET}${SHOW_CURSOR}`);
      const query = await new Promise((resolve) => {
        const onSearchKey = (chunk) => {
          // Process each character in the chunk
          for (let ci = 0; ci < chunk.length; ci++) {
            const k = chunk[ci];
            // Esc — cancel (consume rest of escape sequence)
            if (k === ESC) {
              stdin.removeListener("data", onSearchKey);
              resolve("");
              return;
            }
            // q with empty input → cancel
            if (k === "q" && !state._searchInput) {
              stdin.removeListener("data", onSearchKey);
              resolve("");
              return;
            }
            // Enter → submit
            if (k === "\r" || k === "\n") {
              stdin.removeListener("data", onSearchKey);
              resolve(state._searchInput.trim());
              return;
            }
            // Backspace
            if (k === "\x7f") {
              state._searchInput = state._searchInput.slice(0, -1);
              process.stdout.write(`\r${BOLD}Search: ${RESET}${state._searchInput} \b${SHOW_CURSOR}`);
              continue;
            }
            // Ctrl+C
            if (k === "\x03") {
              stdin.removeListener("data", onSearchKey);
              cleanup();
              process.exit(0);
            }
            // Printable chars
            if (k >= " " && k <= "~") {
              state._searchInput += k;
              process.stdout.write(k);
            }
          }
        };
        stdin.on("data", onSearchKey);
      });
      state._searchMode = false;
      process.stdout.write(HIDE_CURSOR);
      if (query) {
        state.searchResults = await fetchJson(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
        state.view = "list";
        state.selectedItem = 0;
        state.scrollOffset = 0;
        state.isSearch = true;
        state.searchQuery = query;
        state.filter = "";
        state.breadcrumb = [`search: ${query}`];
      }
      process.stdout.write(HIDE_CURSOR);
      render(state);
      return;
    }
  });
}

// --- Helpers ---

function buildProjectTree(state, filterProject) {
  const allEntries = [];
  for (const type of TYPES) for (const e of (state.entries[type] || [])) allEntries.push({ ...e, _type: type });
  const projects = {};
  const unassigned = [];
  for (const e of allEntries) {
    const proj = e.meta?.project || e.project || "";
    if (proj) {
      if (filterProject && proj !== filterProject) continue;
      if (!projects[proj]) projects[proj] = {};
      if (!projects[proj][e._type]) projects[proj][e._type] = [];
      projects[proj][e._type].push(e);
    } else if (!filterProject) {
      unassigned.push(e);
    }
  }
  return { projects, unassigned };
}

function buildBreadcrumb(state, name, sub) {
  const parts = [];
  if (state.isSearch) parts.push(`search: ${state.searchQuery}`);
  else if (state.view !== "types") parts.push(TYPES[state.selectedType]);
  if (name) parts.push(name);
  if (sub) parts.push(sub);
  return parts;
}

function getVisibleItems(state) {
  let items;
  if (state.isBlockedView && state.blockedList) items = state.blockedList;
  else if (state.isSearch && state.searchResults) items = state.searchResults;
  else items = state.entries[TYPES[state.selectedType]] || [];

  // Fuzzy filter (#2)
  if (state.filter) {
    const f = state.filter.toLowerCase();
    items = items.filter((i) => {
      const hay = [i.name, i.description, ...(Array.isArray(i.tags) ? i.tags : [])].join(" ").toLowerCase();
      return hay.includes(f);
    });
  }

  // Sort (#8)
  items = [...items];
  if (state.sortBy === "date") items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  else if (state.sortBy === "name") items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return items;
}

function ratingStars(avg) {
  if (!avg) return "";
  const full = Math.round(avg);
  const color = avg >= 4 ? GREEN : avg >= 3 ? YELLOW : RED;
  return `${color}${"★".repeat(full)}${"☆".repeat(5 - full)}${RESET}`;
}

const _installedCache = new Map();
let _installedCacheTime = 0;

function isInstalled(name) {
  // Refresh cache every 5 seconds
  if (Date.now() - _installedCacheTime > 5000) {
    _installedCache.clear();
    _installedCacheTime = Date.now();
  }
  if (_installedCache.has(name)) return _installedCache.get(name);

  const HOME = homedir();
  const paths = [
    // ihub local
    `agents/${name}.md`, `skills/${name}.md`, `rules/${name}.md`, `memories/${name}.md`, `prompts/${name}.md`,
    // Claude Code
    join(HOME, ".claude", "skills", name, "SKILL.md"),
    join(".claude", "skills", name, "SKILL.md"),
    join(HOME, ".claude", "rules", `${name}.md`),
    join(".claude", "rules", `${name}.md`),
    // Gemini
    join(HOME, ".gemini", "skills", name, "SKILL.md"),
    join(".gemini", "skills", name, "SKILL.md"),
    // Cursor
    join(".cursor", "skills", `${name}.md`),
    join(".cursor", "rules", `${name}.mdc`),
    // Qwen
    join(HOME, ".qwen", "skills", name, "SKILL.md"),
    // Codex
    join(HOME, ".agents", "skills", name, "SKILL.md"),
    join(".agents", "skills", name, "SKILL.md"),
  ];
  const found = paths.some((p) => existsSync(p));
  _installedCache.set(name, found);
  return found;
}

function clearInstalledCache() {
  _installedCache.clear();
  _installedCacheTime = 0;
}

// --- Render ---

function render(state) {
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  const contentRows = rows - 4; // header + breadcrumb + footer line + footer text

  let output = CLEAR;

  // Header
  output += `${BG_CYAN}${BLACK}${BOLD} ihub ${RESET}`;
  output += `  ${DIM}${state.baseUrl}${RESET}`;
  if (state.isAdmin) output += `  ${BG_GREEN}${BLACK} ADMIN ${RESET}`;
  if (state.marked.size > 0) output += `  ${BG_YELLOW}${BLACK} ${state.marked.size} selected ${RESET}`;
  if (state.blockedCount > 0 && state.isAdmin) output += `  ${BG_RED}${WHITE} ${state.blockedCount} blocked ${RESET}`;
  if (state.newCount > 0) output += `  ${YELLOW}\u2022 ${state.newCount} new${RESET}`;
  if (state.statusMsg) { output += `  ${DIM}${state.statusMsg}${RESET}`; state.statusMsg = null; }
  output += "\n";

  // Breadcrumb (#3)
  if (state.breadcrumb.length > 0) {
    output += `${DIM}  ${state.breadcrumb.join(" > ")}${RESET}\n`;
  } else {
    output += "\n";
  }

  // Help overlay (#10)
  if (state.showHelp) {
    output += renderHelp(state, contentRows, cols);
  } else if (state.showBookmarks) {
    output += renderBookmarks(state, contentRows, cols);
  } else if (state.view === "types") output += renderTypes(state, contentRows);
  else if (state.view === "list") {
    // Trigger async preview body fetch for split-pane
    if (cols >= 120) {
      const items = getVisibleItems(state);
      if (items.length > 0 && state.selectedItem < items.length) {
        const sel = items[state.selectedItem];
        const itemType = (state.isSearch || state.isBlockedView) ? (sel.type || TYPES[state.selectedType]) : TYPES[state.selectedType];
        const cacheKey = `${itemType}/${sel.name}`;
        if (state._previewKey !== cacheKey) {
          state._previewKey = cacheKey;
          state._previewBody = state._previewCache.get(cacheKey) || "";
          if (!state._previewCache.has(cacheKey)) {
            const url = `${state.baseUrl}/api/${itemType}/${sel.name}`;
            fetchJson(url, state.token).then((d) => {
              const body = d?.body || "";
              state._previewCache.set(cacheKey, body);
              state._previewBody = body;
              if (state.view === "list" && state._previewKey === cacheKey) render(state);
            });
          }
        }
      }
    }
    output += renderList(state, contentRows, cols);
  }
  else if (state.view === "detail") output += renderDetail(state, contentRows, cols);
  else if (state.view === "comments") output += renderComments(state, contentRows, cols);
  else if (state.view === "metrics") output += renderMetrics(state, contentRows, cols);
  else if (state.view === "audit") output += renderAudit(state, contentRows, cols);
  else if (state.view === "projects") output += renderProjects(state, contentRows, cols);
  else if (state.view === "config") output += renderConfig(state, contentRows);
  else if (state.view === "guide") output += renderGuide(state, contentRows, cols);
  else if (state.view === "agent-select") output += renderAgentSelect(state);
  else if (state.view === "scope-select") output += renderScopeSelect(state);
  else if (state.view === "pulling") output += renderPulling(state, contentRows);
  else if (state.view === "graph") output += renderGraph(state, contentRows, cols);
  else if (state.view === "versions") output += renderVersions(state, contentRows);

  // Pad content to push footer to the bottom of the terminal
  const usedLines = output.split("\n").length - 1; // lines already written (CLEAR adds 1)
  const footerLines = 2; // separator + footer text
  const padLines = Math.max(0, rows - usedLines - footerLines);
  output += "\n".repeat(padLines);

  // Footer — pinned to bottom
  output += `${DIM}${"─".repeat(cols)}${RESET}\n`;
  let footer = getFooter(state);
  if (state._scrollInfo) footer += `  ${state._scrollInfo}`;
  output += `${DIM}${footer}${RESET}`;

  process.stdout.write(output);
}

function getFooter(state) {
  if (state.showHelp) return " press any key to close help";
  if (state.showBookmarks) return " ↑↓ navigate  ⏎ open  esc close";
  const f = {
    types: ` ↑↓ navigate  ⏎ select  j projects  G guide  F bookmarks  / search  ${state.isAdmin ? "m metrics  t audit  i config  B blocked  " : ""}? help  q quit`,
    list: ` ↑↓ nav  ←→ type  ⏎ view  space select  a all  ${state.marked.size > 0 ? "p pull  " : ""}P pull one  s sort  / search  j projects  G guide  F bookmarks  ${(process.stdout.columns || 80) >= 120 ? "{} preview scroll  " : ""}${state.isAdmin ? "m metrics  t audit  i config  B blocked  " : ""}${state.filter ? `filter: ${state.filter}  ` : ""}? help  q quit`,
    detail: ` ↑↓ scroll  c comments  w review  f bookmark  y copy  g graph  v versions  > related  d remove  ? help  esc back`,
    comments: ` ↑↓ scroll  c back  esc back`,
    metrics: ` ↑↓ scroll  r refresh  esc back`,
    audit: ` ↑↓ scroll  n next  b prev  r refresh  esc back`,
    projects: ` ↑↓ scroll  ${state.projectFilter ? "A show all  " : ""}r refresh  esc back`,
    config: ` esc back`,
    "agent-select": ` 1-${AGENT_NAMES.length} toggle  ⏎ confirm  esc cancel`,
    "scope-select": ` l project  g personal  esc cancel`,
    pulling: ` press any key to continue`,
    graph: ` ↑↓ scroll  esc back`,
    versions: ` ↑↓ scroll  esc back`,
    guide: ` ↑↓ scroll  ←→ tab  esc back`,
  };
  return f[state.view] || " ? help";
}

// --- View renderers ---

function renderTypes(state, maxRows) {
  let out = "";
  for (let i = 0; i < TYPES.length; i++) {
    const type = TYPES[i];
    const count = (state.entries[type] || []).length;
    const color = TYPE_COLORS[type];
    const icon = TYPE_ICONS[type];
    const sel = i === state.selectedType;
    out += sel ? `  ${INVERSE} ${icon} ${RESET} ${color}${BOLD}${type}${RESET}` : `    ${color}${icon}${RESET} ${type}`;
    out += `  ${DIM}(${count})${RESET}\n`;
    if (sel) {
      const entries = state.entries[type] || [];
      for (const e of entries.slice(0, 5)) {
        const ver = e.version ? `${GRAY}@${e.version}${RESET}` : "";
        const installed = isInstalled(e.name) ? ` ${GREEN}\u2713${RESET}` : "";
        out += `      ${DIM}├─${RESET} ${e.name}${ver}${installed}\n`;
      }
      if (entries.length > 5) out += `      ${DIM}└─ ...${entries.length - 5} more${RESET}\n`;
      else if (entries.length === 0) out += `      ${DIM}└─ (empty)${RESET}\n`;
    }
  }
  return out;
}

function renderList(state, maxRows, cols) {
  const type = TYPES[state.selectedType];
  const color = TYPE_COLORS[type];
  const items = getVisibleItems(state);
  const showPreview = cols >= 120;

  // Tab bar (#6)
  let tabs = "";
  if (!state.isSearch && !state.isBlockedView) {
    tabs = "  " + TYPES.map((t, i) => {
      const c = TYPE_COLORS[t];
      return i === state.selectedType ? `${INVERSE} ${t} ${RESET}` : `${DIM}${c} ${t} ${RESET}`;
    }).join("  ") + "\n\n";
  }

  let out = tabs;
  const title = state.isBlockedView ? "Blocked artifacts" : (state.isSearch ? "Search results" : type);
  out += `  ${color}${BOLD}${title}${RESET} ${DIM}(${items.length})${RESET}`;
  if (state.filter) out += `  ${YELLOW}filter: ${state.filter}${RESET}`;
  out += `  ${DIM}sort: ${state.sortBy}${RESET}\n\n`;

  if (items.length === 0) return out + `  ${DIM}No entries.${RESET}\n`;

  const visible = Math.min(items.length, maxRows - 5);

  // Calculate dynamic list width based on actual content
  let listWidth, previewWidth;
  if (showPreview) {
    // Measure the widest visible list row: prefix (8: "  > ○ ✓★ ") + name + " " + description
    let maxItemWidth = 0;
    for (let i = state.scrollOffset; i < Math.min(items.length, state.scrollOffset + visible); i++) {
      const item = items[i];
      const prefix = 10; // "  > ○ ✓★ " decorators
      const typePrefix = state.isSearch ? 2 : 0;
      const blocked = item.status === "blocked" ? 4 : 0;
      const nameLen = (item.name || "").length;
      const descLen = (item.description || "").length;
      const w = prefix + typePrefix + blocked + nameLen + 1 + descLen;
      if (w > maxItemWidth) maxItemWidth = w;
    }
    // List gets just enough to show content, min 30, max 55% of cols
    const minList = 30;
    const maxList = Math.floor(cols * 0.55);
    listWidth = Math.max(minList, Math.min(maxItemWidth + 2, maxList));
    previewWidth = cols - listWidth - 3;
  } else {
    listWidth = cols;
    previewWidth = 0;
  }

  // Build preview lines if wide enough
  let previewLines = [];
  if (showPreview && items.length > 0 && state.selectedItem < items.length) {
    const sel = items[state.selectedItem];
    const itemType = (state.isSearch || state.isBlockedView) ? (sel.type || type) : type;
    const body = state._previewBody || "";
    previewLines = wrapAndFormatPreview(sel, body, previewWidth - 2);
  }

  // Render list rows, optionally side-by-side with preview
  const listRows = [];
  for (let i = state.scrollOffset; i < Math.min(items.length, state.scrollOffset + visible); i++) {
    const item = items[i];
    const sel = i === state.selectedItem;
    const itemType = (state.isSearch || state.isBlockedView) ? (item.type || type) : type;
    const itemKey = `${itemType}/${item.name}`;
    const isMarked = state.marked.has(itemKey);
    const checkbox = isMarked ? `${GREEN}\u25C9${RESET}` : `${DIM}\u25CB${RESET}`;
    const installed = isInstalled(item.name) ? `${GREEN}\u2713${RESET}` : " ";
    const bmk = state.bookmarks.includes(itemKey) ? `${YELLOW}\u2605${RESET}` : " ";
    const blocked = item.status === "blocked" ? `${RED}[B]${RESET} ` : "";
    const typeLabel = state.isSearch ? `${TYPE_COLORS[item.type] || ""}${(item.type || "?").charAt(0).toUpperCase()}${RESET} ` : "";

    let ratingLabel = "";
    if (item.meta?.rating || item.rating) {
      ratingLabel = " " + ratingStars(item.meta?.rating || item.rating);
    }

    if (sel) {
      listRows.push(`  ${INVERSE} > ${RESET} ${checkbox} ${installed}${bmk} ${blocked}${typeLabel}${BOLD}${item.name}${RESET}${ratingLabel}`);
    } else {
      const desc = (item.description || "").slice(0, listWidth - 20);
      listRows.push(`    ${checkbox} ${installed}${bmk} ${blocked}${typeLabel}${item.name} ${DIM}${desc}${RESET}`);
    }
  }

  if (showPreview) {
    // Side-by-side: list on left, preview on right — fill to bottom
    const scroll = state.previewScroll || 0;
    const headerLines = out.split("\n").length - 1;
    const totalRows = Math.max(listRows.length, maxRows - headerLines);
    // Clamp scroll so we don't scroll past content
    const maxScroll = Math.max(0, previewLines.length - totalRows);
    if (state.previewScroll > maxScroll) state.previewScroll = maxScroll;
    const clampedScroll = state.previewScroll;
    // Store for key handlers
    state._previewTotalLines = previewLines.length;
    state._previewVisibleRows = totalRows;
    for (let r = 0; r < totalRows; r++) {
      const left = padVisible(listRows[r] || "", listWidth);
      const pIdx = r + clampedScroll;
      const right = pIdx < previewLines.length ? previewLines[pIdx] : "";
      out += `${left} ${DIM}│${RESET} ${right}\n`;
    }
  } else {
    // Narrow: list only, summary below
    for (const row of listRows) out += row + "\n";

    if (items.length > 0 && state.selectedItem < items.length) {
      const sel = items[state.selectedItem];
      out += `\n  ${DIM}${"─".repeat(cols - 4)}${RESET}\n`;
      const desc = sel.description || "";
      out += `  ${BOLD}${sel.name}${RESET} ${GRAY}@${sel.version || "?"}${RESET}\n`;
      out += `  ${DIM}${desc.slice(0, cols - 4)}${RESET}\n`;
      const tags = Array.isArray(sel.tags) ? sel.tags : [];
      if (tags.length) out += `  ${tags.slice(0, 8).map((t) => `${CYAN}#${t}${RESET}`).join(" ")}\n`;
    }
  }

  return out;
}

// Word-wrap text to fit within a given width
function wrapText(text, width) {
  if (width <= 0) return [text];
  const lines = [];
  for (const line of text.split("\n")) {
    if (stripAnsi(line).length <= width) {
      lines.push(line);
    } else {
      // Wrap long lines at word boundaries
      const words = line.split(" ");
      let current = "";
      for (const word of words) {
        const test = current ? current + " " + word : word;
        if (stripAnsi(test).length > width && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
    }
  }
  return lines;
}

// Strip ANSI escape codes for length calculations
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// Pad a string (accounting for ANSI codes) to a visual width
function padVisible(str, width) {
  const visible = stripAnsi(str).length;
  if (visible >= width) return str;
  return str + " ".repeat(width - visible);
}

// Format the preview pane content with syntax highlighting and word wrap
function wrapAndFormatPreview(item, body, width) {
  const lines = [];
  // Header
  lines.push(`${BOLD}${item.name}${RESET} ${GRAY}@${item.version || "?"}${RESET}`);
  if (item.description) lines.push(`${DIM}${item.description}${RESET}`);
  const tags = Array.isArray(item.tags) ? item.tags : [];
  if (tags.length) lines.push(tags.slice(0, 6).map((t) => `${CYAN}#${t}${RESET}`).join(" "));
  lines.push(`${DIM}${"─".repeat(width)}${RESET}`);

  if (!body) {
    lines.push(`${DIM}Loading preview...${RESET}`);
    return lines;
  }

  // Render markdown body with basic syntax highlighting
  for (const raw of body.split("\n")) {
    let formatted;
    if (raw.startsWith("# ")) formatted = `${BOLD}${MAGENTA}${raw.slice(2)}${RESET}`;
    else if (raw.startsWith("## ")) formatted = `${BOLD}${YELLOW}${raw.slice(3)}${RESET}`;
    else if (raw.startsWith("### ")) formatted = `${BOLD}${CYAN}${raw.slice(4)}${RESET}`;
    else if (raw.startsWith("- ")) formatted = `${CYAN}\u2022${RESET} ${raw.slice(2)}`;
    else if (raw.startsWith("```")) formatted = `${DIM}${raw}${RESET}`;
    else formatted = raw;

    for (const wrapped of wrapText(formatted, width)) {
      lines.push(wrapped);
    }
  }
  return lines;
}

function renderDetail(state, maxRows, cols) {
  const entry = state.detail;
  if (!entry) return `  ${DIM}Loading...${RESET}\n`;
  const type = TYPES[state.selectedType];
  const color = TYPE_COLORS[type] || WHITE;
  const lines = [];

  const isBm = state.bookmarks.includes(`${type}/${entry.name}`);
  let title = `  ${color}${BOLD}${entry.name}${RESET} ${GRAY}@${entry.version || "?"}${RESET}`;
  if (isBm) title += ` ${YELLOW}\u2605${RESET}`;
  if (entry.status === "blocked") title += ` ${BG_RED}${WHITE} BLOCKED ${RESET}`;
  if (state.comments?.rating?.count > 0) {
    const r = state.comments.rating;
    title += `  ${ratingStars(r.average)} ${r.average}/5 ${DIM}(${r.count})${RESET}`;
  }
  lines.push(title);
  lines.push(`  ${DIM}${entry.description || ""}${RESET}`);
  lines.push("");

  const meta = [["Owner", entry.owner], ["Author", entry.author || entry.meta?.author], ["Project", entry.meta?.project || entry.project], ["Type", type]].filter(([, v]) => v);
  for (const [k, v] of meta) lines.push(`  ${CYAN}${k}:${RESET} ${v}`);
  const tags = entry.tags || entry.meta?.tags || [];
  if (Array.isArray(tags) && tags.length) lines.push(`  ${CYAN}Tags:${RESET} ${tags.map((t) => `${GREEN}#${t}${RESET}`).join(" ")}`);

  const metaObj = entry.meta || {};
  const tf = { agents: ["inputs", "outputs", "skills", "rules"], skills: ["triggers", "args", "compatible_agents"], rules: ["scope", "severity", "applies_to"], memories: ["scope", "context_type", "related"], prompts: ["model", "compatible_agents"] };
  for (const field of (tf[type] || [])) {
    const val = metaObj[field] || entry[field];
    if (val && (!Array.isArray(val) || val.length)) {
      if (field === "related" && Array.isArray(val)) {
        lines.push(`  ${CYAN}${field}:${RESET} ${val.map((r) => `${MAGENTA}\u2192 ${r}${RESET}`).join("  ")}`);
      } else {
        lines.push(`  ${CYAN}${field}:${RESET} ${Array.isArray(val) ? val.join(", ") : val}`);
      }
    }
  }

  if (entry.attachments?.length) {
    lines.push(""); lines.push(`  ${YELLOW}${BOLD}Attachments (${entry.attachments.length})${RESET}`);
    for (const a of entry.attachments.slice(0, 6)) lines.push(`    ${DIM}├─${RESET} ${a.filepath} ${GRAY}(${a.size}B)${RESET}`);
    if (entry.attachments.length > 6) lines.push(`    ${DIM}└─ ...${entry.attachments.length - 6} more${RESET}`);
  }

  if (state.comments?.comments?.length) {
    lines.push(""); lines.push(`  ${MAGENTA}${BOLD}Recent reviews${RESET}  ${DIM}(c for all, w to add)${RESET}`);
    for (const c of state.comments.comments.slice(0, 3)) {
      lines.push(`    ${ratingStars(c.rating)}  ${CYAN}@${c.username}${RESET}  ${DIM}${c.created_at}${RESET}`);
      lines.push(`    ${c.body.slice(0, cols - 8)}`);
    }
    if (state.comments.comments.length > 3) lines.push(`    ${DIM}...${state.comments.comments.length - 3} more${RESET}`);
  }

  if (entry.body) {
    lines.push(""); lines.push(`  ${DIM}${"─".repeat(cols - 4)}${RESET}`);
    for (const line of entry.body.split("\n")) {
      if (line.startsWith("# ")) lines.push(`  ${BOLD}${MAGENTA}${line.slice(2)}${RESET}`);
      else if (line.startsWith("## ")) lines.push(`  ${BOLD}${YELLOW}${line.slice(3)}${RESET}`);
      else if (line.startsWith("### ")) lines.push(`  ${BOLD}${CYAN}${line.slice(4)}${RESET}`);
      else if (line.startsWith("- ")) lines.push(`  ${CYAN}\u2022${RESET} ${line.slice(2)}`);
      else if (line.startsWith("```")) lines.push(`  ${DIM}${line}${RESET}`);
      else lines.push(`  ${line}`);
    }
  }
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderComments(state, maxRows, cols) {
  const d = state.comments;
  if (!d) return `  ${DIM}No data.${RESET}\n`;
  const lines = [];
  lines.push(`  ${BOLD}${state.detail?.name}${RESET} — Reviews`);
  if (d.rating?.count > 0) {
    lines.push(`  ${ratingStars(d.rating.average)}  ${BOLD}${d.rating.average}/5${RESET}  ${DIM}(${d.rating.count})${RESET}`);
    lines.push("");
    for (let s = 5; s >= 1; s--) { const c = d.comments.filter((x) => x.rating === s).length; const pct = Math.round((c / d.rating.count) * 100); const bar = Math.round((c / d.rating.count) * 20); lines.push(`  ${s}★ ${YELLOW}${"█".repeat(bar)}${DIM}${"░".repeat(20 - bar)}${RESET} ${c} (${pct}%)`); }
  } else lines.push(`  ${DIM}No reviews yet.${RESET}`);
  lines.push(""); lines.push(`  ${DIM}${"─".repeat(cols - 4)}${RESET}`);
  for (const c of (d.comments || [])) { lines.push(""); lines.push(`  ${ratingStars(c.rating)}  ${CYAN}${BOLD}@${c.username}${RESET}  ${DIM}${c.created_at}${RESET}`); for (const l of c.body.split("\n")) lines.push(`  ${l}`); }
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderGraph(state, maxRows, cols) {
  const e = state.detail;
  if (!e) return `  ${DIM}No data.${RESET}\n`;
  const meta = e.meta || {};
  const lines = [];
  lines.push(`  ${BOLD}${CYAN}Dependency Graph: ${e.name}${RESET}`);
  lines.push("");
  lines.push(`  ${BOLD}${e.name}${RESET}`);
  if (meta.skills?.length) { lines.push(`  ${DIM}├── skills${RESET}`); for (const s of meta.skills) lines.push(`  ${DIM}│   └──${RESET} ${GREEN}${s}${RESET}`); }
  if (meta.rules?.length) { lines.push(`  ${DIM}├── rules${RESET}`); for (const r of meta.rules) lines.push(`  ${DIM}│   └──${RESET} ${YELLOW}${r}${RESET}`); }
  if (meta.compatible_agents?.length) { lines.push(`  ${DIM}├── compatible agents${RESET}`); for (const a of meta.compatible_agents) lines.push(`  ${DIM}│   └──${RESET} ${CYAN}${a}${RESET}`); }
  if (meta.related?.length) { lines.push(`  ${DIM}├── related${RESET}`); for (const r of meta.related) lines.push(`  ${DIM}│   └──${RESET} ${MAGENTA}${r}${RESET}`); }
  if (meta.applies_to?.length) { lines.push(`  ${DIM}├── applies to${RESET}`); for (const a of meta.applies_to) lines.push(`  ${DIM}│   └──${RESET} ${CYAN}${a}${RESET}`); }
  if (meta.inputs?.length) { lines.push(`  ${DIM}├── inputs${RESET}`); for (const i of meta.inputs) lines.push(`  ${DIM}│   └──${RESET} ${i}`); }
  if (meta.outputs?.length) { lines.push(`  ${DIM}└── outputs${RESET}`); for (const o of meta.outputs) lines.push(`  ${DIM}    └──${RESET} ${o}`); }
  if (lines.length === 3) lines.push(`  ${DIM}(no dependencies)${RESET}`);
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderVersions(state, maxRows) {
  const lines = [];
  lines.push(`  ${BOLD}${CYAN}Version History: ${state.detail?.name}${RESET}`);
  lines.push("");
  if (!state.versionList?.length) { lines.push(`  ${DIM}No versions.${RESET}`); return scrollView(lines, state.scrollOffset, maxRows, state); }
  for (const v of state.versionList) lines.push(`  ${GREEN}\u25CF${RESET} ${BOLD}${v.version}${RESET}  ${DIM}${v.created_at}${RESET}`);
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderGuide(state, maxRows, cols) {
  const tabs = ["overview", "memories", "mapping"];
  const tab = state.guideTab || 0;
  const lines = [];

  // Tab bar
  const tabBar = "  " + tabs.map((t, i) =>
    i === tab ? `${INVERSE} ${t} ${RESET}` : `${DIM} ${t} ${RESET}`
  ).join("  ");
  lines.push(tabBar);
  lines.push("");

  if (tab === 0) {
    // Overview: artifact types, when to use, boundaries
    lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Artifact Types Guide ${RESET}`);
    lines.push("");
    lines.push(`  ${CYAN}${BOLD}Agent${RESET} ${DIM}— "Who does the work?"${RESET}`);
    lines.push(`  An actor with capabilities, inputs, outputs. Orchestrates skills and follows rules.`);
    lines.push(`  ${DIM}Use when: you need a complete workflow with defined behavior.${RESET}`);
    lines.push(`  ${DIM}Example: code-reviewer, migration-assistant, security-scanner${RESET}`);
    lines.push("");
    lines.push(`  ${GREEN}${BOLD}Skill${RESET} ${DIM}— "How to do X?"${RESET}`);
    lines.push(`  A reusable action or procedure. Has triggers, args, and can be shared across agents.`);
    lines.push(`  ${DIM}Use when: you have a repeatable task that agents can invoke.${RESET}`);
    lines.push(`  ${DIM}Example: test-generator, db-migration, changelog-gen${RESET}`);
    lines.push("");
    lines.push(`  ${YELLOW}${BOLD}Rule${RESET} ${DIM}— "What must be enforced?"${RESET}`);
    lines.push(`  A constraint or policy. Has scope (global/project) and severity (error/warning/info).`);
    lines.push(`  ${DIM}Use when: a team decision must be enforced consistently.${RESET}`);
    lines.push(`  ${DIM}Example: no-any-type, require-tests, semantic-commits${RESET}`);
    lines.push("");
    lines.push(`  ${MAGENTA}${BOLD}Memory${RESET} ${DIM}— "What do we know?"${RESET}`);
    lines.push(`  Knowledge and context that persists across sessions. NOT actions or constraints.`);
    lines.push(`  ${DIM}Use when: knowledge should be recalled, not enforced.${RESET}`);
    lines.push(`  ${DIM}Example: adr-001-database-choice, system-topology, incident-2026-04${RESET}`);
    lines.push("");
    lines.push(`  ${BLUE}${BOLD}Prompt${RESET} ${DIM}— "What should the AI say?"${RESET}`);
    lines.push(`  A reusable instruction template for AI models. Has variables and expected output.`);
    lines.push(`  ${DIM}Use when: you have a proven instruction that produces reliable AI output.${RESET}`);
    lines.push(`  ${DIM}Example: code-review-feedback, debug-assistant, write-tests${RESET}`);
    lines.push("");
    lines.push(`  ${DIM}${"─".repeat(cols - 4)}${RESET}`);
    lines.push("");
    lines.push(`  ${BOLD}Boundaries${RESET}`);
    lines.push("");
    const bw = Math.min(cols - 4, 90);
    lines.push(`  ${BOLD}${padR("Type", 10)}${padR("Stores", 30)}${padR("Does NOT store", bw - 40)}${RESET}`);
    lines.push(`  ${DIM}${"─".repeat(bw)}${RESET}`);
    lines.push(`  ${CYAN}${padR("Agent", 10)}${RESET}${padR("Actor, orchestration", 30)}${DIM}Knowledge, constraints${RESET}`);
    lines.push(`  ${GREEN}${padR("Skill", 10)}${RESET}${padR("Procedures, how-to", 30)}${DIM}Why we do X, what X must follow${RESET}`);
    lines.push(`  ${YELLOW}${padR("Rule", 10)}${RESET}${padR("Constraints, policies", 30)}${DIM}Why it was decided, how to implement${RESET}`);
    lines.push(`  ${MAGENTA}${padR("Memory", 10)}${RESET}${padR("Knowledge, evidence", 30)}${DIM}Actions, constraints, instructions${RESET}`);
    lines.push(`  ${BLUE}${padR("Prompt", 10)}${RESET}${padR("AI instructions", 30)}${DIM}Execution logic, actor definitions${RESET}`);
    lines.push("");
    lines.push(`  ${BOLD}Decision tree${RESET}`);
    lines.push("");
    lines.push(`  ${DIM}Is it a complete workflow?${RESET}            ${CYAN}→ Agent${RESET}`);
    lines.push(`  ${DIM}Is it a reusable action?${RESET}             ${GREEN}→ Skill${RESET}`);
    lines.push(`  ${DIM}Is it a constraint to enforce?${RESET}       ${YELLOW}→ Rule${RESET}`);
    lines.push(`  ${DIM}Is it knowledge to recall?${RESET}           ${MAGENTA}→ Memory${RESET}`);
    lines.push(`  ${DIM}Is it an instruction for an AI?${RESET}      ${BLUE}→ Prompt${RESET}`);
  } else if (tab === 1) {
    // Memory context types
    lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Memory Context Types ${RESET}`);
    lines.push("");
    const types = [
      { name: "decision", color: CYAN, icon: "◆", desc: "Why we chose X over Y",
        detail: "ADRs, trade-off analyses, technology selections, vendor choices.",
        boundary: "Not a rule (rules enforce; decisions explain why).",
        examples: "adr-001-database-choice, adr-002-monorepo, adr-003-auth-strategy" },
      { name: "architecture", color: GREEN, icon: "▲", desc: "What the system looks like",
        detail: "Service topology, data models, network layout, API contracts, schemas.",
        boundary: "Not a skill (skills do things; architecture describes things).",
        examples: "system-topology, data-model-orders" },
      { name: "incident", color: RED, icon: "●", desc: "What happened and root cause",
        detail: "Postmortems, timelines, blast radius, action items, near misses.",
        boundary: "Not a runbook (runbooks are skills; incidents are evidence).",
        examples: "incident-2026-04, incident-2026-03-redis" },
      { name: "domain", color: YELLOW, icon: "■", desc: "What things mean in our context",
        detail: "Business rules, glossary, regulatory constraints, user personas.",
        boundary: "Not a constraint (rules constrain; domain knowledge informs).",
        examples: "domain-payments, domain-glossary" },
      { name: "context", color: MAGENTA, icon: "◇", desc: "Who, when, where around the project",
        detail: "Team structure, ownership, priorities, stakeholders, timelines, budget.",
        boundary: "Not an agent (agents act; context describes the environment).",
        examples: "team-ownership, project-q2-priorities" },
      { name: "learning", color: BLUE, icon: "★", desc: "What we measured and observed",
        detail: "Benchmarks, experiment results, what worked vs failed, retrospectives.",
        boundary: "Not a policy (rules prescribe; learnings provide evidence).",
        examples: "learning-caching-strategy, learning-testing-strategy" },
    ];
    for (const t of types) {
      lines.push(`  ${t.color}${t.icon} ${BOLD}${t.name}${RESET} ${DIM}— ${t.desc}${RESET}`);
      lines.push(`    ${t.detail}`);
      lines.push(`    ${DIM}Boundary: ${t.boundary}${RESET}`);
      lines.push(`    ${DIM}Examples: ${t.examples}${RESET}`);
      lines.push("");
    }
  } else if (tab === 2) {
    // Knowledge mapping
    lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Knowledge Mapping for IT Projects ${RESET}`);
    lines.push("");
    const bw = Math.min(cols - 4, 100);
    const sections = [
      { title: "Requirements & Analysis", color: YELLOW, items: [
        ["Stakeholder interviews", "domain", "Product Owner, BA → Dev"],
        ["Functional requirements", "domain", "BA, PO → Dev, QA"],
        ["Non-functional requirements", "domain", "Architect, SRE → Dev, Ops"],
        ["Regulatory constraints", "domain", "Legal, Compliance → All"],
        ["Glossary / Ubiquitous language", "domain", "BA, Tech Lead → All"],
        ["User journey mapping", "domain", "UX, Product → Frontend"],
        ["Integration requirements", "domain", "Architect, BA → Dev"],
      ]},
      { title: "Architecture & Design", color: GREEN, items: [
        ["System topology", "architecture", "Architect → All"],
        ["Data models / ERDs", "architecture", "Architect, DBA → Dev"],
        ["API contracts", "architecture", "Architect, Backend → FE, QA"],
        ["Network topology", "architecture", "Cloud Arch, NetOps → SRE"],
        ["Landing zone design", "architecture", "Cloud Arch → Platform, FinOps"],
        ["CI/CD pipeline design", "architecture", "DevOps → Developers"],
        ["Security architecture", "architecture", "Security Arch → All"],
        ["DR design", "architecture", "Architect, SRE → Ops, Mgmt"],
      ]},
      { title: "Decisions", color: CYAN, items: [
        ["Technology selection", "decision", "Architect, Lead → All"],
        ["Framework/library choice", "decision", "Lead, Sr Dev → Dev"],
        ["Build vs buy", "decision", "CTO, Architect → All"],
        ["Cloud provider choice", "decision", "CTO, Cloud Arch → All"],
        ["Migration strategy", "decision", "Architect, PM → Dev, Ops"],
        ["Vendor selection", "decision", "Platform, Mgmt → SRE, FinOps"],
        ["Trade-off records", "decision", "Architect → Dev, QA"],
      ]},
      { title: "Incidents & Postmortems", color: RED, items: [
        ["Production outage", "incident", "SRE, Oncall → All"],
        ["Security breach", "incident", "Security, SRE → Mgmt, Legal"],
        ["Data loss event", "incident", "DBA, SRE → Mgmt, Dev"],
        ["Failed migration", "incident", "DBA, DevOps → Dev, PM"],
        ["Failed deployment", "incident", "DevOps, Dev → SRE, QA"],
        ["Capacity incident", "incident", "SRE, Cloud → FinOps, Arch"],
        ["Near miss", "incident", "Any → All"],
      ]},
      { title: "Team & Project Context", color: MAGENTA, items: [
        ["Team ownership map", "context", "Eng Manager → All"],
        ["Quarterly priorities", "context", "PM, Mgmt → Dev, Agents"],
        ["Stakeholder map / RACI", "context", "PM, BA → All"],
        ["Budget constraints", "context", "FinOps, Mgmt → Arch, PM"],
        ["Vendor relationships", "context", "Procurement → SRE, FinOps"],
        ["Compliance deadlines", "context", "Compliance → All"],
        ["Onboarding notes", "context", "New hires → Future hires"],
      ]},
      { title: "Learnings & Evidence", color: BLUE, items: [
        ["Performance benchmarks", "learning", "Sr Dev, SRE → Dev"],
        ["Cost optimization results", "learning", "FinOps → Mgmt"],
        ["Testing strategy results", "learning", "QA, Sr Dev → Dev"],
        ["Migration retrospective", "learning", "Lead, PM → Future teams"],
        ["Tool evaluation", "learning", "Any → All"],
        ["Security audit findings", "learning", "Security → Dev, SRE"],
        ["FinOps analysis", "learning", "FinOps → Mgmt, Arch"],
        ["DR drill results", "learning", "SRE → Mgmt, Arch"],
      ]},
    ];

    for (const s of sections) {
      lines.push(`  ${s.color}${BOLD}${s.title}${RESET}`);
      lines.push(`  ${DIM}${padR("Situation", 32)}${padR("Type", 15)}Roles${RESET}`);
      lines.push(`  ${DIM}${"─".repeat(Math.min(bw, 80))}${RESET}`);
      for (const [sit, type, roles] of s.items) {
        lines.push(`  ${padR(sit, 32)}${MAGENTA}${padR(type, 15)}${RESET}${DIM}${roles}${RESET}`);
      }
      lines.push("");
    }
  }

  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function padR(str, len) {
  const s = String(str);
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function renderHelp(state, maxRows, cols) {
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Keyboard Shortcuts ${RESET}`);
  lines.push("");
  lines.push(`  ${BOLD}Navigation${RESET}`);
  lines.push(`  ${CYAN}↑↓${RESET}       navigate       ${CYAN}←→${RESET}       switch type (list)`);
  lines.push(`  ${CYAN}⏎${RESET}        select/drill    ${CYAN}esc/q${RESET}    go back`);
  lines.push(`  ${CYAN}/${RESET}        search          ${CYAN}r${RESET}        refresh`);
  lines.push(`  ${CYAN}type${RESET}     fuzzy filter (list view)`);
  lines.push("");
  lines.push(`  ${BOLD}Selection & Pull${RESET}`);
  lines.push(`  ${CYAN}space${RESET}    toggle select   ${CYAN}a${RESET}        select/deselect all`);
  lines.push(`  ${CYAN}p${RESET}        pull selected   ${CYAN}P${RESET}        quick pull one`);
  lines.push(`  ${CYAN}s${RESET}        cycle sort (name/date/rating/pulls)`);
  lines.push(`  ${CYAN}{ }${RESET}      scroll preview pane (wide terminals)`);
  lines.push("");
  lines.push(`  ${BOLD}Detail View${RESET}`);
  lines.push(`  ${CYAN}c${RESET}        comments        ${CYAN}w${RESET}        write review`);
  lines.push(`  ${CYAN}f${RESET}        bookmark        ${CYAN}y${RESET}        copy pull command`);
  lines.push(`  ${CYAN}g${RESET}        dependency graph ${CYAN}v${RESET}        version history`);
  lines.push(`  ${CYAN}d${RESET}        remove artifact`);
  lines.push("");
  lines.push(`  ${BOLD}Global${RESET}`);
  lines.push(`  ${CYAN}j${RESET}        projects view   ${CYAN}G${RESET}        artifact guide`);
  lines.push(`  ${CYAN}F${RESET}        bookmarks`);
  lines.push(`  ${CYAN}?${RESET}        this help       ${CYAN}Ctrl+C${RESET}   quit`);
  if (state.isAdmin) {
    lines.push("");
    lines.push(`  ${BOLD}Admin${RESET}`);
    lines.push(`  ${CYAN}m${RESET}        metrics         ${CYAN}t${RESET}        audit trail`);
    lines.push(`  ${CYAN}i${RESET}        server config   ${CYAN}B${RESET}        blocked artifacts`);
  }
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderBookmarks(state, maxRows) {
  const bm = state.bookmarks;
  const lines = [];
  lines.push(`  ${BOLD}${YELLOW}\u2605 Bookmarks${RESET}  ${DIM}(${bm.length})${RESET}`);
  lines.push("");
  if (bm.length === 0) { lines.push(`  ${DIM}No bookmarks. Press f in detail view to add.${RESET}`); return lines.join("\n") + "\n"; }
  for (let i = 0; i < bm.length; i++) {
    const sel = i === state.selectedItem;
    lines.push(sel ? `  ${INVERSE} > ${RESET} ${YELLOW}\u2605${RESET} ${bm[i]}` : `      ${YELLOW}\u2605${RESET} ${DIM}${bm[i]}${RESET}`);
  }
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderProjects(state, maxRows, cols) {
  const tree = state.projectTree;
  if (!tree) return `  ${DIM}No data.${RESET}\n`;
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Projects ${RESET}`); lines.push("");
  for (const [name, types] of Object.entries(tree.projects)) {
    lines.push(`  ${BOLD}${CYAN}${name}${RESET}`);
    for (const t of TYPES) { const entries = types[t]; if (!entries?.length) continue; lines.push(`  ${DIM}├──${RESET} ${YELLOW}${t}${RESET}`); for (const e of entries) lines.push(`  ${DIM}│   ├──${RESET} ${e.name}${GRAY}@${e.version || "?"}${RESET}`); }
    lines.push("");
  }
  if (tree.unassigned.length) { lines.push(`  ${DIM}${BOLD}(unassigned)${RESET}`); for (const e of tree.unassigned) lines.push(`  ${DIM}├──${RESET} ${GRAY}[${e._type}]${RESET} ${e.name}`); }
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderConfig(state, maxRows) {
  const cfg = state.serverConfig;
  if (!cfg) return `  ${DIM}No data.${RESET}\n`;
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Server Configuration ${RESET}`); lines.push("");
  const features = [
    ["Server", `port ${cfg.server?.port}`, true], ["Database", cfg.server?.db_path, true],
    ["Admin", cfg.admin?.username || "(first registered)", !!cfg.admin?.username],
    ["Auth0", cfg.auth0?.enabled ? cfg.auth0.domain : "disabled", cfg.auth0?.enabled],
    ["Slack", cfg.slack?.enabled ? `digest every ${cfg.slack.digest_interval_hours}h` : "disabled", cfg.slack?.enabled],
    ["Metrics", cfg.metrics?.enabled ? "/api/metrics" : "disabled", cfg.metrics?.enabled],
    ["Audit", cfg.audit?.enabled ? `anonymous: ${cfg.audit.log_anonymous}` : "disabled", cfg.audit?.enabled],
    ["Firewall", cfg.firewall?.enabled ? `${cfg.firewall.whitelist_count} IPs` : "disabled", cfg.firewall?.enabled],
  ];
  for (const [n, d, e] of features) lines.push(`  ${e ? `${GREEN}\u2713` : `${RED}\u2717`}${RESET}  ${BOLD}${n.padEnd(12)}${RESET} ${d}`);
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderAgentSelect(state) {
  const selected = state.pullAgents || new Set();
  let out = `  ${BOLD}Select coding agent(s)${RESET}  ${DIM}(number keys toggle, ⏎ confirm)${RESET}\n\n`;
  for (let i = 0; i < AGENT_NAMES.length; i++) {
    const a = AGENT_NAMES[i]; const c = CODING_AGENTS[a];
    const check = selected.has(a) ? `${GREEN}\u25C9${RESET}` : `${DIM}\u25CB${RESET}`;
    out += `  ${check} ${CYAN}[${i + 1}]${RESET} ${BOLD}${c.name}${RESET}\n`;
  }
  out += `\n  ${DIM}${state.marked.size} artifact(s) × ${selected.size || 0} agent(s)${RESET}\n`;
  return out;
}

function renderScopeSelect(state) {
  const names = [...(state.pullAgents || [])].map((a) => CODING_AGENTS[a]?.name || a).join(", ");
  let out = `  ${BOLD}Install scope for ${names}${RESET}\n\n`;
  out += `  ${GREEN}[l]${RESET} ${BOLD}Project${RESET}  — project directory\n`;
  out += `  ${BLUE}[g]${RESET} ${BOLD}Personal${RESET} — home directory\n`;
  out += `\n  ${DIM}${state.marked.size} artifact(s) × ${state.pullAgents?.size || 0} agent(s)${RESET}\n`;
  return out;
}

function renderPulling(state, maxRows) {
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Pulling artifacts ${RESET}`); lines.push("");
  for (const r of state.pullResults) {
    if (r.status === "summary") { lines.push(""); lines.push(`  ${BOLD}${GREEN}\u2714 ${r.total} artifact(s) processed${RESET}`); if (r.agent) lines.push(`  ${DIM}Agent: ${r.agent}  |  Scope: ${r.scope}${RESET}`); lines.push(`  ${DIM}Press any key${RESET}`); }
    else if (r.status === "pulling") lines.push(`  ${YELLOW}\u25CF${RESET} ${r.type}/${r.name} ${DIM}pulling...${RESET}`);
    else if (r.status === "done") { lines.push(`  ${GREEN}\u2714${RESET} ${r.type}/${r.name}${GRAY}@${r.version || "?"}${r.attachments ? ` +${r.attachments} files` : ""}${RESET}`); if (r.target) lines.push(`    ${DIM}→ ${r.target}${RESET}`); }
    else if (r.status === "error") lines.push(`  ${RED}\u2718${RESET} ${r.type}/${r.name} ${RED}${r.error}${RESET}`);
  }
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderMetrics(state, maxRows, cols) {
  if (!state.metrics) return `  ${DIM}No metrics.${RESET}\n`;
  const lines = [];
  const parsed = {};
  for (const line of state.metrics.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_]+)(?:\{(.+?)\})?\s+(.+)$/);
    if (!m) continue;
    const [, name, ls, v] = m;
    if (!parsed[name]) parsed[name] = [];
    const labels = {};
    if (ls) for (const p of ls.match(/[a-zA-Z_]+="[^"]*"/g) || []) {
      const eq = p.indexOf("=");
      labels[p.slice(0, eq)] = p.slice(eq + 2, -1);
    }
    parsed[name].push({ labels, value: parseFloat(v) });
  }

  const sum = (n) => (parsed[n] || []).reduce((s, e) => s + e.value, 0);
  const group = (n, l) => {
    const r = {};
    for (const e of (parsed[n] || [])) { const k = e.labels[l] || "?"; r[k] = (r[k] || 0) + e.value; }
    return r;
  };
  const groupTwo = (n, l1, l2) => {
    const r = {};
    for (const e of (parsed[n] || [])) { const k = `${e.labels[l1] || "?"}/${e.labels[l2] || "?"}`; r[k] = (r[k] || 0) + e.value; }
    return r;
  };

  // Side-by-side layout when terminal is wide enough
  const canPair = cols >= 100;
  const paneW = canPair ? Math.floor((cols - 5) / 2) : cols - 4;
  const chartBarW = Math.min(20, Math.max(8, paneW - 28));
  const chartLabelW = Math.min(20, Math.max(10, paneW - chartBarW - 8));

  // Build a chart block as an array of lines
  function makeChart(title, data, color, limit = 10) {
    const block = [];
    const sorted = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, limit);
    if (sorted.length === 0) return block;
    const max = Math.max(...sorted.map(([, v]) => v), 1);
    block.push(`${BOLD}${color}${title}${RESET}`);
    for (const [k, v] of sorted) {
      const len = Math.max(1, Math.round((v / max) * chartBarW));
      block.push(`  ${k.padEnd(chartLabelW).slice(0, chartLabelW)} ${color}${"█".repeat(len)}${DIM}${"░".repeat(chartBarW - len)}${RESET} ${v}`);
    }
    const total = Object.entries(data).filter(([, v]) => v > 0).length;
    if (total > limit) block.push(`  ${DIM}...and ${total - limit} more${RESET}`);
    return block;
  }

  // Merge two chart blocks side-by-side
  function sideBySide(leftBlock, rightBlock) {
    const h = Math.max(leftBlock.length, rightBlock.length);
    for (let i = 0; i < h; i++) {
      const left = padVisible(leftBlock[i] || "", paneW);
      const right = rightBlock[i] || "";
      lines.push(`  ${left} ${DIM}│${RESET} ${right}`);
    }
    lines.push("");
  }

  // Add a chart pair (side-by-side if wide, stacked if narrow)
  function addCharts(left, right) {
    if (left.length === 0 && right.length === 0) return;
    if (canPair && left.length > 0 && right.length > 0) {
      sideBySide(left, right);
    } else {
      if (left.length > 0) { for (const l of left) lines.push(`  ${l}`); lines.push(""); }
      if (right.length > 0) { for (const l of right) lines.push(`  ${l}`); lines.push(""); }
    }
  }

  lines.push(`  ${BG_YELLOW}${BLACK}${BOLD} Metrics ${RESET}`);
  lines.push("");

  // Stats row
  const stats = [
    [CYAN, sum("ihub_users_count"), "Users"],
    [GREEN, sum("ihub_entries_count"), "Entries"],
    [MAGENTA, sum("ihub_comments_count"), "Comments"],
    [YELLOW, sum("ihub_push_total"), "Pushes"],
    [BLUE, sum("ihub_pull_total"), "Pulls"],
    [WHITE, sum("ihub_view_total"), "Views"],
    [RED, sum("ihub_search_total"), "Searches"],
    [GRAY, sum("ihub_remove_total"), "Removes"],
  ];
  lines.push("  " + stats.map(([c, v, l]) => `${c}${BOLD}${v}${RESET} ${DIM}${l}${RESET}`).join("   "));
  lines.push("");

  // Security stats
  const sensitive = sum("ihub_sensitive_detected_total");
  const firewalled = sum("ihub_firewall_blocked_total");
  if (sensitive > 0 || firewalled > 0) {
    lines.push(`  ${BG_RED}${WHITE}${BOLD} Security ${RESET}  ${RED}${BOLD}${sensitive}${RESET} ${DIM}sensitive detected${RESET}   ${RED}${BOLD}${firewalled}${RESET} ${DIM}firewall blocked${RESET}`);
    lines.push("");
  }

  // Build all chart blocks
  const etData = Object.fromEntries((parsed["ihub_entries_count"] || []).map((e) => [e.labels.type || "?", e.value]));
  const epData = group("ihub_entries_by_project_count", "project");
  const puData = group("ihub_push_total", "user");
  const paData = groupTwo("ihub_push_total", "type", "name");
  const pluData = group("ihub_pull_total", "user");
  const plaData = groupTwo("ihub_pull_total", "type", "name");
  const vuData = group("ihub_view_total", "user");
  const vaData = groupTwo("ihub_view_total", "type", "name");
  const cuData = group("ihub_comments_by_user_count", "user");
  const caObj = {};
  for (const e of (parsed["ihub_comments_by_artifact_count"] || [])) caObj[`${e.labels.type || "?"}/${e.labels.name || "?"}`] = e.value;
  const ruData = group("ihub_remove_total", "user");
  const hmData = group("ihub_http_requests_total", "method");

  // Pair charts by theme
  addCharts(
    makeChart("Entries by Type", etData, YELLOW),
    makeChart("Entries by Project", epData, CYAN)
  );
  addCharts(
    makeChart("Pushes by User", puData, YELLOW),
    makeChart("Pushes by Artifact", paData, YELLOW, 8)
  );
  addCharts(
    makeChart("Pulls by User", pluData, GREEN),
    makeChart("Pulls by Artifact", plaData, GREEN, 8)
  );
  addCharts(
    makeChart("Views by User", vuData, BLUE),
    makeChart("Views by Artifact", vaData, BLUE, 8)
  );
  addCharts(
    makeChart("Comments by User", cuData, MAGENTA),
    makeChart("Comments by Artifact", caObj, MAGENTA, 8)
  );
  addCharts(
    makeChart("Removes by User", ruData, RED),
    makeChart("HTTP Requests", hmData, WHITE)
  );

  // Admin stats
  const regs = sum("ihub_register_total");
  const backups = sum("ihub_backup_total");
  const roleChanges = sum("ihub_role_change_total");
  if (regs > 0 || backups > 0 || roleChanges > 0) {
    lines.push(`  ${BOLD}Admin${RESET}  ${DIM}Registrations:${RESET} ${regs}   ${DIM}Backups:${RESET} ${backups}   ${DIM}Role changes:${RESET} ${roleChanges}`);
    lines.push("");
  }

  lines.push(`  ${DIM}/api/metrics  |  ${new Date().toISOString()}${RESET}`);
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderAudit(state, maxRows, cols) {
  if (!state.audit) return `  ${DIM}No data.${RESET}\n`;
  const totalPages = Math.ceil(state.auditTotal / 50) || 1;
  const lines = [];
  lines.push(`  ${BG_YELLOW}${BLACK}${BOLD} Audit Trail ${RESET}  ${DIM}${state.auditTotal} records  |  page ${state.auditPage}/${totalPages}${RESET}`); lines.push("");
  const AC = { push: GREEN, pull: GREEN, view: BLUE, list: BLUE, search: BLUE, comment: MAGENTA, remove: RED, backup: RED, "set-role": RED, "sensitive-blocked": `${BG_YELLOW}${BLACK}`, approve: GREEN, register: YELLOW, "change-password": YELLOW };
  for (const e of state.audit) {
    const isA = e.role === "admin";
    const badge = isA ? `${BG_RED}${WHITE} ADM ${RESET}` : `${BLUE} USR ${RESET}`;
    const ac = AC[e.action] || WHITE;
    lines.push(`  ${DIM}${e.created_at || ""}${RESET}  ${GRAY}${(e.ip || "").padEnd(15)}${RESET}  ${isA ? RED : CYAN}${(e.username || "anon").padEnd(10)}${RESET} ${badge} ${ac}${BOLD}${(e.action || "").toUpperCase().padEnd(18)}${RESET} ${e.type && e.name ? `${YELLOW}${e.type}/${e.name}${RESET}` : ""}${e.detail ? ` ${DIM}(${e.detail})${RESET}` : ""}`);
  }
  if (totalPages > 1) { lines.push(""); const h = []; if (state.auditPage < totalPages) h.push(`n → page ${state.auditPage + 1}`); if (state.auditPage > 1) h.push(`b → page ${state.auditPage - 1}`); lines.push(`  ${DIM}${h.join("  |  ")}${RESET}`); }
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

// --- Shared ---

function scrollView(lines, offset, maxRows, state) {
  // Clamp offset
  const maxOffset = Math.max(0, lines.length - maxRows);
  if (state && state.scrollOffset > maxOffset) state.scrollOffset = maxOffset;
  const clampedOffset = state ? state.scrollOffset : Math.min(offset, maxOffset);
  // Store for key handlers
  if (state) {
    state._contentLines = lines.length;
    state._contentVisibleRows = maxRows;
  }
  const visible = lines.slice(clampedOffset, clampedOffset + maxRows);
  let out = visible.join("\n") + "\n";
  // Store pagination info for footer display
  if (state && lines.length > maxRows) {
    state._scrollInfo = `${clampedOffset + 1}-${Math.min(clampedOffset + maxRows, lines.length)} of ${lines.length}`;
  } else if (state) {
    state._scrollInfo = null;
  }
  return out;
}

function adjustScroll(state) {
  const rows = (process.stdout.rows || 24) - 7;
  if (state.selectedItem < state.scrollOffset) state.scrollOffset = state.selectedItem;
  else if (state.selectedItem >= state.scrollOffset + rows) state.scrollOffset = state.selectedItem - rows + 1;
}

function cleanup() {
  // Disable mouse tracking
  process.stdout.write("\x1b[?1000l\x1b[?1006l");
  process.stdout.write(SHOW_CURSOR + CLEAR);
  try { process.stdin.setRawMode(false); } catch {}
}

async function loadAuditPage(state, baseUrl, token) {
  const offset = (state.auditPage - 1) * 50;
  process.stdout.write(CLEAR + `${DIM}Loading audit...${RESET}`);
  const d = await fetchJson(`${baseUrl}/api/audit?limit=50&offset=${offset}`, token);
  state.audit = d?.entries || [];
  state.auditTotal = d?.total || 0;
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
    state.pullResults.push({ type, name, status: "pulling" }); render(state);
    let data;
    try {
      const h = {}; if (token) h["Authorization"] = `Bearer ${token}`; h["X-Ihub-Action"] = "pull";
      const res = await fetch(`${baseUrl}/api/${type}/${name}`, { headers: h });
      if (!res.ok) { state.pullResults[state.pullResults.length - 1] = { type, name, status: "error", error: `HTTP ${res.status}` }; render(state); continue; }
      data = await res.json();
    } catch (err) { state.pullResults[state.pullResults.length - 1] = { type, name, status: "error", error: err.message }; render(state); continue; }
    const ver = data.version || data.meta?.version || "?";
    const meta = data.meta || {};
    const md = ["---", ...Object.entries(meta).map(([k, v]) => Array.isArray(v) ? `${k}: [${v.join(", ")}]` : `${k}: ${v}`), "---", "", data.body || ""].join("\n");
    if (type === "memories") {
      mkdirSync("memories", { recursive: true }); writeFileSync(resolve("memories", `${name}.md`), md);
      state.pullResults[state.pullResults.length - 1] = { type, name, status: "done", version: ver, target: `memories/${name}.md`, attachments: 0 }; render(state); continue;
    }
    const targets = [];
    const isSkillType = (type === "skills" || type === "agents" || type === "prompts");
    for (const agent of agents) {
      try {
        const info = getInstallPath(agent, type, scope);
        if (!info?.path) continue;
        let targetPath;
        if (info.skillAsDir && info.skillFilename && isSkillType) { const sd = resolve(info.path, name); mkdirSync(sd, { recursive: true }); targetPath = resolve(sd, info.skillFilename); }
        else { mkdirSync(info.path, { recursive: true }); targetPath = resolve(info.path, `${name}${info.ext || ".md"}`); }
        writeFileSync(targetPath, md); targets.push(targetPath);
        if (data.attachments?.length) { const ad = resolve(dirname(targetPath), name); for (const att of data.attachments) { try { const ar = await fetch(`${baseUrl}/api/${type}/${name}/attachments/${att.filepath}`); if (ar.ok) { const buf = Buffer.from(await ar.arrayBuffer()); mkdirSync(resolve(ad, dirname(att.filepath)), { recursive: true }); writeFileSync(resolve(ad, att.filepath), buf); } } catch {} } }
      } catch {}
    }
    state.pullResults[state.pullResults.length - 1] = { type, name, status: "done", version: ver, attachments: data.attachments?.length || 0, target: targets.length === 1 ? targets[0] : `${targets.length} locations` };
    render(state);
  }
  state.pullResults.push({ type: "—", name: "done", status: "summary", total: toPull.length, agent: agents.map((a) => CODING_AGENTS[a]?.name || a).join(", "), scope });
  state.marked.clear(); state.pullAgents = null; state.pullScope = null;
  clearInstalledCache();
  render(state);
}

// --- API ---

async function fetchJson(url, token) {
  try { const h = {}; if (token) h["Authorization"] = `Bearer ${token}`; const r = await fetch(url, { headers: h }); if (!r.ok) return null; return await r.json(); } catch { return null; }
}

async function fetchText(url, token) {
  try { const h = {}; if (token) h["Authorization"] = `Bearer ${token}`; const r = await fetch(url, { headers: h }); if (!r.ok) return null; return await r.text(); } catch { return null; }
}
