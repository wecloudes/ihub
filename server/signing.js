// Artifact signing — HMAC-SHA256 signing and verification.

import { createHmac } from "crypto";
import { loadServerConfig } from "./config.js";

/**
 * Create HMAC-SHA256 signature of body content.
 * @param {string} body - The body content to sign
 * @param {string} secretKey - The secret key for HMAC
 * @returns {string} Hex string signature
 */
export function signArtifact(body, secretKey) {
  const hmac = createHmac("sha256", secretKey);
  hmac.update(body || "");
  return hmac.digest("hex");
}

/**
 * Verify HMAC-SHA256 signature matches the body.
 * @param {string} body - The body content to verify
 * @param {string} signature - The expected hex signature
 * @param {string} secretKey - The secret key for HMAC
 * @returns {{ valid: boolean }}
 */
export function verifySignature(body, signature, secretKey) {
  const expected = signArtifact(body, secretKey);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return { valid: false };
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return { valid: mismatch === 0 };
}

/**
 * Extract signature from entry metadata if present.
 * @param {object} entry - The entry object with meta field
 * @returns {string|null} The signature or null
 */
export function getSignatureHeader(entry) {
  if (!entry || !entry.meta) return null;
  let meta = entry.meta;
  if (typeof meta === "string") {
    try { meta = JSON.parse(meta); } catch { return null; }
  }
  return meta._signature || null;
}

/**
 * Get signing key from config/env.
 * @returns {string|null}
 */
export function getSigningKey() {
  const key = process.env.IHUB_SIGNING_KEY;
  if (key) return key;
  const config = loadServerConfig();
  return config.signing?.key || null;
}

/**
 * Check if signing is enabled.
 * @returns {boolean}
 */
export function isSigningEnabled() {
  const config = loadServerConfig();
  if (process.env.IHUB_SIGNING_KEY) return true;
  return config.signing?.enabled === true && !!config.signing?.key;
}
