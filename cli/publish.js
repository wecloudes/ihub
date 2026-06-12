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
