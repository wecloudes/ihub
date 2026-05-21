#!/usr/bin/env node
// Seed cross-references between artifacts for the graph view.
// Usage: IHUB_REGISTRY=http://localhost:3002 IHUB_TOKEN=<token> node scripts/seed-connections.js

const BASE = process.env.IHUB_REGISTRY || "http://localhost:3002";
const TOKEN = process.env.IHUB_TOKEN || "admin";

// Owner tokens — populated at runtime from DB or env
const OWNER_TOKENS = {};

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${TOKEN}`,
};

async function getEntry(type, name) {
  const r = await fetch(`${BASE}/api/${type}/${name}`, { headers });
  if (!r.ok) throw new Error(`GET ${type}/${name}: ${r.status}`);
  return r.json();
}

async function pushMeta(type, name, extraMeta) {
  const entry = await getEntry(type, name);
  const meta = { ...(entry.meta || {}), ...extraMeta };
  const owner = entry.owner || "admin";
  const token = OWNER_TOKENS[owner] || TOKEN;
  const body = JSON.stringify({
    name,
    version: entry.version || meta.version || "1.0.0",
    description: entry.description || "",
    tags: entry.tags || [],
    meta,
    body: entry.body || "",
  });
  const r = await fetch(`${BASE}/api/${type}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body,
  });
  if (!r.ok) {
    const e = await r.text();
    console.error(`  FAIL ${type}/${name}: ${r.status} ${e}`);
    return;
  }
  console.log(`  OK ${type}/${name}`);
}

async function main() {
  // Load owner tokens from DB
  try {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(process.env.IHUB_DB_PATH || "./ihub.db", { readonly: true });
    for (const { username, api_key } of db.prepare("SELECT username, api_key FROM users").all()) {
      OWNER_TOKENS[username] = api_key;
    }
    db.close();
    console.log(`Loaded tokens for ${Object.keys(OWNER_TOKENS).length} users`);
  } catch (e) {
    console.log("Could not load DB tokens, using env token only:", e.message);
  }

  console.log("Seeding agent connections...");
  await pushMeta("agents", "code-reviewer", {
    skills: ["lint-check", "test-generator"],
    rules: ["require-tests", "max-function-length"],
    memories: ["error-handling-patterns", "team-conventions"],
    prompts: ["code-review-feedback", "summarize-pr"],
  });
  await pushMeta("agents", "security-scanner", {
    skills: ["dependency-audit", "lint-check"],
    rules: ["no-console-in-prod", "require-tests"],
    memories: ["deployment-checklist", "incident-2026-03-redis"],
    prompts: ["debug-assistant"],
  });
  await pushMeta("agents", "doc-generator", {
    skills: ["changelog-gen", "api-spec-validator"],
    rules: ["semantic-commits"],
    memories: ["api-versioning-strategy", "domain-glossary"],
    prompts: ["api-documentation", "explain-code"],
  });
  await pushMeta("agents", "migration-assistant", {
    skills: ["db-migration", "test-generator"],
    rules: ["require-tests"],
    memories: ["adr-001-database-choice", "data-model-orders", "api-versioning-strategy"],
    prompts: ["code-migration"],
  });
  await pushMeta("agents", "api-designer", {
    skills: ["api-spec-validator"],
    rules: ["semantic-commits", "no-any-type"],
    memories: ["api-versioning-strategy", "domain-payments"],
    prompts: ["api-documentation"],
  });
  await pushMeta("agents", "perf-optimizer", {
    skills: ["test-generator"],
    rules: ["max-function-length", "no-console-in-prod"],
    memories: ["learning-caching-strategy", "system-topology"],
    prompts: ["refactor-suggestion"],
  });
  await pushMeta("agents", "incident-responder", {
    skills: ["error-handler", "docker-compose"],
    rules: ["require-error-boundary"],
    memories: ["incident-2026-03-redis", "incident-2026-04", "team-ownership", "system-topology"],
    prompts: ["debug-assistant"],
  });

  console.log("\nSeeding skill connections...");
  await pushMeta("skills", "lint-check", { compatible_agents: ["code-reviewer", "security-scanner"] });
  await pushMeta("skills", "test-generator", { compatible_agents: ["code-reviewer", "migration-assistant", "perf-optimizer"] });
  await pushMeta("skills", "dependency-audit", { compatible_agents: ["security-scanner"] });
  await pushMeta("skills", "changelog-gen", { compatible_agents: ["doc-generator"] });
  await pushMeta("skills", "api-spec-validator", { compatible_agents: ["api-designer", "doc-generator"] });
  await pushMeta("skills", "db-migration", { compatible_agents: ["migration-assistant"] });
  await pushMeta("skills", "error-handler", { compatible_agents: ["incident-responder"] });
  await pushMeta("skills", "docker-compose", { compatible_agents: ["incident-responder"] });
  await pushMeta("skills", "git-commit-msg", { compatible_agents: ["code-reviewer"] });
  await pushMeta("skills", "docx", { compatible_agents: ["doc-generator"] });

  console.log("\nSeeding rule connections...");
  await pushMeta("rules", "require-tests", { applies_to: ["code-reviewer", "security-scanner", "migration-assistant"] });
  await pushMeta("rules", "max-function-length", { applies_to: ["code-reviewer", "perf-optimizer"] });
  await pushMeta("rules", "no-console-in-prod", { applies_to: ["security-scanner", "perf-optimizer"] });
  await pushMeta("rules", "no-any-type", { applies_to: ["code-reviewer", "api-designer"] });
  await pushMeta("rules", "semantic-commits", { applies_to: ["doc-generator", "api-designer"] });
  await pushMeta("rules", "require-error-boundary", { applies_to: ["incident-responder"] });

  console.log("\nSeeding prompt connections...");
  await pushMeta("prompts", "code-review-feedback", { compatible_agents: ["code-reviewer"], memories: ["error-handling-patterns", "team-conventions"] });
  await pushMeta("prompts", "summarize-pr", { compatible_agents: ["code-reviewer"], memories: ["api-versioning-strategy"] });
  await pushMeta("prompts", "api-documentation", { compatible_agents: ["api-designer", "doc-generator"], memories: ["api-versioning-strategy", "domain-glossary"] });
  await pushMeta("prompts", "explain-code", { compatible_agents: ["doc-generator"], memories: ["system-topology", "domain-glossary"] });
  await pushMeta("prompts", "write-tests", { compatible_agents: ["code-reviewer"], memories: ["learning-testing-strategy", "error-handling-patterns"] });
  await pushMeta("prompts", "debug-assistant", { compatible_agents: ["incident-responder", "security-scanner"], memories: ["incident-2026-03-redis", "system-topology"] });
  await pushMeta("prompts", "code-migration", { compatible_agents: ["migration-assistant"], memories: ["adr-001-database-choice", "data-model-orders"] });
  await pushMeta("prompts", "refactor-suggestion", { compatible_agents: ["perf-optimizer"], memories: ["learning-caching-strategy", "team-conventions"] });

  console.log("\nSeeding memory connections...");
  await pushMeta("memories", "error-handling-patterns", { related: ["code-reviewer", "incident-responder"] });
  await pushMeta("memories", "team-conventions", { related: ["code-reviewer"] });
  await pushMeta("memories", "api-versioning-strategy", { related: ["api-designer", "doc-generator", "migration-assistant"] });
  await pushMeta("memories", "deployment-checklist", { related: ["security-scanner", "incident-responder"] });
  await pushMeta("memories", "system-topology", { related: ["incident-responder", "perf-optimizer"] });
  await pushMeta("memories", "incident-2026-03-redis", { related: ["incident-responder", "security-scanner"] });
  await pushMeta("memories", "incident-2026-04", { related: ["incident-responder"] });
  await pushMeta("memories", "adr-001-database-choice", { related: ["migration-assistant"] });
  await pushMeta("memories", "data-model-orders", { related: ["migration-assistant"] });
  await pushMeta("memories", "domain-payments", { related: ["api-designer"] });
  await pushMeta("memories", "domain-glossary", { related: ["doc-generator", "api-designer"] });
  await pushMeta("memories", "learning-caching-strategy", { related: ["perf-optimizer"] });
  await pushMeta("memories", "learning-testing-strategy", { related: ["code-reviewer"] });
  await pushMeta("memories", "team-ownership", { related: ["incident-responder"] });
  await pushMeta("memories", "project-q2-priorities", { related: ["perf-optimizer", "migration-assistant"] });
  await pushMeta("memories", "adr-002-monorepo", { related: ["doc-generator"] });
  await pushMeta("memories", "adr-003-auth-strategy", { related: ["security-scanner", "api-designer"] });

  console.log("\nDone!");
}

main().catch(console.error);
