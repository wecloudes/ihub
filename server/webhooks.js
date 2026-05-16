import { createHmac } from "crypto";
import { getWebhooksForEvent } from "./db.js";

/**
 * Send webhook notifications for a registry event.
 * Best-effort delivery — errors are caught and logged, never block the request.
 *
 * @param {string} event - Event type: push, pull, comment, remove, approve, register
 * @param {object} payload - { event, type, name, version, username, timestamp }
 */
export function sendWebhook(event, payload) {
  const webhooks = getWebhooksForEvent(event);
  if (webhooks.length === 0) return;

  const body = JSON.stringify({ ...payload, event, timestamp: payload.timestamp || new Date().toISOString() });

  for (const webhook of webhooks) {
    const headers = { "Content-Type": "application/json" };

    if (webhook.secret) {
      const signature = createHmac("sha256", webhook.secret).update(body).digest("hex");
      headers["X-Ihub-Signature"] = signature;
    }

    fetch(webhook.url, { method: "POST", headers, body }).catch(() => {
      // Best-effort: swallow errors silently
    });
  }
}
