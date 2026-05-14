// Auth0 JWT verification — zero dependencies.
// Uses native crypto to verify RS256 JWTs against Auth0's JWKS endpoint.
// Disabled when AUTH0_DOMAIN is not set (falls back to API key auth only).

import { createVerify } from "crypto";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN; // e.g. "myapp.auth0.com"
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || "ihub-api";

let jwksCache = null;
let jwksCacheTime = 0;
const JWKS_TTL = 600_000; // 10 minutes

export function isAuth0Enabled() {
  return !!AUTH0_DOMAIN;
}

/**
 * Verify an Auth0 JWT and return the decoded payload.
 * Returns null if verification fails.
 */
export async function verifyAuth0Token(token) {
  if (!AUTH0_DOMAIN) return null;

  try {
    // Decode header to get kid
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    const header = JSON.parse(base64UrlDecode(headerB64));
    if (header.alg !== "RS256") return null;

    // Get the signing key
    const publicKey = await getSigningKey(header.kid);
    if (!publicKey) return null;

    // Verify signature
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const signatureBuffer = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (!verifier.verify(publicKey, signatureBuffer)) return null;

    // Decode and validate payload
    const payload = JSON.parse(base64UrlDecode(payloadB64));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    // Check issuer
    const expectedIssuer = `https://${AUTH0_DOMAIN}/`;
    if (payload.iss !== expectedIssuer) return null;

    // Check audience
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(AUTH0_AUDIENCE)) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract username from Auth0 JWT payload.
 */
export function getAuth0Username(payload) {
  return payload.nickname
    || payload.name
    || payload.email
    || payload.sub;
}

// --- JWKS ---

async function getSigningKey(kid) {
  const jwks = await fetchJwks();
  if (!jwks) return null;

  const key = jwks.keys.find((k) => k.kid === kid && k.use === "sig");
  if (!key) return null;

  return jwkToPem(key);
}

async function fetchJwks() {
  const now = Date.now();
  if (jwksCache && now - jwksCacheTime < JWKS_TTL) return jwksCache;

  try {
    const res = await fetch(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`);
    if (!res.ok) return jwksCache; // use stale cache on failure
    jwksCache = await res.json();
    jwksCacheTime = now;
    return jwksCache;
  } catch {
    return jwksCache;
  }
}

// --- Helpers ---

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf-8");
}

function jwkToPem(jwk) {
  // Convert RSA JWK to PEM format
  const n = Buffer.from(jwk.n.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const e = Buffer.from(jwk.e.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  // DER encoding for RSA public key
  const nBytes = encodeLength(n);
  const eBytes = encodeLength(e);
  const sequenceInner = Buffer.concat([
    Buffer.from([0x02]), nBytes,
    Buffer.from([0x02]), eBytes,
  ]);
  const sequenceOuter = Buffer.concat([
    Buffer.from([0x30]), derLength(sequenceInner.length), sequenceInner,
  ]);
  const bitString = Buffer.concat([
    Buffer.from([0x03]), derLength(sequenceOuter.length + 1),
    Buffer.from([0x00]), sequenceOuter,
  ]);
  const algorithmId = Buffer.from([
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
    0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ]);
  const publicKeyInfo = Buffer.concat([
    Buffer.from([0x30]), derLength(algorithmId.length + bitString.length),
    algorithmId, bitString,
  ]);

  const base64 = publicKeyInfo.toString("base64");
  const lines = base64.match(/.{1,64}/g).join("\n");
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

function encodeLength(buf) {
  // Ensure positive integer (prepend 0x00 if high bit set)
  if (buf[0] & 0x80) {
    const padded = Buffer.concat([Buffer.from([0x00]), buf]);
    return Buffer.concat([derLength(padded.length), padded]);
  }
  return Buffer.concat([derLength(buf.length), buf]);
}

function derLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x100) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}
