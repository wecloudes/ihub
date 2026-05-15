// Sensitive data detection and masking for artifact content.
// Scans content, masks sensitive data in-place, and returns findings.
// Findings are logged to audit trail and tracked via metrics.

const PATTERNS = [
  // ===== API Keys & Tokens =====
  // AWS
  { type: "aws-access-key", label: "AWS Access Key", pattern: /\b(AKIA[0-9A-Z]{16})\b/g },
  { type: "aws-secret-key", label: "AWS Secret Key", pattern: /(?:aws_secret_access_key|secret_key)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi },
  { type: "aws-arn", label: "AWS ARN", pattern: /\barn:aws:[a-z0-9\-]+:[a-z0-9\-]*:\d{12}:[^\s'"]+/g },
  // Azure
  { type: "azure-storage-key", label: "Azure Storage Key", pattern: /(?:AccountKey|DefaultEndpointsProtocol)\s*=\s*[^\s;]+/gi },
  { type: "azure-connection-string", label: "Azure Connection String", pattern: /(?:Server|Data Source)\s*=\s*[^;]+;.*(?:Password|Pwd)\s*=\s*[^;]+/gi },
  { type: "azure-sas-token", label: "Azure SAS Token", pattern: /\b(sv=\d{4}-\d{2}-\d{2}&s[a-z]=[^&\s]{5,})/g },
  { type: "azure-client-secret", label: "Azure Client Secret", pattern: /(?:client_secret|AZURE_CLIENT_SECRET)\s*[=:]\s*['"]?([A-Za-z0-9~._\-]{34,})['"]?/gi },
  { type: "azure-tenant-id", label: "Azure Tenant ID", pattern: /(?:tenant_id|AZURE_TENANT_ID)\s*[=:]\s*['"]?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})['"]?/gi },
  // GCP
  { type: "gcp-api-key", label: "Google API Key", pattern: /\b(AIza[0-9A-Za-z\-_]{35})\b/g },
  { type: "gcp-oauth", label: "Google OAuth Client", pattern: /\b(\d{12}-[a-z0-9]{32}\.apps\.googleusercontent\.com)\b/g },
  { type: "gcp-service-account", label: "GCP Service Account Key", pattern: /"private_key":\s*"-----BEGIN/g },
  { type: "firebase-key", label: "Firebase Key", pattern: /\b(AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140})\b/g },
  // GitHub
  { type: "github-token", label: "GitHub Token", pattern: /\b(ghp_[A-Za-z0-9_]{36,})\b/g },
  { type: "github-oauth", label: "GitHub OAuth", pattern: /\b(gho_[A-Za-z0-9_]{36,})\b/g },
  { type: "github-app", label: "GitHub App Token", pattern: /\b(ghu_[A-Za-z0-9_]{36,})\b/g },
  { type: "github-refresh", label: "GitHub Refresh Token", pattern: /\b(ghr_[A-Za-z0-9_]{36,})\b/g },
  { type: "gitlab-token", label: "GitLab Token", pattern: /\b(glpat-[A-Za-z0-9\-_]{20,})\b/g },
  // AI providers
  { type: "openai-key", label: "OpenAI Key", pattern: /\b(sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,})\b/g },
  { type: "openai-project-key", label: "OpenAI Project Key", pattern: /\b(sk-proj-[A-Za-z0-9\-_]{40,})\b/g },
  { type: "anthropic-key", label: "Anthropic Key", pattern: /\b(sk-ant-[A-Za-z0-9\-_]{40,})\b/g },
  { type: "huggingface-token", label: "HuggingFace Token", pattern: /\b(hf_[A-Za-z0-9]{34,})\b/g },
  // Messaging & services
  { type: "slack-token", label: "Slack Token", pattern: /\b(xox[bporas]-[A-Za-z0-9\-]+)\b/g },
  { type: "slack-webhook", label: "Slack Webhook", pattern: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g },
  { type: "discord-webhook", label: "Discord Webhook", pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/g },
  { type: "telegram-token", label: "Telegram Bot Token", pattern: /\b(\d{8,10}:[A-Za-z0-9_-]{35})\b/g },
  // Payment
  { type: "stripe-secret", label: "Stripe Secret Key", pattern: /\b(sk_live_[A-Za-z0-9]{24,})\b/g },
  { type: "stripe-publishable", label: "Stripe Publishable Key", pattern: /\b(pk_live_[A-Za-z0-9]{24,})\b/g },
  { type: "stripe-restricted", label: "Stripe Restricted Key", pattern: /\b(rk_live_[A-Za-z0-9]{24,})\b/g },
  // Email services
  { type: "sendgrid-key", label: "SendGrid Key", pattern: /\bSG\.[A-Za-z0-9\-_]{22,}\.[A-Za-z0-9\-_]{22,}/g },
  { type: "mailgun-key", label: "Mailgun Key", pattern: /\b(key-[A-Za-z0-9]{32})\b/g },
  // Twilio
  { type: "twilio-key", label: "Twilio Key", pattern: /\b(SK[a-f0-9]{32})\b/g },
  { type: "twilio-auth", label: "Twilio Auth Token", pattern: /(?:twilio.*auth.*token|account_sid)\s*[=:]\s*['"]?([a-f0-9]{32})['"]?/gi },
  // Package managers
  { type: "npm-token", label: "npm Token", pattern: /\b(npm_[A-Za-z0-9]{36})\b/g },
  { type: "pypi-token", label: "PyPI Token", pattern: /\b(pypi-[A-Za-z0-9\-_]{50,})\b/g },
  { type: "nuget-key", label: "NuGet Key", pattern: /\b(oy2[a-z0-9]{43})\b/g },
  // Datadog
  { type: "datadog-key", label: "Datadog Key", pattern: /\b([a-f0-9]{32})\b/g, context: /datadog|dd[-_]api/i },

  // ===== Atlassian (Jira, Confluence) =====
  { type: "atlassian-api-token", label: "Atlassian API Token", pattern: /(?:atlassian|jira|confluence).*(?:token|api[_-]?key)\s*[=:]\s*['"]?([A-Za-z0-9]{24,})['"]?/gi },
  { type: "jira-oauth", label: "Jira OAuth Secret", pattern: /(?:jira.*(?:secret|oauth))\s*[=:]\s*['"]?([A-Za-z0-9\-_]{20,})['"]?/gi },
  { type: "confluence-token", label: "Confluence Token", pattern: /(?:confluence.*(?:token|key|secret))\s*[=:]\s*['"]?([A-Za-z0-9\-_]{20,})['"]?/gi },

  // ===== Kubernetes & ArgoCD =====
  { type: "k8s-service-token", label: "Kubernetes Service Token", pattern: /\beyJhbGciOi[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g },
  { type: "k8s-secret-data", label: "Kubernetes Secret Data", pattern: /(?:kind:\s*Secret[\s\S]{0,200}?data:[\s\S]{0,100}?)([A-Za-z0-9+/]{40,}={0,2})/g },
  { type: "kubeconfig-token", label: "Kubeconfig Token", pattern: /(?:token|client-key-data|client-certificate-data)\s*:\s*([A-Za-z0-9+/\-_]{40,}={0,2})/g },
  { type: "argocd-token", label: "ArgoCD Token", pattern: /(?:argocd.*(?:token|secret|password))\s*[=:]\s*['"]?([A-Za-z0-9\-_.]{20,})['"]?/gi },
  { type: "argocd-auth", label: "ArgoCD Auth Token", pattern: /(?:ARGOCD_AUTH_TOKEN|argocd\.token)\s*[=:]\s*['"]?([A-Za-z0-9\-_.]{20,})['"]?/gi },
  { type: "helm-secret", label: "Helm Secret Value", pattern: /(?:helm.*(?:password|secret|key))\s*[=:]\s*['"]?([^\s'"]{8,})['"]?/gi },

  // ===== Private Keys =====
  { type: "private-key-rsa", label: "RSA Private Key", pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g },
  { type: "private-key-pgp", label: "PGP Private Key", pattern: /-----BEGIN\s+PGP\s+PRIVATE\s+KEY\s+BLOCK-----/g },
  { type: "private-key-ssh", label: "SSH Private Key", pattern: /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/g },
  { type: "private-key-ec", label: "EC Private Key", pattern: /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/g },

  // ===== Passwords & Secrets in Config =====
  { type: "password-assignment", label: "Password Assignment", pattern: /(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|auth[_-]?token)\s*[=:]\s*['"]([^'"]{8,})['"](?!\s*\{)/gi },
  { type: "bearer-token", label: "Bearer Token", pattern: /(?:Authorization|Bearer)\s*[=:]\s*['"]?Bearer\s+([A-Za-z0-9\-._~+/]+=*)\b/gi },
  { type: "basic-auth", label: "Basic Auth", pattern: /(?:Authorization)\s*[=:]\s*['"]?Basic\s+([A-Za-z0-9+/]+=*)\b/gi },
  { type: "connection-string", label: "Connection String Password", pattern: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^:]+:([^@]+)@/g },

  // ===== PII: Email =====
  { type: "email", label: "Email Address", pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    exclude: /example\.com|test\.com|localhost|noreply|your[_-]?email|user@|someone@|placeholder|TODO|e\.g\./i },

  // ===== PII: Phone Numbers (Spain focus + international) =====
  { type: "phone-spain-mobile", label: "Spanish Mobile", pattern: /\b(?:\+34[\s.-]?)?[67]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
    exclude: /example|test|\+34\s*000/i },
  { type: "phone-spain-landline", label: "Spanish Landline", pattern: /\b(?:\+34[\s.-]?)?9[1-9]\d[\s.-]?\d{3}[\s.-]?\d{3}\b/g,
    exclude: /example|test/i },
  { type: "phone-international", label: "Phone Number (International)", pattern: /\+\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}[\s.-]?\d{0,4}\b/g,
    exclude: /\+1234|example|\+0|port|version/i },
  { type: "phone-us", label: "Phone Number (US)", pattern: /\b(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g },

  // ===== PII: Spanish Identity =====
  { type: "dni-nie-spain", label: "Spanish DNI/NIE", pattern: /\b[XYZxyz]?\d{7,8}[A-Za-z]\b/g, context: /dni|nie|nif|documento|identidad/i },
  { type: "cif-spain", label: "Spanish CIF", pattern: /\b[ABCDEFGHJKLMNPQRSUVWabcdefghjklmnpqrsuvw]\d{7}[0-9A-Ja-j]\b/g, context: /cif|empresa|sociedad/i },
  { type: "nss-spain", label: "Spanish NSS", pattern: /\b\d{2}[\s/-]?\d{8}[\s/-]?\d{2}\b/g, context: /seguridad social|nss|afiliaci/i },

  // ===== PII: Financial =====
  { type: "credit-card-visa", label: "Credit Card (Visa)", pattern: /\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  { type: "credit-card-mastercard", label: "Credit Card (Mastercard)", pattern: /\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
  { type: "credit-card-amex", label: "Credit Card (Amex)", pattern: /\b3[47]\d{2}[\s-]?\d{6}[\s-]?\d{5}\b/g },
  { type: "iban", label: "IBAN", pattern: /\b[A-Z]{2}\d{2}\s?[\dA-Z]{4}\s?[\dA-Z]{4}\s?[\dA-Z]{4}(?:\s?[\dA-Z]{4}){0,6}(?:\s?[\dA-Z]{1,4})?\b/g,
    exclude: /example|test|XXXX|0000/i },
  { type: "iban-spain", label: "Spanish IBAN", pattern: /\bES\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}/g,
    exclude: /example|test|0000/i },
  { type: "swift-bic", label: "SWIFT/BIC Code", pattern: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g, context: /swift|bic|bank/i },
  { type: "us-ssn", label: "US SSN", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, exclude: /example|test|000-00|123-45/i },

  // ===== PII: Identity =====
  { type: "passport", label: "Passport Number", pattern: /\b[A-Z]{1,2}\d{6,9}\b/g, context: /passport|pasaporte/i },
  { type: "ip-private", label: "Private IP Address", pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    exclude: /example|localhost|0\.0\.0|docker|container|subnet|cidr|range/i },

  // ===== Generic High Entropy =====
  { type: "hex-secret", label: "Hex Secret (32+ chars)", pattern: /(?:secret|token|key|password|api_key|apikey)\s*[=:]\s*['"]?([0-9a-f]{32,})['"]?/gi },
  { type: "base64-secret", label: "Base64 Secret (40+ chars)", pattern: /(?:secret|token|key|password)\s*[=:]\s*['"]?([A-Za-z0-9+/]{40,}={0,2})['"]?/gi },
];

/**
 * Scan text content for sensitive data.
 * Returns array of { type, label, match, line, redacted }.
 */
export function scanSensitiveData(content) {
  const findings = [];
  const lines = content.split("\n");

  for (const rule of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith("//") && !line.includes("=")) continue;
      if (rule.context && !rule.context.test(line)) continue;

      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(line)) !== null) {
        const matched = match[1] || match[0];
        if (rule.exclude && (rule.exclude.test(matched) || rule.exclude.test(line))) continue;
        if (isInsideCodeExample(lines, i)) continue;

        const redacted = redact(matched);
        if (!findings.some((f) => f.type === rule.type && f.line === i + 1 && f.redacted === redacted)) {
          findings.push({ type: rule.type, label: rule.label, match: matched, redacted, line: i + 1 });
        }
      }
    }
  }
  return findings;
}

/**
 * Mask all sensitive data in content, replacing matches with redacted versions.
 * Returns { maskedContent, findings }.
 */
export function maskSensitiveData(content) {
  const findings = scanSensitiveData(content);
  if (findings.length === 0) return { maskedContent: content, findings };

  let masked = content;
  // Sort by match length descending to avoid partial replacements
  const sorted = [...findings].sort((a, b) => b.match.length - a.match.length);
  for (const f of sorted) {
    const replacement = `[MASKED:${f.type}]`;
    masked = masked.split(f.match).join(replacement);
  }

  return { maskedContent: masked, findings };
}

/**
 * Format findings for CLI display.
 */
export function formatFindings(findings) {
  if (findings.length === 0) return null;

  const lines = [];
  lines.push(`\x1b[43m\x1b[30m\x1b[1m ⚠ SENSITIVE DATA DETECTED — ${findings.length} finding(s) masked before publishing \x1b[0m\n`);

  // Group by type
  const grouped = {};
  for (const f of findings) {
    if (!grouped[f.label]) grouped[f.label] = [];
    grouped[f.label].push(f);
  }

  for (const [label, items] of Object.entries(grouped)) {
    lines.push(`  \x1b[33m${label}\x1b[0m \x1b[2m(${items.length})\x1b[0m`);
    for (const f of items.slice(0, 3)) {
      lines.push(`    \x1b[31mLine ${f.line}\x1b[0m  \x1b[2m${f.redacted} → [MASKED:${f.type}]\x1b[0m`);
    }
    if (items.length > 3) lines.push(`    \x1b[2m...and ${items.length - 3} more\x1b[0m`);
  }

  return lines.join("\n");
}

function isInsideCodeExample(lines, targetLine) {
  let inFence = false;
  let fenceIsExample = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("```")) {
      if (!inFence) {
        inFence = true;
        const context = lines.slice(Math.max(0, i - 5), i + 1).join(" ");
        fenceIsExample = /example|sample|demo|incorrect|correct|before|after|output/i.test(context);
      } else {
        inFence = false;
        fenceIsExample = false;
      }
    }
    if (i === targetLine && inFence && fenceIsExample) return true;
  }
  return false;
}

function redact(value) {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "***" + value.slice(-4);
}
