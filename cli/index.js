#!/usr/bin/env bun

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { startTui } from "./tui.js";
import { loadConfig } from "./registry.js";
import {
  ROOT, TYPE_FIELDS, VALID_HOOK_EVENTS, REF_CHECKS,
  PLURAL_MAP, SINGULAR_MAP, TYPE_ALIASES,
  pluralize, singularize,
} from "./context.js";
import {
  list, search, show, preview, validate, projects, printProjectTree,
} from "./query.js";
import { passwd, register, login, whoami } from "./auth.js";
import {
  audit, metrics, backup, restore, admin, webhook, federation,
} from "./admin.js";
import {
  push, pull, remove, comment, comments, watch, pullFromUrl,
} from "./publish.js";
import { create, importArtifact } from "./create.js";
import {
  pin as pinCmd, unpin as unpinCmd, pins as pinsCmd,
  exportBundle as exportBundleCmd, importBundle as importBundleCmd,
} from "./pinning.js";
import {
  completions, man, showConfig, outdated, doctor, verify, diff, version, help,
} from "./diagnostics.js";

// Pinning command wrappers (inject ROOT)
function pin(args) { return pinCmd(args, ROOT); }
function unpin(args) { return unpinCmd(args); }
function pins() { return pinsCmd(); }
async function exportBundle(args) { return exportBundleCmd(args, ROOT); }

const [, , rawCommand, ...rawArgs] = process.argv;

const commands = {
  browse,
  open,
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
  restore,
  admin,
  register,
  login,
  whoami,
  watch,
  outdated,
  doctor,
  pin,
  unpin,
  pins,
  export: exportBundle,
  webhook,
  federation,
  verify,
  diff,
  version,
  help,
};

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

async function browse() {
  const config = loadConfig();
  const base = config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
  const token = config.token || process.env.IHUB_TOKEN || "";
  await startTui(base.replace(/\/+$/, ""), token);
}

// --- Open Web UI ---


async function open() {
  const config = loadConfig();
  const base = (config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
  const url = base + "/ui";
  const { platform } = await import("os");
  const { execSync } = await import("child_process");
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  try {
    execSync(`${cmd} ${url}`, { stdio: "ignore" });
    console.log(`Opened ${url}`);
  } catch {
    console.log(`Open in your browser: ${url}`);
  }
}

// --- Local Commands ---

