import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { NodeDraftSchema, type NodeDraft } from "../../schemas/ontology.js";
import { getOntologyPaths } from "../project/paths.js";
import { ensureDir, writeJson } from "../fs/json.js";

// Draft persistence: ephemeral on-disk state for the walker's edit mode.
//
// Drafts are NOT events. They are the user's keystrokes mid-thought. Promoting
// a draft to a proposal (via `:propose` in the walker, or future tooling)
// produces a proper append-only proposal_created event; until then, drafts
// can be saved, overwritten, or cleared without touching the network log.
//
// Filename: .ontology/work/drafts/<focalNodeId>.draft.json
//
// One draft per focal node. Re-entering edit mode loads the existing draft.

export function draftPath(focalNodeId: string, cwd: string = process.cwd()): string {
  const paths = getOntologyPaths(cwd);
  return path.join(paths.draftsDir, `${focalNodeId}.draft.json`);
}

export function loadDraft(focalNodeId: string, cwd: string = process.cwd()): NodeDraft | null {
  const filePath = draftPath(focalNodeId, cwd);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  try {
    return NodeDraftSchema.parse(JSON.parse(content));
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      const summary = err.issues.slice(0, 3).map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
      throw new Error(`Failed to parse draft for ${focalNodeId}: ${summary}`);
    }
    throw new Error(`Failed to parse draft for ${focalNodeId}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface SaveDraftOptions {
  focalNodeId: string;
  draftPrompt: string;
  cwd?: string;
}

// Saves or overwrites a draft. Returns the persisted record.
// `createdAt` is preserved across saves; only `updatedAt` advances.
export function saveDraft(options: SaveDraftOptions): NodeDraft {
  const cwd = options.cwd ?? process.cwd();
  const paths = getOntologyPaths(cwd);
  const now = Math.floor(Date.now() / 1000);

  const existing = loadDraft(options.focalNodeId, cwd);
  const record = NodeDraftSchema.parse({
    focalNodeId: options.focalNodeId,
    draftPrompt: options.draftPrompt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  ensureDir(paths.draftsDir);
  writeJson(draftPath(options.focalNodeId, cwd), record);
  return record;
}

// Removes a draft from disk if it exists. No-op if it doesn't. Returns true
// when a draft was actually deleted, false otherwise.
export function clearDraft(focalNodeId: string, cwd: string = process.cwd()): boolean {
  const filePath = draftPath(focalNodeId, cwd);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

// Lists every draft under .ontology/work/drafts/. Useful for surfacing
// "(N drafts pending)" in inspect output or for cleanup commands.
export function listDrafts(cwd: string = process.cwd()): NodeDraft[] {
  const paths = getOntologyPaths(cwd);
  if (!fs.existsSync(paths.draftsDir)) return [];
  const files = fs.readdirSync(paths.draftsDir).filter(f => f.endsWith(".draft.json"));
  const out: NodeDraft[] = [];
  for (const file of files) {
    const focalNodeId = file.replace(/\.draft\.json$/, "");
    const draft = loadDraft(focalNodeId, cwd);
    if (draft) out.push(draft);
  }
  return out.sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    return a.focalNodeId.localeCompare(b.focalNodeId);
  });
}
