import { resolve, dirname, join, basename } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from "fs";
import { CODING_AGENTS } from "./agents-config.js";
import { pushEntry, pullEntry, entryToMarkdown } from "./registry.js";
import { ROOT, TYPE_FIELDS, pluralize, prompt, closeReadline } from "./context.js";
import { importBundle as importBundleCmd } from "./pinning.js";

export async function create(args) {
  const interactive = args.includes("--interactive") || args.includes("-i");

  // Parse --from flag
  let fromName = null;
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--interactive" || args[i] === "-i") continue;
    if (args[i] === "--from" && args[i + 1]) { fromName = args[++i]; continue; }
    filtered.push(args[i]);
  }

  let [type, name] = filtered;

  const validTypes = ["agent", "command", "design", "hook", "mcp", "memory", "prompt", "rule", "skill"];

  if (interactive && !type) {
    type = await prompt(`Type (${validTypes.join(", ")}): `);
  }
  if (!type) {
    console.error("Usage: ihub create <agent|command|design|hook|mcp|memory|prompt|rule|skill> <name> [--interactive|-i]");
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

  // --from: create from registry template
  if (fromName) {
    await createFromTemplate(type, name, fromName, targetPath, interactive);
    return;
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

export function detectSourceAgent(path) {
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

export function mapSourceFields(sourceAgent, type, sourceMeta) {
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
      mapped.globs = String(sourceMeta.globs).replace(/^["']|["']$/g, "");
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

export async function importArtifact(args) {
  // Route to bundle import if first non-flag arg is a .json file
  const nonFlagArgs = args.filter((a) => !a.startsWith("-"));
  if (nonFlagArgs.length >= 1 && nonFlagArgs[0].endsWith(".json")) {
    return importBundleCmd(args, ROOT);
  }

  const interactive = args.includes("-i") || args.includes("--interactive");
  const noPush = args.includes("--no-push");
  const filtered = args.filter((a) => a !== "-i" && a !== "--interactive" && a !== "--no-push");

  const [type, sourcePath] = filtered;
  if (!type || !sourcePath) {
    console.error("Usage: ihub import <type> <path> [-i] [--no-push]");
    console.error("       ihub import <bundle.json> [--no-push]");
    console.error("");
    console.error("  Import from coding agent:");
    console.error("    ihub import skill ~/.claude/skills/docx/");
    console.error("    ihub import rule .cursor/rules/my-rule.mdc");
    console.error("");
    console.error("  Import from JSON bundle (created by ihub export):");
    console.error("    ihub import bundle.json");
    console.error("    ihub import bundle.json --no-push");
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

export function collectCompanionFiles(dir, baseDir, excludeFile, result) {
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

export async function createFromTemplate(type, name, fromName, targetPath, interactive) {
  const pluralType = pluralize(type);

  // Fetch the template artifact from registry
  let entry;
  try {
    entry = await pullEntry(pluralType, fromName);
  } catch (err) {
    console.error(`Failed to fetch template "${fromName}" from registry: ${err.message}`);
    process.exit(1);
  }

  const templateMeta = entry.meta || {};
  const templateBody = entry.body || "";

  // Build new metadata: keep everything from template but replace name and reset version
  const values = { ...templateMeta, name, version: "0.1.0" };

  if (interactive) {
    const fields = TYPE_FIELDS[type];
    console.log(`\nCreating ${type}: ${name} (from template: ${fromName})\n`);

    for (const field of fields) {
      const currentVal = values[field.key];
      const defaultVal = currentVal
        ? (Array.isArray(currentVal) ? currentVal.join(", ") : String(currentVal))
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

  const content = frontmatter.join("\n") + "\n\n" + templateBody + "\n";
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content);
  console.log(`Created: ${targetPath} (from template: ${fromName})`);
}
