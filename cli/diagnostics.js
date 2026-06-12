import { resolve, join } from "path";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { loadConfig, fetchServerConfig } from "./registry.js";
import { loadRegistry } from "./parse.js";
import { renderMarkdown } from "./render.js";
import { ROOT, pluralize, singularize, prompt } from "./context.js";

export function completions(args) {
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


export function man() {
  const manPath = resolve(ROOT, "man", "ihub.1.md");
  const content = readFileSync(manPath, "utf-8");
  console.log(renderMarkdown(content));
}


export async function showConfig() {
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


export async function outdated() {
  const config = loadConfig();
  const base = (config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
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


export async function doctor() {
  const config = loadConfig();
  const base = (config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
  const token = config.token || process.env.IHUB_TOKEN || "";
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
        headers: { "Authorization": `Bearer ${token}` },
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



export async function verify(args) {
  const [type, name] = args;
  if (!type || !name) {
    console.error("Usage: ihub verify <type> <name>");
    process.exit(1);
  }

  const singularType = singularize(type);
  const pluralType = pluralize(singularType);
  const config = loadConfig();
  const base = config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
  const token = config.token || process.env.IHUB_TOKEN;

  const res = await fetch(`${base.replace(/\/+$/, "")}/api/${pluralType}/${name}`, {
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
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


export async function diff(args) {
  const [type, name, v1, v2] = args;
  if (!type || !name || !v1 || !v2) {
    console.error("Usage: ihub diff <type> <name> <version1> <version2>");
    process.exit(1);
  }

  const singularType = singularize(type);
  const pluralType = pluralize(singularType);
  const config = loadConfig();
  const base = (config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000").replace(/\/+$/, "");
  const hdrs = config.token ? { Authorization: `Bearer ${config.token}` } : {};

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


export function version() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
  console.log(`ihub v${pkg.version}`);
  const link = `\x1b]8;;https://www.wecloud.es/\x07WeCloud\x1b]8;;\x07`;
  console.log(`Made with <3 by ${link}`);
  console.log(`Cloud made simple`);
}


export function help() {
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

