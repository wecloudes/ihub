import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { entryToMarkdown } from "../cli/registry.js";

describe("entryToMarkdown", () => {
  it("converts an entry back to markdown with frontmatter", () => {
    const entry = {
      meta: {
        name: "test-agent",
        description: "A test",
        version: "0.1.0",
        tags: ["a", "b"],
      },
      body: "# Test Agent\n\nSome content",
    };

    const md = entryToMarkdown(entry);
    assert.ok(md.startsWith("---\n"));
    assert.ok(md.includes("name: test-agent"));
    assert.ok(md.includes("description: A test"));
    assert.ok(md.includes("tags: [a, b]"));
    assert.ok(md.includes("# Test Agent"));
    assert.ok(md.includes("Some content"));
  });

  it("handles empty body", () => {
    const entry = { meta: { name: "empty" }, body: "" };
    const md = entryToMarkdown(entry);
    assert.ok(md.includes("name: empty"));
  });

  it("handles entry with no meta", () => {
    const entry = { body: "just body" };
    const md = entryToMarkdown(entry);
    assert.ok(md.includes("just body"));
  });
});
