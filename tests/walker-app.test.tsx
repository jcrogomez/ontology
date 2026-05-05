import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../src/walker/app.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Render-mounting tests for the walker App.
//
// Keystroke-driven tests are intentionally NOT included here. ink-testing-library
// does not replicate raw-mode terminal escape-sequence delivery faithfully, which
// makes such tests flaky. Navigation transitions are exercised directly in
// `walker-navigation.test.ts` against pure functions; the keystroke wiring is a
// thin call site over those functions and is exercised manually via `onto walk`.

describe("walker App (read-only v0)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
  });

  it("renders the canon node identity and coordinate tag", () => {
    const { lastFrame } = render(<App initialNodeId="node_0000_canon" cwd={tempDir} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("node_0000_canon");
    expect(frame).toContain("canon · semantic · intent");
  });

  it("renders the prompt section", () => {
    const { lastFrame } = render(<App initialNodeId="node_0000_canon" cwd={tempDir} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Prompt");
  });

  it("renders the path section", () => {
    const { lastFrame } = render(<App initialNodeId="node_0000_canon" cwd={tempDir} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Path");
  });

  it("renders the hint bar in view mode by default", () => {
    const { lastFrame } = render(<App initialNodeId="node_0000_canon" cwd={tempDir} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("parent");
    expect(frame).toContain("child");
    expect(frame).toContain("sibling");
  });

  it("renders the canon's constraints", () => {
    const { lastFrame } = render(<App initialNodeId="node_0000_canon" cwd={tempDir} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Constraints");
  });

  it("renders an error message when the focal node does not exist", () => {
    const { lastFrame } = render(<App initialNodeId="node_doesnt_exist" cwd={tempDir} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Node not found");
  });

  it("renders a child node correctly when its parent is canon", () => {
    runCli(tempDir, [
      "node", "create",
      "--level", "domain",
      "--kind", "entity",
      "--prompt", "Harvest entity",
    ]);
    const { lastFrame } = render(<App initialNodeId="node_0001" cwd={tempDir} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("node_0001");
    expect(frame).toContain("domain · semantic · intent");
  });
});
