import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePrometheus, parseFilters, renderDashboard } from "../cli/dashboard.js";

const SAMPLE_METRICS = `# HELP ihub_users_count Current number of registered users
# TYPE ihub_users_count gauge
ihub_users_count 5
# HELP ihub_entries_count Current number of entries by type
# TYPE ihub_entries_count gauge
ihub_entries_count{type="agents"} 12
ihub_entries_count{type="skills"} 8
ihub_entries_count{type="rules"} 3
ihub_entries_count{type="memories"} 2
ihub_entries_count{type="prompts"} 4
# HELP ihub_entries_by_project_count Current number of entries by project and type
# TYPE ihub_entries_by_project_count gauge
ihub_entries_by_project_count{project="ci-toolkit",type="agents"} 5
ihub_entries_by_project_count{project="ci-toolkit",type="skills"} 3
ihub_entries_by_project_count{project="web-app",type="agents"} 7
ihub_entries_by_project_count{project="(none)",type="rules"} 3
# HELP ihub_entries_by_name_count Current number of entry versions by type and name
# TYPE ihub_entries_by_name_count gauge
ihub_entries_by_name_count{type="agents",name="code-reviewer"} 3
ihub_entries_by_name_count{type="agents",name="test-runner"} 1
ihub_entries_by_name_count{type="skills",name="lint-check"} 2
# HELP ihub_comments_count Current number of comments
# TYPE ihub_comments_count gauge
ihub_comments_count 17
# HELP ihub_comments_by_artifact_count Current number of comments per artifact
# TYPE ihub_comments_by_artifact_count gauge
ihub_comments_by_artifact_count{type="agents",name="code-reviewer"} 10
ihub_comments_by_artifact_count{type="skills",name="lint-check"} 7
# HELP ihub_comments_by_user_count Current number of comments per user
# TYPE ihub_comments_by_user_count gauge
ihub_comments_by_user_count{user="alice"} 12
ihub_comments_by_user_count{user="bob"} 5
# HELP ihub_push_total Artifacts pushed
# TYPE ihub_push_total counter
ihub_push_total{type="agents",name="code-reviewer",user="alice"} 10
ihub_push_total{type="agents",name="test-runner",user="bob"} 5
ihub_push_total{type="skills",name="lint-check",user="alice"} 3
# HELP ihub_view_total Artifact detail views
# TYPE ihub_view_total counter
ihub_view_total{type="agents",name="code-reviewer",user="anonymous"} 42
ihub_view_total{type="agents",name="test-runner",user="bob"} 7
ihub_view_total{type="skills",name="lint-check",user="alice"} 15
# HELP ihub_search_total Search requests
# TYPE ihub_search_total counter
ihub_search_total 25
# HELP ihub_comment_total Comments added
# TYPE ihub_comment_total counter
ihub_comment_total{type="agents",name="code-reviewer",user="bob"} 3
ihub_comment_total{type="skills",name="lint-check",user="alice"} 2
# HELP ihub_remove_total Artifacts removed
# TYPE ihub_remove_total counter
ihub_remove_total{type="agents",name="old-agent",user="alice"} 1
# HELP ihub_backup_total Database backups
# TYPE ihub_backup_total counter
ihub_backup_total{user="alice"} 2
# HELP ihub_http_requests_total Total HTTP requests
# TYPE ihub_http_requests_total counter
ihub_http_requests_total{method="GET",path="/agents"} 100
ihub_http_requests_total{method="POST",path="/agents"} 18
ihub_http_requests_total{method="DELETE",path="/agents"} 1
# HELP ihub_register_total User registrations
# TYPE ihub_register_total counter
ihub_register_total{role="admin"} 1
ihub_register_total{role="user"} 4
`;

describe("parsePrometheus", () => {
  it("parses gauges", () => {
    const m = parsePrometheus(SAMPLE_METRICS);
    assert.equal(m["ihub_users_count"][0].value, 5);
  });

  it("parses labeled gauges", () => {
    const m = parsePrometheus(SAMPLE_METRICS);
    const agents = m["ihub_entries_count"].find((e) => e.labels.type === "agents");
    assert.equal(agents.value, 12);
  });

  it("parses counters with multiple labels", () => {
    const m = parsePrometheus(SAMPLE_METRICS);
    const alicePush = m["ihub_push_total"].find(
      (e) => e.labels.user === "alice" && e.labels.name === "code-reviewer"
    );
    assert.equal(alicePush.value, 10);
  });

  it("parses counter without labels", () => {
    const m = parsePrometheus(SAMPLE_METRICS);
    assert.equal(m["ihub_search_total"][0].value, 25);
  });

  it("parses per-project entries", () => {
    const m = parsePrometheus(SAMPLE_METRICS);
    const ciAgents = m["ihub_entries_by_project_count"].find(
      (e) => e.labels.project === "ci-toolkit" && e.labels.type === "agents"
    );
    assert.equal(ciAgents.value, 5);
  });

  it("parses per-artifact comments", () => {
    const m = parsePrometheus(SAMPLE_METRICS);
    const cr = m["ihub_comments_by_artifact_count"].find(
      (e) => e.labels.name === "code-reviewer"
    );
    assert.equal(cr.value, 10);
  });

  it("parses per-user comments", () => {
    const m = parsePrometheus(SAMPLE_METRICS);
    const alice = m["ihub_comments_by_user_count"].find(
      (e) => e.labels.user === "alice"
    );
    assert.equal(alice.value, 12);
  });

  it("ignores comment and empty lines", () => {
    const m = parsePrometheus("# HELP foo bar\n# TYPE foo counter\n\nfoo 42\n");
    assert.equal(m["foo"][0].value, 42);
    assert.equal(Object.keys(m).length, 1);
  });
});

describe("parseFilters", () => {
  it("parses --type flag", () => {
    const f = parseFilters(["--type", "agents"]);
    assert.equal(f.type, "agents");
  });

  it("parses --user flag", () => {
    const f = parseFilters(["--user", "alice"]);
    assert.equal(f.user, "alice");
  });

  it("parses --name flag", () => {
    const f = parseFilters(["--name", "code-reviewer"]);
    assert.equal(f.name, "code-reviewer");
  });

  it("parses --project flag", () => {
    const f = parseFilters(["--project", "ci-toolkit"]);
    assert.equal(f.project, "ci-toolkit");
  });

  it("parses multiple flags", () => {
    const f = parseFilters(["--type", "agents", "--user", "alice", "--name", "code-reviewer"]);
    assert.equal(f.type, "agents");
    assert.equal(f.user, "alice");
    assert.equal(f.name, "code-reviewer");
  });

  it("returns empty for no flags", () => {
    const f = parseFilters([]);
    assert.deepEqual(f, {});
  });
});

describe("renderDashboard", () => {
  const metrics = parsePrometheus(SAMPLE_METRICS);

  it("renders stats row", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("5"));  // users
    assert.ok(out.includes("29")); // entries (12+8+3+2+4)
    assert.ok(out.includes("17")); // comments
    assert.ok(out.includes("18")); // pushes (10+5+3)
    assert.ok(out.includes("25")); // searches
  });

  it("renders entries by type section", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("Entries by Type"));
    assert.ok(out.includes("agents"));
    assert.ok(out.includes("skills"));
    assert.ok(out.includes("█"));
  });

  it("renders entries by project", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("Entries by Project"));
    assert.ok(out.includes("ci-toolkit"));
    assert.ok(out.includes("web-app"));
  });

  it("renders per-artifact versions", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("Artifacts (versions)"));
    assert.ok(out.includes("agents/code-reviewer"));
    assert.ok(out.includes("3 ver"));
  });

  it("renders pushes by user and artifact", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("Pushes by User"));
    assert.ok(out.includes("alice"));
    assert.ok(out.includes("Pushes by Artifact"));
    assert.ok(out.includes("agents/code-reviewer"));
  });

  it("renders views by user and artifact", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("Views by User"));
    assert.ok(out.includes("Views by Artifact"));
    assert.ok(out.includes("agents/code-reviewer"));
  });

  it("renders comments by user and artifact", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("Comments by User"));
    assert.ok(out.includes("Comments by Artifact"));
  });

  it("renders HTTP requests by method", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("HTTP Requests by Method"));
    assert.ok(out.includes("GET"));
    assert.ok(out.includes("POST"));
  });

  it("renders title and footer", () => {
    const out = renderDashboard(metrics);
    assert.ok(out.includes("ihub Registry Dashboard"));
    assert.ok(out.includes("/api/metrics"));
    assert.ok(out.includes("Tip:"));
  });

  it("handles empty metrics", () => {
    const out = renderDashboard({});
    assert.ok(out.includes("ihub Registry Dashboard"));
    assert.ok(out.includes("0"));
  });

  // --- Filtered ---

  it("filters by type", () => {
    const out = renderDashboard(metrics, { type: "agents" });
    assert.ok(out.includes("Filters: type=agents"));
    assert.ok(out.includes("Pushes by Artifact"));
    assert.ok(out.includes("agents/code-reviewer"));
    // Should not include skills in push breakdown
    assert.ok(!out.includes("skills/lint-check"));
  });

  it("filters by user", () => {
    const out = renderDashboard(metrics, { user: "alice" });
    assert.ok(out.includes("Filters: user=alice"));
    assert.ok(out.includes("alice"));
  });

  it("filters by name", () => {
    const out = renderDashboard(metrics, { name: "code-reviewer" });
    assert.ok(out.includes("Filters: name=code-reviewer"));
  });

  it("filters by project", () => {
    const out = renderDashboard(metrics, { project: "ci-toolkit" });
    assert.ok(out.includes("Filters: project=ci-toolkit"));
    assert.ok(out.includes("ci-toolkit"));
  });

  it("filters with multiple flags", () => {
    const out = renderDashboard(metrics, { type: "agents", user: "alice" });
    assert.ok(out.includes("type=agents"));
    assert.ok(out.includes("user=alice"));
  });

  it("filtered dashboard hides HTTP section", () => {
    const out = renderDashboard(metrics, { type: "agents" });
    assert.ok(!out.includes("HTTP Requests by Method"));
  });
});
