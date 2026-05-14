import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import without SLACK_WEBHOOK_URL set — all sends are no-ops
const { isSlackEnabled, sendSlackMessage } = await import("../server/slack.js");

describe("slack", () => {
  it("isSlackEnabled returns false when no webhook", () => {
    assert.equal(isSlackEnabled(), false);
  });

  it("sendSlackMessage silently succeeds when disabled", async () => {
    // Should not throw
    await sendSlackMessage({ text: "test" });
  });
});
