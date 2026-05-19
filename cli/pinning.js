// Artifact pinning and bundle export/import functions
import { resolve, dirname } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { loadConfig, saveConfig, pullEntry, pushEntry, entryToMarkdown } from "./registry.js";
import { loadRegistry } from "./parse.js";

const PLURAL_MAP = {
  agent: "agents", skill: "skills", rule: "rules",
  memory: "memories", prompt: "prompts",
};
const SINGULAR_MAP = Object.fromEntries(
  Object.entries(PLURAL_MAP).map(([s, p]) => [p, s])
);

function pluralize(type) {
  return PLURAL_MAP[type] || type;
}

function singularize(type) {
  return SINGULAR_MAP[type] || type;
}

export function pin(args, ROOT) {
  const [type, name, versionArg] = args;
  if (!type || !name) {
    console.error("Usage: ihub pin <type> <name> [version]");
    process.exit(1);
  }

  const pluralType = pluralize(singularize(type));
  const validTypes = ["agents", "skills", "rules", "memories", "prompts"];
  if (!validTypes.includes(pluralType)) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  let pinVersion = versionArg;
  if (!pinVersion) {
    const registry = loadRegistry(ROOT);
    const entries = registry[pluralType];
    const entry = entries ? entries.find((e) => (e.name || e.file) === name) : null;
    if (entry && entry.version) {
      pinVersion = entry.version;
    } else {
      console.error("No version specified and no local version found. Usage: ihub pin <type> <name> <version>");
      process.exit(1);
    }
  }

  const config = loadConfig();
  if (!config.pins) config.pins = {};
  const pinKey = `${pluralType}/${name}`;
  config.pins[pinKey] = pinVersion;
  saveConfig(config);
  console.log(`Pinned ${pinKey} to ${pinVersion}`);
}

export function unpin(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub unpin <type> <name>");
    process.exit(1);
  }

  const pluralType = pluralize(singularize(type));
  const config = loadConfig();
  const pinKey = `${pluralType}/${name}`;

  if (!config.pins || !config.pins[pinKey]) {
    console.error(`Not pinned: ${pinKey}`);
    process.exit(1);
  }

  delete config.pins[pinKey];
  if (Object.keys(config.pins).length === 0) delete config.pins;
  saveConfig(config);
  console.log(`Unpinned ${pinKey} (will pull latest on next pull)`);
}

export function pins() {
  const config = loadConfig();
  const pinned = config.pins || {};
  const entries = Object.entries(pinned);

  if (entries.length === 0) {
    console.log("No pinned artifacts.");
    return;
  }

  console.log(`\nPinned artifacts (${entries.length}):\n`);
  for (const [key, ver] of entries) {
    console.log(`  ${key} → ${ver}`);
  }
  console.log();
}

export async function exportBundle(args, ROOT) {
  let projectFilter = null;
  let typeFilter = null;
  let outputPath = null;
  let nameFilters = [];
  let fromUrl = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) projectFilter = args[++i];
    else if (args[i] === "--type" && args[i + 1]) typeFilter = args[++i];
    else if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) outputPath = args[++i];
    else if (args[i] === "--name" && args[i + 1]) nameFilters.push(args[++i]);
    else if (args[i] === "--from" && args[i + 1]) fromUrl = args[++i];
  }

  const config = loadConfig();
  const base = (fromUrl || config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
  const token = fromUrl ? "" : (config.token || process.env.IHUB_TOKEN || "");
  const validTypes = ["agents", "skills", "rules", "memories", "prompts"];
  const types = typeFilter ? [pluralize(singularize(typeFilter))] : validTypes;

  if (fromUrl) {
    console.error(`Exporting from: ${base}`);
  }

  const artifacts = [];

  for (const type of types) {
    if (!validTypes.includes(type)) continue;

    let entries;
    try {
      const url = projectFilter
        ? `${base}/api/${type}?project=${encodeURIComponent(projectFilter)}`
        : `${base}/api/${type}`;
      const h = { "Content-Type": "application/json" };
      if (token) h["Authorization"] = `Bearer ${token}`;
      const res = await fetch(url, { headers: h });
      if (!res.ok) continue;
      entries = await res.json();
    } catch {
      continue;
    }

    if (!Array.isArray(entries)) continue;

    for (const e of entries) {
      const entryName = e.name || e.meta?.name;
      if (!entryName) continue;

      if (projectFilter && e.meta?.project !== projectFilter && e.project !== projectFilter) continue;
      if (nameFilters.length > 0 && !nameFilters.includes(entryName)) continue;

      try {
        const fullEntry = await pullEntry(type, entryName);
        artifacts.push({
          type,
          name: entryName,
          version: fullEntry.meta?.version || e.version || "0.1.0",
          description: fullEntry.meta?.description || e.description || "",
          tags: fullEntry.meta?.tags || e.tags || [],
          meta: fullEntry.meta || {},
          body: fullEntry.body || "",
          attachments: fullEntry.attachments || [],
        });
      } catch {
        // skip entries we can't fetch
      }
    }
  }

  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  const bundle = {
    ihub_version: pkg.version,
    exported_at: new Date().toISOString(),
    source: base,
    filters: {
      ...(projectFilter && { project: projectFilter }),
      ...(typeFilter && { type: typeFilter }),
      ...(nameFilters.length > 0 && { names: nameFilters }),
    },
    artifacts,
  };

  const json = JSON.stringify(bundle, null, 2);

  if (outputPath) {
    writeFileSync(outputPath, json + "\n");
    console.log(`Exported ${artifacts.length} artifact(s) to ${outputPath}`);
  } else {
    console.log(json);
  }
}

export async function importBundle(args, ROOT) {
  const noPush = args.includes("--no-push");
  const filtered = args.filter((a) => a !== "--no-push");
  const [filePath] = filtered;

  if (!filePath) {
    console.error("Usage: ihub import <file.json> [--no-push]");
    process.exit(1);
  }

  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  let bundle;
  try {
    bundle = JSON.parse(readFileSync(absPath, "utf-8"));
  } catch (err) {
    console.error(`Failed to parse bundle: ${err.message}`);
    process.exit(1);
  }

  if (!bundle.artifacts || !Array.isArray(bundle.artifacts)) {
    console.error("Invalid bundle: missing artifacts array");
    process.exit(1);
  }

  console.log(`Importing bundle (${bundle.artifacts.length} artifacts, ihub v${bundle.ihub_version || "unknown"})`);

  for (const artifact of bundle.artifacts) {
    const { type, name, meta, body } = artifact;
    if (!type || !name) {
      console.error(`  Skipping invalid artifact (missing type or name)`);
      continue;
    }

    const bPluralType = type.endsWith("s") ? type : pluralize(type);

    // Build markdown
    const lines = ["---"];
    const metaObj = meta || {};
    for (const [key, value] of Object.entries(metaObj)) {
      if (Array.isArray(value)) {
        lines.push(`${key}: [${value.join(", ")}]`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push("---");
    lines.push("");
    if (body) lines.push(body);
    const markdown = lines.join("\n");

    // Save locally
    const targetDir = resolve(ROOT, bPluralType);
    mkdirSync(targetDir, { recursive: true });
    const targetPath = resolve(targetDir, `${name}.md`);
    writeFileSync(targetPath, markdown);
    console.log(`  Saved ${bPluralType}/${name} → ${targetPath}`);

    // Push to registry unless --no-push
    if (!noPush) {
      try {
        const registry = loadRegistry(ROOT);
        const entry = registry[bPluralType]?.find((e) => (e.name || e.file) === name);
        if (entry) {
          const result = await pushEntry(bPluralType, entry);
          console.log(`  Pushed ${bPluralType}/${name}@${result.version}`);
        }
      } catch (err) {
        console.error(`  Push failed for ${bPluralType}/${name}: ${err.message}`);
      }
    }
  }

  console.log(`\nImport complete. ${bundle.artifacts.length} artifact(s) processed.`);
}
