#!/usr/bin/env bun

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { startTui } from "./tui.js";
import { loadConfig } from "./registry.js";
import { ROOT } from "./context.js";
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

let command = rawCommand;
let args = [...rawArgs];

// Accept `plugin`/`plugins` as an explicit noun for symmetry:
//   ihub plugin list        → ihub list
//   ihub plugin show <name>  → ihub show <name>
//   ihub plugins             → ihub list
if (command === "plugin" || command === "plugins") {
  command = args[0] || "list";
  args = args.slice(1);
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
  const { execFileSync } = await import("child_process");
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
  try {
    execFileSync(cmd, [url], { stdio: "ignore" });
    console.log(`Opened ${url}`);
  } catch {
    console.log(`Open in your browser: ${url}`);
  }
}

// --- Local Commands ---

