import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../src/surfaces/walker/app.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";

// Walker intent-editing v1: artifact preview panel (`a` / :preview), inverse
// traceability (:which <file>), and the shadow-drift glyph on the identity
// bar. Same stdin-driven harness as walker-keyboard-flows.test.tsx (spaced
// writes via press() + frame polling via waitFor()).
//
// Fixture: a mock-ingested project, so applied nodes carry outputs.files —
// the shadows the preview reads and drift compares.

const ESC = "\u001B";
const ENTER = "\r";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor(
  frame: () => string | undefined,
  predicate: (f: string) => boolean,
  label: string,
  timeoutMs = 5000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = frame() ?? "";
    if (predicate(last)) return last;
    await sleep(20);
  }
  throw new Error(`waitFor(${label}) timed out.\nLast frame:\n${last}`);
}

interface Harness {
  frame: () => string | undefined;
  press: (keys: string) => Promise<void>;
  unmount: () => void;
}

async function mountWalker(cwd: string, focal: string): Promise<Harness> {
  const { stdin, lastFrame, unmount } = render(<App initialNodeId={focal} cwd={cwd} />);
  await waitFor(lastFrame, (f) => f.includes("↑ parent"), "initial hint bar");
  const press = async (keys: string): Promise<void> => {
    await sleep(50);
    stdin.write(keys);
  };
  return { frame: lastFrame, press, unmount };
}

async function typeCommand(w: Harness, cmd: string): Promise<void> {
  await w.press(":");
  await waitFor(w.frame, (f) => f.includes(":_"), "command prompt");
  await w.press(cmd);
  await waitFor(w.frame, (f) => f.includes(`:${cmd}_`), `typed ${cmd}`);
  await w.press(ENTER);
}

describe("walker artifact preview + :which + shadow glyph", () => {
  let tempDir: string;
  let alphaNodeId: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "alpha.ts"),
      [
        `export function alpha(): number { return 1; }`,
        `/* mock-fixture`,
        JSON.stringify({
          label: "alpha helper",
          level: "unit",
          kind: "rule",
          prompt: "Alpha helper module.",
          provides: ["alpha"],
        }),
        `*/`,
      ].join("\n"),
    );
    expect(
      runCli(tempDir, ["ingest", srcDir, "--provider", "mock", "--json"]).status,
    ).toBe(0);
    const proposalsDir = path.join(tempDir, ".ontology/proposals");
    for (const f of fs.readdirSync(proposalsDir).filter((x) => x.endsWith(".json")).sort()) {
      const id = f.replace(/\.json$/, "");
      const r = runCli(tempDir, ["proposal", "apply", id, "--json"]);
      expect(r.status).toBe(0);
      alphaNodeId = JSON.parse(r.stdout).mutation.createdEntityId;
    }
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("`a` toggles the preview with file content and no-anchor note; `a` again closes", async () => {
    const w = await mountWalker(tempDir, alphaNodeId);
    await w.press("a");
    await waitFor(w.frame, (f) => f.includes("ARTIFACT —"), "preview open");
    const frame = w.frame() ?? "";
    expect(frame).toContain("src/alpha.ts");
    expect(frame).toContain("export function alpha()");
    expect(frame).toContain("no anchor");

    await w.press("a");
    await waitFor(w.frame, (f) => !f.includes("ARTIFACT —"), "preview closed");
    w.unmount();
  });

  it("with a drift anchor: clean badge, then editing the file shows DRIFTED + identity glyph", async () => {
    expect(runCli(tempDir, ["drift", "--update", "--json"]).status).toBe(0);

    const w = await mountWalker(tempDir, alphaNodeId);
    await w.press("a");
    await waitFor(w.frame, (f) => f.includes("shadow ✓ matches anchor"), "clean badge");
    expect(w.frame()).not.toContain("≠ shadow drifted");
    w.unmount();

    // Edit the shadow OUTSIDE the walker; a fresh mount must show the drift.
    fs.appendFileSync(path.join(tempDir, "src/alpha.ts"), "\n// drifted\n");
    const w2 = await mountWalker(tempDir, alphaNodeId);
    await waitFor(w2.frame, (f) => f.includes("≠ shadow drifted"), "identity glyph");
    await w2.press("a");
    await waitFor(w2.frame, (f) => f.includes("DRIFTED from anchor"), "drifted badge");
    w2.unmount();
  });

  it("a deleted shadow surfaces as missing on the identity bar", async () => {
    expect(runCli(tempDir, ["drift", "--update", "--json"]).status).toBe(0);
    fs.rmSync(path.join(tempDir, "src/alpha.ts"));
    const w = await mountWalker(tempDir, alphaNodeId);
    await waitFor(w.frame, (f) => f.includes("? shadow missing"), "missing glyph");
    w.unmount();
  });

  it("the canon (no outputs.files) previews the no-shadow message", async () => {
    const w = await mountWalker(tempDir, "node_0000_canon");
    await w.press("a");
    await waitFor(
      w.frame,
      (f) => f.includes("focal has no compiled shadow"),
      "no-shadow message",
    );
    w.unmount();
  });

  it(":which <file> jumps the focal to the owning node and opens the preview", async () => {
    const w = await mountWalker(tempDir, "node_0000_canon");
    await typeCommand(w, "which src/alpha.ts");
    await waitFor(w.frame, (f) => f.includes(`${alphaNodeId} owns src/alpha.ts`), "owner message");
    await waitFor(w.frame, (f) => f.includes("alpha helper"), "focal jumped");
    await waitFor(w.frame, (f) => f.includes("ARTIFACT —"), "preview opened");
    w.unmount();
  });

  it(":which with an unknown file reports no owner; with no arg reports usage", async () => {
    const w = await mountWalker(tempDir, alphaNodeId);
    await typeCommand(w, "which src/nope.ts");
    await waitFor(w.frame, (f) => f.includes("no node owns src/nope.ts"), "no-owner message");
    await typeCommand(w, "which");
    await waitFor(w.frame, (f) => f.includes("usage: :which <file>"), "usage message");
    w.unmount();
  });

  it("Esc still exits cleanly from view mode with the preview open", async () => {
    const w = await mountWalker(tempDir, alphaNodeId);
    await w.press("a");
    await waitFor(w.frame, (f) => f.includes("ARTIFACT —"), "preview open");
    await w.press(ESC);
    await sleep(80); // exit() unmounts; nothing to assert beyond not hanging
    w.unmount();
  });
});
