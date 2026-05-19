import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { validateVersionBump, detectBreakingChanges, enforcePolicy } = await import("../server/versioning.js");

describe("versioning", () => {
  // --- validateVersionBump ---

  it("allows major bump", () => {
    assert.deepEqual(validateVersionBump("1.0.0", "2.0.0"), { ok: true });
  });

  it("allows minor bump", () => {
    assert.deepEqual(validateVersionBump("1.0.0", "1.1.0"), { ok: true });
  });

  it("allows patch bump", () => {
    assert.deepEqual(validateVersionBump("1.0.0", "1.0.1"), { ok: true });
  });

  it("rejects same version", () => {
    const result = validateVersionBump("1.0.0", "1.0.0");
    assert.ok(result.error);
    assert.ok(result.error.includes("not greater"));
  });

  it("rejects downgrade", () => {
    const result = validateVersionBump("2.0.0", "1.0.0");
    assert.ok(result.error);
  });

  it("rejects invalid semver format", () => {
    const result = validateVersionBump("1.0.0", "abc");
    assert.ok(result.error);
    assert.ok(result.error.includes("not valid semver"));
  });

  it("rejects incomplete semver", () => {
    const result = validateVersionBump("1.0.0", "1.0");
    assert.ok(result.error);
  });

  it("allows any valid version when current is null", () => {
    assert.deepEqual(validateVersionBump(null, "1.0.0"), { ok: true });
  });

  it("allows any valid version when current is invalid", () => {
    assert.deepEqual(validateVersionBump("bad", "1.0.0"), { ok: true });
  });

  // --- detectBreakingChanges ---

  it("no breaking changes when headings preserved", () => {
    const old = "# Hello\n\nContent\n\n## World\n\nMore";
    const new_ = "# Hello\n\nUpdated content\n\n## World\n\nMore stuff";
    const { breaking, reasons } = detectBreakingChanges(old, new_);
    assert.equal(breaking, false);
    assert.equal(reasons.length, 0);
  });

  it("detects removed headings", () => {
    const old = "# Hello\n\n## Removed Section\n\nContent";
    const new_ = "# Hello\n\nContent";
    const { breaking, reasons } = detectBreakingChanges(old, new_);
    assert.equal(breaking, true);
    assert.ok(reasons.some((r) => r.includes("Removed sections")));
  });

  it("detects body shrinkage over 50%", () => {
    const old = "x".repeat(200);
    const new_ = "x".repeat(50);
    const { breaking, reasons } = detectBreakingChanges(old, new_);
    assert.equal(breaking, true);
    assert.ok(reasons.some((r) => r.includes("shrunk")));
  });

  it("not breaking when body grows", () => {
    const old = "short";
    const new_ = "much longer content than before";
    const { breaking } = detectBreakingChanges(old, new_);
    assert.equal(breaking, false);
  });

  it("returns no breaking for missing old/new body", () => {
    assert.equal(detectBreakingChanges(null, "new").breaking, false);
    assert.equal(detectBreakingChanges("old", null).breaking, false);
    assert.equal(detectBreakingChanges(null, null).breaking, false);
  });

  it("truncates reasons list when many headings removed", () => {
    const old = Array.from({ length: 6 }, (_, i) => `## Section ${i}`).join("\n\n");
    const new_ = "# Title only";
    const { reasons } = detectBreakingChanges(old, new_);
    assert.ok(reasons[0].includes("+"));
  });

  // --- enforcePolicy ---

  it("returns ok when no policy", () => {
    assert.deepEqual(enforcePolicy(null, { version: "1.0.0" }, null), { ok: true });
  });

  it("enforces semver when enabled", () => {
    const result = enforcePolicy({ version: "1.0.0" }, { version: "2.0.0" }, { enforce_semver: true });
    assert.equal(result.ok, true);
  });

  it("returns error for invalid version bump with enforce_semver", () => {
    const result = enforcePolicy({ version: "2.0.0" }, { version: "1.0.0" }, { enforce_semver: true });
    assert.ok(result.error);
  });

  it("warns about breaking changes without major bump", () => {
    const old = { version: "1.0.0", body: "# Hello\n\n## Removed\n\nContent" };
    const new_ = { version: "1.1.0", body: "# Hello\n\nContent" };
    const result = enforcePolicy(old, new_, { require_major_for_breaking: true });
    assert.equal(result.ok, true);
    assert.ok(result.warnings);
    assert.ok(result.warnings.length > 0);
  });

  it("no warning when major bumped for breaking changes", () => {
    const old = { version: "1.0.0", body: "# Hello\n\n## Removed\n\nContent" };
    const new_ = { version: "2.0.0", body: "# Hello\n\nContent" };
    const result = enforcePolicy(old, new_, { require_major_for_breaking: true });
    assert.equal(result.ok, true);
    assert.equal(result.warnings, undefined);
  });

  it("no warning for new entry", () => {
    const result = enforcePolicy(null, { version: "1.0.0", body: "new" }, { require_major_for_breaking: true });
    assert.equal(result.ok, true);
  });
});
