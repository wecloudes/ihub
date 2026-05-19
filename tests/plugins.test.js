import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tmpDir = mkdtempSync(join(tmpdir(), "ihub-plugins-test-"));

// Create test plugin files
writeFileSync(join(tmpDir, "good-plugin.mjs"), `
export default {
  name: "good-plugin",
  beforePush(data) { return { ok: true }; },
  afterPush(data) {},
  beforePull(data) { return { body: data.body + "\\n<!-- good -->", meta: data.meta }; },
};
`);

writeFileSync(join(tmpDir, "blocking-plugin.mjs"), `
export default {
  name: "blocking-plugin",
  beforePush(data) { return { error: "blocked by policy" }; },
};
`);

writeFileSync(join(tmpDir, "throwing-plugin.mjs"), `
export default {
  name: "throwing-plugin",
  beforePush(data) { throw new Error("plugin crashed"); },
};
`);

writeFileSync(join(tmpDir, "no-name-plugin.mjs"), `
export default { beforePush() { return { ok: true }; } };
`);

writeFileSync(join(tmpDir, "config-good.json"), JSON.stringify({ plugins: [join(tmpDir, "good-plugin.mjs")] }));
process.env.IHUB_CONFIG = join(tmpDir, "config-good.json");

const { resetConfig } = await import("../server/config.js");
resetConfig();
const { loadPlugins, runBeforePush, runAfterPush, runBeforePull, resetPlugins } = await import("../server/plugins.js");

after(() => {
  rmSync(tmpDir, { recursive: true });
});

describe("plugins", () => {
  beforeEach(() => {
    resetPlugins();
  });

  it("loadPlugins loads configured plugins", async () => {
    process.env.IHUB_CONFIG = join(tmpDir, "config-good.json");
    resetConfig();
    const plugins = await loadPlugins();
    assert.ok(plugins.length >= 1);
    assert.equal(plugins[0].name, "good-plugin");
  });

  it("runBeforePush returns ok for good plugin", async () => {
    process.env.IHUB_CONFIG = join(tmpDir, "config-good.json");
    resetConfig();
    await loadPlugins();
    const result = await runBeforePush({ type: "skills", name: "test" });
    assert.deepEqual(result, { ok: true });
  });

  it("runBeforePush returns error when plugin blocks", async () => {
    writeFileSync(join(tmpDir, "config-blocking.json"), JSON.stringify({ plugins: [join(tmpDir, "blocking-plugin.mjs")] }));
    process.env.IHUB_CONFIG = join(tmpDir, "config-blocking.json");
    resetConfig();
    await loadPlugins();
    const result = await runBeforePush({ type: "skills", name: "test" });
    assert.ok(result.error);
    assert.ok(result.error.includes("blocking-plugin"));
    assert.ok(result.error.includes("blocked by policy"));
  });

  it("runBeforePush returns error when plugin throws", async () => {
    writeFileSync(join(tmpDir, "config-throwing.json"), JSON.stringify({ plugins: [join(tmpDir, "throwing-plugin.mjs")] }));
    process.env.IHUB_CONFIG = join(tmpDir, "config-throwing.json");
    resetConfig();
    await loadPlugins();
    const result = await runBeforePush({ type: "skills", name: "test" });
    assert.ok(result.error);
    assert.ok(result.error.includes("throwing-plugin"));
    assert.ok(result.error.includes("plugin crashed"));
  });

  it("runAfterPush does not throw", async () => {
    process.env.IHUB_CONFIG = join(tmpDir, "config-good.json");
    resetConfig();
    await loadPlugins();
    // Should not throw
    runAfterPush({ type: "skills", name: "test", version: "1.0.0", owner: "alice" });
  });

  it("runBeforePull transforms body", async () => {
    process.env.IHUB_CONFIG = join(tmpDir, "config-good.json");
    resetConfig();
    await loadPlugins();
    const result = await runBeforePull({ type: "skills", name: "test", body: "# Hello", meta: {} });
    assert.ok(result.body.includes("<!-- good -->"));
    assert.ok(result.meta);
  });

  it("runBeforePull returns original when no beforePull hook", async () => {
    writeFileSync(join(tmpDir, "no-hooks.mjs"), `export default { name: "no-hooks" };`);
    writeFileSync(join(tmpDir, "config-nohooks.json"), JSON.stringify({ plugins: [join(tmpDir, "no-hooks.mjs")] }));
    process.env.IHUB_CONFIG = join(tmpDir, "config-nohooks.json");
    resetConfig();
    await loadPlugins();
    const result = await runBeforePull({ type: "skills", name: "test", body: "original", meta: { a: 1 } });
    assert.equal(result.body, "original");
    assert.deepEqual(result.meta, { a: 1 });
  });

  it("resetPlugins clears loaded state", async () => {
    process.env.IHUB_CONFIG = join(tmpDir, "config-good.json");
    resetConfig();
    await loadPlugins();
    resetPlugins();
    // After reset, runBeforePush should have no plugins
    const result = await runBeforePush({ type: "skills", name: "test" });
    assert.deepEqual(result, { ok: true });
  });

  it("skips plugins without name", async () => {
    writeFileSync(join(tmpDir, "config-noname.json"), JSON.stringify({ plugins: [join(tmpDir, "no-name-plugin.mjs")] }));
    process.env.IHUB_CONFIG = join(tmpDir, "config-noname.json");
    resetConfig();
    const plugins = await loadPlugins();
    assert.equal(plugins.length, 0);
  });
});
