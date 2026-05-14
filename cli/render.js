// Terminal markdown renderer using ANSI escape codes

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const ITALIC = "\x1b[3m";
const UNDERLINE = "\x1b[4m";
const STRIKETHROUGH = "\x1b[9m";

const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";
const GRAY = "\x1b[90m";
const WHITE = "\x1b[37m";

const BG_GRAY = "\x1b[48;5;236m";

/**
 * Render a full markdown document (frontmatter + body) for the terminal.
 */
export function renderMarkdown(content) {
  const lines = content.split("\n");
  const output = [];
  let inFrontmatter = false;
  let frontmatterDone = false;
  let inCodeBlock = false;
  let codeBlockLang = "";
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Frontmatter
    if (line.trim() === "---" && !frontmatterDone) {
      if (!inFrontmatter) {
        inFrontmatter = true;
        output.push(`${DIM}${CYAN}${"─".repeat(50)}${RESET}`);
        continue;
      } else {
        inFrontmatter = false;
        frontmatterDone = true;
        output.push(`${DIM}${CYAN}${"─".repeat(50)}${RESET}`);
        continue;
      }
    }

    if (inFrontmatter) {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx);
        const value = line.slice(colonIdx + 1).trim();
        output.push(`  ${CYAN}${key}${RESET}${DIM}:${RESET} ${WHITE}${value}${RESET}`);
      } else {
        output.push(`  ${DIM}${line}${RESET}`);
      }
      continue;
    }

    // Code blocks
    if (line.trimStart().startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        const label = codeBlockLang ? ` ${codeBlockLang} ` : "";
        output.push(`${DIM}${GRAY}┌${label}${"─".repeat(Math.max(0, 48 - label.length))}┐${RESET}`);
      } else {
        inCodeBlock = false;
        codeBlockLang = "";
        output.push(`${DIM}${GRAY}└${"─".repeat(49)}┘${RESET}`);
      }
      continue;
    }

    if (inCodeBlock) {
      output.push(`${GRAY}│${RESET} ${GREEN}${line}${RESET}`);
      continue;
    }

    // Headings
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      output.push("");
      output.push(`${BOLD}${MAGENTA}${h1[1]}${RESET}`);
      output.push(`${MAGENTA}${"═".repeat(h1[1].length)}${RESET}`);
      continue;
    }

    const h2 = line.match(/^## (.+)/);
    if (h2) {
      output.push("");
      output.push(`${BOLD}${YELLOW}${h2[1]}${RESET}`);
      output.push(`${DIM}${YELLOW}${"─".repeat(h2[1].length)}${RESET}`);
      continue;
    }

    const h3 = line.match(/^### (.+)/);
    if (h3) {
      output.push("");
      output.push(`${BOLD}${CYAN}${h3[1]}${RESET}`);
      continue;
    }

    const h4 = line.match(/^#{4,} (.+)/);
    if (h4) {
      output.push(`${BOLD}${h4[1]}${RESET}`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      output.push(`${DIM}${"─".repeat(50)}${RESET}`);
      continue;
    }

    // Table
    if (line.includes("|") && line.trim().startsWith("|")) {
      // Separator row
      if (/^\|[\s\-:|]+\|$/.test(line.trim())) {
        output.push(`${DIM}${line.replace(/[^|]/g, (c) => c === "-" ? "─" : c)}${RESET}`);
        continue;
      }
      // Header or data row
      const cells = line.split("|").slice(1, -1);
      if (!inTable) {
        inTable = true;
        output.push(`${BOLD}${cells.map((c) => c.trim()).join("${RESET} │ ${BOLD}")}${RESET}`);
      } else {
        output.push(cells.map((c) => c.trim()).join(` ${DIM}│${RESET} `));
      }
      continue;
    }
    inTable = false;

    // Bullet lists
    const bullet = line.match(/^(\s*)[-*] (.+)/);
    if (bullet) {
      const indent = bullet[1];
      const text = renderInline(bullet[2]);
      output.push(`${indent}${CYAN}\u2022${RESET} ${text}`);
      continue;
    }

    // Numbered lists
    const numbered = line.match(/^(\s*)(\d+)\. (.+)/);
    if (numbered) {
      const indent = numbered[1];
      const num = numbered[2];
      const text = renderInline(numbered[3]);
      output.push(`${indent}${CYAN}${num}.${RESET} ${text}`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      output.push(`${DIM}${CYAN}▎${RESET} ${ITALIC}${line.slice(2)}${RESET}`);
      continue;
    }

    // Emphasis/italic placeholder text
    if (line.trim().startsWith("_") && line.trim().endsWith("_")) {
      output.push(`${DIM}${ITALIC}${line.trim().slice(1, -1)}${RESET}`);
      continue;
    }

    // Regular text with inline formatting
    output.push(renderInline(line));
  }

  return output.join("\n");
}

/**
 * Apply inline formatting: **bold**, *italic*, `code`, ~~strike~~, [links]
 */
function renderInline(text) {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`)
    .replace(/__(.+?)__/g, `${BOLD}$1${RESET}`)
    // Italic
    .replace(/\*(.+?)\*/g, `${ITALIC}$1${RESET}`)
    .replace(/_(.+?)_/g, `${ITALIC}$1${RESET}`)
    // Strikethrough
    .replace(/~~(.+?)~~/g, `${STRIKETHROUGH}$1${RESET}`)
    // Inline code
    .replace(/`([^`]+)`/g, `${BG_GRAY}${GREEN} $1 ${RESET}`)
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${UNDERLINE}${BLUE}$1${RESET} ${DIM}($2)${RESET}`);
}
