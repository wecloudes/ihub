import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, extname, basename } from "path";

/**
 * Parse YAML frontmatter from a markdown string.
 * Handles simple YAML (strings, arrays, booleans, numbers) without dependencies.
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { meta: {}, body: content };

  const yamlStr = match[1];
  const body = content.slice(match[0].length).trim();
  const meta = {};

  for (const line of yamlStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // inline array: [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (value === "true") {
      value = true;
    } else if (value === "false") {
      value = false;
    } else if (value !== "" && !isNaN(Number(value))) {
      value = Number(value);
    }

    meta[key] = value;
  }

  return { meta, body };
}

/**
 * Load all markdown entries from a directory.
 */
export function loadEntries(dir) {
  const entries = [];
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return entries;
  }

  for (const file of files) {
    if (extname(file) !== ".md") continue;
    const filePath = join(dir, file);
    if (!statSync(filePath).isFile()) continue;

    const content = readFileSync(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(content);
    entries.push({
      file: basename(file, ".md"),
      path: filePath,
      ...meta,
      body,
    });
  }

  return entries;
}

/**
 * Load the full registry from the project root.
 */
export function loadRegistry(root) {
  return {
    agents: loadEntries(join(root, "agents")),
    skills: loadEntries(join(root, "skills")),
    rules: loadEntries(join(root, "rules")),
    memories: loadEntries(join(root, "memories")),
    prompts: loadEntries(join(root, "prompts")),
  };
}
