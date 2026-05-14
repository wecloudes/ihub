import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { inc, gauge, serialize, reset, register } from "../server/metrics.js";

describe("metrics", () => {
  beforeEach(() => {
    reset();
  });

  it("increments a counter", () => {
    inc("test_counter", { action: "push" });
    inc("test_counter", { action: "push" });
    inc("test_counter", { action: "pull" });

    const output = serialize();
    assert.ok(output.includes('test_counter{action="push"} 2'));
    assert.ok(output.includes('test_counter{action="pull"} 1'));
  });

  it("sets a gauge", () => {
    gauge("test_gauge", { type: "agents" }, 42);
    const output = serialize();
    assert.ok(output.includes('test_gauge{type="agents"} 42'));
  });

  it("updates a gauge", () => {
    gauge("test_gauge", {}, 10);
    gauge("test_gauge", {}, 20);
    const output = serialize();
    assert.ok(output.includes("test_gauge 20"));
    assert.ok(!output.includes("test_gauge 10"));
  });

  it("handles counter with no labels", () => {
    inc("simple_counter");
    inc("simple_counter");
    const output = serialize();
    assert.ok(output.includes("simple_counter 2"));
  });

  it("serializes HELP and TYPE lines", () => {
    register("my_metric", "counter", "A test metric");
    inc("my_metric", {});
    const output = serialize();
    assert.ok(output.includes("# HELP my_metric A test metric"));
    assert.ok(output.includes("# TYPE my_metric counter"));
  });

  it("escapes label values", () => {
    inc("test_escape", { path: '/api/"test"' });
    const output = serialize();
    assert.ok(output.includes('path="/api/\\"test\\""'));
  });

  it("reset clears all metrics", () => {
    inc("a_counter", {});
    gauge("a_gauge", {}, 5);
    reset();
    const output = serialize();
    assert.ok(!output.includes("a_counter"));
    assert.ok(!output.includes("a_gauge"));
  });

  it("serializes registered default metrics", () => {
    // These are registered at import time in metrics.js
    inc("ihub_push_total", { type: "agents", user: "alice" });
    const output = serialize();
    assert.ok(output.includes("# HELP ihub_push_total"));
    assert.ok(output.includes("# TYPE ihub_push_total counter"));
    assert.ok(output.includes('ihub_push_total{type="agents",user="alice"} 1'));
  });
});
