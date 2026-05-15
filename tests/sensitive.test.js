import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scanSensitiveData, maskSensitiveData, formatFindings } from "../server/sensitive.js";

describe("sensitive data detection", () => {
  // --- API Keys ---
  it("detects AWS access keys", () => {
    const r = scanSensitiveData("key = AKIAIOSFODNN7EXAMPLE");
    assert.ok(r.some((f) => f.type === "aws-access-key"));
  });

  it("detects GitHub tokens", () => {
    const r = scanSensitiveData("token: ghp_ABCDEFghijklmnop1234567890abcdef1234");
    assert.ok(r.some((f) => f.type === "github-token"));
  });

  it("detects Slack tokens", () => {
    const r = scanSensitiveData("SLACK_TOKEN=xoxb-123456789-abcdef");
    assert.ok(r.some((f) => f.type === "slack-token"));
  });

  it("detects Slack webhooks", () => {
    const prefix = "https://hooks.slack.com/services/";
    const r = scanSensitiveData("url: " + prefix + "TXXXXXXXX/BXXXXXXXX/xxxxxxxxxxxxxxxxxxxxxxxx");
    assert.ok(r.some((f) => f.type === "slack-webhook"));
  });

  it("detects Stripe keys", () => {
    const key = "sk_" + "live_" + "test1234567890abcdefghijkl";
    const r = scanSensitiveData(key);
    assert.ok(r.some((f) => f.type === "stripe-secret"));
  });

  it("detects Google API keys", () => {
    const r = scanSensitiveData("key: AIzaSyC1234567890abcdefghijklmnopqrstuv");
    assert.ok(r.some((f) => f.type === "gcp-api-key"));
  });

  it("detects OpenAI project keys", () => {
    const r = scanSensitiveData("OPENAI_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890abcd");
    assert.ok(r.some((f) => f.type === "openai-project-key"));
  });

  it("detects Anthropic keys", () => {
    const r = scanSensitiveData("key = sk-ant-abcdefghijklmnopqrstuvwxyz1234567890abcde");
    assert.ok(r.some((f) => f.type === "anthropic-key"));
  });

  it("detects SendGrid keys", () => {
    const r = scanSensitiveData("SG.abcdefghijklmnopqrstuv.abcdefghijklmnopqrstuvwxyz1234567890abc");
    assert.ok(r.some((f) => f.type === "sendgrid-key"));
  });

  // --- Atlassian ---
  it("detects Atlassian/Jira tokens", () => {
    const r = scanSensitiveData("jira_api_token = 'ABCDEFghijklmnop12345678'");
    assert.ok(r.some((f) => f.type === "atlassian-api-token"));
  });

  it("detects Confluence tokens", () => {
    const r = scanSensitiveData("confluence_token: abcdefghijklmnopqrstuvwx");
    assert.ok(r.some((f) => f.type === "confluence-token"));
  });

  // --- Kubernetes & ArgoCD ---
  it("detects Kubernetes JWT tokens", () => {
    const r = scanSensitiveData("token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature");
    assert.ok(r.some((f) => f.type === "k8s-service-token"));
  });

  it("detects ArgoCD tokens", () => {
    const r = scanSensitiveData("ARGOCD_AUTH_TOKEN=eyJhbGciOiJIUzI1NiJ9.abc123");
    assert.ok(r.some((f) => f.type === "argocd-auth"));
  });

  it("detects kubeconfig tokens", () => {
    const r = scanSensitiveData("token: abcdefghijklmnopqrstuvwxyz1234567890abcdefgh");
    assert.ok(r.some((f) => f.type === "kubeconfig-token"));
  });

  // --- Azure ---
  it("detects Azure connection strings", () => {
    const r = scanSensitiveData("Server=myserver.database.windows.net;Password=MyP@ss123");
    assert.ok(r.some((f) => f.type === "azure-connection-string"));
  });

  // --- Private Keys ---
  it("detects RSA private keys", () => {
    const r = scanSensitiveData("-----BEGIN RSA PRIVATE KEY-----");
    assert.ok(r.some((f) => f.type === "private-key-rsa"));
  });

  it("detects SSH private keys", () => {
    const r = scanSensitiveData("-----BEGIN OPENSSH PRIVATE KEY-----");
    assert.ok(r.some((f) => f.type === "private-key-ssh"));
  });

  // --- Passwords ---
  it("detects password assignments", () => {
    const r = scanSensitiveData('password = "SuperSecret123!"');
    assert.ok(r.some((f) => f.type === "password-assignment"));
  });

  it("detects connection string passwords", () => {
    const r = scanSensitiveData("postgres://admin:s3cretPass@db.example.com:5432/mydb");
    assert.ok(r.some((f) => f.type === "connection-string"));
  });

  // --- Spain PII ---
  it("detects Spanish mobile numbers", () => {
    const r = scanSensitiveData("telefono: +34 612 345 678");
    assert.ok(r.some((f) => f.type === "phone-spain-mobile"));
  });

  it("detects Spanish landline numbers", () => {
    const r = scanSensitiveData("tel: +34 912 345 678");
    assert.ok(r.some((f) => f.type === "phone-spain-landline"));
  });

  it("detects Spanish IBAN", () => {
    const r = scanSensitiveData("iban: ES91 2100 0418 4502 0005 1332");
    assert.ok(r.some((f) => f.type === "iban-spain"));
  });

  it("detects Spanish DNI with context", () => {
    const r = scanSensitiveData("DNI: 12345678Z");
    assert.ok(r.some((f) => f.type === "dni-nie-spain"));
  });

  // --- General PII ---
  it("detects real email addresses", () => {
    const r = scanSensitiveData("contact: john.doe@company.com");
    assert.ok(r.some((f) => f.type === "email"));
  });

  it("ignores example emails", () => {
    const r = scanSensitiveData("email: user@example.com");
    assert.ok(!r.some((f) => f.type === "email"));
  });

  it("detects US phone numbers", () => {
    const r = scanSensitiveData("phone: 555-123-4567");
    assert.ok(r.some((f) => f.type === "phone-us"));
  });

  it("detects credit card numbers", () => {
    const r = scanSensitiveData("card: 4111-1111-1111-1111");
    assert.ok(r.some((f) => f.type === "credit-card-visa"));
  });

  it("detects US SSN", () => {
    const r = scanSensitiveData("ssn: 078-05-1120");
    assert.ok(r.some((f) => f.type === "us-ssn"));
  });

  it("ignores placeholder SSN", () => {
    const r = scanSensitiveData("ssn: 000-00-0000");
    assert.ok(!r.some((f) => f.type === "us-ssn"));
  });

  // --- Code example skip ---
  it("skips secrets inside code example blocks", () => {
    const fakeKey = "sk_" + "live_" + "test1234567890abcdefghijkl";
    const content = `# Rule\n\n## Examples\n\n### Incorrect\n\n\`\`\`javascript\nconst apiKey = "${fakeKey}";\n\`\`\``;
    const r = scanSensitiveData(content);
    assert.ok(!r.some((f) => f.type === "stripe-secret"));
  });

  // --- Clean content ---
  it("returns empty for clean content", () => {
    const r = scanSensitiveData("# My Skill\n\nThis does linting.\n\n```bash\nihub run lint\n```");
    assert.equal(r.length, 0);
  });

  // --- Masking ---
  it("masks sensitive data in content", () => {
    const fakeKey = "sk_" + "live_" + "test1234567890abcdefghijkl";
    const content = `api_key = "${fakeKey}"`;
    const { maskedContent, findings } = maskSensitiveData(content);
    assert.ok(findings.length > 0);
    assert.ok(maskedContent.includes("[MASKED:"));
    assert.ok(!maskedContent.includes("test1234567890"));
  });

  it("returns original content when clean", () => {
    const content = "# Hello\nNo secrets here.";
    const { maskedContent, findings } = maskSensitiveData(content);
    assert.equal(findings.length, 0);
    assert.equal(maskedContent, content);
  });

  // --- Formatting ---
  it("formatFindings returns null for no findings", () => {
    assert.equal(formatFindings([]), null);
  });

  it("formatFindings groups by type", () => {
    const findings = [
      { type: "aws-access-key", label: "AWS Access Key", match: "AKIAIOSFODNN7EXAMPLE", redacted: "AKIA***MPLE", line: 5 },
      { type: "aws-access-key", label: "AWS Access Key", match: "AKIAIOSFODNN7EXAMPL2", redacted: "AKIA***PL2", line: 10 },
    ];
    const out = formatFindings(findings);
    assert.ok(out.includes("SENSITIVE DATA DETECTED"));
    assert.ok(out.includes("AWS Access Key"));
    assert.ok(out.includes("(2)"));
  });
});
