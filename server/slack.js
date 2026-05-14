// Slack integration via Incoming Webhook.
// Disabled when SLACK_WEBHOOK_URL is not set.

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export function isSlackEnabled() {
  return !!WEBHOOK_URL;
}

/**
 * Send a message to Slack via webhook.
 * Silently fails if webhook is not configured or request fails.
 */
export async function sendSlackMessage(payload) {
  if (!WEBHOOK_URL) return;

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Slack notifications are best-effort — don't break the server
  }
}

/**
 * Notify Slack about a new artifact push.
 */
export async function notifyPush({ type, name, version, owner }) {
  const emoji = typeEmoji(type);
  await sendSlackMessage({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} *New ${singularType(type)} published*\n*${name}* \`v${version}\` by *${owner}*`,
        },
      },
    ],
  });
}

/**
 * Send a weekly digest with top artifacts and users.
 */
export async function sendWeeklyDigest(db) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const types = ["agents", "skills", "rules", "memories", "prompts"];

  const sections = [];

  // Header
  sections.push({
    type: "header",
    text: { type: "plain_text", text: "ihub Weekly Digest" },
  });

  sections.push({
    type: "section",
    text: { type: "mrkdwn", text: `_Activity from the last 7 days_` },
  });

  // Top 5 pulled artifacts per type
  for (const type of types) {
    const rows = db.prepare(`
      SELECT name, COUNT(*) as pulls FROM audit_log
      WHERE action IN ('pull', 'view') AND type = ? AND created_at >= ?
      GROUP BY name ORDER BY pulls DESC LIMIT 5
    `).all(type, since);

    if (rows.length === 0) continue;

    const emoji = typeEmoji(type);
    const list = rows.map((r, i) => `${i + 1}. *${r.name}* — ${r.pulls} pulls`).join("\n");
    sections.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *Top ${type}*\n${list}`,
      },
    });
  }

  // Top 5 users by activity
  const topUsers = db.prepare(`
    SELECT username, COUNT(*) as actions FROM audit_log
    WHERE username != 'anonymous' AND created_at >= ?
    GROUP BY username ORDER BY actions DESC LIMIT 5
  `).all(since);

  if (topUsers.length > 0) {
    const list = topUsers.map((r, i) => `${i + 1}. *${r.username}* — ${r.actions} actions`).join("\n");
    sections.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:trophy: *Top users*\n${list}`,
      },
    });
  }

  // Summary stats
  const totalPushes = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE action = 'push' AND created_at >= ?").get(since).c;
  const totalPulls = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE action IN ('pull', 'view') AND created_at >= ?").get(since).c;
  const totalComments = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE action = 'comment' AND created_at >= ?").get(since).c;
  const newUsers = db.prepare("SELECT COUNT(*) as c FROM audit_log WHERE action = 'register' AND created_at >= ?").get(since).c;

  sections.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `Pushes: ${totalPushes}  |  Pulls: ${totalPulls}  |  Comments: ${totalComments}  |  New users: ${newUsers}`,
    }],
  });

  await sendSlackMessage({ blocks: sections });
}

function singularType(type) {
  const map = { agents: "agent", skills: "skill", rules: "rule", memories: "memory", prompts: "prompt" };
  return map[type] || type;
}

function typeEmoji(type) {
  const map = {
    agents: ":robot_face:",
    skills: ":hammer_and_wrench:",
    rules: ":shield:",
    memories: ":brain:",
    prompts: ":speech_balloon:",
  };
  return map[type] || ":package:";
}
