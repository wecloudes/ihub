#!/usr/bin/env node

import { resolve, dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from "fs";
import { createInterface } from "readline";
import { homedir } from "os";
import { CODING_AGENTS, AGENT_NAMES, getInstallPath } from "./agents-config.js";
import { loadRegistry, loadEntries } from "./parse.js";
import { renderMarkdown } from "./render.js";
import { parsePrometheus, parseFilters, renderDashboard } from "./dashboard.js";
import { startTui } from "./tui.js";
import { maskSensitiveData, formatFindings } from "../server/sensitive.js";
import {
  pushEntry,
  pullEntry,
  removeEntry,
  remoteSearch,
  commentEntry,
  getEntryComments,
  downloadAttachment,
  downloadBackup,
  setRole,
  triggerDigest,
  fetchServerConfig,
  changePassword,
  fetchMetrics,
  fetchAuditLog,
  entryToMarkdown,
  loadConfig,
  saveConfig,
} from "./registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const TYPE_FIELDS = {
  agent: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "inputs", label: "Inputs (comma-separated)", type: "array" },
    { key: "outputs", label: "Outputs (comma-separated)", type: "array" },
    { key: "skills", label: "Skills (comma-separated)", type: "array" },
    { key: "rules", label: "Rules (comma-separated)", type: "array" },
  ],
  skill: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "triggers", label: "Triggers (comma-separated)", type: "array" },
    { key: "args", label: "Arguments (comma-separated)", type: "array" },
    { key: "compatible_agents", label: "Compatible agents (comma-separated)", type: "array" },
  ],
  rule: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "scope", label: "Scope", type: "string", default: "global" },
    { key: "severity", label: "Severity (error/warning/info)", type: "string", default: "error" },
    { key: "applies_to", label: "Applies to agents (comma-separated)", type: "array" },
  ],
  memory: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "scope", label: "Scope", type: "string", default: "global" },
    { key: "context_type", label: "Context type (memory/preference/decision/insight)", type: "string", default: "memory" },
    { key: "related", label: "Related entries (comma-separated)", type: "array" },
  ],
  prompt: [
    { key: "description", label: "Description", type: "string", required: true },
    { key: "version", label: "Version", type: "string", default: "0.1.0" },
    { key: "author", label: "Author", type: "string" },
    { key: "project", label: "Project", type: "string" },
    { key: "tags", label: "Tags (comma-separated)", type: "array" },
    { key: "model", label: "Target model", type: "string" },
    { key: "compatible_agents", label: "Compatible agents (comma-separated)", type: "array" },
  ],
};

let _rl;
let _lineQueue = [];
let _lineResolve = null;
let _closed = false;

function initReadline() {
  if (_rl) return;
  _rl = createInterface({ input: process.stdin, output: process.stdout });
  _rl.on("line", (line) => {
    if (_lineResolve) {
      const resolve = _lineResolve;
      _lineResolve = null;
      resolve(line);
    } else {
      _lineQueue.push(line);
    }
  });
  _rl.on("close", () => {
    _closed = true;
    if (_lineResolve) {
      const resolve = _lineResolve;
      _lineResolve = null;
      resolve(null);
    }
  });
}

function prompt(question, defaultValue = "") {
  initReadline();
  process.stdout.write(question);

  if (_lineQueue.length > 0) {
    const line = _lineQueue.shift();
    return Promise.resolve(line.trim() || defaultValue);
  }
  if (_closed) {
    return Promise.resolve(defaultValue);
  }

  return new Promise((resolve) => {
    _lineResolve = (line) => resolve(line === null ? defaultValue : line.trim() || defaultValue);
  });
}

function closeReadline() {
  if (_rl) { _rl.close(); _rl = null; }
}

const [, , rawCommand, ...rawArgs] = process.argv;

const commands = {
  browse,
  list,
  search,
  show,
  preview,
  validate,
  create,
  import: importArtifact,
  push,
  pull,
  remove,
  comment,
  comments,
  projects,
  passwd,
  completions,
  man,
  config: showConfig,
  metrics,
  audit,
  backup,
  admin,
  register,
  login,
  whoami,
  version,
  help,
};

const PLURAL_MAP = {
  agent: "agents", skill: "skills", rule: "rules",
  memory: "memories", prompt: "prompts",
};
const SINGULAR_MAP = Object.fromEntries(
  Object.entries(PLURAL_MAP).map(([s, p]) => [p, s])
);
const TYPE_ALIASES = {
  ...PLURAL_MAP,
  agents: "agents", skills: "skills", rules: "rules",
  memories: "memories", prompts: "prompts",
};

function pluralize(type) {
  return PLURAL_MAP[type] || TYPE_ALIASES[type] || type;
}

function singularize(type) {
  return SINGULAR_MAP[type] || type;
}

// Support type-first syntax: ihub agents list, ihub agent show <name>
let command = rawCommand;
let args = [...rawArgs];

if (command && TYPE_ALIASES[command] && !commands[command]) {
  const pluralType = TYPE_ALIASES[command];
  const subcommand = args[0];

  if (subcommand === "list") {
    command = "list";
    args = [pluralType];
  } else if (subcommand === "show") {
    command = "show";
    // Convert: ihub agent show <name> → show(["agent", "<name>"])
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "preview") {
    command = "preview";
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "import") {
    command = "import";
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "create") {
    command = "create";
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "push") {
    command = "push";
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "pull") {
    command = "pull";
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "remove") {
    command = "remove";
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "comment") {
    command = "comment";
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "comments") {
    command = "comments";
    const singularType = singularize(pluralType);
    args = [singularType, ...args.slice(1)];
  } else if (subcommand === "search") {
    command = "search";
    // keep args as-is (the query)
    args = args.slice(1);
  } else {
    // No subcommand: default to list
    command = "list";
    args = [pluralType];
  }
}

const fn = commands[command];
if (!fn) {
  help();
  process.exit(command ? 1 : 0);
} else {
  Promise.resolve(fn(args)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

// --- TUI ---

async function browse() {
  const config = loadConfig();
  const base = config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
  const token = config.token || process.env.IHUB_TOKEN || "";
  await startTui(base.replace(/\/+$/, ""), token);
}

// --- Local Commands ---

function list(args) {
  const type = args[0];
  const registry = loadRegistry(ROOT);

  const types = type ? [type] : ["agents", "skills", "rules", "memories", "prompts"];
  for (const t of types) {
    const entries = registry[t];
    if (!entries) {
      console.error(`Unknown type: ${t}`);
      continue;
    }
    console.log(`\n${t.toUpperCase()} (${entries.length})`);
    for (const e of entries) {
      const desc = e.description || "";
      const tags = Array.isArray(e.tags) ? e.tags.join(", ") : "";
      console.log(`  ${e.name || e.file}  ${desc ? "— " + desc : ""}`);
      if (tags) console.log(`    tags: ${tags}`);
    }
  }
  console.log();
}

function search(args) {
  const isRemote = args[0] === "--remote";
  if (isRemote) args.shift();

  const query = args.join(" ").toLowerCase();
  if (!query) {
    console.error("Usage: ihub search [--remote] <query>");
    process.exit(1);
  }

  if (isRemote) {
    return remoteSearch(query).then((results) => {
      if (results.length === 0) {
        console.log("No remote results found.");
        return;
      }
      console.log(`\nFound ${results.length} remote result(s):\n`);
      for (const r of results) {
        console.log(`  [${r.type}] ${r.name} — ${r.description || ""}`);
      }
      console.log();
    });
  }

  const registry = loadRegistry(ROOT);
  const results = [];

  for (const [type, entries] of Object.entries(registry)) {
    for (const entry of entries) {
      const haystack = [
        entry.name,
        entry.description,
        ...(Array.isArray(entry.tags) ? entry.tags : []),
        entry.body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (haystack.includes(query)) {
        results.push({ type: type.slice(0, -1), ...entry });
      }
    }
  }

  if (results.length === 0) {
    console.log("No results found.");
    return;
  }

  console.log(`\nFound ${results.length} result(s):\n`);
  for (const r of results) {
    console.log(`  [${r.type}] ${r.name || r.file} — ${r.description || ""}`);
  }
  console.log();
}

function show(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub show <type> <name>");
    process.exit(1);
  }

  const registry = loadRegistry(ROOT);
  const entries = registry[pluralize(type)];
  if (!entries) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  const entry = entries.find((e) => (e.name || e.file) === name);
  if (!entry) {
    console.error(`Not found: ${name}`);
    process.exit(1);
  }

  console.log(`\n--- ${entry.name || entry.file} ---`);
  const { body, path, file, ...meta } = entry;
  console.log(JSON.stringify(meta, null, 2));
  console.log(`\n${body}\n`);
}

function preview(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub preview <type> <name>");
    process.exit(1);
  }

  const registry = loadRegistry(ROOT);
  const entries = registry[pluralize(type)];
  if (!entries) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  const entry = entries.find((e) => (e.name || e.file) === name);
  if (!entry) {
    console.error(`Not found: ${name}`);
    process.exit(1);
  }

  const rawContent = readFileSync(entry.path, "utf-8");
  console.log(renderMarkdown(rawContent));
}

function validate() {
  const registry = loadRegistry(ROOT);
  let errors = 0;

  for (const [type, entries] of Object.entries(registry)) {
    for (const entry of entries) {
      const label = `${type}/${entry.file}`;

      if (!entry.name) {
        console.error(`  MISSING name in ${label}`);
        errors++;
      }
      if (!entry.description) {
        console.error(`  MISSING description in ${label}`);
        errors++;
      }
      if (!entry.version) {
        console.error(`  MISSING version in ${label}`);
        errors++;
      }

      if (Array.isArray(entry.skills)) {
        for (const ref of entry.skills) {
          if (!registry.skills.find((s) => (s.name || s.file) === ref)) {
            console.error(`  BROKEN ref: skill "${ref}" in ${label}`);
            errors++;
          }
        }
      }
      if (Array.isArray(entry.rules)) {
        for (const ref of entry.rules) {
          if (!registry.rules.find((r) => (r.name || r.file) === ref)) {
            console.error(`  BROKEN ref: rule "${ref}" in ${label}`);
            errors++;
          }
        }
      }
      if (Array.isArray(entry.compatible_agents)) {
        for (const ref of entry.compatible_agents) {
          if (!registry.agents.find((a) => (a.name || a.file) === ref)) {
            console.error(`  BROKEN ref: agent "${ref}" in ${label}`);
            errors++;
          }
        }
      }
      if (Array.isArray(entry.applies_to)) {
        for (const ref of entry.applies_to) {
          if (!registry.agents.find((a) => (a.name || a.file) === ref)) {
            console.error(`  BROKEN ref: agent "${ref}" in ${label}`);
            errors++;
          }
        }
      }
    }
  }

  if (errors === 0) {
    console.log("Registry is valid.");
  } else {
    console.error(`\n${errors} error(s) found.`);
    process.exit(1);
  }
}

function projects(args) {
  const [projectName] = args;
  const registry = loadRegistry(ROOT);
  const TYPES = ["agents", "skills", "rules", "memories", "prompts"];

  // Collect all projects
  const projectMap = {};
  const unassigned = { agents: [], skills: [], rules: [], memories: [], prompts: [] };

  for (const type of TYPES) {
    for (const entry of registry[type]) {
      const proj = entry.project || "";
      if (proj) {
        if (!projectMap[proj]) projectMap[proj] = { agents: [], skills: [], rules: [], memories: [], prompts: [] };
        projectMap[proj][type].push(entry);
      } else {
        unassigned[type].push(entry);
      }
    }
  }

  const projectNames = Object.keys(projectMap).sort();

  // If a specific project is requested
  if (projectName) {
    const proj = projectMap[projectName];
    if (!proj) {
      console.error(`Project not found: ${projectName}`);
      console.error(`Available projects: ${projectNames.join(", ") || "(none)"}`);
      process.exit(1);
    }
    printProjectTree(projectName, proj);
    return;
  }

  // List all projects
  if (projectNames.length === 0 && TYPES.every((t) => unassigned[t].length === 0)) {
    console.log("\nNo entries found.\n");
    return;
  }

  for (const name of projectNames) {
    printProjectTree(name, projectMap[name]);
  }

  const hasUnassigned = TYPES.some((t) => unassigned[t].length > 0);
  if (hasUnassigned) {
    printProjectTree("(unassigned)", unassigned);
  }
}

function printProjectTree(name, data) {
  const TYPES = ["agents", "skills", "rules", "memories", "prompts"];
  const typesWithEntries = TYPES.filter((t) => data[t].length > 0);

  console.log(`\n\x1b[1m\x1b[36m${name}\x1b[0m`);

  for (let ti = 0; ti < typesWithEntries.length; ti++) {
    const type = typesWithEntries[ti];
    const entries = data[type];
    const isLastType = ti === typesWithEntries.length - 1;
    const typeConnector = isLastType ? "\u2514" : "\u251c";
    const typePrefix = isLastType ? " " : "\u2502";

    console.log(`${typeConnector}\u2500\u2500 \x1b[33m${type}\x1b[0m`);

    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      const isLastEntry = ei === entries.length - 1;
      const entryConnector = isLastEntry ? "\u2514" : "\u251c";
      const desc = entry.description ? `\x1b[2m \u2014 ${entry.description}\x1b[0m` : "";
      const ver = entry.version ? `\x1b[90m@${entry.version}\x1b[0m` : "";

      console.log(`${typePrefix}   ${entryConnector}\u2500\u2500 ${entry.name || entry.file}${ver}${desc}`);
    }
  }

  if (typesWithEntries.length === 0) {
    console.log(`\u2514\u2500\u2500 \x1b[2m(empty)\x1b[0m`);
  }
}

async function create(args) {
  const interactive = args.includes("--interactive") || args.includes("-i");
  const filtered = args.filter((a) => a !== "--interactive" && a !== "-i");

  let [type, name] = filtered;

  const validTypes = ["agent", "skill", "rule", "memory", "prompt"];

  if (interactive && !type) {
    type = await prompt(`Type (${validTypes.join(", ")}): `);
  }
  if (!type) {
    console.error("Usage: ihub create <agent|skill|rule|memory|prompt> <name> [--interactive|-i]");
    process.exit(1);
  }
  if (!validTypes.includes(type)) {
    console.error(`Type must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  if (interactive && !name) {
    name = await prompt("Name: ");
  }
  if (!name) {
    console.error("Usage: ihub create <type> <name> [--interactive|-i]");
    process.exit(1);
  }

  const targetPath = resolve(ROOT, pluralize(type), `${name}.md`);
  if (existsSync(targetPath)) {
    console.error(`Already exists: ${targetPath}`);
    process.exit(1);
  }

  if (!interactive) {
    // Original template-based flow
    const templatePath = resolve(ROOT, "templates", `${type}.md`);
    let content = readFileSync(templatePath, "utf-8");
    content = content.replace(/^name: *$/m, `name: ${name}`);
    content = content.replace(/\{\{name\}\}/g, name);
    writeFileSync(targetPath, content);
    console.log(`Created: ${targetPath}`);
    return;
  }

  // Interactive flow
  const fields = TYPE_FIELDS[type];
  const values = { name };

  console.log(`\nCreating ${type}: ${name}\n`);

  for (const field of fields) {
    const defaultHint = field.default ? ` (${field.default})` : "";
    const requiredHint = field.required ? " *" : "";
    const answer = await prompt(`${field.label}${requiredHint}${defaultHint}: `);

    if (field.type === "array") {
      values[field.key] = answer
        ? answer.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    } else {
      values[field.key] = answer || field.default || "";
    }

    if (field.required && !values[field.key]) {
      console.error(`${field.label} is required.`);
      process.exit(1);
    }
  }

  // Build frontmatter
  const frontmatter = ["---"];
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      frontmatter.push(`${key}: [${value.join(", ")}]`);
    } else {
      frontmatter.push(`${key}: ${value}`);
    }
  }
  frontmatter.push("---");

  // Build body from template structure
  const bodyParts = [`\n# ${name}\n`];
  const templatePath = resolve(ROOT, "templates", `${type}.md`);
  const templateContent = readFileSync(templatePath, "utf-8");
  const templateBody = templateContent.replace(/^---[\s\S]*?---/, "").trim();
  // Replace placeholder and remove the name heading (we already added it)
  const cleanBody = templateBody.replace(/# \{\{name\}\}/, "").trim();
  if (cleanBody) bodyParts.push(cleanBody);

  const content = frontmatter.join("\n") + "\n" + bodyParts.join("\n") + "\n";
  writeFileSync(targetPath, content);
  closeReadline();
  console.log(`\nCreated: ${targetPath}`);
}

// --- Import ---

function detectSourceAgent(path) {
  const p = path.toLowerCase();
  if (p.includes("/.claude/") || p.includes("\\.claude\\")) return "claude";
  if (p.includes("/.cursor/") || p.includes("\\.cursor\\") || p.endsWith(".mdc")) return "cursor";
  if (p.includes("/.qwen/") || p.includes("\\.qwen\\")) return "qwen";
  if (p.includes("/.gemini/") || p.includes("\\.gemini\\")) return "gemini";
  if (p.includes("/.codex/") || p.includes("\\.codex\\")) return "codex";
  if (p.includes("/.opencode/") || p.includes("\\.opencode\\") || p.includes("/.config/opencode/")) return "opencode";
  if (p.includes("/.agents/") || p.includes("\\.agents\\")) return "codex";
  return null;
}

function mapSourceFields(sourceAgent, type, sourceMeta) {
  const mapped = {};

  // Common: name and description are universal
  if (sourceMeta.name) mapped.name = sourceMeta.name;
  if (sourceMeta.description) mapped.description = sourceMeta.description;

  // Claude/Qwen/OpenCode SKILL.md: may have nested metadata
  if (sourceAgent === "claude" || sourceAgent === "qwen" || sourceAgent === "opencode") {
    if (sourceMeta.metadata) {
      if (sourceMeta.metadata.author) mapped.author = sourceMeta.metadata.author;
      if (sourceMeta.metadata.version) mapped.version = sourceMeta.metadata.version;
    }
    if (sourceMeta.license) mapped.tags = [...(mapped.tags || []), `license:${sourceMeta.license}`];
  }

  // Cursor .mdc: map globs/alwaysApply to ihub fields
  if (sourceAgent === "cursor") {
    if (sourceMeta.alwaysApply === true || sourceMeta.alwaysApply === "true") {
      mapped.scope = "global";
    } else {
      mapped.scope = "project";
    }
    if (sourceMeta.globs) {
      mapped.tags = [...(mapped.tags || []), `globs:${sourceMeta.globs}`];
    }
    if (sourceMeta.priority) {
      const p = parseInt(sourceMeta.priority, 10);
      if (p >= 8) mapped.severity = "error";
      else if (p >= 4) mapped.severity = "warning";
      else mapped.severity = "info";
    }
    if (sourceMeta.tags && Array.isArray(sourceMeta.tags)) {
      mapped.tags = [...(mapped.tags || []), ...sourceMeta.tags];
    }
  }

  // Codex AGENTS.md: typically no structured frontmatter
  // Gemini GEMINI.md: typically no structured frontmatter

  return mapped;
}

async function importArtifact(args) {
  const interactive = args.includes("-i") || args.includes("--interactive");
  const noPush = args.includes("--no-push");
  const filtered = args.filter((a) => a !== "-i" && a !== "--interactive" && a !== "--no-push");

  const [type, sourcePath] = filtered;
  if (!type || !sourcePath) {
    console.error("Usage: ihub import <type> <path> [-i] [--no-push]");
    console.error("  Example: ihub import skill ~/.claude/skills/docx/");
    console.error("  Example: ihub import rule .cursor/rules/my-rule.mdc");
    console.error("  Example: ihub import skill ~/.qwen/skills/my-skill/");
    process.exit(1);
  }

  const validTypes = ["agent", "skill", "rule", "memory", "prompt"];
  if (!validTypes.includes(type)) {
    console.error(`Type must be one of: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const absPath = resolve(sourcePath);

  // Determine the source file and companion directory
  let sourceFile;
  let sourceDir;

  const stat = existsSync(absPath) ? statSync(absPath) : null;
  if (!stat) {
    console.error(`Source not found: ${absPath}`);
    process.exit(1);
  }

  if (stat.isDirectory()) {
    // Look for known files in order of priority
    const candidates = ["SKILL.md", "AGENT.md", "RULE.md", "PROMPT.md", "index.md", "README.md"];
    const allFiles = readdirSync(absPath);
    const mdFiles = allFiles.filter((f) => f.endsWith(".md") || f.endsWith(".mdc"));
    const found = candidates.find((c) => mdFiles.includes(c)) || mdFiles[0];
    if (!found) {
      console.error(`No markdown file found in: ${absPath}`);
      process.exit(1);
    }
    sourceFile = join(absPath, found);
    sourceDir = absPath;
  } else if (stat.isFile() && (absPath.endsWith(".md") || absPath.endsWith(".mdc"))) {
    sourceFile = absPath;
    sourceDir = dirname(absPath);
  } else {
    console.error(`Source must be a directory or .md/.mdc file: ${absPath}`);
    process.exit(1);
  }

  // Detect source agent from path
  const sourceAgent = detectSourceAgent(absPath);

  // Parse source frontmatter + body
  const sourceContent = readFileSync(sourceFile, "utf-8");
  const { parseFrontmatter } = await import("./parse.js");
  const { meta: sourceMeta, body: sourceBody } = parseFrontmatter(sourceContent);

  // Map agent-specific fields to ihub fields
  const mapped = mapSourceFields(sourceAgent, type, sourceMeta);

  // Extract name from source metadata, mapped fields, or directory name
  const defaultName = mapped.name || sourceMeta.name || basename(sourceDir);

  console.log(`\nImporting ${type} from: ${sourceFile}`);
  if (sourceAgent) console.log(`  Detected agent: ${CODING_AGENTS[sourceAgent]?.name || sourceAgent}`);
  if (mapped.name || sourceMeta.name) console.log(`  Source name: ${mapped.name || sourceMeta.name}`);
  if (mapped.description || sourceMeta.description) {
    const desc = mapped.description || sourceMeta.description;
    const truncated = desc.length > 80 ? desc.slice(0, 77) + "..." : desc;
    console.log(`  Description: ${truncated}`);
  }
  console.log("");

  // Build ihub metadata — auto-fill what we can, ask for the rest
  const fields = TYPE_FIELDS[type];
  const values = {};

  if (interactive) {
    values.name = await prompt(`Name (${defaultName}): `, defaultName);
    for (const field of fields) {
      const mappedVal = mapped[field.key];
      const sourceVal = mappedVal !== undefined ? mappedVal : sourceMeta[field.key];
      const defaultVal = sourceVal
        ? (Array.isArray(sourceVal) ? sourceVal.join(", ") : String(sourceVal))
        : (field.default || "");
      const hint = defaultVal ? ` (${defaultVal})` : "";
      const requiredHint = field.required ? " *" : "";
      const answer = await prompt(`${field.label}${requiredHint}${hint}: `, defaultVal);

      if (field.type === "array") {
        values[field.key] = answer ? answer.split(",").map((s) => s.trim()).filter(Boolean) : [];
      } else {
        values[field.key] = answer || field.default || "";
      }
    }
    closeReadline();
  } else {
    // Auto-fill from mapped + source + defaults
    values.name = defaultName;
    let missingRequired = [];

    for (const field of fields) {
      const mappedVal = mapped[field.key];
      const sourceVal = mappedVal !== undefined ? mappedVal : sourceMeta[field.key];

      if (sourceVal !== undefined) {
        values[field.key] = sourceVal;
      } else if (field.default) {
        values[field.key] = field.default;
      } else if (field.type === "array") {
        values[field.key] = [];
      } else {
        values[field.key] = "";
      }

      // Track missing required fields
      if (field.required && !values[field.key]) {
        missingRequired.push(field);
      }
    }

    // Prompt only for missing required fields
    if (missingRequired.length > 0) {
      console.log(`Missing required fields — please provide:\n`);
      for (const field of missingRequired) {
        const answer = await prompt(`${field.label} *: `);
        if (field.type === "array") {
          values[field.key] = answer ? answer.split(",").map((s) => s.trim()).filter(Boolean) : [];
        } else {
          values[field.key] = answer || "";
        }
      }
      closeReadline();
    }
  }

  const name = values.name;
  const pluralType = pluralize(type);

  // Build frontmatter
  const frontmatter = ["---"];
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      frontmatter.push(`${key}: [${value.join(", ")}]`);
    } else {
      frontmatter.push(`${key}: ${value}`);
    }
  }
  frontmatter.push("---");

  // Write the artifact .md
  const targetPath = resolve(ROOT, pluralType, `${name}.md`);
  const content = frontmatter.join("\n") + "\n\n" + sourceBody + "\n";
  writeFileSync(targetPath, content);
  console.log(`Created: ${targetPath}`);

  // Copy companion files (everything except the source .md itself)
  const companionDir = resolve(ROOT, pluralType, name);
  let fileCount = 0;
  const sourceFiles = [];
  collectCompanionFiles(sourceDir, sourceDir, sourceFile, sourceFiles);

  if (sourceFiles.length > 0) {
    for (const { relPath, absPath: filePath } of sourceFiles) {
      const destPath = resolve(companionDir, relPath);
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, readFileSync(filePath));
      fileCount++;
    }
    console.log(`Copied: ${fileCount} file(s) → ${companionDir}`);
  }

  // Push to server unless --no-push
  if (!noPush) {
    const { loadRegistry } = await import("./parse.js");
    const registry = loadRegistry(ROOT);
    const entry = registry[pluralType]?.find((e) => (e.name || e.file) === name);
    if (entry) {
      try {
        const result = await pushEntry(pluralType, entry);
        console.log(`Pushed: ${pluralType}/${name}@${result.version}` + (result.attachments ? ` (+${result.attachments} files)` : ""));
      } catch (err) {
        console.error(`Push failed: ${err.message}`);
        console.error("Files saved locally. Push manually with: ihub push " + type + " " + name);
      }
    }
  } else {
    console.log(`\nSkipped push. Run manually: ihub push ${type} ${name}`);
  }
}

function collectCompanionFiles(dir, baseDir, excludeFile, result) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectCompanionFiles(full, baseDir, excludeFile, result);
    } else if (full !== excludeFile) {
      const relPath = full.substring(baseDir.length + 1);
      result.push({ relPath, absPath: full });
    }
  }
}

// --- Remote Commands ---

async function push(args) {
  const force = args.includes("--force");
  const filtered = args.filter((a) => a !== "--force");
  const [type, name] = filtered;
  if (!type || !name) {
    console.error("Usage: ihub push <type> <name> [--force]");
    console.error("  type: agent, skill, rule, memory, prompt");
    process.exit(1);
  }

  const pluralType = pluralize(type);
  const registry = loadRegistry(ROOT);
  const entries = registry[pluralType];

  if (!entries) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  const entry = entries.find((e) => (e.name || e.file) === name);
  if (!entry) {
    console.error(`Not found locally: ${type}/${name}`);
    process.exit(1);
  }

  // Scan and mask sensitive data before pushing
  const content = readFileSync(entry.path, "utf-8");
  const { maskedContent, findings } = maskSensitiveData(content);

  if (findings.length > 0) {
    const report = formatFindings(findings);
    console.log(report);
    // Re-parse the entry with masked content
    const { parseFrontmatter } = await import("./parse.js");
    const { meta, body } = parseFrontmatter(maskedContent);
    entry.body = body;
    Object.assign(entry, meta);
  }

  const result = await pushEntry(pluralType, entry);
  const ver = result.version;
  console.log(`Pushed ${pluralType}/${name}@${ver}`);

  if (findings.length > 0) {
    console.log(`\x1b[33m⚠ ${findings.length} sensitive value(s) were masked before publishing\x1b[0m`);
  }
}

function globalPath(pluralType) {
  return resolve(homedir(), ".claude", pluralType);
}

async function pull(args) {
  // Parse flags
  let destination;
  let agentFlags = [];
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--local" || args[i] === "-l") destination = "local";
    else if (args[i] === "--global" || args[i] === "-g") destination = "global";
    else if (args[i] === "--agent" && args[i + 1]) agentFlags.push(args[++i]);
    else filtered.push(args[i]);
  }

  const [type, nameArg] = filtered;
  if (!type || !nameArg) {
    console.error("Usage: ihub pull <type> <name[:version]> [--local|--global] [--agent <name>...]");
    console.error("  Agents: " + AGENT_NAMES.join(", "));
    console.error("  Multi-agent: --agent claude --agent cursor");
    process.exit(1);
  }

  // Parse name:version syntax
  const colonIdx = nameArg.indexOf(":");
  let name, version;
  if (colonIdx !== -1) {
    name = nameArg.slice(0, colonIdx);
    const tag = nameArg.slice(colonIdx + 1);
    version = tag === "latest" ? undefined : tag;
  } else {
    name = nameArg;
    version = undefined;
  }

  const singularType = singularize(type);
  const pluralType = pluralize(singularType);
  const validTypes = ["agents", "skills", "rules", "memories", "prompts"];
  if (!validTypes.includes(pluralType)) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  const entry = await pullEntry(pluralType, name, version);
  const markdown = entryToMarkdown(entry);
  const ver = entry.meta?.version || "latest";

  // Memories always go to the local working directory — no agent paths, no prompt
  if (singularType === "memory") {
    const targetPath = resolve(ROOT, pluralType, `${name}.md`);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, markdown);
    console.log(`Pulled ${pluralType}/${name}@${ver} → ${targetPath}`);
    await downloadAttachmentsTo(pluralType, name, targetPath, entry.attachments);
    return;
  }

  // Determine coding agents
  let agents = agentFlags.length > 0
    ? agentFlags
    : (process.env.IHUB_AGENT ? process.env.IHUB_AGENT.split(",") : null);

  if (!agents) {
    const savedAgents = loadConfig().agents || (loadConfig().agent ? [loadConfig().agent] : null);
    agents = savedAgents;
  }

  if (!agents && !destination) {
    // Ask — allow multi-selection (comma-separated or space-separated numbers)
    const agentList = AGENT_NAMES.map((a, i) => `  [${i + 1}] ${CODING_AGENTS[a].name}`).join("\n");
    const answer = await prompt(
      `Which coding agent(s)? (comma-separated for multiple)\n${agentList}\nChoice: `,
      "7"
    );
    const indices = answer.split(/[,\s]+/).map((s) => parseInt(s.trim(), 10) - 1);
    agents = indices
      .filter((i) => i >= 0 && i < AGENT_NAMES.length)
      .map((i) => AGENT_NAMES[i]);
    if (agents.length === 0) agents = ["ihub"];

    // Save preference
    const config = loadConfig();
    config.agents = agents;
    delete config.agent;
    saveConfig(config);
    const names = agents.map((a) => CODING_AGENTS[a]?.name || a).join(", ");
    console.log(`Saved agent preference: ${names}`);
  }

  agents = agents || ["ihub"];

  // Determine scope if not set via flag
  if (!destination) {
    const answer = await prompt(
      `Install scope:\n  [l] Project\n  [g] Personal\nChoice [l/g]: `,
      "l"
    );
    destination = (answer === "g" || answer === "global") ? "global" : "local";
  }

  // Install for each selected agent
  for (const agent of agents) {
    const installInfo = getInstallPath(agent, pluralType, destination);
    let targetPath;

    if (!installInfo?.path) {
      if (installInfo?.note) {
        console.log(`  ${CODING_AGENTS[agent]?.name || agent}: ${installInfo.note} — skipped`);
      }
      continue;
    }

    const targetDir = installInfo.path;

    const isSkillType = (pluralType === "skills" || pluralType === "agents" || pluralType === "prompts");
    if (installInfo.skillAsDir && installInfo.skillFilename && isSkillType) {
      // Agents like Claude/Qwen/OpenCode: install as <dir>/<name>/SKILL.md
      const skillDir = resolve(targetDir, name);
      mkdirSync(skillDir, { recursive: true });
      targetPath = resolve(skillDir, installInfo.skillFilename);
    } else {
      // Flat file: <dir>/<name>.md or <name>.mdc
      const ext = installInfo.ext || ".md";
      mkdirSync(targetDir, { recursive: true });
      targetPath = resolve(targetDir, `${name}${ext}`);
    }

    // Transform content for agent-specific formats
    const output = transformForAgent(agent, pluralType, entry, markdown);
    writeFileSync(targetPath, output);

    const agentLabel = agents.length > 1 ? ` (${CODING_AGENTS[agent]?.name || agent})` : "";
    const scopeLabel = destination === "global" ? "personal" : "project";
    console.log(`Pulled ${pluralType}/${name}@${ver} → ${targetPath} (${scopeLabel}${agentLabel})`);

    await downloadAttachmentsTo(pluralType, name, targetPath, entry.attachments);
  }
}

function transformForAgent(agent, pluralType, entry, defaultMarkdown) {
  const meta = entry.meta || {};
  const body = entry.body || "";

  if (agent === "cursor" && (pluralType === "rules" || pluralType === "prompts")) {
    // Cursor .mdc format: description, globs, alwaysApply
    const lines = ["---"];
    lines.push(`description: ${meta.description || entry.description || ""}`);
    if (meta.applies_to && Array.isArray(meta.applies_to) && meta.applies_to.length > 0) {
      lines.push(`globs: "**/*"`);
    } else {
      lines.push(`globs: ""`);
    }
    lines.push(`alwaysApply: ${meta.scope === "global" ? "true" : "false"}`);
    lines.push("---");
    lines.push("");
    lines.push(body);
    return lines.join("\n");
  }

  if ((agent === "claude" || agent === "qwen" || agent === "opencode") &&
      (pluralType === "skills" || pluralType === "agents" || pluralType === "prompts")) {
    // Claude/Qwen/OpenCode SKILL.md format: name, description
    const lines = ["---"];
    lines.push(`name: ${meta.name || entry.name || ""}`);
    lines.push(`description: ${meta.description || entry.description || ""}`);
    if (meta.version) lines.push(`version: ${meta.version}`);
    if (meta.author) lines.push(`author: ${meta.author}`);
    lines.push("---");
    lines.push("");
    lines.push(body);
    return lines.join("\n");
  }

  return defaultMarkdown;
}

async function downloadAttachmentsTo(pluralType, name, targetPath, attachments) {
  if (!attachments || attachments.length === 0) return;
  const attachDir = resolve(dirname(targetPath), name);
  for (const att of attachments) {
    const attPath = resolve(attachDir, att.filepath);
    mkdirSync(dirname(attPath), { recursive: true });
    const content = await downloadAttachment(pluralType, name, att.filepath);
    writeFileSync(attPath, content);
  }
  console.log(`  + ${attachments.length} attachment(s) → ${attachDir}`);
}

async function remove(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub remove <type> <name>");
    process.exit(1);
  }

  const pluralType = pluralize(type);
  const result = await removeEntry(pluralType, name);
  console.log(`Removed: ${result.deleted}`);
}

async function comment(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub comment <type> <name>");
    process.exit(1);
  }

  const pluralType = pluralize(type);
  const ratingStr = await prompt("Rating (1-5): ");
  const rating = parseInt(ratingStr, 10);
  if (!rating || rating < 1 || rating > 5) {
    console.error("Rating must be between 1 and 5.");
    process.exit(1);
  }

  const body = await prompt("Comment: ");
  if (!body) {
    console.error("Comment cannot be empty.");
    process.exit(1);
  }

  closeReadline();
  const result = await commentEntry(pluralType, name, { rating, body });
  console.log(`Comment added to ${type}/${name} (${rating}/5)`);
}

async function comments(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub comments <type> <name>");
    process.exit(1);
  }

  const pluralType = pluralize(type);
  const data = await getEntryComments(pluralType, name);

  if (data.rating.count === 0) {
    console.log(`\nNo comments for ${type}/${name}\n`);
    return;
  }

  console.log(`\n${type}/${name} — ${data.rating.average}/5 (${data.rating.count} review${data.rating.count !== 1 ? "s" : ""})\n`);
  for (const c of data.comments) {
    const stars = "\u2605".repeat(c.rating) + "\u2606".repeat(5 - c.rating);
    console.log(`  ${stars}  @${c.username}  ${c.created_at}`);
    console.log(`  ${c.body}\n`);
  }
}

function completions(args) {
  const shell = args[0] || "";
  const completionsDir = resolve(ROOT, "completions");

  if (shell === "bash") {
    console.log(readFileSync(resolve(completionsDir, "ihub.bash"), "utf-8"));
    return;
  }
  if (shell === "zsh") {
    console.log(readFileSync(resolve(completionsDir, "ihub.zsh"), "utf-8"));
    return;
  }

  console.log(`
ihub shell completions

Setup:

  Bash:
    source <(ihub completions bash)
    # Or add to ~/.bashrc:
    eval "$(ihub completions bash)"

  Zsh:
    source <(ihub completions zsh)
    # Or add to ~/.zshrc:
    eval "$(ihub completions zsh)"
`);
}

function man() {
  const manPath = resolve(ROOT, "man", "ihub.1.md");
  const content = readFileSync(manPath, "utf-8");
  console.log(renderMarkdown(content));
}

async function passwd() {
  const config = loadConfig();
  if (!config.token) {
    console.error("Not logged in. Run: ihub register <url> or ihub login <url>");
    process.exit(1);
  }

  const pw1 = await prompt("New password: ");
  if (!pw1 || pw1.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const pw2 = await prompt("Confirm password: ");
  if (pw1 !== pw2) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  await changePassword(pw1);

  // Update local config with new key
  config.token = pw1;
  saveConfig(config);
  closeReadline();
  console.log("Password updated and saved to ~/.ihubrc");
}

async function showConfig() {
  const cfg = await fetchServerConfig();
  console.log("");
  console.log("\x1b[1m\x1b[46m\x1b[30m Server Configuration \x1b[0m");
  console.log("");

  const features = [
    ["Server", `port ${cfg.server.port}`, true],
    ["Database", cfg.server.db_path, true],
    ["Admin", cfg.admin?.username || "(first registered user)", !!cfg.admin?.username],
    ["Auth0", cfg.auth0.enabled ? cfg.auth0.domain : "disabled", cfg.auth0.enabled],
    ["Slack", cfg.slack.enabled ? `digest every ${cfg.slack.digest_interval_hours}h` : "disabled", cfg.slack.enabled],
    ["Metrics", cfg.metrics.enabled ? "/api/metrics" : "disabled", cfg.metrics.enabled],
    ["Audit", cfg.audit.enabled ? `anonymous: ${cfg.audit.log_anonymous}` : "disabled", cfg.audit.enabled],
  ];

  for (const [name, detail, enabled] of features) {
    const status = enabled ? "\x1b[32m\u2713\x1b[0m" : "\x1b[31m\u2717\x1b[0m";
    console.log(`  ${status}  \x1b[1m${name.padEnd(12)}\x1b[0m ${detail}`);
  }
  console.log("");
}

async function audit(args) {
  const opts = { limit: 50, offset: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--user" && args[i + 1]) opts.user = args[++i];
    else if (args[i] === "--action" && args[i + 1]) opts.action = args[++i];
    else if (args[i] === "--page" && args[i + 1]) {
      const page = parseInt(args[++i], 10);
      if (page > 1) opts.offset = (page - 1) * opts.limit;
    }
    else if (args[i] === "--limit" && args[i + 1]) opts.limit = parseInt(args[++i], 10);
  }

  const data = await fetchAuditLog(opts);
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

function getActionColor(action) {
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

async function metrics(args) {
  const filters = parseFilters(args);
  const raw = await fetchMetrics();
  const parsed = parsePrometheus(raw);
  console.log(renderDashboard(parsed, filters));
}

async function backup(args) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = args[0] || `ihub-backup-${timestamp}.db`;

  await downloadBackup(outputPath);
  console.log(`Backup saved to: ${outputPath}`);
}

async function admin(args) {
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

  console.error("Usage: ihub admin <subcommand>");
  console.error("  set-role <username> <role>   Set user role (admin only)");
  console.error("  digest                       Send weekly digest to Slack (admin only)");
  process.exit(1);
}

async function register(args) {
  const [url] = args;
  if (!url) {
    console.error("Usage: ihub register <registry-url>");
    console.error("  Example: ihub register http://localhost:3000");
    process.exit(1);
  }

  const username = await prompt("Username: ");
  if (!username) {
    console.error("No username provided.");
    process.exit(1);
  }

  const base = url.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Registration failed: ${res.status}`);

  const config = loadConfig();
  config.registry = base;
  config.token = data.api_key;
  config.username = data.username;
  saveConfig(config);
  console.log(`Registered as "${data.username}" and saved config to ~/.ihubrc`);
}

async function login(args) {
  const useAuth0 = args.includes("--auth0");
  const filtered = args.filter((a) => a !== "--auth0");
  const [url] = filtered;

  if (!url) {
    console.error("Usage: ihub login <registry-url> [--auth0]");
    console.error("  Example: ihub login http://localhost:3000");
    console.error("  Example: ihub login http://localhost:3000 --auth0");
    process.exit(1);
  }

  const base = url.replace(/\/+$/, "");

  if (useAuth0) {
    await loginAuth0(base);
    return;
  }

  const token = await prompt("API key: ");
  if (!token) {
    console.error("No API key provided.");
    process.exit(1);
  }

  // Verify the key and get username
  const res = await fetch(`${base}/api/whoami`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Invalid API key");

  const config = loadConfig();
  config.registry = base;
  config.token = token;
  config.username = data.username;
  saveConfig(config);
  console.log(`Logged in as "${data.username}" — saved config to ~/.ihubrc`);
}

async function loginAuth0(registryUrl) {
  // Read Auth0 config from env
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const audience = process.env.AUTH0_AUDIENCE || "ihub-api";

  if (!domain || !clientId) {
    console.error("Auth0 login requires AUTH0_DOMAIN and AUTH0_CLIENT_ID environment variables.");
    console.error("  Example: AUTH0_DOMAIN=myapp.auth0.com AUTH0_CLIENT_ID=abc123 ihub login http://localhost:3000 --auth0");
    process.exit(1);
  }

  // Step 1: Request device code
  const codeRes = await fetch(`https://${domain}/oauth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      scope: "openid profile email",
      audience,
    }),
  });
  const codeData = await codeRes.json();
  if (!codeRes.ok) throw new Error(codeData.error_description || "Device code request failed");

  // Step 2: Show user the verification URL
  console.log("");
  console.log("\x1b[1mAuth0 Device Login\x1b[0m");
  console.log("");
  console.log(`  Open this URL in your browser:`);
  console.log(`  \x1b[4m\x1b[34m${codeData.verification_uri_complete}\x1b[0m`);
  console.log("");
  console.log(`  Or go to \x1b[4m${codeData.verification_uri}\x1b[0m and enter code: \x1b[1m${codeData.user_code}\x1b[0m`);
  console.log("");
  console.log("\x1b[2mWaiting for authorization...\x1b[0m");

  // Step 3: Poll for token
  const interval = (codeData.interval || 5) * 1000;
  const expiresAt = Date.now() + codeData.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, interval));

    const tokenRes = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: codeData.device_code,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      // Step 4: Verify with the ihub server
      const whoamiRes = await fetch(`${registryUrl}/api/whoami`, {
        headers: { "Authorization": `Bearer ${tokenData.access_token}` },
      });
      const whoamiData = await whoamiRes.json();
      if (!whoamiRes.ok) throw new Error(whoamiData.error || "Server rejected Auth0 token");

      const config = loadConfig();
      config.registry = registryUrl;
      config.token = tokenData.access_token;
      config.username = whoamiData.username;
      config.auth0 = { domain, clientId, audience };
      if (tokenData.refresh_token) config.auth0.refreshToken = tokenData.refresh_token;
      saveConfig(config);
      console.log(`\x1b[32mLogged in as "${whoamiData.username}" via Auth0 — saved to ~/.ihubrc\x1b[0m`);
      return;
    }

    if (tokenData.error === "authorization_pending") continue;
    if (tokenData.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    throw new Error(tokenData.error_description || tokenData.error || "Auth0 login failed");
  }

  throw new Error("Auth0 login timed out. Please try again.");
}

async function whoami() {
  const config = loadConfig();
  if (!config.token) {
    console.error("Not logged in. Run: ihub register <url> or ihub login <url>");
    process.exit(1);
  }

  const base = config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
  const res = await fetch(`${base.replace(/\/+$/, "")}/api/whoami`, {
    headers: { "Authorization": `Bearer ${config.token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Not authenticated");
  console.log(`Logged in as: ${data.username} (${data.role})`);
  console.log(`Registry: ${base}`);
}

function version() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  console.log(`ihub v${pkg.version}`);
  const link = `\x1b]8;;https://www.wecloud.es/\x07WeCloud\x1b]8;;\x07`;
  console.log(`Made with <3 by ${link}`);
  console.log(`Cloud made simple`);
}

function help() {
  console.log(`
ihub — registry for agents, skills, rules, memories, and prompts

Commands:
  browse                     Interactive TUI browser for the registry
  list [type]                 List entries (agents, skills, rules, memories, prompts, or all)
  search <query>              Full-text search across local entries
  show <type> <name>          Show metadata for a specific entry
  preview <type> <name>       Render an entry with markdown formatting
  validate                    Check all entries for missing fields and broken refs
  projects [name]             Tree view of all projects and their artifacts
  create <type> <name> [-i]   Create a new entry (-i for interactive)
  import <type> <path> [-i]  Import from external path (auto-push, -i for metadata prompts)
  push <type> <name>          Publish a local entry to the registry
  pull <type> <name[:ver]>    Download an entry (--local or --global)
  remove <type> <name>        Remove an entry (owner only)
  comment <type> <name>       Add a comment with rating (1-5)
  comments <type> <name>      View comments and average rating
  search --remote <query>     Search the remote registry
  register <url>              Create account and save API key
  login <url> [--auth0]       Log in with API key or Auth0 device flow
  passwd                     Change password (API key)
  whoami                      Show current user and registry
  config                     Show server config and enabled features (admin)
  audit [--user U] [--action A] [--page N] [--limit N]
                              View audit trail (admin only, paginated)
  metrics [--type T] [--user U] [--name N] [--project P]
                              Show server metrics dashboard (filterable)
  backup [path]               Download a full DB backup (admin only)
  admin set-role <user> <role> Set user role (admin only)
  admin digest               Send weekly digest to Slack (admin only)
  completions [bash|zsh]      Output shell completions
  man                        Full manual page
  version                     Show version info

Type-first syntax (equivalent):
  ihub agents list            Same as: ihub list agents
  ihub agent show <name>      Same as: ihub show agent <name>
  ihub skill create <name> [-i]  Same as: ihub create skill <name> [-i]
  ihub rule push <name>       Same as: ihub push rule <name>
  ihub memory pull <name>     Same as: ihub pull memory <name>

Types: agent(s), skill(s), rule(s), memory/memories, prompt(s)
`);
}
