import { prompt, closeReadline } from "./context.js";
import { loadConfig, saveConfig, changePassword } from "./registry.js";

export async function passwd() {
  const config = loadConfig();
  if (!config.token) {
    console.error("Not logged in. Run: ihub register <url> or ihub login <url>");
    process.exit(1);
  }

  const pw1 = await prompt("New password: ");
  if (!pw1 || pw1.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const pw2 = await prompt("Confirm password: ");
  if (pw1 !== pw2) {
    console.error("Passwords do not match.");
    process.exit(1);
  }

  await changePassword(pw1);

  // Update local config with new key
  config.token = pw1;
  saveConfig(config);
  closeReadline();
  console.log("Password updated and saved to ~/.ihubrc");
}

export async function register(args) {
  const [url] = args;
  if (!url) {
    console.error("Usage: ihub register <registry-url>");
    console.error("  Example: ihub register http://localhost:3000");
    process.exit(1);
  }

  const username = await prompt("Username: ");
  if (!username) {
    console.error("No username provided.");
    process.exit(1);
  }

  const base = url.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Registration failed: ${res.status}`);

  const config = loadConfig();
  config.registry = base;
  config.token = data.api_key;
  config.username = data.username;
  saveConfig(config);
  console.log(`Registered as "${data.username}" and saved config to ~/.ihubrc`);
}

export async function login(args) {
  const useAuth0 = args.includes("--auth0");
  const filtered = args.filter((a) => a !== "--auth0");
  const [url] = filtered;

  if (!url) {
    console.error("Usage: ihub login <registry-url> [--auth0]");
    console.error("  Example: ihub login http://localhost:3000");
    console.error("  Example: ihub login http://localhost:3000 --auth0");
    process.exit(1);
  }

  const base = url.replace(/\/+$/, "");

  if (useAuth0) {
    await loginAuth0(base);
    return;
  }

  const token = await prompt("API key: ");
  if (!token) {
    console.error("No API key provided.");
    process.exit(1);
  }

  // Verify the key and get username
  const res = await fetch(`${base}/api/whoami`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Invalid API key");

  const config = loadConfig();
  config.registry = base;
  config.token = token;
  config.username = data.username;
  saveConfig(config);
  console.log(`Logged in as "${data.username}" — saved config to ~/.ihubrc`);
}

export async function loginAuth0(registryUrl) {
  // Read Auth0 config from env
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const audience = process.env.AUTH0_AUDIENCE || "ihub-api";

  if (!domain || !clientId) {
    console.error("Auth0 login requires AUTH0_DOMAIN and AUTH0_CLIENT_ID environment variables.");
    console.error("  Example: AUTH0_DOMAIN=myapp.auth0.com AUTH0_CLIENT_ID=abc123 ihub login http://localhost:3000 --auth0");
    process.exit(1);
  }

  // Step 1: Request device code
  const codeRes = await fetch(`https://${domain}/oauth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      scope: "openid profile email",
      audience,
    }),
  });
  const codeData = await codeRes.json();
  if (!codeRes.ok) throw new Error(codeData.error_description || "Device code request failed");

  // Step 2: Show user the verification URL
  console.log("");
  console.log("\x1b[1mAuth0 Device Login\x1b[0m");
  console.log("");
  console.log(`  Open this URL in your browser:`);
  console.log(`  \x1b[4m\x1b[34m${codeData.verification_uri_complete}\x1b[0m`);
  console.log("");
  console.log(`  Or go to \x1b[4m${codeData.verification_uri}\x1b[0m and enter code: \x1b[1m${codeData.user_code}\x1b[0m`);
  console.log("");
  console.log("\x1b[2mWaiting for authorization...\x1b[0m");

  // Step 3: Poll for token
  const interval = (codeData.interval || 5) * 1000;
  const expiresAt = Date.now() + codeData.expires_in * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, interval));

    const tokenRes = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: clientId,
        device_code: codeData.device_code,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      // Step 4: Verify with the ihub server
      const whoamiRes = await fetch(`${registryUrl}/api/whoami`, {
        headers: { "Authorization": `Bearer ${tokenData.access_token}` },
      });
      const whoamiData = await whoamiRes.json();
      if (!whoamiRes.ok) throw new Error(whoamiData.error || "Server rejected Auth0 token");

      const config = loadConfig();
      config.registry = registryUrl;
      config.token = tokenData.access_token;
      config.username = whoamiData.username;
      config.auth0 = { domain, clientId, audience };
      if (tokenData.refresh_token) config.auth0.refreshToken = tokenData.refresh_token;
      saveConfig(config);
      console.log(`\x1b[32mLogged in as "${whoamiData.username}" via Auth0 — saved to ~/.ihubrc\x1b[0m`);
      return;
    }

    if (tokenData.error === "authorization_pending") continue;
    if (tokenData.error === "slow_down") {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    throw new Error(tokenData.error_description || tokenData.error || "Auth0 login failed");
  }

  throw new Error("Auth0 login timed out. Please try again.");
}

export async function whoami(args = []) {
  const jsonMode = args.includes("--json");
  const config = loadConfig();
  if (!config.token) {
    console.error("Not logged in. Run: ihub register <url> or ihub login <url>");
    process.exit(1);
  }

  const base = config.registry || process.env.IHUB_REGISTRY || "http://localhost:3000";
  const res = await fetch(`${base.replace(/\/+$/, "")}/api/whoami`, {
    headers: { "Authorization": `Bearer ${config.token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Not authenticated");

  if (jsonMode) {
    console.log(JSON.stringify({ ...data, registry: base }, null, 2));
    return;
  }

  console.log(`Logged in as: ${data.username} (${data.role})`);
  console.log(`Registry: ${base}`);
}
