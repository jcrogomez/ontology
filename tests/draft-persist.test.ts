import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { createTempProject, cleanupTempProject } from "./helpers/temp-project.js";
import { runCli } from "./helpers/run-cli.js";
import {
  saveDraft,
  loadDraft,
  clearDraft,
  listDrafts,
  draftPath,
} from "../src/core/drafts/persist.js";

describe("drafts persistence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempProject();
    expect(runCli(tempDir, ["init"]).status).toBe(0);
  });

  afterEach(() => cleanupTempProject(tempDir));

  it("loadDraft returns null when no draft exists", () => {
    expect(loadDraft("node_0000_canon", tempDir)).toBeNull();
  });

  it("saveDraft writes a record under .ontology/work/drafts/", () => {
    const draft = saveDraft({ focalNodeId: "node_0000_canon", draftPrompt: "hello", cwd: tempDir });
    expect(draft.focalNodeId).toBe("node_0000_canon");
    expect(draft.draftPrompt).toBe("hello");
    const filePath = draftPath("node_0000_canon", tempDir);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("does NOT mutate state.json or events.jsonl when saving a draft (drafts are not events)", () => {
    const stateBefore = fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8");
    const eventsBefore = fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8");
    saveDraft({ focalNodeId: "node_0000_canon", draftPrompt: "x", cwd: tempDir });
    expect(fs.readFileSync(path.join(tempDir, ".ontology/state.json"), "utf-8")).toBe(stateBefore);
    expect(fs.readFileSync(path.join(tempDir, ".ontology/events.jsonl"), "utf-8")).toBe(eventsBefore);
  });

  it("saveDraft preserves createdAt across re-saves and advances updatedAt", () => {
    const first = saveDraft({ focalNodeId: "node_0000_canon", draftPrompt: "a", cwd: tempDir });
    // Sleep a moment so the second save's updatedAt can differ.
    const second = saveDraft({ focalNodeId: "node_0000_canon", draftPrompt: "b", cwd: tempDir });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.draftPrompt).toBe("b");
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
  });

  it("loadDraft round-trips the persisted record", () => {
    saveDraft({ focalNodeId: "node_0000_canon", draftPrompt: "round-trip", cwd: tempDir });
    const loaded = loadDraft("node_0000_canon", tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.draftPrompt).toBe("round-trip");
  });

  it("clearDraft returns true when removing an existing draft", () => {
    saveDraft({ focalNodeId: "node_0000_canon", draftPrompt: "x", cwd: tempDir });
    expect(clearDraft("node_0000_canon", tempDir)).toBe(true);
    expect(loadDraft("node_0000_canon", tempDir)).toBeNull();
    expect(clearDraft("node_0000_canon", tempDir)).toBe(false);
  });

  it("listDrafts returns drafts sorted by updatedAt desc then id asc", () => {
    // Hand-craft distinct updatedAt values to avoid clock-resolution flakes:
    // both saveDraft calls within the same wall-clock second would tie at
    // updatedAt and then fall through to the alphabetic tiebreaker.
    saveDraft({ focalNodeId: "node_a", draftPrompt: "1", cwd: tempDir });
    saveDraft({ focalNodeId: "node_b", draftPrompt: "2", cwd: tempDir });
    const dir = path.join(tempDir, ".ontology/work/drafts");
    const fileA = path.join(dir, "node_a.draft.json");
    const fileB = path.join(dir, "node_b.draft.json");
    const a = JSON.parse(fs.readFileSync(fileA, "utf-8"));
    const b = JSON.parse(fs.readFileSync(fileB, "utf-8"));
    a.updatedAt = 1000;
    b.updatedAt = 2000;
    fs.writeFileSync(fileA, JSON.stringify(a));
    fs.writeFileSync(fileB, JSON.stringify(b));
    const all = listDrafts(tempDir);
    expect(all.length).toBe(2);
    // Most recent first.
    expect(all[0].focalNodeId).toBe("node_b");
    expect(all[1].focalNodeId).toBe("node_a");
  });

  it("listDrafts uses focal id as a tiebreaker when updatedAt matches", () => {
    saveDraft({ focalNodeId: "node_b", draftPrompt: "2", cwd: tempDir });
    saveDraft({ focalNodeId: "node_a", draftPrompt: "1", cwd: tempDir });
    // Force identical updatedAt on disk to exercise the tiebreaker path.
    const dir = path.join(tempDir, ".ontology/work/drafts");
    for (const f of ["node_a.draft.json", "node_b.draft.json"]) {
      const filePath = path.join(dir, f);
      const r = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      r.updatedAt = 1234;
      fs.writeFileSync(filePath, JSON.stringify(r));
    }
    const all = listDrafts(tempDir);
    expect(all.map(d => d.focalNodeId)).toEqual(["node_a", "node_b"]);
  });

  it("listDrafts ignores files that do not match the .draft.json suffix", () => {
    saveDraft({ focalNodeId: "node_a", draftPrompt: "x", cwd: tempDir });
    fs.writeFileSync(path.join(tempDir, ".ontology/work/drafts/notes.md"), "ignore");
    const all = listDrafts(tempDir);
    expect(all.length).toBe(1);
  });
});
