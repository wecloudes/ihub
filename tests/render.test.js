import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../cli/render.js";

const RESET = "\x1b[0m";

describe("renderMarkdown", () => {
  it("renders h1 with bold and underline", () => {
    const out = renderMarkdown("# My Title");
    assert.ok(out.includes("My Title"));
    assert.ok(out.includes("\x1b[1m")); // bold
    assert.ok(out.includes("═")); // underline
    assert.ok(!out.includes("# My Title")); // raw marker removed
  });

  it("renders h2 with separator", () => {
    const out = renderMarkdown("## Section");
    assert.ok(out.includes("Section"));
    assert.ok(out.includes("─"));
    assert.ok(!out.includes("## "));
  });

  it("renders h3", () => {
    const out = renderMarkdown("### Subsection");
    assert.ok(out.includes("Subsection"));
    assert.ok(out.includes("\x1b[1m")); // bold
    assert.ok(!out.includes("### "));
  });

  it("renders frontmatter with key highlighting", () => {
    const out = renderMarkdown("---\nname: test\nversion: 1.0\n---");
    assert.ok(out.includes("name"));
    assert.ok(out.includes("test"));
    assert.ok(out.includes("─")); // separator
  });

  it("renders bullet lists with dot", () => {
    const out = renderMarkdown("- First item\n- Second item");
    assert.ok(out.includes("\u2022")); // bullet dot
    assert.ok(out.includes("First item"));
    assert.ok(out.includes("Second item"));
  });

  it("renders numbered lists", () => {
    const out = renderMarkdown("1. First\n2. Second");
    assert.ok(out.includes("1."));
    assert.ok(out.includes("First"));
  });

  it("renders code blocks with borders", () => {
    const out = renderMarkdown("```yaml\nkey: value\n```");
    assert.ok(out.includes("yaml"));
    assert.ok(out.includes("┌"));
    assert.ok(out.includes("┘"));
    assert.ok(out.includes("key: value"));
  });

  it("renders inline bold", () => {
    const out = renderMarkdown("This is **bold** text");
    assert.ok(out.includes("\x1b[1m")); // bold escape
    assert.ok(out.includes("bold"));
    assert.ok(!out.includes("**"));
  });

  it("renders inline code", () => {
    const out = renderMarkdown("Use `my_func()` here");
    assert.ok(out.includes("my_func()"));
    assert.ok(!out.includes("`my_func()`"));
  });

  it("renders blockquotes", () => {
    const out = renderMarkdown("> This is a quote");
    assert.ok(out.includes("▎"));
    assert.ok(out.includes("This is a quote"));
  });

  it("renders horizontal rules", () => {
    const out = renderMarkdown("---\nname: x\n---\n\nText\n\n---\n\nMore");
    // The third --- (after frontmatter) should be a horizontal rule
    const lines = out.split("\n");
    const hrLines = lines.filter((l) => l.includes("─") && !l.includes("name"));
    assert.ok(hrLines.length >= 2); // frontmatter separators + hr
  });

  it("renders links", () => {
    const out = renderMarkdown("[click here](https://example.com)");
    assert.ok(out.includes("click here"));
    assert.ok(out.includes("example.com"));
    assert.ok(!out.includes("[click here]"));
  });

  it("handles plain text unchanged", () => {
    const out = renderMarkdown("Just some regular text.");
    assert.ok(out.includes("Just some regular text."));
  });
});
