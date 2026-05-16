// Federation — subscribe to upstream registries and mirror artifacts.

import { loadServerConfig } from "./config.js";
import { upsertEntry, getDb } from "./db.js";

const VALID_TYPES = ["agents", "skills", "rules", "memories", "prompts"];

// In-memory state: last sync timestamps per upstream URL
const syncState = new Map();

// In-memory upstreams (added at runtime)
const runtimeUpstreams = [];

/**
 * Sync artifacts from an upstream registry.
 * For each configured type, fetches the list and then each individual artifact.
 * Stores locally with owner set to "federated:{upstreamUrl}".
 */
export async function syncFromUpstream(upstreamUrl, types) {
  const url = upstreamUrl.replace(/\/+$/, "");
  const typesToSync = (types || VALID_TYPES).filter((t) => VALID_TYPES.includes(t));
  let synced = 0;
  const errors = [];

  for (const type of typesToSync) {
    try {
      const listRes = await fetch(`${url}/api/${type}`);
      if (!listRes.ok) {
        errors.push(`Failed to list ${type} from ${url}: ${listRes.status}`);
        continue;
      }
      const entries = await listRes.json();

      for (const entry of entries) {
        const name = entry.name;
        if (!name) continue;

        try {
          const detailRes = await fetch(`${url}/api/${type}/${name}`);
          if (!detailRes.ok) {
            errors.push(`Failed to fetch ${type}/${name} from ${url}: ${detailRes.status}`);
            continue;
          }
          const detail = await detailRes.json();

          // Parse meta — it may be a string or object
          let meta = detail.meta || {};
          if (typeof meta === "string") {
            try { meta = JSON.parse(meta); } catch { meta = {}; }
          }

          upsertEntry({
            type,
            name,
            version: detail.version || meta.version || "0.1.0",
            description: detail.description || meta.description || "",
            tags: detail.tags || (typeof meta.tags === "string" ? JSON.parse(meta.tags) : meta.tags) || [],
            meta,
            body: detail.body || "",
            author: detail.author || meta.author || "",
            owner: `federated:${url}`,
          });
          synced++;
        } catch (err) {
          errors.push(`Error fetching ${type}/${name}: ${err.message}`);
        }
      }
    } catch (err) {
      errors.push(`Error listing ${type} from ${url}: ${err.message}`);
    }
  }

  syncState.set(url, { lastSync: new Date().toISOString(), synced, errors: errors.length });
  return { synced, errors };
}

/**
 * List configured upstreams (from config + runtime additions).
 */
export function listUpstreams() {
  const config = loadServerConfig();
  const configured = config.federation?.upstreams || [];
  const all = [...configured, ...runtimeUpstreams];

  return all.map((u) => ({
    url: u.url,
    types: u.types || VALID_TYPES,
    interval_hours: u.interval_hours || 24,
    lastSync: syncState.get(u.url)?.lastSync || null,
    lastSynced: syncState.get(u.url)?.synced || 0,
    lastErrors: syncState.get(u.url)?.errors || 0,
  }));
}

/**
 * Add an upstream at runtime (in-memory only).
 */
export function addUpstream(url, types, interval_hours) {
  runtimeUpstreams.push({
    url: url.replace(/\/+$/, ""),
    types: types || VALID_TYPES,
    interval_hours: interval_hours || 24,
  });
}

/**
 * Run periodic sync for all enabled upstreams.
 * Called by setInterval in server/index.js.
 */
export async function syncAll() {
  const upstreams = listUpstreams();
  const results = [];
  for (const upstream of upstreams) {
    const result = await syncFromUpstream(upstream.url, upstream.types);
    results.push({ url: upstream.url, ...result });
  }
  return results;
}
