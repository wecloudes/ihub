// Plugin system for ihub server.
// Plugins are JS modules configured in ihub.config.json under "plugins" array.
// Each plugin exports: { name, beforePush?, afterPush?, beforePull? }

import { loadServerConfig } from "./config.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

let _plugins = [];
let _loaded = false;

/**
 * Load all plugins from config. Dynamically imports each module.
 * Call once at server startup.
 */
export async function loadPlugins() {
  if (_loaded) return _plugins;
  const cfg = loadServerConfig();
  const pluginPaths = cfg.plugins || [];

  for (const pluginPath of pluginPaths) {
    try {
      const resolved = resolve(process.cwd(), pluginPath);
      const mod = await import(resolved);
      const plugin = mod.default || mod;
      if (!plugin.name) {
        console.warn(`Plugin at ${pluginPath} missing "name" — skipping`);
        continue;
      }
      _plugins.push(plugin);
    } catch (err) {
      console.error(`Failed to load plugin "${pluginPath}": ${err.message}`);
    }
  }

  _loaded = true;
  return _plugins;
}

/**
 * Run all beforePush hooks in order. Stops on first error.
 * @param {object} data - { type, name, version, body, meta, tags }
 * @returns {{ ok: true } | { error: string }}
 */
export async function runBeforePush(data) {
  for (const plugin of _plugins) {
    if (typeof plugin.beforePush !== "function") continue;
    try {
      const result = await plugin.beforePush(data);
      if (result && result.error) {
        return { error: `Plugin "${plugin.name}": ${result.error}` };
      }
    } catch (err) {
      return { error: `Plugin "${plugin.name}" threw: ${err.message}` };
    }
  }
  return { ok: true };
}

/**
 * Run all afterPush hooks (fire-and-forget).
 * @param {object} data - { type, name, version, owner }
 */
export function runAfterPush(data) {
  for (const plugin of _plugins) {
    if (typeof plugin.afterPush !== "function") continue;
    try {
      Promise.resolve(plugin.afterPush(data)).catch(() => {});
    } catch {}
  }
}

/**
 * Run all beforePull hooks, applying transforms in sequence.
 * @param {object} data - { type, name, body, meta }
 * @returns {{ body, meta }} — possibly transformed
 */
export async function runBeforePull(data) {
  let { body, meta } = data;
  for (const plugin of _plugins) {
    if (typeof plugin.beforePull !== "function") continue;
    try {
      const result = await plugin.beforePull({ type: data.type, name: data.name, body, meta });
      if (result && result.body !== undefined) {
        body = result.body;
        meta = result.meta !== undefined ? result.meta : meta;
      }
    } catch {}
  }
  return { body, meta };
}

/**
 * Reset plugins (for testing).
 */
export function resetPlugins() {
  _plugins = [];
  _loaded = false;
}
