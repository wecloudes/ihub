// Versioning policy enforcement for ihub server.
// Validates semantic version bumps and detects breaking changes.

/**
 * Parse a semver string into { major, minor, patch } or null if invalid.
 */
function parseSemver(version) {
  if (!version || typeof version !== "string") return null;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10) };
}

/**
 * Check that newVersion is valid semver and greater than currentVersion.
 * @returns {{ ok: true } | { error: string }}
 */
export function validateVersionBump(currentVersion, newVersion) {
  const cur = parseSemver(currentVersion);
  const nv = parseSemver(newVersion);

  if (!nv) {
    return { error: `New version "${newVersion}" is not valid semver (expected major.minor.patch)` };
  }
  if (!cur) {
    // No current version or unparseable — allow any valid new version
    return { ok: true };
  }

  // Compare: new must be greater
  if (nv.major > cur.major) return { ok: true };
  if (nv.major === cur.major && nv.minor > cur.minor) return { ok: true };
  if (nv.major === cur.major && nv.minor === cur.minor && nv.patch > cur.patch) return { ok: true };

  return { error: `New version ${newVersion} is not greater than current ${currentVersion}` };
}

/**
 * Simple heuristic to detect breaking changes between old and new body.
 * @returns {{ breaking: boolean, reasons: string[] }}
 */
export function detectBreakingChanges(oldBody, newBody) {
  const reasons = [];

  if (!oldBody || !newBody) return { breaking: false, reasons };

  // Check if sections were removed (heading lines present in old but not new)
  const oldHeadings = (oldBody.match(/^#{1,6}\s+.+$/gm) || []);
  const newHeadings = new Set((newBody.match(/^#{1,6}\s+.+$/gm) || []));
  const removedHeadings = oldHeadings.filter((h) => !newHeadings.has(h));
  if (removedHeadings.length > 0) {
    reasons.push(`Removed sections: ${removedHeadings.slice(0, 3).join(", ")}${removedHeadings.length > 3 ? ` (+${removedHeadings.length - 3} more)` : ""}`);
  }

  // Check if body shrunk by more than 50%
  if (oldBody.length > 0 && newBody.length < oldBody.length * 0.5) {
    reasons.push(`Body shrunk by ${Math.round((1 - newBody.length / oldBody.length) * 100)}% (from ${oldBody.length} to ${newBody.length} chars)`);
  }

  return { breaking: reasons.length > 0, reasons };
}

/**
 * Enforce versioning policy.
 * @param {object|null} oldEntry - existing entry (null if new)
 * @param {object} newEntry - incoming entry { version, body }
 * @param {object} policy - { enforce_semver, require_major_for_breaking }
 * @returns {{ ok: true, warnings?: string[] } | { error: string }}
 */
export function enforcePolicy(oldEntry, newEntry, policy) {
  if (!policy) return { ok: true };

  const warnings = [];

  if (policy.enforce_semver) {
    const currentVersion = oldEntry ? oldEntry.version : null;
    const result = validateVersionBump(currentVersion, newEntry.version);
    if (result.error) return { error: result.error };
  }

  if (policy.require_major_for_breaking && oldEntry) {
    const { breaking, reasons } = detectBreakingChanges(oldEntry.body, newEntry.body);
    if (breaking) {
      const curSemver = parseSemver(oldEntry.version);
      const newSemver = parseSemver(newEntry.version);
      if (curSemver && newSemver && newSemver.major <= curSemver.major) {
        warnings.push(`Breaking changes detected but no major version bump: ${reasons.join("; ")}`);
      }
    }
  }

  return warnings.length > 0 ? { ok: true, warnings } : { ok: true };
}
