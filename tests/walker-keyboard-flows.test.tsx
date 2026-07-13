import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "../src/surfaces/walker/app.js";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import { loadDraft } from "../src/kernel/core/drafts/persist.js";

// Keyboard-FLOW tests for the walker: multi-key sequences delivered through
// ink-testing-library's fake stdin, asserting on the rendered frame and on
// real side effects on disk. This is the layer walker-app.test.tsx (render
// mounts) and walker-navigation.test.ts (pure functions) deliberately leave
// out — the wiring from keystroke → mode transition → action.
//
// On the historical flakiness note in walker-app.test.tsx — the failure mode
// is now understood, not mysterious: ink re-subscribes useInput's stdin
// listener across renders, so a write issued back-to-back with the previous
// keystroke's render can land in the unsubscribed gap and be dropped
// (EventEmitter 'data' with no listener is lost). Two rules make delivery
// deterministic: (1) every key goes through press(), which lets the prior
// render's effects settle before writing; (2) assertions never sleep blindly
// — they poll the frame via waitFor() until the expected text appears or a
// 5s deadline trips.

const ARROW_UP = "\u001B[A";
const ARROW_DOWN = "\u001B[B";
const ESC = "\u001B";
const ENTER = "\r";
const BACKSPACE = "\u007F";

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

// Mount the walker and wait until the view-mode hint bar renders — the
// signal that the tree is live. press() spaces writes so none lands in the
// useInput re-subscription gap (see header comment).
async function mountWalker(cwd: string, focal = "node_0000_canon"): Promise<Harness> {
  const { stdin, lastFrame, unmount } = render(<App initialNodeId={focal} cwd={cwd} />);
  await waitFor(lastFrame, (f) => f.includes("↑ parent"), "initial hint bar");
  const press = async (keys: string): Promise<void> => {
    await sleep(50);
    stdin.write(keys);
  };
  return { frame: lastFrame, press, unmount };
}

describe("walker keyboard flows (stdin-driven)", () => {
  let tempDir: string;
  let tmpHome: string;
  let originalXdg: string | undefined;

  beforeEach(() => {
    // Redirect the project registry (XDG_CONFIG_HOME/ontology/projects.json)
    // to a throwaway dir so the `:projects` flow never reads or writes the
    // developer's real registry. Set BEFORE `init` so the subprocess inherits
    // it and registers the temp project into the isolated registry.
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "onto-walker-xdg-"));
    originalXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tmpHome;
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => {
    cleanupTempProject(tempDir);
    if (originalXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdg;
    }
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("`:` enters command mode, Esc returns to view mode", async () => {
    const w = await mountWalker(tempDir);
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt with cursor");
    await w.press(ESC);
    await waitFor(w.frame, (f) => f.includes("↑ parent"), "back to view hints");
    w.unmount();
  });

  it("command buffer accumulates, backspace edits it, Return dispatches", async () => {
    const w = await mountWalker(tempDir);
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt");
    await w.press("xy");
    await waitFor(w.frame, (f) => f.includes(":xy_"), "typed buffer");
    await w.press(BACKSPACE);
    await waitFor(w.frame, (f) => f.includes(":x_"), "backspaced buffer");
    await w.press(ENTER);
    await waitFor(w.frame, (f) => f.includes("unknown command: :x"), "dispatch message");
    w.unmount();
  });

  it("`i` opens the draft editor, typing composes, Esc saves the draft to disk", async () => {
    const w = await mountWalker(tempDir);
    await w.press("i");
    // The banner shows the focal's LABEL (not its id).
    await waitFor(
      w.frame,
      (f) => f.includes("EDIT — drafting a candidate child of Ontology Mathematical Canon"),
      "edit mode banner",
    );
    await w.press("hello from keys");
    await waitFor(w.frame, (f) => f.includes("hello from keys"), "draft text echoed");
    await w.press(ESC);
    await waitFor(w.frame, (f) => f.includes("draft saved for node_0000_canon"), "save message");
    // The flow's real side effect: the draft is on disk.
    const draft = loadDraft("node_0000_canon", tempDir);
    expect(draft?.draftPrompt).toBe("hello from keys");
    w.unmount();
  });

  it("arrow keys navigate child and parent; ↑ at canon reports no parent", async () => {
    expect(
      runCli(tempDir, [
        "node", "create",
        "--level", "domain",
        "--kind", "entity",
        "--prompt", "Keyboard-flow child",
      ]).status,
    ).toBe(0);

    const w = await mountWalker(tempDir);
    await w.press(ARROW_DOWN);
    await waitFor(w.frame, (f) => f.includes("node_0001"), "focal moved to child");
    await w.press(ARROW_UP);
    await waitFor(w.frame, (f) => f.includes("canon · semantic · intent"), "focal back at canon");
    await w.press(ARROW_UP);
    await waitFor(w.frame, (f) => f.includes("no parent (canon)"), "no-parent message");
    w.unmount();
  });

  it("full loop: draft → :propose → :proposals panel → r rejects — all via keyboard", async () => {
    const w = await mountWalker(tempDir);

    // Compose a draft.
    await w.press("i");
    await waitFor(w.frame, (f) => f.includes("EDIT — drafting"), "edit mode");
    await w.press("a proposed child node");
    await waitFor(w.frame, (f) => f.includes("a proposed child node"), "draft echoed");
    await w.press(ESC);
    await waitFor(w.frame, (f) => f.includes("draft saved"), "draft saved");

    // Turn it into a proposal.
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt");
    await w.press("propose");
    await waitFor(w.frame, (f) => f.includes(":propose_"), "propose typed");
    await w.press(ENTER);
    await waitFor(w.frame, (f) => /proposal proposal_\d+ created \(pending\)/.test(f), "proposal created");

    // Review it in the panel and reject it.
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt again");
    await w.press("proposals");
    await waitFor(w.frame, (f) => f.includes(":proposals_"), "proposals typed");
    await w.press(ENTER);
    await waitFor(w.frame, (f) => f.includes("PROPOSALS — 1 pending"), "panel with one row");
    await w.press("r");
    await waitFor(w.frame, (f) => /rejected/i.test(f), "rejection feedback");

    // Close the panel.
    await w.press(ESC);
    await waitFor(w.frame, (f) => f.includes("proposals panel dismissed"), "panel dismissed");
    w.unmount();
  });

  it("`:proposals` with an empty queue renders the empty panel and Esc dismisses it", async () => {
    const w = await mountWalker(tempDir);
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt");
    await w.press("proposals");
    await waitFor(w.frame, (f) => f.includes(":proposals_"), "proposals typed");
    await w.press(ENTER);
    await waitFor(w.frame, (f) => f.includes("(no pending proposals)"), "empty panel");
    // j/k on an empty list must be a harmless no-op, not a crash.
    await w.press("j");
    await w.press("k");
    await w.press(ESC);
    await waitFor(w.frame, (f) => f.includes("proposals panel dismissed"), "panel dismissed");
    w.unmount();
  });

  it("`:models` shows the per-task routing + catalog; `:route` reconfigures it live (REGEN_ORACLE_REFINE)", async () => {
    const w = await mountWalker(tempDir);
    // View: the routing table + the registry catalog.
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt");
    await w.press("models");
    await w.press(ENTER);
    const viewed = await waitFor(w.frame, (f) => f.includes("MODEL ROUTING"), "routing panel");
    expect(viewed).toContain("code_sketch"); // a routable task is shown
    expect(viewed).toContain("mock_default"); // the catalog lists the registered model
    expect(viewed).toMatch(/per-node model\.ref/); // unrouted by default

    // Reconfigure: route code_sketch → mock_default, see it reflected live.
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt 2");
    await w.press("route code_sketch mock_default");
    await w.press(ENTER);
    await waitFor(w.frame, (f) => f.includes('routed "code_sketch"'), "route confirmation");
    // The panel refreshed and now shows the resolved routing.
    await waitFor(
      w.frame,
      (f) => f.includes("code_sketch") && f.includes("[mock/deterministic-mock-model]"),
      "routing resolved in panel",
    );
    w.unmount();

    // And it persisted to the registry on disk (governed write).
    const reg = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".ontology/models/registry.json"), "utf-8"),
    );
    expect(reg.routing).toEqual({ code_sketch: "mock_default" });
  });

  it("`:projects` opens the switcher (current project + create row); n enters create, Esc dismisses", async () => {
    const w = await mountWalker(tempDir);

    // Open the switcher — `init` registered the temp project into the isolated
    // registry, so it shows as the current row alongside the create row.
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt");
    await w.press("projects");
    await waitFor(w.frame, (f) => f.includes(":projects_"), "projects typed");
    await w.press(ENTER);
    const panel = await waitFor(w.frame, (f) => f.includes("PROJECTS"), "projects panel");
    // A real registered project row rendered (not the empty-state placeholder),
    // plus the always-present create row. (The "current" tag is intentionally
    // not asserted: macOS resolves os.tmpdir() through a /private symlink, so
    // the registered path and the live cwd compare unequal — orthogonal to this
    // flow.)
    expect(panel).not.toContain("No projects registered yet");
    expect(panel).toContain("+ Create new Ontology project");

    // n → create sub-mode: the TextInput mounts (name prompt).
    await w.press("n");
    await waitFor(w.frame, (f) => f.includes("name:"), "create mode name field");

    // Esc from create returns to the list (still open), Esc again dismisses.
    await w.press(ESC);
    await waitFor(w.frame, (f) => f.includes("enter open"), "back to list hints");
    await w.press(ESC);
    await waitFor(w.frame, (f) => f.includes("projects panel dismissed"), "panel dismissed");
    w.unmount();
  });

  it("`:next` opens the safe-action panel and Esc dismisses it", async () => {
    const w = await mountWalker(tempDir);
    await w.press(":");
    await waitFor(w.frame, (f) => f.includes(":_"), "command prompt");
    await w.press("next");
    await waitFor(w.frame, (f) => f.includes(":next_"), "next typed");
    await w.press(ENTER);
    // Fresh `init` graph: canon has no shadow → nothing blocked → the panel
    // shows the header + the batch-syncable line, not a crash.
    await waitFor(w.frame, (f) => f.includes("NEXT SAFE ACTIONS"), "next-actions panel");
    await waitFor(w.frame, (f) => f.includes("batch-syncable now"), "syncable line");
    // j/k on a possibly-empty list must be harmless.
    await w.press("j");
    await w.press("k");
    await w.press(ESC);
    await waitFor(w.frame, (f) => f.includes("next-actions panel dismissed"), "panel dismissed");
    w.unmount();
  });
});
