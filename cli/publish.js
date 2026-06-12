import { resolve, dirname, basename } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, watch as fsWatch, rmSync, symlinkSync } from "fs";
import { homedir } from "os";
import { CODING_AGENTS, AGENT_NAMES, getInstallPath, getConfigTarget } from "./agents-config.js";
import { mergeObjectEntry, mergeArrayEntry, resolveMcpConfig, resolveHookEntries, toOpencodeMcpEntry } from "./config-merge.js";
import { maskSensitiveData, formatFindings } from "../server/sensitive.js";
import {
  pushEntry, pullEntry, removeEntry, commentEntry, getEntryComments,
  downloadAttachment, entryToMarkdown, loadConfig, saveConfig,
  getBaseUrl, getToken, authHeaders,
} from "./registry.js";
import { loadRegistry } from "./parse.js";
import { ROOT, pluralize, singularize, prompt, closeReadline, parseJsonFlag } from "./context.js";

export async function push(args) {
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

  // Diff on push: fetch current version and show changes
  if (!force) {
    const diffShown = await showPushDiff(pluralType, name, entry);
    if (diffShown) {
      const answer = await prompt("Proceed with push? [y/N]: ", "n");
      if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
        closeReadline();
        console.log("Push cancelled.");
        return;
      }
      closeReadline();
    }
  }

  const result = await pushEntry(pluralType, entry);
  const ver = result.version;
  console.log(`Pushed ${pluralType}/${name}@${ver}`);

  if (findings.length > 0) {
    console.log(`\x1b[41m\x1b[37m\x1b[1m ⚠ BLOCKED \x1b[0m ${findings.length} sensitive value(s) masked — artifact requires admin approval`);
    console.log(`\x1b[2mAn admin must run: ihub admin approve ${pluralType}/${name}\x1b[0m`);
  }
}

export async function showPushDiff(pluralType, name, localEntry) {
  const base = getBaseUrl();

  try {
    const hdrs = { "Content-Type": "application/json", ...authHeaders() };
    const res = await fetch(`${base}/api/${pluralType}/${name}`, { headers: hdrs });
    if (!res.ok) {
      if (res.status === 404) {
        console.log(`\n\x1b[32mNew artifact\x1b[0m — ${pluralType}/${name} does not exist on registry yet.\n`);
        return false;
      }
      return false;
    }

    const remote = await res.json();
    let hasDiff = false;

    // Compare metadata
    const metaChanges = [];
    if (remote.description !== (localEntry.description || "")) {
      metaChanges.push(`  description: "${remote.description || ""}" -> "${localEntry.description || ""}"`);
    }
    const remoteTags = Array.isArray(remote.tags) ? remote.tags.join(", ") : "";
    const localTags = Array.isArray(localEntry.tags) ? localEntry.tags.join(", ") : "";
    if (remoteTags !== localTags) {
      metaChanges.push(`  tags: [${remoteTags}] -> [${localTags}]`);
    }
    if (remote.version !== (localEntry.version || "0.1.0")) {
      metaChanges.push(`  version: ${remote.version} -> ${localEntry.version || "0.1.0"}`);
    }

    if (metaChanges.length > 0) {
      hasDiff = true;
      console.log(`\n\x1b[1mMetadata changes:\x1b[0m`);
      for (const change of metaChanges) {
        console.log(`\x1b[33m~${change}\x1b[0m`);
      }
    }

    // Compare body content line by line
    const remoteLines = (remote.body || "").split("\n");
    const localLines = (localEntry.body || "").split("\n");
    const diffLines = computeSimpleDiff(remoteLines, localLines);

    if (diffLines.length > 0) {
      hasDiff = true;
      console.log(`\n\x1b[1mBody changes:\x1b[0m`);
      for (const line of diffLines) {
        if (line.startsWith("+")) {
          console.log(`\x1b[32m${line}\x1b[0m`);
        } else if (line.startsWith("-")) {
          console.log(`\x1b[31m${line}\x1b[0m`);
        } else {
          console.log(line);
        }
      }
    }

    if (!hasDiff) {
      console.log(`\n\x1b[2mNo changes detected — content is identical to remote.\x1b[0m\n`);
    } else {
      console.log("");
    }

    return hasDiff;
  } catch {
    return false;
  }
}

export function computeSimpleDiff(oldLines, newLines) {
  const result = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi >= oldLines.length) {
      result.push(`+ ${newLines[ni]}`);
      ni++;
    } else if (ni >= newLines.length) {
      result.push(`- ${oldLines[oi]}`);
      oi++;
    } else if (oldLines[oi] === newLines[ni]) {
      oi++;
      ni++;
    } else {
      let foundInNew = -1;
      for (let k = ni + 1; k < Math.min(ni + 5, newLines.length); k++) {
        if (newLines[k] === oldLines[oi]) { foundInNew = k; break; }
      }
      let foundInOld = -1;
      for (let k = oi + 1; k < Math.min(oi + 5, oldLines.length); k++) {
        if (oldLines[k] === newLines[ni]) { foundInOld = k; break; }
      }

      if (foundInNew !== -1 && (foundInOld === -1 || foundInNew - ni <= foundInOld - oi)) {
        while (ni < foundInNew) {
          result.push(`+ ${newLines[ni]}`);
          ni++;
        }
      } else if (foundInOld !== -1) {
        while (oi < foundInOld) {
          result.push(`- ${oldLines[oi]}`);
          oi++;
        }
      } else {
        result.push(`- ${oldLines[oi]}`);
        result.push(`+ ${newLines[ni]}`);
        oi++;
        ni++;
      }
    }
  }

  return result;
}

export function globalPath(pluralType) {
  return resolve(homedir(), ".claude", pluralType);
}

export async function pull(args) {
  // Parse flags
  let destination;
  let agentFlags = [];
  let noDeps = false;
  let yes = false;
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--local" || args[i] === "-l") destination = "local";
    else if (args[i] === "--global" || args[i] === "-g") destination = "global";
    else if (args[i] === "--agent" && args[i + 1]) agentFlags.push(args[++i]);
    else if (args[i] === "--no-deps") noDeps = true;
    else if (args[i] === "--yes" || args[i] === "-y") yes = true;
    else filtered.push(args[i]);
  }

  // Handle URL-based pull: ihub pull https://registry.example.com/api/skills/lint-check
  const firstArg = filtered[0];
  if (firstArg && (firstArg.startsWith("http://") || firstArg.startsWith("https://"))) {
    await pullFromUrl(firstArg, destination);
    return;
  }

  const [type, nameArg] = filtered;
  if (!type || !nameArg) {
    console.error("Usage: ihub pull <type> <name[:version]> [--local|--global] [--agent <name>...] [--no-deps] [--yes]");
    console.error("  Or:    ihub pull <url>");
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
  const validTypes = ["agents", "commands", "designs", "hooks", "mcps", "memories", "prompts", "rules", "skills"];
  if (!validTypes.includes(pluralType)) {
    console.error(`Unknown type: ${type}`);
    process.exit(1);
  }

  // Check if artifact is pinned (only if no explicit version given)
  let pullVersion = version;
  if (!version) {
    const cfg = loadConfig();
    const pinKey = `${pluralType}/${name}`;
    if (cfg.pins && cfg.pins[pinKey]) {
      pullVersion = cfg.pins[pinKey];
      console.log(`Pinned to ${pullVersion} (use ihub unpin to get latest)`);
    }
  }

  const entry = await pullEntry(pluralType, name, pullVersion);
  const markdown = entryToMarkdown(entry);
  const ver = entry.meta?.version || "latest";

  // Show signature verification status if present
  if (entry.verified === true) {
    console.log("\x1b[32m✓ Signature verified\x1b[0m");
  } else if (entry.verified === false) {
    console.log("\x1b[33m⚠ Signature verification failed — artifact may have been tampered with\x1b[0m");
  }

  // Memories always go to the local working directory — no agent paths, no prompt
  if (singularType === "memory") {
    const targetPath = resolve(ROOT, pluralType, `${name}.md`);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, markdown);
    console.log(`Pulled ${pluralType}/${name}@${ver} → ${targetPath}`);
    await downloadAttachmentsTo(pluralType, name, targetPath, entry.attachments);
    return;
  }

  // Designs always install as DESIGN.md in the project root — global not supported
  if (singularType === "design") {
    if (destination === "global") {
      console.error("Designs can only be pulled into the project directory, not globally.");
      process.exit(1);
    }
    const targetPath = resolve(ROOT, "DESIGN.md");
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

  // Install for each selected agent — prioritize Claude, symlink duplicates
  // Sort agents: claude first, then others
  const sortedAgents = [...agents].sort((a, b) => {
    if (a === "claude") return -1;
    if (b === "claude") return 1;
    return 0;
  });

  // MCP servers and hooks merge into shared agent config files instead of
  // writing standalone artifact files
  if (pluralType === "mcps" || pluralType === "hooks") {
    if (pluralType === "hooks") {
      const ok = await confirmHookInstall(entry, name, yes);
      if (!ok) {
        console.log("Hook install cancelled.");
        return;
      }
    }
    let merged = 0;
    for (const agent of sortedAgents) {
      if (installConfigArtifact(agent, pluralType, name, entry, destination)) merged++;
    }
    // Keep a tracking copy in the local working directory
    const trackPath = resolve(ROOT, pluralType, `${name}.md`);
    mkdirSync(dirname(trackPath), { recursive: true });
    writeFileSync(trackPath, markdown);
    console.log(`Pulled ${pluralType}/${name}@${ver} → ${trackPath}${merged ? "" : " (no agent config updated)"}`);
    return;
  }

  // Track installed outputs: content hash → { targetPath, isDir }
  const installed = new Map();

  for (const agent of sortedAgents) {
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
    const isDir = !!(installInfo.skillAsDir && installInfo.skillFilename && isSkillType);

    if (isDir) {
      const skillDir = resolve(targetDir, name);
      mkdirSync(skillDir, { recursive: true });
      targetPath = resolve(skillDir, installInfo.skillFilename);
    } else {
      const ext = installInfo.ext || ".md";
      mkdirSync(targetDir, { recursive: true });
      targetPath = resolve(targetDir, `${name}${ext}`);
    }

    // Transform content for agent-specific formats
    const output = transformForAgent(agent, pluralType, entry, markdown);

    // Check if identical content was already installed — symlink instead of duplicating
    const existing = installed.get(output);
    const agentLabel = agents.length > 1 ? ` (${CODING_AGENTS[agent]?.name || agent})` : "";
    const scopeLabel = destination === "global" ? "personal" : "project";

    if (existing && agents.length > 1) {
      // Create symlink instead of writing duplicate content
      const symlinkTarget = isDir ? dirname(existing.targetPath) : existing.targetPath;
      const symlinkPath = isDir ? dirname(targetPath) : targetPath;

      try {
        // Remove existing file/dir if present (can't symlink over it)
        if (existsSync(symlinkPath)) {
          const s = statSync(symlinkPath, { throwIfNoEntry: false });
          if (s && !s.isSymbolicLink?.()) {
            // It's a real file/dir from a previous pull — safe to replace with symlink
          }
          rmSync(symlinkPath, { recursive: true, force: true });
        }
        symlinkSync(symlinkTarget, symlinkPath);
        console.log(`Pulled ${pluralType}/${name}@${ver} → ${symlinkPath} → ${symlinkTarget} (symlink${agentLabel})`);
      } catch (e) {
        // Symlink failed (e.g., cross-device) — fall back to writing real file
        if (isDir) mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, output);
        console.log(`Pulled ${pluralType}/${name}@${ver} → ${targetPath} (${scopeLabel}${agentLabel})`);
      }
    } else {
      // First install or unique content — write real file
      writeFileSync(targetPath, output);
      installed.set(output, { targetPath, isDir });
      console.log(`Pulled ${pluralType}/${name}@${ver} → ${targetPath} (${scopeLabel}${agentLabel})`);
      await downloadAttachmentsTo(pluralType, name, targetPath, entry.attachments);
    }
  }

  // Transitive dependency pulls for agents
  if (!noDeps && singularType === "agent") {
    const depMeta = entry.meta || {};
    const depSkills = Array.isArray(depMeta.skills) ? depMeta.skills : [];
    const depRules = Array.isArray(depMeta.rules) ? depMeta.rules : [];
    const depMemories = Array.isArray(depMeta.memories) ? depMeta.memories : [];
    const depPrompts = Array.isArray(depMeta.prompts) ? depMeta.prompts : [];
    const depMcps = Array.isArray(depMeta.mcps) ? depMeta.mcps : [];
    const depHooks = Array.isArray(depMeta.hooks) ? depMeta.hooks : [];
    const deps = [
      ...depSkills.map((n) => ({ type: "skills", name: n })),
      ...depRules.map((n) => ({ type: "rules", name: n })),
      ...depMemories.map((n) => ({ type: "memories", name: n })),
      ...depPrompts.map((n) => ({ type: "prompts", name: n })),
      ...depMcps.map((n) => ({ type: "mcps", name: n })),
      ...depHooks.map((n) => ({ type: "hooks", name: n })),
    ];

    if (deps.length > 0) {
      const depLabels = deps.map((d) => `${d.type}/${d.name}`);
      console.log(`Pulling ${singularType} ${name}... also pulling ${deps.length} dependencies: ${depLabels.join(", ")}`);

      const pulled = new Set([`${pluralType}/${name}`]);
      for (const dep of deps) {
        const depKey = `${dep.type}/${dep.name}`;
        if (pulled.has(depKey)) continue;
        pulled.add(depKey);

        const localDir = resolve(ROOT, dep.type);
        const localFile = resolve(localDir, `${dep.name}.md`);
        const isConfigDep = dep.type === "mcps" || dep.type === "hooks";
        // Config-merged deps re-merge even when the tracking file exists (idempotent)
        if (existsSync(localFile) && !isConfigDep) continue;

        try {
          let depVersion = undefined;
          const cfg = loadConfig();
          if (cfg.pins && cfg.pins[depKey]) {
            depVersion = cfg.pins[depKey];
          }
          const depEntry = await pullEntry(dep.type, dep.name, depVersion);
          const depMarkdown = entryToMarkdown(depEntry);
          const depVer = depEntry.meta?.version || "latest";

          if (isConfigDep) {
            if (dep.type === "hooks") {
              const ok = await confirmHookInstall(depEntry, dep.name, yes);
              if (!ok) {
                console.log(`  Skipped dependency ${depKey} (not confirmed)`);
                continue;
              }
            }
            for (const agent of sortedAgents) {
              installConfigArtifact(agent, dep.type, dep.name, depEntry, destination);
            }
          }

          mkdirSync(localDir, { recursive: true });
          writeFileSync(localFile, depMarkdown);
          console.log(`  Pulled dependency ${depKey}@${depVer} → ${localFile}`);
        } catch (err) {
          console.error(`  Warning: could not pull dependency ${depKey}: ${err.message}`);
        }
      }
    }
  }

  // Transitive dependency pulls for prompts (memories)
  if (!noDeps && singularType === "prompt") {
    const depMeta = entry.meta || {};
    const depMemories = Array.isArray(depMeta.memories) ? depMeta.memories : [];
    if (depMemories.length > 0) {
      const depLabels = depMemories.map((n) => `memories/${n}`);
      console.log(`Pulling ${singularType} ${name}... also pulling ${depMemories.length} memories: ${depLabels.join(", ")}`);

      for (const memName of depMemories) {
        const localDir = resolve(ROOT, "memories");
        const localFile = resolve(localDir, `${memName}.md`);
        if (existsSync(localFile)) continue;

        try {
          let depVersion = undefined;
          const cfg = loadConfig();
          if (cfg.pins && cfg.pins[`memories/${memName}`]) {
            depVersion = cfg.pins[`memories/${memName}`];
          }
          const depEntry = await pullEntry("memories", memName, depVersion);
          const depMarkdown = entryToMarkdown(depEntry);
          const depVer = depEntry.meta?.version || "latest";
          mkdirSync(localDir, { recursive: true });
          writeFileSync(localFile, depMarkdown);
          console.log(`  Pulled dependency memories/${memName}@${depVer} → ${localFile}`);
        } catch (err) {
          console.error(`  Warning: could not pull dependency memories/${memName}: ${err.message}`);
        }
      }
    }
  }
}

/**
 * Merge an mcp/hook artifact into one agent's shared config file.
 * Returns true when a config file was updated, false when skipped.
 */
export function installConfigArtifact(agent, pluralType, name, artifact, scope) {
  const target = getConfigTarget(agent, pluralType, scope);
  if (!target?.path) {
    if (target?.note) {
      console.log(`  ${CODING_AGENTS[agent]?.name || agent}: ${target.note} — skipped`);
    }
    return false;
  }

  const meta = artifact.meta || {};
  const body = artifact.body || "";
  const targetPath = resolve(target.path);
  try {
    if (pluralType === "mcps") {
      const { serverName, entry } = resolveMcpConfig(meta, body);
      const value = target.shape === "opencode" ? toOpencodeMcpEntry(entry) : entry;
      mergeObjectEntry(targetPath, target.key, serverName || name, value);
    } else {
      const entries = resolveHookEntries(meta, body);
      entries.forEach(({ event, entry }, idx) => {
        const marker = entries.length === 1 ? `hook/${name}` : `hook/${name}:${event}:${idx}`;
        mergeArrayEntry(targetPath, `${target.key}.${event}`, marker, entry);
      });
    }
    console.log(`  Merged ${pluralType}/${name} → ${targetPath} (${CODING_AGENTS[agent]?.name || agent})`);
    return true;
  } catch (err) {
    console.error(`  ${CODING_AGENTS[agent]?.name || agent}: ${err.message}`);
    return false;
  }
}

/**
 * Hooks execute shell commands — always show the command, verify the
 * signature when present, and require confirmation unless --yes was passed.
 */
export async function confirmHookInstall(entry, name, yes) {
  const meta = entry.meta || {};
  if (entry.verified === false) {
    console.error(`Hook ${name}: signature verification failed — not installing.`);
    return false;
  }
  if (!meta._signature) {
    console.log(`\x1b[33m⚠ Hook ${name} is not signed — review the command carefully.\x1b[0m`);
  }
  let hookEntries;
  try {
    hookEntries = resolveHookEntries(meta, entry.body || "");
  } catch (err) {
    console.error(`Hook ${name}: ${err.message} — not installing.`);
    return false;
  }
  console.log(`\nHook ${name} will run shell command(s):`);
  for (const { event, entry: he } of hookEntries) {
    console.log(`  event:   ${event}`);
    if (he.matcher) console.log(`  matcher: ${he.matcher}`);
    for (const h of Array.isArray(he.hooks) ? he.hooks : []) {
      console.log(`  command: ${h.command || "(unset)"}`);
    }
  }
  if (yes) return true;
  const answer = await prompt("Install this hook? [y/N]: ", "n");
  return /^y(es)?$/i.test(answer);
}

export function transformForAgent(agent, pluralType, entry, defaultMarkdown) {
  const meta = entry.meta || {};
  const body = entry.body || "";

  if (agent === "cursor" && (pluralType === "rules" || pluralType === "prompts")) {
    // Cursor .mdc format: description, globs, alwaysApply
    const lines = ["---"];
    lines.push(`description: ${meta.description || entry.description || ""}`);
    const globs = meta.globs || entry.globs || "";
    lines.push(`globs: "${globs}"`);
    lines.push(`alwaysApply: ${meta.scope === "global" ? "true" : "false"}`);
    lines.push("---");
    lines.push("");
    lines.push(body);
    return lines.join("\n");
  }

  if (agent === "claude" && pluralType === "rules") {
    // Claude Code rules: include globs in frontmatter if specified
    const globs = meta.globs || entry.globs || "";
    const lines = ["---"];
    lines.push(`name: ${meta.name || entry.name || ""}`);
    lines.push(`description: ${meta.description || entry.description || ""}`);
    if (globs) lines.push(`globs: ${globs}`);
    lines.push("---");
    lines.push("");
    lines.push(body);
    return lines.join("\n");
  }

  if ((agent === "claude" || agent === "qwen" || agent === "opencode") &&
      (pluralType === "skills" || pluralType === "agents" || pluralType === "prompts" || pluralType === "commands" || pluralType === "designs")) {
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

export async function downloadAttachmentsTo(pluralType, name, targetPath, attachments) {
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

export async function remove(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub remove <type> <name>");
    process.exit(1);
  }

  const pluralType = pluralize(type);
  const result = await removeEntry(pluralType, name);
  console.log(`Removed: ${result.deleted}`);
}

export async function comment(args) {
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

export async function comments(args) {
  const { jsonMode, rest: filtered } = parseJsonFlag(args);
  const [type, name] = filtered;
  if (!type || !name) {
    console.error("Usage: ihub comments <type> <name>");
    process.exit(1);
  }

  const pluralType = pluralize(type);
  const data = await getEntryComments(pluralType, name);

  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

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
    ["Firewall", cfg.firewall?.enabled ? `${cfg.firewall.whitelist_count} IPs whitelisted` : "disabled", cfg.firewall?.enabled],
  ];

  for (const [name, detail, enabled] of features) {
    const status = enabled ? "\x1b[32m\u2713\x1b[0m" : "\x1b[31m\u2717\x1b[0m";
    console.log(`  ${status}  \x1b[1m${name.padEnd(12)}\x1b[0m ${detail}`);
  }
  console.log("");
}

async function audit(args) {
  const { jsonMode, rest } = parseJsonFlag(args);
  const opts = { limit: 50, offset: 0 };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--user" && rest[i + 1]) opts.user = rest[++i];
    else if (rest[i] === "--action" && rest[i + 1]) opts.action = rest[++i];
    else if (rest[i] === "--page" && rest[i + 1]) {
      const page = parseInt(rest[++i], 10);
      if (page > 1) opts.offset = (page - 1) * opts.limit;
    }
    else if (rest[i] === "--limit" && rest[i + 1]) opts.limit = parseInt(rest[++i], 10);
  }

  const data = await fetchAuditLog(opts);

  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

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
  const { jsonMode, rest: filteredMetricArgs } = parseJsonFlag(args);
  const filters = parseFilters(filteredMetricArgs);
  const raw = await fetchMetrics();

  if (jsonMode) {
    const parsed = parsePrometheus(raw);
    console.log(JSON.stringify(parsed, null, 2));
    return;
  }

  const parsed = parsePrometheus(raw);
  console.log(renderDashboard(parsed, filters));
}

async function backup(args) {
  const isFull = args.includes("--full");
  const filtered = args.filter(a => a !== "--full");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  if (isFull) {
    // Full JSON backup — works with any storage adapter (S3, R2, etc.)
    const outputPath = filtered[0] || `ihub-backup-${timestamp}.json`;
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/backup/full`, { headers: authHeaders() });
    if (!res.ok) { const e = await res.json().catch(() => ({})); console.error(`Backup failed: ${e.error || res.status}`); process.exit(1); }
    const data = await res.text();
    writeFileSync(outputPath, data);
    const bundle = JSON.parse(data);
    console.log(`Full backup saved to: ${outputPath}`);
    console.log(`  ${bundle.artifacts?.length || 0} artifacts, ${bundle.comments?.length || 0} comments, ${bundle.users?.length || 0} users`);
  } else {
    // SQLite backup — only works when storage adapter is sqlite
    const outputPath = filtered[0] || `ihub-backup-${timestamp}.db`;
    await downloadBackup(outputPath);
    console.log(`Backup saved to: ${outputPath}`);
    console.log(`  (Use --full for a complete backup that works with any storage adapter)`);
  }
}

async function restore(args) {
  const filePath = args[0];
  if (!filePath) {
    console.error("Usage: ihub restore <backup-file>");
    console.error("  Supports .db (SQLite) and .json (full) backups.");
    process.exit(1);
  }
  if (!existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const base = getBaseUrl();
  const auth = authHeaders();
  const buf = readFileSync(filePath);

  // Detect format
  const isJson = filePath.endsWith(".json") || buf.slice(0, 1).toString() === "{";
  const isSqlite = buf.slice(0, 16).toString("ascii").startsWith("SQLite format 3");

  if (isJson) {
    // Full JSON restore — works with any storage adapter
    let bundle;
    try { bundle = JSON.parse(buf.toString()); } catch { console.error("Invalid JSON backup file."); process.exit(1); }
    if (!bundle.artifacts) { console.error("Invalid backup — missing artifacts."); process.exit(1); }
    console.log(`Restoring full backup from ${filePath}...`);
    console.log(`  ${bundle.artifacts.length} artifacts, ${bundle.comments?.length || 0} comments`);
    const res = await fetch(`${base}/api/backup/full`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: buf,
    });
    const data = await res.json();
    if (!res.ok) { console.error(`Restore failed: ${data.error}`); process.exit(1); }
    console.log(`Restored: ${data.imported} artifacts, ${data.comments} comments${data.errors ? `, ${data.errors} errors` : ""}`);
  } else if (isSqlite) {
    // SQLite restore — only works when storage adapter is sqlite
    console.log(`Restoring SQLite backup from ${filePath} (${buf.length} bytes)...`);
    const res = await fetch(`${base}/api/backup`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/octet-stream" },
      body: buf,
    });
    const data = await res.json();
    if (!res.ok) { console.error(`Restore failed: ${data.error}`); process.exit(1); }
    console.log(`Database restored successfully (${data.size} bytes).`);
  } else {
    console.error("Unrecognized backup format. Use a .db (SQLite) or .json (full) file.");
    process.exit(1);
  }
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

  if (subcommand === "approve") {
    const target = subArgs[0]; // type/name
    if (!target || !target.includes("/")) {
      console.error("Usage: ihub admin approve <type>/<name>");
      process.exit(1);
    }
    const [aType, aName] = target.split("/");
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/${aType}/${aName}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Approve failed");
    console.log(`\x1b[32m✓ Approved: ${aType}/${aName} → available\x1b[0m`);
    return;
  }

  if (subcommand === "blocked") {
    const base = getBaseUrl();
    const res = await fetch(`${base}/api/blocked`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list blocked");
    if (data.length === 0) {
      console.log("No blocked artifacts.");
      return;
    }
    console.log(`\n\x1b[33m${data.length} blocked artifact(s):\x1b[0m\n`);
    for (const e of data) {
      console.log(`  \x1b[31m✗\x1b[0m ${e.type}/${e.name}@${e.version}  \x1b[2mby ${e.owner}\x1b[0m`);
    }
    console.log(`\n\x1b[2mApprove with: ihub admin approve <type>/<name>\x1b[0m\n`);
    return;
  }

  console.error("Usage: ihub admin <subcommand>");
  console.error("  set-role <username> <role>   Set user role (admin only)");
  console.error("  approve <type>/<name>        Approve a blocked artifact (admin only)");
  console.error("  blocked                      List blocked artifacts (admin only)");
  console.error("  digest                       Send weekly digest to Slack (admin only)");
  process.exit(1);
}

async function webhook(args) {
  const [subcommand, ...subArgs] = args;
  const base = getBaseUrl();
  const token = getToken();

  if (!token) {
    console.error("Not logged in. Run: ihub login <url>");
    process.exit(1);
  }

  const hdrs = { "Content-Type": "application/json", ...authHeaders() };

  if (subcommand === "list") {
    const res = await fetch(`${base}/api/webhooks`, { headers: hdrs });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list webhooks");
    if (data.length === 0) {
      console.log("No webhooks configured.");
      return;
    }
    console.log(`\n${data.length} webhook(s):\n`);
    for (const wh of data) {
      console.log(`  [${wh.id}] ${wh.url}  events: ${wh.events}  (${wh.created_at})`);
    }
    console.log("");
    return;
  }

  if (subcommand === "add") {
    const url = subArgs[0];
    if (!url) {
      console.error("Usage: ihub webhook add <url> [--events push,comment] [--secret s]");
      process.exit(1);
    }
    let events = ["push", "pull", "comment", "remove", "approve", "register"];
    let secret = null;
    for (let i = 1; i < subArgs.length; i++) {
      if (subArgs[i] === "--events" && subArgs[i + 1]) {
        events = subArgs[++i].split(",").map((e) => e.trim());
      } else if (subArgs[i] === "--secret" && subArgs[i + 1]) {
        secret = subArgs[++i];
      }
    }
    const body = { url, events };
    if (secret) body.secret = secret;
    const res = await fetch(`${base}/api/webhooks`, {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add webhook");
    console.log(`Webhook added (id: ${data.id}) — ${url} [${events.join(", ")}]`);
    return;
  }

  if (subcommand === "remove") {
    const id = subArgs[0];
    if (!id) {
      console.error("Usage: ihub webhook remove <id>");
      process.exit(1);
    }
    const res = await fetch(`${base}/api/webhooks/${id}`, {
      method: "DELETE",
      headers: hdrs,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to remove webhook");
    console.log(`Webhook ${id} removed.`);
    return;
  }

  console.error("Usage: ihub webhook <list|add|remove>");
  console.error("  list                         List registered webhooks");
  console.error("  add <url> [--events ...] [--secret s]  Add a webhook");
  console.error("  remove <id>                  Remove a webhook");
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

async function whoami(args = []) {
  const jsonMode = args.includes("--json");
  if (!getToken()) {
    console.error("Not logged in. Run: ihub register <url> or ihub login <url>");
    process.exit(1);
  }

  const base = getBaseUrl();
  const res = await fetch(`${base}/api/whoami`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Not authenticated");

  if (jsonMode) {
    console.log(JSON.stringify({ ...data, registry: base }, null, 2));
    return;
  }

  console.log(`Logged in as: ${data.username} (${data.role})`);
  console.log(`Registry: ${base}`);
}

async function outdated() {
  const base = getBaseUrl();
  const registry = loadRegistry(ROOT);
  const TYPES = ["agents", "commands", "designs", "hooks", "mcps", "memories", "prompts", "rules", "skills"];

  let found = 0;
  console.log("");

  for (const type of TYPES) {
    for (const entry of registry[type]) {
      const name = entry.name || entry.file;
      const localVersion = entry.version || "0.0.0";

      try {
        const res = await fetch(`${base}/api/${type}/${name}`);
        if (!res.ok) continue;
        const remote = await res.json();
        const remoteVersion = remote.meta?.version || remote.version || "0.0.0";

        if (remoteVersion !== localVersion && remoteVersion > localVersion) {
          console.log(`  ${name}  local: ${localVersion}  registry: ${remoteVersion}  ⬆ update available`);
          found++;
        }
      } catch {
        // registry unavailable — skip
      }
    }
  }

  if (found === 0) {
    console.log("  All local artifacts are up to date.");
  } else {
    console.log(`\n  ${found} artifact(s) have updates available.`);
  }
  console.log("");
}

async function doctor() {
  const base = getBaseUrl();
  const token = getToken();
  const TYPES = ["agents", "commands", "designs", "hooks", "mcps", "memories", "prompts", "rules", "skills"];

  console.log("\nihub doctor\n");

  // 1. Server reachable
  try {
    const res = await fetch(`${base}/api/ping`);
    if (res.ok) {
      console.log("  ✓ Server reachable ("+base+")");
    } else {
      console.log("  ✗ Server reachable (status "+res.status+")");
    }
  } catch (err) {
    console.log("  ✗ Server reachable (" + err.message + ")");
  }

  // 2. Auth valid
  if (token) {
    try {
      const res = await fetch(`${base}/api/whoami`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("  ✓ Auth valid (" + data.username + ", " + data.role + ")");
      } else {
        console.log("  ✗ Auth valid (invalid token)");
      }
    } catch (err) {
      console.log("  ✗ Auth valid (" + err.message + ")");
    }
  } else {
    console.log("  ✗ Auth valid (no token configured)");
  }

  // 3. Local artifacts valid
  try {
    const registry = loadRegistry(ROOT);
    let errors = 0;
    for (const [type, entries] of Object.entries(registry)) {
      for (const entry of entries) {
        if (!entry.name) errors++;
        if (!entry.description) errors++;
        if (!entry.version) errors++;
      }
    }
    if (errors === 0) {
      console.log("  ✓ Local artifacts valid");
    } else {
      console.log("  ✗ Local artifacts valid (" + errors + " issue(s))");
    }
  } catch (err) {
    console.log("  ✗ Local artifacts valid (" + err.message + ")");
  }

  // 4. Storage writable
  const allExist = TYPES.every((t) => existsSync(resolve(ROOT, t)));
  if (allExist) {
    console.log("  ✓ Storage writable");
  } else {
    const missing = TYPES.filter((t) => !existsSync(resolve(ROOT, t)));
    console.log("  ✗ Storage writable (missing: " + missing.join(", ") + ")");
  }

  // 5. Config file found
  const rcPath = join(homedir(), ".ihubrc");
  if (existsSync(rcPath)) {
    console.log("  ✓ Config file found (~/.ihubrc)");
  } else {
    console.log("  ✗ Config file found (~/.ihubrc not found)");
  }

  console.log("");
}


async function federation(args) {
  const [subcommand] = args;
  const base = getBaseUrl();

  if (subcommand === "sync") {
    const res = await fetch(`${base}/api/federation/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Federation sync failed");
    console.log("\x1b[32m✓ Federation sync complete\x1b[0m");
    for (const r of data.results) {
      console.log(`  ${r.url}: ${r.synced} synced, ${r.errors.length} errors`);
      for (const err of r.errors) {
        console.log(`    \x1b[31m✗\x1b[0m ${err}`);
      }
    }
    return;
  }

  if (subcommand === "status") {
    const res = await fetch(`${base}/api/federation/status`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to get federation status");
    console.log(`Federation: ${data.enabled ? "\x1b[32menabled\x1b[0m" : "\x1b[33mdisabled\x1b[0m"}`);
    if (data.upstreams.length === 0) {
      console.log("  No upstreams configured.");
    } else {
      for (const u of data.upstreams) {
        console.log(`  ${u.url}`);
        console.log(`    Types: ${u.types.join(", ")}`);
        console.log(`    Interval: ${u.interval_hours}h`);
        console.log(`    Last sync: ${u.lastSync || "never"}`);
        if (u.lastSynced) console.log(`    Last synced: ${u.lastSynced} artifacts`);
        if (u.lastErrors) console.log(`    Last errors: ${u.lastErrors}`);
      }
    }
    return;
  }

  console.error("Usage: ihub federation sync|status");
  process.exit(1);
}

async function verify(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub verify <type> <name>");
    process.exit(1);
  }

  const singularType = singularize(type);
  const pluralType = pluralize(singularType);
  const base = getBaseUrl();

  const res = await fetch(`${base}/api/${pluralType}/${name}`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Not found: ${pluralType}/${name}`);

  if (data.verified === true) {
    console.log(`\x1b[32m✓ ${pluralType}/${name} — signature verified\x1b[0m`);
  } else if (data.verified === false) {
    console.log(`\x1b[31m✗ ${pluralType}/${name} — signature verification FAILED\x1b[0m`);
    console.log("  The artifact may have been tampered with.");
    process.exit(1);
  } else {
    console.log(`\x1b[33m⚠ ${pluralType}/${name} — no signature (signing not enabled on server)\x1b[0m`);
  }
}

async function diff(args) {
  const [type, name, v1, v2] = args;
  if (!type || !name || !v1 || !v2) {
    console.error("Usage: ihub diff <type> <name> <version1> <version2>");
    process.exit(1);
  }

  const singularType = singularize(type);
  const pluralType = pluralize(singularType);
  const base = getBaseUrl();
  const hdrs = authHeaders();

  const [r1, r2] = await Promise.all([
    fetch(`${base}/api/${pluralType}/${name}?version=${encodeURIComponent(v1)}`, { headers: hdrs }),
    fetch(`${base}/api/${pluralType}/${name}?version=${encodeURIComponent(v2)}`, { headers: hdrs }),
  ]);
  if (!r1.ok) throw new Error(`Version ${v1} not found`);
  if (!r2.ok) throw new Error(`Version ${v2} not found`);
  const d1 = await r1.json(), d2 = await r2.json();

  const lines1 = (d1.body || "").split("\n"), lines2 = (d2.body || "").split("\n");
  const maxLen = Math.max(lines1.length, lines2.length);

  console.log(`\n\x1b[1m${pluralType}/${name}\x1b[0m  v${v1} → v${v2}\n`);

  let adds = 0, dels = 0;
  for (let i = 0; i < maxLen; i++) {
    const l1 = lines1[i], l2 = lines2[i];
    if (l1 === l2) {
      console.log(`  ${l2 || ""}`);
    } else {
      if (l1 !== undefined) { console.log(`\x1b[31m- ${l1}\x1b[0m`); dels++; }
      if (l2 !== undefined) { console.log(`\x1b[32m+ ${l2}\x1b[0m`); adds++; }
    }
  }
  console.log(`\n\x1b[32m+${adds}\x1b[0m / \x1b[31m-${dels}\x1b[0m lines changed\n`);
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
ihub — harness engineering platform for AI coding agents

Commands:
  browse                     Interactive TUI browser for the registry
  open                       Open the web UI in your default browser
  list [type]                 List entries (agents, commands, designs, hooks, mcps, memories, prompts, rules, skills, or all)
  search <query>              Full-text search across local entries
  show <type> <name>          Show metadata for a specific entry
  preview <type> <name>       Render an entry with markdown formatting
  validate                    Check all entries for missing fields and broken refs
  projects [name]             Tree view of all projects and their artifacts
  create <type> <name> [-i] [--from <template>]
                              Create a new entry (-i for interactive, --from to use registry template)
  import <type> <path> [-i]  Import from coding agent (auto-push, -i for metadata prompts)
  import <bundle.json>        Import from JSON bundle (created by ihub export)
  push <type> <name>          Publish a local entry to the registry
  pull <type> <name[:ver]>    Download an entry (--local or --global, --no-deps; --yes to skip hook confirmation)
  pull <url>                  Pull artifact directly from any registry URL
  watch                       Watch local dirs and auto-push on save
  remove <type> <name>        Remove an entry (owner only)
  comment <type> <name>       Add a comment with rating (1-5)
  comments <type> <name>      View comments and average rating
  search --remote <query>     Search the remote registry
  register <url>              Create account and save API key
  login <url> [--auth0]       Log in with API key or Auth0 device flow
  passwd                     Change password (API key)
  whoami                      Show current user and registry
  doctor                     Run diagnostic checks (server, auth, storage, config)
  outdated                   Compare local vs registry versions
  verify <type> <name>        Check artifact HMAC signature
  diff <type> <name> <v1> <v2> Compare two versions of an artifact
  pin <type> <name> [ver]     Lock artifact to a specific version
  unpin <type> <name>         Remove version pin
  pins                       List all pinned artifacts
  export [--project P] [--type T] [--name N] [-o file]
                              Export artifacts as JSON bundle
  export --from <url>         Export from another registry
  config                     Show server config and enabled features (admin)
  audit [--user U] [--action A] [--page N] [--limit N]
                              View audit trail (admin only, paginated)
  metrics [--type T] [--user U] [--name N] [--project P]
                              Show server metrics dashboard (filterable)
  backup [path]               Download SQLite backup (admin only)
  backup --full [path]        Download full JSON backup (any storage adapter)
  restore <file>              Restore from .db or .json backup (admin only)
  webhook list                List registered webhooks (admin only)
  webhook add <url> [--events push,pull] [--secret s]
                              Add a webhook (admin only)
  webhook remove <id>         Remove a webhook (admin only)
  federation sync             Trigger manual upstream sync (admin only)
  federation status           Show upstream registry status (admin only)
  admin set-role <user> <role> Set user role (admin only)
  admin approve <type>/<name> Approve a blocked artifact (admin only)
  admin blocked              List blocked artifacts (admin only)
  admin digest               Send weekly digest to Slack (admin only)
  completions [bash|zsh]      Output shell completions
  man                        Full manual page
  version                     Show version info

Flags: --json on list, show, search, comments, whoami, projects, audit, metrics

Type-first syntax (equivalent):
  ihub agents list            Same as: ihub list agents
  ihub agent show <name>      Same as: ihub show agent <name>
  ihub skill create <name> [-i]  Same as: ihub create skill <name> [-i]
  ihub rule push <name>       Same as: ihub push rule <name>
  ihub memory pull <name>     Same as: ihub pull memory <name>

Types: agent(s), command(s), design(s), memory/memories, prompt(s), rule(s), skill(s)
`);
}

// --- Watch Command ---

export async function watch() {
  const base = getBaseUrl();
  const token = getToken();

  if (!token) {
    console.error("Not logged in. Run: ihub register <url> or ihub login <url>");
    process.exit(1);
  }

  const dirs = ["agents", "commands", "designs", "hooks", "mcps", "memories", "prompts", "rules", "skills"];
  const debounceTimers = {};

  function timestamp() {
    const now = new Date();
    return `[${now.toLocaleTimeString("en-GB", { hour12: false })}]`;
  }

  console.log(`${timestamp()} Watching for changes in: ${dirs.join(", ")}`);
  console.log(`${timestamp()} Registry: ${base}`);
  console.log(`${timestamp()} Press Ctrl+C to stop.\n`);

  for (const dir of dirs) {
    const dirPath = resolve(ROOT, dir);
    if (!existsSync(dirPath)) continue;

    fsWatch(dirPath, { recursive: true }, (eventType, filename) => {
      if (!filename || !filename.endsWith(".md")) return;

      const filePath = resolve(dirPath, filename);
      const key = filePath;

      // Debounce: wait 500ms after last change
      if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
      debounceTimers[key] = setTimeout(async () => {
        delete debounceTimers[key];

        try {
          if (!existsSync(filePath)) return;

          const content = readFileSync(filePath, "utf-8");
          const { parseFrontmatter } = await import("./parse.js");
          const { meta, body } = parseFrontmatter(content);

          if (!meta.name) {
            console.log(`${timestamp()} \u2717 Skipped ${dir}/${filename}: Missing name`);
            return;
          }
          if (!meta.version) {
            console.log(`${timestamp()} \u2717 Push failed: Missing version in ${dir}/${filename}`);
            return;
          }

          console.log(`${timestamp()} Detected change in ${dir}/${filename} \u2192 pushing...`);

          const entry = { ...meta, body, path: filePath, file: basename(filePath, ".md") };
          const result = await pushEntry(dir, entry);
          console.log(`${timestamp()} \u2713 Pushed ${dir}/${meta.name} v${result.version}`);
        } catch (err) {
          console.log(`${timestamp()} \u2717 Push failed: ${err.message}`);
        }
      }, 500);
    });
  }

  // Keep process alive until Ctrl+C
  await new Promise(() => {});
}

// --- Pull from URL ---

export async function pullFromUrl(url, destination) {
  // Parse URL to extract type and name: .../api/<type>/<name>
  const parsed = new URL(url);
  const pathParts = parsed.pathname.split("/").filter(Boolean);

  // Look for /api/<type>/<name> pattern
  let pluralType = null;
  let name = null;
  const validTypes = ["agents", "commands", "designs", "hooks", "mcps", "memories", "prompts", "rules", "skills"];

  for (let i = 0; i < pathParts.length - 1; i++) {
    if (pathParts[i] === "api" && i + 2 < pathParts.length) {
      const candidate = pathParts[i + 1];
      if (validTypes.includes(candidate)) {
        pluralType = candidate;
        name = pathParts[i + 2];
        break;
      }
    }
  }

  // Fallback: last two segments as type/name
  if (!pluralType && pathParts.length >= 2) {
    const candidate = pathParts[pathParts.length - 2];
    if (validTypes.includes(candidate)) {
      pluralType = candidate;
      name = pathParts[pathParts.length - 1];
    }
  }

  if (!pluralType || !name) {
    console.error(`Could not parse type and name from URL: ${url}`);
    console.error("Expected format: https://registry.example.com/api/<type>/<name>");
    process.exit(1);
  }

  // Fetch from the URL (no auth)
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    let errMsg;
    try { errMsg = JSON.parse(text).error; } catch { errMsg = `HTTP ${res.status}`; }
    throw new Error(`Pull from URL failed: ${errMsg}`);
  }
  const entry = await res.json();
  const markdown = entryToMarkdown(entry);

  const targetPath = resolve(ROOT, pluralType, `${name}.md`);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, markdown);
  const ver = entry.meta?.version || "latest";
  console.log(`Pulled ${pluralType}/${name}@${ver} from ${parsed.host} \u2192 ${targetPath}`);

  if (pluralType === "mcps" || pluralType === "hooks") {
    console.log(`  Saved locally only \u2014 run \`ihub pull ${singularize(pluralType)} ${name}\` to merge into agent configs.`);
  }

  if (entry.attachments && entry.attachments.length > 0) {
    console.log(`  (${entry.attachments.length} attachment(s) not downloaded \u2014 use registry pull for full sync)`);
  }
}

// --- Create from Registry Template ---

// --- Pinning & Bundle Wrappers ---
