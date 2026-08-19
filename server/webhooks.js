import { createHmac } from "crypto";
import { getWebhooksForEvent } from "./db.js";
import { inc } from "./metrics.js";

/**
 * Send webhook notifications for a registry event.
 * Non-blocking: delivery happens asynchronously with a 10-second timeout
 * and one retry after 2 seconds on failure.
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

    (async () => {
      const attempt = async () => {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      };

      try {
        await attempt();
        inc("ihub_webhook_delivered_total", { status: "success" });
      } catch (err) {
        console.error(`[webhook] delivery failed: ${webhook.url} error=${err.message}`);
        inc("ihub_webhook_failed_total", { status: "error" });
        // Retry once after 2 seconds
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await attempt();
          inc("ihub_webhook_delivered_total", { status: "success" });
        } catch (retryErr) {
          console.error(`[webhook] retry failed: ${webhook.url} error=${retryErr.message}`);
          inc("ihub_webhook_failed_total", { status: "error" });
        }
      }
    })();
  }
}
