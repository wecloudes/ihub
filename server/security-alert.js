// Security alert notifications.
// Channel controlled by security.notify_via config: "terminal", "slack", or "email".
// - terminal: prints to server console (default, no setup needed)
// - slack: sends to security.slack_webhook_url (separate from notifications channel)
// - email: sends to security.email via SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)

import { loadServerConfig } from "./config.js";

/**
 * Send a security alert for sensitive data detection.
 */
export async function sendSecurityAlert({ type, name, username, findings }) {
  const cfg = loadServerConfig();
  const channel = cfg.security.notify_via || "terminal";
  const findingTypes = [...new Set(findings.map((f) => f.type))];
  const summary = `${findings.length} sensitive value(s) detected in ${type}/${name} by ${username}`;

  if (channel === "slack") {
    await sendSlackAlert(cfg, { type, name, username, findings, findingTypes });
  } else if (channel === "email") {
    await sendEmailAlert(cfg, { type, name, username, findings, findingTypes });
  } else {
    // terminal (default)
    printTerminalAlert({ type, name, username, findings, findingTypes });
  }

  return { summary, findingTypes };
}

// --- Terminal ---

function printTerminalAlert({ type, name, username, findings, findingTypes }) {
  console.log();
  console.log("\x1b[41m\x1b[37m\x1b[1m ⚠ SECURITY ALERT \x1b[0m");
  console.log(`  Artifact:  ${type}/${name}`);
  console.log(`  Pushed by: ${username}`);
  console.log(`  Findings:  ${findings.length}`);
  console.log(`  Types:     ${findingTypes.join(", ")}`);
  console.log(`  Status:    BLOCKED — requires admin approval`);
  console.log(`  Approve:   ihub admin approve ${type}/${name}`);
  console.log();
  for (const f of findings.slice(0, 10)) {
    console.log(`    Line ${f.line}: ${f.label} (${f.redacted})`);
  }
  if (findings.length > 10) console.log(`    ...and ${findings.length - 10} more`);
  console.log();
}

// --- Slack ---

async function sendSlackAlert(cfg, { type, name, username, findings, findingTypes }) {
  const webhookUrl = cfg.security.slack_webhook_url;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: ":rotating_light: Sensitive Data Alert" },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: [
                `*Artifact:* \`${type}/${name}\``,
                `*Pushed by:* ${username}`,
                `*Findings:* ${findings.length}`,
                `*Types:* ${findingTypes.join(", ")}`,
                `*Status:* \`BLOCKED\` — requires admin approval`,
              ].join("\n"),
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: findings.slice(0, 10).map((f) =>
                `• Line ${f.line}: *${f.label}* — \`${f.redacted}\``
              ).join("\n") + (findings.length > 10 ? `\n• _...and ${findings.length - 10} more_` : ""),
            },
          },
          {
            type: "context",
            elements: [{
              type: "mrkdwn",
              text: `Approve via CLI: \`ihub admin approve ${type}/${name}\``,
            }],
          },
        ],
      }),
    });
  } catch {
    // Best-effort
  }
}

// --- Email ---

async function sendEmailAlert(cfg, { type, name, username, findings, findingTypes }) {
  const to = cfg.security.email;
  if (!to) return;

  const subject = `[ihub] BLOCKED: Sensitive data in ${type}/${name}`;
  const body = [
    `Sensitive data was detected and masked. Artifact is BLOCKED.`,
    ``,
    `Artifact: ${type}/${name}`,
    `Pushed by: ${username}`,
    `Findings: ${findings.length}`,
    `Types: ${findingTypes.join(", ")}`,
    ``,
    `Details:`,
    ...findings.map((f) => `  - Line ${f.line}: ${f.label} (${f.redacted})`),
    ``,
    `To approve: ihub admin approve ${type}/${name}`,
  ].join("\n");

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "ihub-security@localhost";

  if (!host) {
    console.log(`[SECURITY EMAIL] To: ${to} | ${subject}`);
    return;
  }

  try {
    const net = await import("net");
    const socket = net.createConnection(port, host);
    const send = (cmd) => new Promise((resolve) => {
      socket.write(cmd + "\r\n");
      socket.once("data", (d) => resolve(d.toString()));
    });
    await new Promise((resolve) => socket.on("connect", resolve));
    await send("EHLO ihub");
    if (user && pass) {
      await send("AUTH LOGIN");
      await send(Buffer.from(user).toString("base64"));
      await send(Buffer.from(pass).toString("base64"));
    }
    await send(`MAIL FROM:<${from}>`);
    await send(`RCPT TO:<${to}>`);
    await send("DATA");
    await send(`From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\n\r\n${body}\r\n.`);
    await send("QUIT");
    socket.end();
  } catch (err) {
    console.error(`Failed to send security email: ${err.message}`);
  }
}
