import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tmpDir = mkdtempSync(join(tmpdir(), "ihub-signing-test-"));
process.env.IHUB_CONFIG = join(tmpDir, "nonexistent.json");
delete process.env.IHUB_SIGNING_KEY;

const { resetConfig } = await import("../server/config.js");
resetConfig();
const { signArtifact, verifySignature, getSignatureHeader, getSigningKey, isSigningEnabled } = await import("../server/signing.js");

describe("signing", () => {
  after(() => {
    delete process.env.IHUB_SIGNING_KEY;
    rmSync(tmpDir, { recursive: true });
  });

  // --- signArtifact ---

  it("produces consistent hex output for same input", () => {
    const sig1 = signArtifact("hello world", "secret");
    const sig2 = signArtifact("hello world", "secret");
    assert.equal(sig1, sig2);
    assert.match(sig1, /^[0-9a-f]{64}$/);
  });

  it("produces different output for different bodies", () => {
    const sig1 = signArtifact("body-a", "secret");
    const sig2 = signArtifact("body-b", "secret");
    assert.notEqual(sig1, sig2);
  });

  it("produces different output for different keys", () => {
    const sig1 = signArtifact("same body", "key1");
    const sig2 = signArtifact("same body", "key2");
    assert.notEqual(sig1, sig2);
  });

  it("handles empty body", () => {
    const sig = signArtifact("", "secret");
    assert.match(sig, /^[0-9a-f]{64}$/);
  });

  it("handles null body", () => {
    const sig = signArtifact(null, "secret");
    assert.match(sig, /^[0-9a-f]{64}$/);
  });

  // --- verifySignature ---

  it("returns valid true for correct signature", () => {
    const sig = signArtifact("test body", "mykey");
    const result = verifySignature("test body", sig, "mykey");
    assert.deepEqual(result, { valid: true });
  });

  it("returns valid false for wrong signature", () => {
    const result = verifySignature("test body", "0".repeat(64), "mykey");
    assert.deepEqual(result, { valid: false });
  });

  it("returns valid false for different length signature", () => {
    const result = verifySignature("test body", "short", "mykey");
    assert.deepEqual(result, { valid: false });
  });

  it("returns valid false for tampered body", () => {
    const sig = signArtifact("original", "key");
    const result = verifySignature("tampered", sig, "key");
    assert.deepEqual(result, { valid: false });
  });

  // --- getSignatureHeader ---

  it("returns signature from object meta", () => {
    const sig = getSignatureHeader({ meta: { _signature: "abc123" } });
    assert.equal(sig, "abc123");
  });

  it("returns signature from JSON string meta", () => {
    const sig = getSignatureHeader({ meta: JSON.stringify({ _signature: "def456" }) });
    assert.equal(sig, "def456");
  });

  it("returns null for missing _signature", () => {
    assert.equal(getSignatureHeader({ meta: { other: "field" } }), null);
  });

  it("returns null for null entry", () => {
    assert.equal(getSignatureHeader(null), null);
  });

  it("returns null for entry without meta", () => {
    assert.equal(getSignatureHeader({}), null);
  });

  it("returns null for invalid JSON string meta", () => {
    assert.equal(getSignatureHeader({ meta: "not{json" }), null);
  });

  // --- getSigningKey ---

  it("reads from env var", () => {
    process.env.IHUB_SIGNING_KEY = "env-key-123";
    assert.equal(getSigningKey(), "env-key-123");
    delete process.env.IHUB_SIGNING_KEY;
  });

  it("returns null when not configured", () => {
    delete process.env.IHUB_SIGNING_KEY;
    resetConfig();
    assert.equal(getSigningKey(), null);
  });

  // --- isSigningEnabled ---

  it("returns true when env var set", () => {
    process.env.IHUB_SIGNING_KEY = "some-key";
    assert.equal(isSigningEnabled(), true);
    delete process.env.IHUB_SIGNING_KEY;
  });

  it("returns false when nothing configured", () => {
    delete process.env.IHUB_SIGNING_KEY;
    resetConfig();
    assert.equal(isSigningEnabled(), false);
  });
});
