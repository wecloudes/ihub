// Interactive TUI browser for the ihub plugin registry — zero dependencies.
// One unit: a plugin (Claude Code plugin) bundling components
// (skills / commands / agents / mcp servers / hooks). Features: live preview,
// fuzzy filter, breadcrumbs, install indicators, blocked list, sorting,
// ratings, help overlay, bookmarks, quick pull, containment graph, clipboard.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

const ESC = "\x1b";
const CLEAR = `${ESC}[2J${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

const THEME = process.env.IHUB_THEME || "dark";
// NO_COLOR (https://no-color.org) — strip colors, keep bold/dim/inverse for hierarchy
const NO_COLOR = !!process.env.NO_COLOR;
const C = (s) => (NO_COLOR ? "" : s);

const CYAN = C(`${ESC}[36m`);
const YELLOW = C(`${ESC}[33m`);
const GREEN = C(`${ESC}[32m`);
const MAGENTA = C(`${ESC}[35m`);
const BLUE = C(`${ESC}[34m`);
const RED = C(`${ESC}[31m`);
const BRIGHT_RED = C(`${ESC}[91m`);
const BRIGHT_CYAN = C(`${ESC}[96m`);

// Spinner frames for loading states
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let _spinnerIdx = 0;
const WHITE = C(THEME === "light" ? `${ESC}[90m` : `${ESC}[37m`);
const GRAY = C(THEME === "light" ? `${ESC}[37m` : `${ESC}[90m`);
const BG_CYAN = C(THEME === "light" ? `${ESC}[106m` : `${ESC}[46m`);
const BLACK = C(`${ESC}[30m`);
const INVERSE = `${ESC}[7m`;
const BG_YELLOW = C(THEME === "light" ? `${ESC}[103m` : `${ESC}[43m`);
const BG_GREEN = C(THEME === "light" ? `${ESC}[102m` : `${ESC}[42m`);
const BG_RED = C(`${ESC}[41m`);

// A plugin is one unit; components inside it are colored by kind.
const PLUGIN_COLOR = MAGENTA;
const PLUGIN_ICON = "▣"; // ▣
// meta.components keys → display label, color, icon
const COMPONENT_KINDS = [
  { key: "skills", label: "Skills", color: GREEN, icon: "▶" },        // ▶
  { key: "commands", label: "Commands", color: BRIGHT_RED, icon: "⌘" }, // ⌘
  { key: "agents", label: "Agents", color: CYAN, icon: "◆" },         // ◆
  { key: "mcpServers", label: "MCP servers", color: BRIGHT_CYAN, icon: "⦿" }, // ⿿
  { key: "hooks", label: "Hooks", color: RED, icon: "⚓" },            // ⚓
];

const PLURAL = "plugins"; // registry type segment for every plugin endpoint

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
    selectedItem: 0,
    scrollOffset: 0,
    plugins: [],
    detail: null,
    comments: null,
    metrics: null,
    audit: null,
    auditPage: 1,
    auditTotal: 0,
    marked: new Set(),        // marked plugin names
    pullResults: [],
    baseUrl,
    token,
    isAdmin: false,
    filter: "",           // inline fuzzy filter
    filterMode: false,    // when true, all printable keys go to the filter
    previewScroll: 0,    // right pane scroll offset
    sortBy: "name",       // name | date | rating | pulls | trending
    showHelp: false,
    bookmarks: loadBookmarks(),
    showBookmarks: false,
    blockedCount: 0,
    lastVisit: null,
    newCount: 0,
    statusMsg: null,
    previousView: null,  // tracks where to go back from overlay views
    breadcrumb: [],
    projectTree: null,
    serverConfig: null,
    _previewCache: new Map(),
    _previewKey: null,
    _previewBody: "",
  };

  process.stdout.write(CLEAR + HIDE_CURSOR);
  // Enable SGR mouse tracking (only in real terminals — programmatic
  // drivers like expect can misparse mouse sequences mixed with arrow keys)
  const mouseEnabled = process.stdin.isTTY;
  if (mouseEnabled) process.stdout.write("\x1b[?1000h\x1b[?1006h");
  state._loading = true;
  const _startupSpin = setInterval(() => {
    _spinnerIdx = (_spinnerIdx + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`\r ${CYAN}${SPINNER_FRAMES[_spinnerIdx]}${RESET} ${DIM}Loading registry...${RESET}`);
  }, 80);
  process.stdout.write(`\r ${CYAN}${SPINNER_FRAMES[0]}${RESET} ${DIM}Loading registry...${RESET}`);

  // Load the flat plugin list
  state.plugins = (await fetchJson(`${baseUrl}/api/${PLURAL}`)) || [];
  if (token) {
    const whoami = await fetchJson(`${baseUrl}/api/whoami`, token);
    if (whoami?.role === "admin") {
      state.isAdmin = true;
      const blocked = await fetchJson(`${baseUrl}/api/blocked`, token);
      state.blockedCount = Array.isArray(blocked) ? blocked.length : 0;
    }
  }

  // Notification bell — check for new plugins since last visit
  const configPath = join(homedir(), ".ihub-tui-state.json");
  try {
    const s = JSON.parse(readFileSync(configPath, "utf-8"));
    state.lastVisit = s.lastVisit;
  } catch {}
  if (state.lastVisit) {
    let newCount = 0;
    for (const e of state.plugins) {
      if (e.created_at && e.created_at > state.lastVisit) newCount++;
    }
    state.newCount = newCount;
  }
  writeFileSync(configPath, JSON.stringify({ lastVisit: new Date().toISOString() }));
  clearInterval(_startupSpin);
  state._loading = false;

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

      // Left click (press only) — select a list row
      if (button === 0 && isPress) {
        if (state.view === "list") {
          // Header takes ~5 lines (border + header + breadcrumb + title + blank)
          const listStartRow = 6;
          const clickedIdx = (row - listStartRow) + state.scrollOffset;
          const items = getVisibleItems(state);
          if (clickedIdx >= 0 && clickedIdx < items.length) {
            state.selectedItem = clickedIdx;
            state.previewScroll = 0;
          }
        }
        render(state);
        return;
      }

      // Consume any other mouse event without processing
      render(state);
      return;
    }

    // Esc cancels an in-flight network operation (stale result is discarded)
    if (state._loading && key === ESC) {
      _opSeq++;
      state._loading = false;
      render(state);
      return;
    }

    // Ignore main handler while search input is active
    if (state._searchMode) return;

    // Filter mode — every printable key goes to the filter (action keys disabled)
    // so names containing reserved chars (p, s, q, ...) are filterable.
    if (state.view === "list" && state.filterMode) {
      if (key === ESC) {
        state.filterMode = false;
        state.filter = "";
        state.selectedItem = 0;
        state.scrollOffset = 0;
      } else if (key === "\r" || key === "\n") {
        state.filterMode = false; // keep filter, re-enable action keys
      } else if (key === "\x7f") {
        state.filter = state.filter.slice(0, -1);
        if (!state.filter) state.filterMode = false;
        state.selectedItem = 0;
        state.scrollOffset = 0;
      } else if (key === `${ESC}[A`) {
        state.selectedItem = Math.max(0, state.selectedItem - 1);
        state.previewScroll = 0;
        adjustScroll(state);
      } else if (key === `${ESC}[B`) {
        const items = getVisibleItems(state);
        state.selectedItem = Math.min(items.length - 1, state.selectedItem + 1);
        state.previewScroll = 0;
        adjustScroll(state);
      } else if (key.length === 1 && key >= " " && key <= "~") {
        state.filter += key;
        state.selectedItem = 0;
        state.scrollOffset = 0;
      }
      render(state);
      return;
    }

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

    // Projects view — A to show all
    if (state.view === "projects") {
      if (key === "A" || key === "a") {
        state.projectTree = buildProjectTree(state, null);
        state.projectFilter = null;
        state.breadcrumb = ["projects"];
        state.scrollOffset = 0;
      } else if (key === ESC || key === "\x7f" || key === "q") {
        state.view = state.previousView || "list";
        state.previousView = null;
        state.scrollOffset = 0;
        state.breadcrumb = [];
      } else if (key === `${ESC}[A`) {
        state.scrollOffset = Math.max(0, state.scrollOffset - 1);
      } else if (key === `${ESC}[B`) {
        state.scrollOffset++;
      } else if (key === "r") {
        await withLoading(state, async (isStale) => {
          const fresh = await fetchJson(`${baseUrl}/api/${PLURAL}`);
          if (isStale()) return;
          if (fresh) state.plugins = fresh;
          state.projectTree = buildProjectTree(state, state.projectFilter);
        });
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
        state.view = state.previousView || "list";
        state.previousView = null;
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

    // q or Esc to quit from the flat list (main view)
    if ((key === "q" || key === ESC) && state.view === "list" && !state.showBookmarks && !state.detail && !state.isSearch && !state.isBlockedView) {
      cleanup();
      process.exit(0);
    }

    // Escape / q — go back
    if (key === ESC || key === "\x7f" || key === "q") {
      if (state.showBookmarks) {
        state.showBookmarks = false;
        state.view = "list";
      } else if (state.view === "comments" || state.view === "graph") {
        state.view = "detail";
        state.scrollOffset = 0;
      } else if (state.view === "metrics" || state.view === "projects" || state.view === "config" || state.view === "versions" || state.view === "guide") {
        state.view = state.previousView || "list";
        state.previousView = null;
        state.scrollOffset = 0;
      } else if (state.view === "detail") {
        state.view = "list";
        state.detail = null;
        state.comments = null;
      } else if (state.view === "list") {
        // In search/blocked mode — clear and go back to normal list
        state.isSearch = false;
        state.isBlockedView = false;
        state.searchResults = null;
        state.blockedList = null;
        state.selectedItem = 0;
        state.scrollOffset = 0;
        state.filter = "";
        state.marked.clear();
      }
      state.breadcrumb = buildBreadcrumb(state);
      render(state);
      return;
    }

    // Arrow up
    if (key === `${ESC}[A`) {
      if (state.view === "list" || state.showBookmarks) {
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
      if (state.view === "list" || state.showBookmarks) {
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

    // Home / End / PageUp / PageDown
    if ([`${ESC}[H`, `${ESC}[1~`, `${ESC}[F`, `${ESC}[4~`, `${ESC}[5~`, `${ESC}[6~`].includes(key)) {
      const isHome = key === `${ESC}[H` || key === `${ESC}[1~`;
      const isEnd = key === `${ESC}[F` || key === `${ESC}[4~`;
      const isPgUp = key === `${ESC}[5~`;
      const page = (process.stdout.rows || 24) - 7;
      if (state.view === "list" || state.showBookmarks) {
        const items = getVisibleItems(state);
        if (isHome) state.selectedItem = 0;
        else if (isEnd) state.selectedItem = Math.max(0, items.length - 1);
        else if (isPgUp) state.selectedItem = Math.max(0, state.selectedItem - page);
        else state.selectedItem = Math.min(Math.max(0, items.length - 1), state.selectedItem + page);
        state.previewScroll = 0;
        adjustScroll(state);
      } else {
        const maxOffset = Math.max(0, (state._contentLines || 0) - (state._contentVisibleRows || 1));
        if (isHome) state.scrollOffset = 0;
        else if (isEnd) state.scrollOffset = maxOffset;
        else if (isPgUp) state.scrollOffset = Math.max(0, state.scrollOffset - page);
        else state.scrollOffset = Math.min(maxOffset, state.scrollOffset + page);
      }
      render(state);
      return;
    }

    // Enter
    if (key === "\r" || key === "\n") {
      if (state.showBookmarks) {
        const items = state.bookmarks;
        if (items.length > 0) {
          const name = items[state.selectedItem];
          await withLoading(state, async (isStale) => {
            const [detail, comments] = await Promise.all([
              fetchJson(`${baseUrl}/api/${PLURAL}/${name}`, token),
              fetchJson(`${baseUrl}/api/${PLURAL}/${name}/comments`),
            ]);
            if (isStale()) return;
            state.detail = detail;
            state.comments = comments;
            state.view = "detail";
            state.scrollOffset = 0;
            state.showBookmarks = false;
            state.breadcrumb = ["bookmarks", name];
          });
        }
      } else if (state.view === "list") {
        const items = getVisibleItems(state);
        if (items.length > 0) {
          const item = items[state.selectedItem];
          await withLoading(state, async (isStale) => {
            const [detail, comments] = await Promise.all([
              fetchJson(`${baseUrl}/api/${PLURAL}/${item.name}`, token),
              fetchJson(`${baseUrl}/api/${PLURAL}/${item.name}/comments`),
            ]);
            if (isStale()) return;
            state.detail = detail;
            state.comments = comments;
            state.view = "detail";
            state.scrollOffset = 0;
            state.breadcrumb = buildBreadcrumb(state, item.name);
          });
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
          if (state.marked.has(item.name)) state.marked.delete(item.name);
          else state.marked.add(item.name);
          state.selectedItem = Math.min(items.length - 1, state.selectedItem + 1);
          adjustScroll(state);
        }
        render(state);
        return;
      }

      // a — select/deselect all
      if (key === "a") {
        const items = getVisibleItems(state);
        const names = items.map((i) => i.name);
        const allSel = names.every((n) => state.marked.has(n));
        if (allSel) names.forEach((n) => state.marked.delete(n));
        else names.forEach((n) => state.marked.add(n));
        render(state);
        return;
      }

      // p — bulk pull marked plugins
      if (key === "p" && state.marked.size > 0) {
        await executeBulkPull(state, baseUrl, token);
        return;
      }

      // P — quick pull the selected plugin
      if (key === "P") {
        const items = getVisibleItems(state);
        if (items.length > 0) {
          state.marked.add(items[state.selectedItem].name);
          await executeBulkPull(state, baseUrl, token);
        } else {
          render(state);
        }
        return;
      }

      // s — cycle sort
      if (key === "s") {
        const sorts = ["name", "date", "rating", "pulls", "trending"];
        const idx = sorts.indexOf(state.sortBy);
        state.sortBy = sorts[(idx + 1) % sorts.length];
        state.statusMsg = `Sort: ${state.sortBy}`;
        render(state);
        return;
      }

      // A (uppercase) in blocked view — approve selected plugin
      if (key === "A" && state.isBlockedView && state.isAdmin) {
        const items = getVisibleItems(state);
        if (items.length > 0) {
          const item = items[state.selectedItem];
          await withLoading(state, async (isStale) => {
            const r = await fetchJson(`${baseUrl}/api/${PLURAL}/${item.name}/approve`, token, "POST");
            if (isStale()) return;
            if (r) {
              state.statusMsg = `Approved ${item.name}`;
              const blocked = await fetchJson(`${baseUrl}/api/blocked`, token);
              if (isStale()) return;
              state.blockedList = blocked;
              state.blockedCount = (state.blockedList || []).length;
              if (state.selectedItem >= (state.blockedList || []).length) state.selectedItem = Math.max(0, (state.blockedList || []).length - 1);
            } else {
              state.statusMsg = "Approve failed";
            }
          });
        }
        render(state);
        return;
      }

      // f — enter filter mode explicitly (covers names starting with reserved keys)
      if (key === "f") {
        state.filterMode = true;
        render(state);
        return;
      }

      // Reserved action keys (everything else is fuzzy filter input)
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
        state.filterMode = true;
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

      // w — write review
      if (key === "w" && token) {
        const name = state.detail.name;
        cleanup();
        process.stdout.write(`${CLEAR}${BOLD}Rate ${name}${RESET}\n\n`);
        if (stdin.setRawMode) stdin.setRawMode(false);
        const ratingStr = await new Promise((r) => { process.stdout.write("Rating (1-5): "); stdin.once("data", (d) => r(d.toString().trim())); });
        const body = await new Promise((r) => { process.stdout.write("Comment: "); stdin.once("data", (d) => r(d.toString().trim())); });
        if (stdin.setRawMode) stdin.setRawMode(true);
        process.stdout.write(HIDE_CURSOR);
        const rating = parseInt(ratingStr, 10);
        if (rating >= 1 && rating <= 5 && body) {
          const h = { "Content-Type": "application/json" };
          if (token) h["Authorization"] = `Bearer ${token}`;
          await fetch(`${baseUrl}/api/${PLURAL}/${name}/comments`, { method: "POST", headers: h, body: JSON.stringify({ rating, body }) });
          state.comments = await fetchJson(`${baseUrl}/api/${PLURAL}/${name}/comments`);
          state.statusMsg = `Review added (${rating}/5)`;
        }
        render(state);
        return;
      }

      // d — remove (with confirmation)
      if (key === "d") {
        if (state.confirmDelete) {
          state.confirmDelete = false;
          const name = state.detail.name;
          await withLoading(state, async (isStale) => {
            const h = { "Content-Type": "application/json" };
            if (token) h["Authorization"] = `Bearer ${token}`;
            let res;
            try { res = await fetch(`${baseUrl}/api/${PLURAL}/${name}`, { method: "DELETE", headers: h }); }
            catch (err) { if (!isStale()) state.statusMsg = `Remove failed: ${err.message}`; return; }
            if (res.ok) {
              const plugins = await fetchJson(`${baseUrl}/api/${PLURAL}`);
              if (isStale()) return;
              if (plugins) state.plugins = plugins;
              state.view = "list";
              state.detail = null;
              state.selectedItem = 0;
              state.statusMsg = `Removed ${name}`;
            } else {
              const d = await res.json().catch(() => ({}));
              if (isStale()) return;
              state.statusMsg = d.error || "Remove failed — only owners and admins can delete";
            }
            state.breadcrumb = buildBreadcrumb(state);
          });
        } else {
          state.confirmDelete = true;
          state.statusMsg = `\x1b[41m\x1b[37m DELETE ${state.detail.name}? Press d to confirm, any other key to cancel \x1b[0m`;
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

      // f — toggle bookmark
      if (key === "f") {
        const k = state.detail.name;
        const idx = state.bookmarks.indexOf(k);
        if (idx >= 0) { state.bookmarks.splice(idx, 1); state.statusMsg = `Unbookmarked ${k}`; }
        else { state.bookmarks.push(k); state.statusMsg = `Bookmarked ${k}`; }
        saveBookmarks(state.bookmarks);
        render(state);
        return;
      }

      // y — copy pull command to clipboard
      if (key === "y") {
        const cmd = `ihub pull ${state.detail.name}`;
        try { execSync(`echo ${JSON.stringify(cmd)} | pbcopy 2>/dev/null || echo ${JSON.stringify(cmd)} | xclip -sel clip 2>/dev/null || echo ${JSON.stringify(cmd)} | xsel --clipboard 2>/dev/null`, { stdio: "ignore" }); state.statusMsg = `Copied: ${cmd}`; }
        catch { state.statusMsg = cmd; }
        render(state);
        return;
      }

      // g — component containment graph
      if (key === "g") {
        state.view = "graph";
        state.scrollOffset = 0;
        state.breadcrumb = buildBreadcrumb(state, state.detail.name, "components");
        render(state);
        return;
      }

      // v — version history
      if (key === "v") {
        await withLoading(state, async (isStale) => {
          const versions = await fetchJson(`${baseUrl}/api/${PLURAL}/${state.detail.name}/versions`);
          if (isStale()) return;
          state.versionList = versions;
          state.previousView = state.view;
          state.view = "versions";
          state.scrollOffset = 0;
          state.breadcrumb = buildBreadcrumb(state, state.detail.name, "versions");
        });
        render(state);
        return;
      }

      // > — navigate to a related plugin (by name)
      if (key === ">") {
        const meta = state.detail.meta || {};
        const related = meta.related || state.detail.related;
        if (Array.isArray(related) && related.length > 0) {
          const targetName = related[0];
          await withLoading(state, async (isStale) => {
            const entry = await fetchJson(`${baseUrl}/api/${PLURAL}/${targetName}`, token);
            if (isStale()) return;
            if (entry && entry.name) {
              state.detail = entry;
              const comments = await fetchJson(`${baseUrl}/api/${PLURAL}/${entry.name}/comments`);
              if (isStale()) return;
              state.comments = comments;
              state.scrollOffset = 0;
              state.breadcrumb = buildBreadcrumb(state, entry.name);
              state.statusMsg = `Navigated to ${entry.name}`;
            } else {
              state.statusMsg = `Related plugin "${targetName}" not found`;
            }
          });
          render(state);
          return;
        } else {
          state.statusMsg = "No related plugins";
          render(state);
          return;
        }
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

    // --- Global shortcuts (from the list) ---
    if (state.view === "list") {
      // m — metrics
      if (key === "m" && state.isAdmin) {
        await withLoading(state, async (isStale) => {
          const metrics = await fetchText(`${baseUrl}/api/metrics`, token);
          if (isStale()) return;
          state.metrics = metrics;
          state.previousView = state.view;
          state.view = "metrics";
          state.scrollOffset = 0;
          state.breadcrumb = ["metrics"];
        });
        render(state);
        return;
      }
      // t — audit
      if (key === "t" && state.isAdmin) {
        state.auditPage = 1;
        await loadAuditPage(state, baseUrl, token);
        state.previousView = state.view;
        state.view = "audit";
        state.scrollOffset = 0;
        state.breadcrumb = ["audit"];
        render(state);
        return;
      }
      // j — projects
      if (key === "j") {
        let filterProject = null;
        const items = getVisibleItems(state);
        if (items.length > 0 && state.selectedItem < items.length) {
          filterProject = items[state.selectedItem].meta?.project || items[state.selectedItem].project;
        }
        state.projectTree = buildProjectTree(state, filterProject);
        state.projectFilter = filterProject;
        state.previousView = state.view;
        state.view = "projects";
        state.scrollOffset = 0;
        state.breadcrumb = filterProject ? ["projects", filterProject] : ["projects"];
        render(state);
        return;
      }
      // i — config
      if (key === "i" && state.isAdmin) {
        await withLoading(state, async (isStale) => {
          const cfg = await fetchJson(`${baseUrl}/api/config`, token);
          if (isStale()) return;
          state.serverConfig = cfg;
          state.previousView = state.view;
          state.view = "config";
          state.scrollOffset = 0;
          state.breadcrumb = ["config"];
        });
        render(state);
        return;
      }
      // B — blocked list
      if (key === "B" && state.isAdmin) {
        await withLoading(state, async (isStale) => {
          const blocked = await fetchJson(`${baseUrl}/api/blocked`, token);
          if (isStale()) return;
          state.blockedList = blocked;
          state.view = "list";
          state.isBlockedView = true;
          state.selectedItem = 0;
          state.scrollOffset = 0;
          state.breadcrumb = ["blocked"];
        });
        render(state);
        return;
      }
      // G — plugin guide
      if (key === "G") {
        state.previousView = state.view;
        state.view = "guide";
        state.scrollOffset = 0;
        state.breadcrumb = ["guide"];
        render(state);
        return;
      }
      // F — show bookmarks
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
      await withLoading(state, async (isStale) => {
        const fresh = await fetchJson(`${baseUrl}/api/${PLURAL}`);
        if (isStale()) return;
        if (fresh) state.plugins = fresh;
        if (state.view === "detail" && state.detail) {
          const name = state.detail.name;
          const [detail, comments] = await Promise.all([
            fetchJson(`${baseUrl}/api/${PLURAL}/${name}`),
            fetchJson(`${baseUrl}/api/${PLURAL}/${name}/comments`),
          ]);
          if (isStale()) return;
          state.detail = detail;
          state.comments = comments;
        }
        if (state.view === "metrics") {
          const metrics = await fetchText(`${baseUrl}/api/metrics`, token);
          if (isStale()) return;
          state.metrics = metrics;
        }
      });
      if (state.view === "audit") await loadAuditPage(state, baseUrl, token);
      render(state);
      return;
    }

    // / — search
    if (key === "/" && state.view === "list") {
      // Inline search prompt — stays in raw mode so Esc/q can cancel
      state._searchInput = "";
      state._searchMode = true;
      process.stdout.write(`${CLEAR}${BOLD}Search: ${RESET}${SHOW_CURSOR}`);
      const query = await new Promise((resolve) => {
        const onSearchKey = (chunk) => {
          for (let ci = 0; ci < chunk.length; ci++) {
            const k = chunk[ci];
            if (k === ESC) {
              stdin.removeListener("data", onSearchKey);
              resolve("");
              return;
            }
            if (k === "q" && !state._searchInput) {
              stdin.removeListener("data", onSearchKey);
              resolve("");
              return;
            }
            if (k === "\r" || k === "\n") {
              stdin.removeListener("data", onSearchKey);
              resolve(state._searchInput.trim());
              return;
            }
            if (k === "\x7f") {
              state._searchInput = state._searchInput.slice(0, -1);
              process.stdout.write(`\r${BOLD}Search: ${RESET}${state._searchInput} \b${SHOW_CURSOR}`);
              continue;
            }
            if (k === "\x03") {
              stdin.removeListener("data", onSearchKey);
              cleanup();
              process.exit(0);
            }
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
        await withLoading(state, async (isStale) => {
          const results = await fetchJson(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
          if (isStale()) return;
          state.searchResults = results;
          state.view = "list";
          state.selectedItem = 0;
          state.scrollOffset = 0;
          state.isSearch = true;
          state.searchQuery = query;
          state.filter = "";
          state.breadcrumb = [`search: ${query}`];
        });
      }
      process.stdout.write(HIDE_CURSOR);
      render(state);
      return;
    }
  });
}

// --- Helpers ---

// Async operation wrapper: animates the header spinner while the op runs and
// guards against stale results (a newer op or Esc-cancel supersedes this one).
let _opSeq = 0;
async function withLoading(state, fn) {
  const seq = ++_opSeq;
  state._loading = true;
  const timer = setInterval(() => { if (state._loading) render(state); }, 80);
  try {
    return await fn(() => seq !== _opSeq);
  } finally {
    clearInterval(timer);
    if (seq === _opSeq) {
      state._loading = false;
      render(state);
    }
  }
}

function buildProjectTree(state, filterProject) {
  const projects = {};
  const unassigned = [];
  for (const e of (state.plugins || [])) {
    const proj = e.meta?.project || e.project || "";
    if (proj) {
      if (filterProject && proj !== filterProject) continue;
      if (!projects[proj]) projects[proj] = [];
      projects[proj].push(e);
    } else if (!filterProject) {
      unassigned.push(e);
    }
  }
  return { projects, unassigned };
}

function buildBreadcrumb(state, name, sub) {
  const parts = [];
  if (state.isSearch) parts.push(`search: ${state.searchQuery}`);
  else if (state.isBlockedView) parts.push("blocked");
  else parts.push("plugins");
  if (name) parts.push(name);
  if (sub) parts.push(sub);
  return parts;
}

function getVisibleItems(state) {
  let items;
  if (state.isBlockedView && state.blockedList) items = state.blockedList;
  else if (state.isSearch && state.searchResults) items = state.searchResults;
  else items = state.plugins || [];

  // Fuzzy filter
  if (state.filter) {
    const f = state.filter.toLowerCase();
    items = items.filter((i) => {
      const kw = i.meta?.keywords || i.tags || [];
      const hay = [i.name, i.description, ...(Array.isArray(kw) ? kw : [])].join(" ").toLowerCase();
      return hay.includes(f);
    });
  }

  // Sort
  items = [...items];
  if (state.sortBy === "date") items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  else if (state.sortBy === "name") items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  else if (state.sortBy === "rating") items.sort((a, b) => ((b.meta?.rating || b.avg_rating || 0) - (a.meta?.rating || a.avg_rating || 0)));
  else if (state.sortBy === "pulls") items.sort((a, b) => ((b.pulls || 0) - (a.pulls || 0)));
  else if (state.sortBy === "trending") items.sort((a, b) => {
    const sa = (b.pulls || 0) * 2 + (b.meta?.rating || b.avg_rating || 0) * 10 + (b.comment_count || 0) * 3;
    const sb = (a.pulls || 0) * 2 + (a.meta?.rating || a.avg_rating || 0) * 10 + (a.comment_count || 0) * 3;
    return sa - sb;
  });

  return items;
}

function ratingStars(avg) {
  if (!avg) return "";
  const full = Math.round(avg);
  const color = avg >= 4 ? GREEN : avg >= 3 ? YELLOW : RED;
  return `${color}${"★".repeat(full)}${"☆".repeat(5 - full)}${RESET}`;
}

// Count components across a plugin's meta.components map
function componentCount(entry) {
  const comps = entry?.meta?.components || {};
  return COMPONENT_KINDS.reduce((s, k) => s + (Array.isArray(comps[k.key]) ? comps[k.key].length : 0), 0);
}

// A compact colored badge string of component-kind counts, e.g. "3▶ 1⌘"
function componentBadges(entry) {
  const comps = entry?.meta?.components || {};
  return COMPONENT_KINDS
    .filter((k) => Array.isArray(comps[k.key]) && comps[k.key].length)
    .map((k) => `${k.color}${comps[k.key].length}${k.icon}${RESET}`)
    .join(" ");
}

const _installedCache = new Map();
let _installedCacheTime = 0;

// A plugin is installed if its directory exists locally or in the Claude cache
function isInstalled(name) {
  if (Date.now() - _installedCacheTime > 5000) {
    _installedCache.clear();
    _installedCacheTime = Date.now();
  }
  if (_installedCache.has(name)) return _installedCache.get(name);
  const paths = [
    `plugins/${name}`,
    join(homedir(), ".claude", "plugins", name),
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

  // Minimum size gate
  if (cols < 60 || rows < 15) {
    process.stdout.write(CLEAR + `\n  ${BOLD}Terminal too small${RESET}\n  ihub needs at least 60x15 (current: ${cols}x${rows}).\n  ${DIM}Resize to continue.${RESET}\n`);
    return;
  }

  const contentRows = rows - 4; // header + breadcrumb + footer line + footer text

  let output = CLEAR;

  // Header — box-drawing top border
  output += `${DIM}┌${"─".repeat(cols - 2)}┐${RESET}\n`;
  let hdr = ` ${BG_CYAN}${BLACK}${BOLD} ihub ${RESET}`;
  hdr += `  ${DIM}Harness engineering platform • Publish once, install everywhere${RESET}`;
  if (state.isAdmin) hdr += `  ${BG_GREEN}${BLACK} ADMIN ${RESET}`;
  if (state.marked.size > 0) hdr += `  ${BG_YELLOW}${BLACK} ${state.marked.size} selected ${RESET}`;
  if (state.blockedCount > 0 && state.isAdmin) hdr += `  ${BG_RED}${WHITE} ${state.blockedCount} blocked ${RESET}`;
  if (state.newCount > 0) hdr += `  ${YELLOW}• ${state.newCount} new${RESET}`;
  if (state._loading) { _spinnerIdx = (_spinnerIdx + 1) % SPINNER_FRAMES.length; hdr += `  ${CYAN}${SPINNER_FRAMES[_spinnerIdx]}${RESET}`; }
  if (_netError) hdr += `  ${RED}${BOLD}● offline${RESET}`;
  if (state.statusMsg) {
    if (state._statusFor !== state.statusMsg) { state._statusFor = state.statusMsg; state._statusTime = Date.now(); }
    if (Date.now() - state._statusTime < 4000) hdr += `  ${GREEN}✓ ${state.statusMsg}${RESET}`;
    else { state.statusMsg = null; state._statusFor = null; }
  }
  output += hdr + "\n";

  // Breadcrumb
  if (state.breadcrumb.length > 0) {
    output += `${DIM}  ${state.breadcrumb.map((b, i) => i < state.breadcrumb.length - 1 ? `${b} ›` : `${WHITE}${b}${RESET}${DIM}`).join(" ")}${RESET}\n`;
  } else {
    output += "\n";
  }

  // Help overlay
  if (state.showHelp) {
    state._scrollInfo = null;
    output += renderHelp(state, contentRows, cols);
  } else if (state.showBookmarks) {
    output += renderBookmarks(state, contentRows, cols);
  } else if (state.view === "list") {
    // Trigger async preview body fetch for split-pane
    if (cols >= 120) {
      const items = getVisibleItems(state);
      if (items.length > 0 && state.selectedItem < items.length) {
        const sel = items[state.selectedItem];
        const cacheKey = sel.name;
        if (state._previewKey !== cacheKey) {
          state._previewKey = cacheKey;
          state._previewBody = state._previewCache.get(cacheKey) || "";
          if (!state._previewCache.has(cacheKey)) {
            const url = `${state.baseUrl}/api/${PLURAL}/${sel.name}`;
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
  else if (state.view === "pulling") output += renderPulling(state, contentRows);
  else if (state.view === "graph") output += renderGraph(state, contentRows, cols);
  else if (state.view === "versions") output += renderVersions(state, contentRows);

  // Pad content to push footer to the bottom of the terminal
  const usedLines = output.split("\n").length - 1;
  const footerLines = 2;
  const padLines = Math.max(0, rows - usedLines - footerLines);
  output += "\n".repeat(padLines);

  // Footer — pinned to bottom with box-drawing
  output += `${DIM}└${"─".repeat(cols - 2)}┘${RESET}\n`;
  let footer = getFooter(state);
  if (state._scrollInfo) footer += `  ${DIM}${state._scrollInfo}${RESET}`;
  output += footer;

  process.stdout.write(output);
}

function fmtKey(key) { return `${WHITE}[${RESET}${BOLD}${key}${RESET}${WHITE}]${RESET}`; }
function fmtGroup(pairs) { return pairs.map(([k, l]) => `${fmtKey(k)}${DIM}${l}${RESET}`).join(" "); }

function getFooter(state) {
  if (state.showHelp) return ` ${DIM}press any key to close help${RESET}`;
  if (state.showBookmarks) return ` ${fmtGroup([["↑↓", "nav"], ["⏎", "open"], ["esc", "close"]])}`;
  const v = state.view;

  if (v === "list") {
    let f = ` ${fmtGroup([["↑↓", "nav"], ["⏎", "view"], ["spc", "sel"]])}  ${fmtGroup([["P", "pull"], ["s", "sort"], ["/", "find"], ["j", "proj"], ["G", "guide"]])}`;
    if (state.marked.size > 0) f += `  ${fmtKey("p")}${DIM}bulk pull${RESET}`;
    if (state.isBlockedView && state.isAdmin) f += `  ${fmtKey("A")}${DIM}approve${RESET}`;
    if (state.isAdmin) f += `  ${fmtGroup([["m", "metrics"], ["t", "audit"]])}`;
    f += `  ${fmtGroup([["?", "help"], ["q", "quit"]])}`;
    if (state.filterMode) f += `  ${YELLOW}filter: ${state.filter}▌${RESET} ${DIM}[esc]clear [⏎]done${RESET}`;
    else if (state.filter) f += `  ${YELLOW}filter: ${state.filter}${RESET}`;
    return f;
  }
  if (v === "detail") return ` ${fmtGroup([["↑↓", "scroll"], ["c", "comments"], ["w", "review"], ["f", "fav"], ["g", "components"], ["v", "ver"], [">", "related"], ["d", "del"], ["esc", "back"]])}`;
  if (v === "comments") return ` ${fmtGroup([["↑↓", "scroll"], ["esc", "back"]])}`;
  if (v === "metrics") return ` ${fmtGroup([["↑↓", "scroll"], ["r", "refresh"], ["esc", "back"]])}`;
  if (v === "audit") return ` ${fmtGroup([["↑↓", "scroll"], ["n", "next"], ["b", "prev"], ["r", "refresh"], ["esc", "back"]])}`;
  if (v === "projects") return ` ${fmtGroup([["↑↓", "scroll"], ...(state.projectFilter ? [["A", "all"]] : []), ["r", "refresh"], ["esc", "back"]])}`;
  if (v === "config") return ` ${fmtGroup([["esc", "back"]])}`;
  if (v === "pulling") return ` ${DIM}press any key to continue${RESET}`;
  if (v === "graph") return ` ${fmtGroup([["↑↓", "scroll"], ["esc", "back"]])}`;
  if (v === "versions") return ` ${fmtGroup([["↑↓", "scroll"], ["esc", "back"]])}`;
  if (v === "guide") return ` ${fmtGroup([["↑↓", "scroll"], ["esc", "back"]])}`;
  return ` ${fmtGroup([["?", "help"]])}`;
}

// --- View renderers ---

function renderList(state, maxRows, cols) {
  const items = getVisibleItems(state);
  const showPreview = cols >= 120;

  const title = state.isBlockedView ? "Blocked plugins" : (state.isSearch ? "Search results" : "Plugins");
  let out = `  ${PLUGIN_COLOR}${BOLD}${PLUGIN_ICON} ${title}${RESET} ${DIM}(${items.length})${RESET}`;
  if (state.filter) out += `  ${YELLOW}filter: ${state.filter}${RESET}`;
  out += `  ${DIM}sort: ${state.sortBy}${RESET}\n\n`;

  if (items.length === 0) return out + `  ${DIM}No plugins.${RESET}\n`;

  const visible = Math.min(items.length, maxRows - 5);

  // Calculate dynamic list width based on actual content
  let listWidth, previewWidth;
  if (showPreview) {
    let maxItemWidth = 0;
    for (let i = state.scrollOffset; i < Math.min(items.length, state.scrollOffset + visible); i++) {
      const item = items[i];
      const prefix = 10;
      const blocked = item.status === "blocked" ? 4 : 0;
      const nameLen = (item.name || "").length;
      const descLen = (item.description || "").length;
      const w = prefix + blocked + nameLen + 1 + descLen;
      if (w > maxItemWidth) maxItemWidth = w;
    }
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
    const body = state._previewBody || "";
    previewLines = wrapAndFormatPreview(sel, body, previewWidth - 2);
  }

  // Render list rows, optionally side-by-side with preview
  const listRows = [];
  for (let i = state.scrollOffset; i < Math.min(items.length, state.scrollOffset + visible); i++) {
    const item = items[i];
    const sel = i === state.selectedItem;
    const isMarked = state.marked.has(item.name);
    const checkbox = isMarked ? `${GREEN}◉${RESET}` : `${DIM}○${RESET}`;
    const installed = isInstalled(item.name) ? `${GREEN}✓${RESET}` : " ";
    const bmk = state.bookmarks.includes(item.name) ? `${YELLOW}★${RESET}` : " ";
    const blocked = item.status === "blocked" ? `${RED}[B]${RESET} ` : "";
    const nComp = componentCount(item);
    const compTag = nComp ? ` ${DIM}${nComp}c${RESET}` : "";

    let ratingLabel = "";
    if (item.meta?.rating || item.rating) {
      ratingLabel = " " + ratingStars(item.meta?.rating || item.rating);
    }

    if (sel) {
      listRows.push(`  ${INVERSE} ▸ ${RESET} ${checkbox} ${installed}${bmk} ${blocked}${PLUGIN_COLOR}${PLUGIN_ICON}${RESET} ${BOLD}${item.name}${RESET}${compTag}${ratingLabel}`);
    } else {
      const desc = (item.description || "").slice(0, listWidth - 22);
      listRows.push(`    ${checkbox} ${installed}${bmk} ${blocked}${PLUGIN_COLOR}${PLUGIN_ICON}${RESET} ${item.name} ${DIM}${desc}${RESET}`);
    }
  }

  if (showPreview) {
    const scroll = state.previewScroll || 0;
    const headerLines = out.split("\n").length - 1;
    const totalRows = Math.max(listRows.length, maxRows - headerLines);
    const maxScroll = Math.max(0, previewLines.length - totalRows);
    if (state.previewScroll > maxScroll) state.previewScroll = maxScroll;
    const clampedScroll = state.previewScroll;
    state._previewTotalLines = previewLines.length;
    state._previewVisibleRows = totalRows;
    const sep = previewLines.length > 0 ? `${PLUGIN_COLOR}│${RESET}` : `${DIM}│${RESET}`;
    if (previewLines.length > 0) {
      const selItem = items[state.selectedItem];
      const previewTitle = selItem ? `${DIM}── ${PLUGIN_COLOR}${selItem.name}${RESET}${DIM} ${"─".repeat(Math.max(0, previewWidth - (selItem.name || "").length - 4))}${RESET}` : "";
      out += `${padVisible("", listWidth)} ${sep} ${previewTitle}\n`;
    }
    for (let r = 0; r < totalRows - (previewLines.length > 0 ? 1 : 0); r++) {
      const left = padVisible(listRows[r] || "", listWidth);
      const pIdx = r + clampedScroll;
      const right = pIdx < previewLines.length ? previewLines[pIdx] : "";
      out += `${left} ${sep} ${right}\n`;
    }
  } else {
    for (const row of listRows) out += row + "\n";

    if (items.length > 0 && state.selectedItem < items.length) {
      const sel = items[state.selectedItem];
      out += `\n  ${DIM}${"─".repeat(cols - 4)}${RESET}\n`;
      const desc = sel.description || "";
      out += `  ${BOLD}${sel.name}${RESET} ${GRAY}@${sel.version || "?"}${RESET}`;
      const badges = componentBadges(sel);
      if (badges) out += `  ${badges}`;
      out += "\n";
      out += `  ${DIM}${desc.slice(0, cols - 4)}${RESET}\n`;
      const kw = sel.meta?.keywords || sel.tags || [];
      if (Array.isArray(kw) && kw.length) out += `  ${kw.slice(0, 8).map((t) => `${CYAN}#${t}${RESET}`).join(" ")}\n`;
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
  lines.push(`${BOLD}${item.name}${RESET} ${GRAY}@${item.version || "?"}${RESET}`);
  if (item.description) lines.push(`${DIM}${item.description}${RESET}`);
  const badges = componentBadges(item);
  if (badges) lines.push(badges);
  const kw = item.meta?.keywords || item.tags || [];
  if (Array.isArray(kw) && kw.length) lines.push(kw.slice(0, 6).map((t) => `${CYAN}#${t}${RESET}`).join(" "));
  lines.push(`${DIM}${"─".repeat(width)}${RESET}`);

  if (!body) {
    lines.push(`${DIM}Loading preview...${RESET}`);
    return lines;
  }

  for (const raw of body.split("\n")) {
    let formatted;
    if (raw.startsWith("# ")) formatted = `${BOLD}${MAGENTA}${raw.slice(2)}${RESET}`;
    else if (raw.startsWith("## ")) formatted = `${BOLD}${YELLOW}${raw.slice(3)}${RESET}`;
    else if (raw.startsWith("### ")) formatted = `${BOLD}${CYAN}${raw.slice(4)}${RESET}`;
    else if (raw.startsWith("- ")) formatted = `${CYAN}•${RESET} ${raw.slice(2)}`;
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
  const meta = entry.meta || {};
  const lines = [];

  const isBm = state.bookmarks.includes(entry.name);
  let title = `  ${PLUGIN_COLOR}${BOLD}${PLUGIN_ICON} ${entry.name}${RESET} ${GRAY}@${entry.version || meta.version || "?"}${RESET}`;
  const displayName = meta.displayName || entry.displayName;
  if (displayName) title += ` ${DIM}(${displayName})${RESET}`;
  if (isBm) title += ` ${YELLOW}★${RESET}`;
  if (entry.status === "blocked") title += ` ${BG_RED}${WHITE} BLOCKED ${RESET}`;
  if (state.comments?.rating?.count > 0) {
    const r = state.comments.rating;
    title += `  ${ratingStars(r.average)} ${r.average}/5 ${DIM}(${r.count})${RESET}`;
  }
  lines.push(title);
  lines.push(`  ${DIM}${entry.description || meta.description || ""}${RESET}`);
  lines.push("");

  // Manifest fields
  const author = meta.author || entry.author;
  const authorStr = author ? (typeof author === "object" ? [author.name, author.email, author.url].filter(Boolean).join(" · ") : author) : null;
  const repo = typeof meta.repository === "object" ? meta.repository?.url : meta.repository;
  const manifest = [
    ["Owner", entry.owner],
    ["Author", authorStr],
    ["Project", meta.project || entry.project],
    ["License", meta.license],
    ["Homepage", meta.homepage],
    ["Repository", repo],
  ].filter(([, v]) => v);
  for (const [k, v] of manifest) lines.push(`  ${CYAN}${k}:${RESET} ${v}`);
  const keywords = meta.keywords || entry.tags || meta.tags || [];
  if (Array.isArray(keywords) && keywords.length) lines.push(`  ${CYAN}Keywords:${RESET} ${keywords.map((t) => `${GREEN}#${t}${RESET}`).join(" ")}`);

  // Component tree (from meta.components)
  const comps = meta.components || {};
  const present = COMPONENT_KINDS.filter((k) => Array.isArray(comps[k.key]) && comps[k.key].length);
  const totalComps = present.reduce((s, k) => s + comps[k.key].length, 0);
  lines.push("");
  if (present.length) {
    lines.push(`  ${BOLD}Components${RESET} ${DIM}(${totalComps})${RESET}`);
    for (const k of present) {
      lines.push(`  ${k.color}${k.icon} ${k.label}${RESET} ${DIM}(${comps[k.key].length})${RESET}`);
      for (const n of comps[k.key]) lines.push(`    ${DIM}└─${RESET} ${k.color}${n}${RESET}`);
    }
  } else {
    lines.push(`  ${DIM}No components declared.${RESET}`);
  }

  if (entry.attachments?.length) {
    lines.push(""); lines.push(`  ${YELLOW}${BOLD}Files (${entry.attachments.length})${RESET}`);
    for (const a of entry.attachments.slice(0, 8)) lines.push(`    ${DIM}├─${RESET} ${a.filepath} ${GRAY}(${a.size}B)${RESET}`);
    if (entry.attachments.length > 8) lines.push(`    ${DIM}└─ ...${entry.attachments.length - 8} more${RESET}`);
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
      else if (line.startsWith("- ")) lines.push(`  ${CYAN}•${RESET} ${line.slice(2)}`);
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

// Component containment tree: plugin → component kinds → component names
function renderGraph(state, maxRows, cols) {
  const e = state.detail;
  if (!e) return `  ${DIM}No data.${RESET}\n`;
  const comps = e.meta?.components || {};
  const lines = [];
  lines.push(`  ${BOLD}${CYAN}Components: ${e.name}${RESET}`);
  lines.push("");
  lines.push(`  ${PLUGIN_COLOR}${PLUGIN_ICON} ${BOLD}${e.name}${RESET}`);
  const present = COMPONENT_KINDS.filter((k) => Array.isArray(comps[k.key]) && comps[k.key].length);
  present.forEach((k, ki) => {
    const last = ki === present.length - 1;
    const branch = last ? "└──" : "├──";
    const cont = last ? "    " : "│   ";
    lines.push(`  ${DIM}${branch}${RESET} ${k.color}${k.label}${RESET} ${DIM}(${comps[k.key].length})${RESET}`);
    comps[k.key].forEach((n) => lines.push(`  ${DIM}${cont}└──${RESET} ${k.color}${n}${RESET}`));
  });
  if (present.length === 0) lines.push(`  ${DIM}(no components)${RESET}`);
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderVersions(state, maxRows) {
  const lines = [];
  lines.push(`  ${BOLD}${CYAN}Version History: ${state.detail?.name}${RESET}`);
  lines.push("");
  if (!state.versionList?.length) { lines.push(`  ${DIM}No versions.${RESET}`); return scrollView(lines, state.scrollOffset, maxRows, state); }
  for (const v of state.versionList) lines.push(`  ${GREEN}●${RESET} ${BOLD}${v.version}${RESET}  ${DIM}${v.created_at}${RESET}`);
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

// Concise plugin-model reference: the unit + the 5 component kinds.
function renderGuide(state, maxRows, cols) {
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} ihub Plugin Guide ${RESET}`);
  lines.push("");
  lines.push(`  ${PLUGIN_COLOR}${BOLD}${PLUGIN_ICON} Plugin${RESET} ${DIM}— the one unit ihub publishes, discovers, and installs.${RESET}`);
  lines.push("");
  lines.push(`  A plugin is a Claude Code plugin: a directory with a manifest`);
  lines.push(`  (${CYAN}.claude-plugin/plugin.json${RESET}) plus any of five component kinds. ihub`);
  lines.push(`  packs the whole directory into one registry entry and recreates it`);
  lines.push(`  on pull. Install drops the plugin dir into the Claude plugin cache`);
  lines.push(`  or a local marketplace — one unit, no per-type juggling.`);
  lines.push("");
  lines.push(`  ${BOLD}Manifest fields${RESET}`);
  lines.push(`  ${DIM}Required:${RESET} name (kebab-case), description`);
  lines.push(`  ${DIM}Optional:${RESET} displayName, version, author, homepage, repository,`);
  lines.push(`           license, keywords, project (groups plugins in a marketplace)`);
  lines.push("");
  lines.push(`  ${DIM}${"─".repeat(Math.min(cols - 4, 70))}${RESET}`);
  lines.push("");
  lines.push(`  ${BOLD}Component kinds${RESET} ${DIM}(everything a plugin can bundle)${RESET}`);
  lines.push("");

  const kinds = [
    { k: COMPONENT_KINDS[0], one: "How to do X — a reusable procedure the agent can invoke.",
      path: "skills/<name>/SKILL.md", ex: "git-commit-msg, test-generator, lint-check" },
    { k: COMPONENT_KINDS[1], one: "A slash command — a named prompt entry point.",
      path: "commands/<name>.md", ex: "/commit, /review, /changelog" },
    { k: COMPONENT_KINDS[2], one: "A subagent — an actor with its own instructions and tools.",
      path: "agents/<name>.md", ex: "code-reviewer, doc-generator" },
    { k: COMPONENT_KINDS[3], one: "MCP servers the agent can reach. Secrets stay ${VAR} placeholders.",
      path: ".mcp.json", ex: "github, context7, playwright" },
    { k: COMPONENT_KINDS[4], one: "Lifecycle hooks (event + shell command). Install is gated.",
      path: "hooks/hooks.json", ex: "PreToolUse, PostToolUse, Stop" },
  ];
  for (const { k, one, path, ex } of kinds) {
    lines.push(`  ${k.color}${k.icon} ${BOLD}${k.label}${RESET}`);
    lines.push(`    ${one}`);
    lines.push(`    ${DIM}Path: ${path}${RESET}`);
    lines.push(`    ${DIM}Example: ${ex}${RESET}`);
    lines.push("");
  }

  lines.push(`  ${DIM}${"─".repeat(Math.min(cols - 4, 70))}${RESET}`);
  lines.push("");
  lines.push(`  ${BOLD}In this browser${RESET}`);
  lines.push(`  ${CYAN}⏎${RESET} open a plugin   ${CYAN}g${RESET} component tree   ${CYAN}j${RESET} group by project`);
  lines.push(`  ${CYAN}P${RESET} pull one        ${CYAN}space${RESET}+${CYAN}p${RESET} bulk pull   ${CYAN}v${RESET} version history`);
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderHelp(state, maxRows, cols) {
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Keyboard Shortcuts ${RESET}`);
  lines.push("");
  lines.push(`  ${BOLD}Navigation${RESET}`);
  lines.push(`  ${CYAN}↑↓${RESET}       navigate       ${CYAN}⏎${RESET}        open plugin`);
  lines.push(`  ${CYAN}esc/q${RESET}    go back         ${CYAN}r${RESET}        refresh`);
  lines.push(`  ${CYAN}/${RESET}        search          ${CYAN}type${RESET}     fuzzy filter (${CYAN}f${RESET} enters, esc clears, ⏎ keeps)`);
  lines.push(`  ${CYAN}pgup/dn${RESET}  page scroll     ${CYAN}home/end${RESET} jump top/bottom`);
  lines.push("");
  lines.push(`  ${BOLD}Selection & Pull${RESET}`);
  lines.push(`  ${CYAN}space${RESET}    toggle select   ${CYAN}a${RESET}        select/deselect all`);
  lines.push(`  ${CYAN}p${RESET}        pull selected   ${CYAN}P${RESET}        quick pull one`);
  lines.push(`  ${CYAN}s${RESET}        cycle sort (name/date/rating/pulls/trending)`);
  lines.push(`  ${CYAN}{ }${RESET}      scroll preview pane (wide terminals)`);
  lines.push("");
  lines.push(`  ${BOLD}Detail View${RESET}`);
  lines.push(`  ${CYAN}c${RESET}        comments        ${CYAN}w${RESET}        write review`);
  lines.push(`  ${CYAN}f${RESET}        bookmark        ${CYAN}y${RESET}        copy pull command`);
  lines.push(`  ${CYAN}g${RESET}        component tree  ${CYAN}v${RESET}        version history`);
  lines.push(`  ${CYAN}>${RESET}        related plugin  ${CYAN}d${RESET}        remove plugin`);
  lines.push("");
  lines.push(`  ${BOLD}Global${RESET}`);
  lines.push(`  ${CYAN}j${RESET}        projects view   ${CYAN}G${RESET}        plugin guide`);
  lines.push(`  ${CYAN}F${RESET}        bookmarks`);
  lines.push(`  ${CYAN}?${RESET}        this help       ${CYAN}Ctrl+C${RESET}   quit`);
  if (state.isAdmin) {
    lines.push("");
    lines.push(`  ${BOLD}Admin${RESET}`);
    lines.push(`  ${CYAN}m${RESET}        metrics         ${CYAN}t${RESET}        audit trail`);
    lines.push(`  ${CYAN}i${RESET}        server config   ${CYAN}B${RESET}        blocked plugins`);
  }
  return scrollView(lines, 0, maxRows, null);
}

function renderBookmarks(state, maxRows) {
  const bm = state.bookmarks;
  const lines = [];
  lines.push(`  ${BOLD}${YELLOW}★ Bookmarks${RESET}  ${DIM}(${bm.length})${RESET}`);
  lines.push("");
  if (bm.length === 0) { lines.push(`  ${DIM}No bookmarks. Press f in detail view to add.${RESET}`); return lines.join("\n") + "\n"; }
  for (let i = 0; i < bm.length; i++) {
    const sel = i === state.selectedItem;
    lines.push(sel ? `  ${INVERSE} > ${RESET} ${YELLOW}★${RESET} ${bm[i]}` : `      ${YELLOW}★${RESET} ${DIM}${bm[i]}${RESET}`);
  }
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderProjects(state, maxRows, cols) {
  const tree = state.projectTree;
  if (!tree) return `  ${DIM}No data.${RESET}\n`;
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Projects ${RESET}`); lines.push("");
  for (const [name, plugins] of Object.entries(tree.projects)) {
    lines.push(`  ${BOLD}${CYAN}${name}${RESET} ${DIM}(${plugins.length})${RESET}`);
    for (const e of plugins) {
      const badges = componentBadges(e);
      lines.push(`  ${DIM}├──${RESET} ${PLUGIN_COLOR}${PLUGIN_ICON}${RESET} ${e.name}${GRAY}@${e.version || "?"}${RESET}${badges ? `  ${badges}` : ""}`);
    }
    lines.push("");
  }
  if (tree.unassigned.length) {
    lines.push(`  ${DIM}${BOLD}(unassigned)${RESET}`);
    for (const e of tree.unassigned) lines.push(`  ${DIM}├──${RESET} ${PLUGIN_COLOR}${PLUGIN_ICON}${RESET} ${e.name}`);
  }
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
  for (const [n, d, e] of features) lines.push(`  ${e ? `${GREEN}✓` : `${RED}✗`}${RESET}  ${BOLD}${n.padEnd(12)}${RESET} ${d}`);
  return scrollView(lines, state.scrollOffset, maxRows, state);
}

function renderPulling(state, maxRows) {
  const lines = [];
  lines.push(`  ${BG_CYAN}${BLACK}${BOLD} Pulling plugins ${RESET}`); lines.push("");
  for (const r of state.pullResults) {
    if (r.status === "summary") { lines.push(""); lines.push(`  ${BOLD}${GREEN}✔ ${r.total} plugin(s) processed${RESET}`); lines.push(`  ${DIM}Press any key${RESET}`); }
    else if (r.status === "pulling") lines.push(`  ${YELLOW}●${RESET} ${r.name} ${DIM}pulling...${RESET}`);
    else if (r.status === "done") { lines.push(`  ${GREEN}✔${RESET} ${r.name}${GRAY}@${r.version || "?"}${r.attachments ? ` +${r.attachments} files` : ""}${RESET}`); if (r.target) lines.push(`    ${DIM}→ ${r.target}${RESET}`); }
    else if (r.status === "error") lines.push(`  ${RED}✘${RESET} ${r.name} ${RED}${r.error}${RESET}`);
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

  const canPair = cols >= 100;
  const paneW = canPair ? Math.floor((cols - 5) / 2) : cols - 4;
  const chartBarW = Math.min(20, Math.max(8, paneW - 28));
  const chartLabelW = Math.min(20, Math.max(10, paneW - chartBarW - 8));

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

  function sideBySide(leftBlock, rightBlock) {
    const h = Math.max(leftBlock.length, rightBlock.length);
    for (let i = 0; i < h; i++) {
      const left = padVisible(leftBlock[i] || "", paneW);
      const right = rightBlock[i] || "";
      lines.push(`  ${left} ${DIM}│${RESET} ${right}`);
    }
    lines.push("");
  }

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

  const stats = [
    [CYAN, sum("ihub_users_count"), "Users"],
    [GREEN, sum("ihub_entries_count"), "Plugins"],
    [MAGENTA, sum("ihub_comments_count"), "Comments"],
    [YELLOW, sum("ihub_push_total"), "Pushes"],
    [BLUE, sum("ihub_pull_total"), "Pulls"],
    [WHITE, sum("ihub_view_total"), "Views"],
    [RED, sum("ihub_search_total"), "Searches"],
    [GRAY, sum("ihub_remove_total"), "Removes"],
  ];
  lines.push("  " + stats.map(([c, v, l]) => `${c}${BOLD}${v}${RESET} ${DIM}${l}${RESET}`).join("   "));
  lines.push("");

  const sensitive = sum("ihub_sensitive_detected_total");
  const firewalled = sum("ihub_firewall_blocked_total");
  if (sensitive > 0 || firewalled > 0) {
    lines.push(`  ${BG_RED}${WHITE}${BOLD} Security ${RESET}  ${RED}${BOLD}${sensitive}${RESET} ${DIM}sensitive detected${RESET}   ${RED}${BOLD}${firewalled}${RESET} ${DIM}firewall blocked${RESET}`);
    lines.push("");
  }

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

  addCharts(
    makeChart("Plugins by Project", epData, CYAN),
    makeChart("Pushes by User", puData, YELLOW)
  );
  addCharts(
    makeChart("Pushes by Plugin", paData, YELLOW, 8),
    makeChart("Pulls by User", pluData, GREEN)
  );
  addCharts(
    makeChart("Pulls by Plugin", plaData, GREEN, 8),
    makeChart("Views by User", vuData, BLUE)
  );
  addCharts(
    makeChart("Views by Plugin", vaData, BLUE, 8),
    makeChart("Comments by User", cuData, MAGENTA)
  );
  addCharts(
    makeChart("Comments by Plugin", caObj, MAGENTA, 8),
    makeChart("Removes by User", ruData, RED)
  );
  addCharts(
    makeChart("HTTP Requests", hmData, WHITE),
    []
  );

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
  const maxOffset = Math.max(0, lines.length - maxRows);
  if (state && state.scrollOffset > maxOffset) state.scrollOffset = maxOffset;
  const clampedOffset = state ? state.scrollOffset : Math.min(offset, maxOffset);
  if (state) {
    state._contentLines = lines.length;
    state._contentVisibleRows = maxRows;
  }
  const visible = lines.slice(clampedOffset, clampedOffset + maxRows);
  let out = visible.join("\n") + "\n";
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
  if (process.stdin.isTTY) process.stdout.write("\x1b[?1000l\x1b[?1006l");
  process.stdout.write(SHOW_CURSOR + CLEAR);
  try { process.stdin.setRawMode(false); } catch {}
}

async function loadAuditPage(state, baseUrl, token) {
  const offset = (state.auditPage - 1) * 50;
  await withLoading(state, async (isStale) => {
    const d = await fetchJson(`${baseUrl}/api/audit?limit=50&offset=${offset}`, token);
    if (isStale()) return;
    state.audit = d?.entries || [];
    state.auditTotal = d?.total || 0;
  });
}

// Pull each marked plugin: recreate plugins/<name>/ from its attachments
// (the whole plugin dir) plus its README body. A plugin is one unit — no
// per-component-kind install branching.
async function executeBulkPull(state, baseUrl, token) {
  state.view = "pulling";
  state.pullResults = [];
  render(state);
  const toPull = [...state.marked];
  for (const name of toPull) {
    state.pullResults.push({ name, status: "pulling" }); render(state);
    let data;
    try {
      const h = {}; if (token) h["Authorization"] = `Bearer ${token}`; h["X-Ihub-Action"] = "pull";
      const res = await fetch(`${baseUrl}/api/${PLURAL}/${name}`, { headers: h });
      if (!res.ok) { state.pullResults[state.pullResults.length - 1] = { name, status: "error", error: `HTTP ${res.status}` }; render(state); continue; }
      data = await res.json();
    } catch (err) { state.pullResults[state.pullResults.length - 1] = { name, status: "error", error: err.message }; render(state); continue; }

    const ver = data.version || data.meta?.version || "?";
    const dir = resolve("plugins", name);
    let fileCount = 0;
    try {
      mkdirSync(dir, { recursive: true });
      // README.md is the entry body
      if (data.body) { writeFileSync(resolve(dir, "README.md"), data.body); fileCount++; }
      // Attachments are the component files at their plugin-relative paths
      if (data.attachments?.length) {
        for (const att of data.attachments) {
          try {
            const ar = await fetch(`${baseUrl}/api/${PLURAL}/${name}/attachments/${att.filepath}`);
            if (ar.ok) {
              const buf = Buffer.from(await ar.arrayBuffer());
              mkdirSync(resolve(dir, dirname(att.filepath)), { recursive: true });
              writeFileSync(resolve(dir, att.filepath), buf);
              fileCount++;
            }
          } catch {}
        }
      }
      state.pullResults[state.pullResults.length - 1] = { name, status: "done", version: ver, attachments: fileCount, target: `plugins/${name}/` };
    } catch (err) {
      state.pullResults[state.pullResults.length - 1] = { name, status: "error", error: err.message };
    }
    render(state);
  }
  state.pullResults.push({ name: "done", status: "summary", total: toPull.length });
  state.marked.clear();
  clearInstalledCache();
  render(state);
}

// --- API ---

// Network state — true after a connection failure, cleared on next success.
// HTTP error statuses (404 etc.) are normal API responses, not connectivity loss.
let _netError = false;
export function isOffline() { return _netError; }

async function fetchJson(url, token, method) {
  try { const h = {}; if (token) h["Authorization"] = `Bearer ${token}`; const opts = { headers: h }; if (method) opts.method = method; const r = await fetch(url, opts); _netError = false; if (!r.ok) return null; return await r.json(); } catch { _netError = true; return null; }
}

async function fetchText(url, token) {
  try { const h = {}; if (token) h["Authorization"] = `Bearer ${token}`; const r = await fetch(url, { headers: h }); _netError = false; if (!r.ok) return null; return await r.text(); } catch { _netError = true; return null; }
}
