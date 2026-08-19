import { resolve, dirname, join, basename } from "path";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, cpSync,
} from "fs";
import { loadPlugin } from "./parse.js";
import { ROOT, PLUGIN_FIELDS, PLUGIN_NAME_RE, prompt, closeReadline } from "./context.js";
import { importBundle as importBundleCmd } from "./pinning.js";

const TEMPLATE_DIR = resolve(ROOT, "templates", "plugin");

// --- create ---

export async function create(args) {
  const interactive = args.includes("--interactive") || args.includes("-i");
  // Ignore any --from template flag; not supported for plugins.
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--interactive" || args[i] === "-i") continue;
    if (args[i] === "--from") { i++; continue; }
    positional.push(args[i]);
  }

  let [name] = positional;
  if (interactive && !name) name = await prompt("Plugin name (kebab-case): ");
  if (!name) {
    console.error("Usage: ihub create <name> [--interactive|-i]");
    process.exit(1);
  }
  if (!PLUGIN_NAME_RE.test(name)) {
    console.error(`Invalid name "${name}" — plugin names must be kebab-case [a-z0-9-] (no ":").`);
    process.exit(1);
  }

  const pluginDir = resolve(ROOT, "plugins", name);
  if (existsSync(pluginDir)) {
    console.error(`Already exists: ${pluginDir}`);
    process.exit(1);
  }

  // Gather manifest values
  const values = { name };
  if (interactive) {
    console.log(`\nCreating plugin: ${name}\n`);
    for (const field of PLUGIN_FIELDS) {
      const defaultHint = field.default ? ` (${field.default})` : "";
      const requiredHint = field.required ? " *" : "";
      const answer = await prompt(`${field.label}${requiredHint}${defaultHint}: `);
      if (field.type === "array") {
        values[field.key] = answer ? answer.split(",").map((s) => s.trim()).filter(Boolean) : [];
      } else {
        values[field.key] = answer || field.default || "";
      }
      if (field.required && !values[field.key]) {
        console.error(`${field.label} is required.`);
        process.exit(1);
      }
    }
    closeReadline();
  } else {
    for (const field of PLUGIN_FIELDS) {
      values[field.key] = field.type === "array" ? [] : (field.default || "");
    }
    if (!values.description) values.description = `The ${name} plugin`;
  }

  scaffoldPlugin(pluginDir, values);
  console.log(`Created: ${pluginDir}`);
  console.log(`  Edit .claude-plugin/plugin.json, then: ihub push ${name}`);
}

// Copy templates/plugin/ into the target dir, filling manifest + README
// placeholders. Falls back to a minimal inline scaffold if the template dir
// is absent.
function scaffoldPlugin(pluginDir, values) {
  if (existsSync(TEMPLATE_DIR)) {
    cpSync(TEMPLATE_DIR, pluginDir, { recursive: true });
  } else {
    writeMinimalScaffold(pluginDir);
  }

  // Write the manifest from gathered values (authoritative over template).
  const manifest = {
    name: values.name,
    displayName: values.displayName || values.name,
    version: values.version || "0.1.0",
    description: values.description || "",
    ...(values.author && { author: { name: values.author } }),
    ...(values.homepage && { homepage: values.homepage }),
    ...(values.repository && { repository: values.repository }),
    license: values.license || "MIT",
    keywords: Array.isArray(values.keywords) ? values.keywords : [],
    ...(values.project && { project: values.project }),
  };
  const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  // Fill README placeholders.
  const readmePath = join(pluginDir, "README.md");
  if (existsSync(readmePath)) {
    let readme = readFileSync(readmePath, "utf-8");
    readme = readme.replace(/\{\{name\}\}/g, values.name).replace(/\{\{description\}\}/g, values.description || "");
    writeFileSync(readmePath, readme);
  } else {
    writeFileSync(readmePath, `# ${values.name}\n\n${values.description || ""}\n`);
  }
}

function writeMinimalScaffold(pluginDir) {
  mkdirSync(join(pluginDir, ".claude-plugin"), { recursive: true });
  mkdirSync(join(pluginDir, "skills", "example-skill"), { recursive: true });
  mkdirSync(join(pluginDir, "commands"), { recursive: true });
  writeFileSync(join(pluginDir, "skills", "example-skill", "SKILL.md"),
    "---\ndescription: One-line description of what this skill does and when to use it\n---\n\n# Example Skill\n\nExplain the capability this skill adds.\n");
  writeFileSync(join(pluginDir, "commands", "example-command.md"),
    "---\ndescription: One-line description of this command\n---\n\nDescribe what running this command does.\n");
  writeFileSync(join(pluginDir, ".mcp.json"),
    JSON.stringify({ "example-server": { command: "npx", args: ["-y", "@example/mcp-server@latest"], env: { API_KEY: "${API_KEY}" } } }, null, 2) + "\n");
  mkdirSync(join(pluginDir, "hooks"), { recursive: true });
  writeFileSync(join(pluginDir, "hooks", "hooks.json"),
    JSON.stringify({ hooks: { PostToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: "echo edited" }] }] } }, null, 2) + "\n");
}

// --- import ---

export async function importArtifact(args) {
  const nonFlag = args.filter((a) => !a.startsWith("-"));
  if (nonFlag.length >= 1 && nonFlag[0].endsWith(".json")) {
    return importBundleCmd(args, ROOT);
  }

  const noPush = args.includes("--no-push");
  const filtered = args.filter((a) => a !== "--no-push" && a !== "-i" && a !== "--interactive");
  const [sourcePath] = filtered;

  if (!sourcePath) {
    console.error("Usage: ihub import <path> [--no-push]");
    console.error("       ihub import <bundle.json> [--no-push]");
    console.error("");
    console.error("  Import an existing Claude plugin directory:");
    console.error("    ihub import ~/some-plugin/          # has .claude-plugin/plugin.json");
    console.error("  Import a single component (wrapped into a new plugin):");
    console.error("    ihub import ~/.claude/skills/docx/  # a SKILL.md dir");
    process.exit(1);
  }

  const absPath = resolve(sourcePath);
  if (!existsSync(absPath)) {
    console.error(`Source not found: ${absPath}`);
    process.exit(1);
  }
  const st = statSync(absPath);

  let name;
  if (st.isDirectory() && existsSync(join(absPath, ".claude-plugin", "plugin.json"))) {
    // Full Claude plugin — copy verbatim.
    let manifest = {};
    try { manifest = JSON.parse(readFileSync(join(absPath, ".claude-plugin", "plugin.json"), "utf-8")); } catch {}
    name = manifest.name || basename(absPath);
    const dest = resolve(ROOT, "plugins", name);
    if (existsSync(dest)) { console.error(`Already exists: ${dest}`); process.exit(1); }
    cpSync(absPath, dest, { recursive: true });
    console.log(`Imported plugin ${name} → ${dest}`);
  } else {
    // Single component — wrap into a new plugin.
    name = await wrapComponentAsPlugin(absPath, st);
  }

  if (!noPush) {
    try {
      const { push } = await import("./publish.js");
      await push([name]);
    } catch (err) {
      console.error(`Push failed: ${err.message}`);
      console.error(`Files saved locally. Push manually with: ihub push ${name}`);
    }
  } else {
    console.log(`\nSkipped push. Run manually: ihub push ${name}`);
  }
  return name;
}

// Wrap a lone component (a SKILL.md dir, a skill/command/agent .md file, or a
// bare component tree missing a manifest) into a new plugins/<name>/ directory.
async function wrapComponentAsPlugin(absPath, st) {
  const dirName = basename(absPath).replace(/\.(md|mdc)$/i, "");
  const name = dirName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "imported-plugin";
  const dest = resolve(ROOT, "plugins", name);
  if (existsSync(dest)) { console.error(`Already exists: ${dest}`); process.exit(1); }

  let description = `Imported plugin ${name}`;

  if (st.isDirectory() && existsSync(join(absPath, "SKILL.md"))) {
    // A skill directory → skills/<name>/
    const skillDest = join(dest, "skills", name);
    cpSync(absPath, skillDest, { recursive: true });
    description = readSkillDescription(join(skillDest, "SKILL.md")) || description;
  } else if (st.isDirectory() && (existsSync(join(absPath, "skills")) || existsSync(join(absPath, "commands")) || existsSync(join(absPath, "agents")))) {
    // A component tree missing a manifest → copy component dirs.
    for (const sub of ["skills", "commands", "agents", "hooks"]) {
      if (existsSync(join(absPath, sub))) cpSync(join(absPath, sub), join(dest, sub), { recursive: true });
    }
    if (existsSync(join(absPath, ".mcp.json"))) cpSync(join(absPath, ".mcp.json"), join(dest, ".mcp.json"));
  } else if (st.isFile() && /SKILL\.md$/i.test(absPath)) {
    const skillDest = join(dest, "skills", name);
    mkdirSync(skillDest, { recursive: true });
    cpSync(absPath, join(skillDest, "SKILL.md"));
    description = readSkillDescription(join(skillDest, "SKILL.md")) || description;
  } else if (st.isFile() && /\.(md|mdc)$/i.test(absPath)) {
    // A lone markdown file → treat as a command.
    mkdirSync(join(dest, "commands"), { recursive: true });
    cpSync(absPath, join(dest, "commands", `${name}.md`));
  } else {
    console.error(`Unsupported source: ${absPath} (expected a plugin dir, a SKILL.md dir, or a component file)`);
    process.exit(1);
  }

  // Synthesize the manifest + README.
  mkdirSync(join(dest, ".claude-plugin"), { recursive: true });
  writeFileSync(join(dest, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name, displayName: name, version: "0.1.0", description, license: "MIT", keywords: [] }, null, 2) + "\n");
  if (!existsSync(join(dest, "README.md"))) {
    writeFileSync(join(dest, "README.md"), `# ${name}\n\n${description}\n`);
  }
  console.log(`Wrapped component into plugin ${name} → ${dest}`);
  return name;
}

function readSkillDescription(skillPath) {
  try {
    const content = readFileSync(skillPath, "utf-8");
    const m = content.match(/^description:\s*(.+)$/m);
    return m ? m[1].trim() : "";
  } catch { return ""; }
}
