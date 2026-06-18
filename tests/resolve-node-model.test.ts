import { describe, it, expect } from "vitest";
import { resolveNodeModel, resolveTaskModel } from "../src/runtime/llm/resolve-node-model.js";
import type { OntologyModel } from "../src/kernel/schemas/ontology.js";

const mockEntry: OntologyModel = {
  id: "mock_default",
  provider: "mock",
  name: "deterministic-mock-model",
  temperature: 0,
  multimodal: false,
  notes: "default mock",
};
const ollamaEntry: OntologyModel = {
  id: "qwen-coder",
  provider: "ollama",
  name: "qwen2.5-coder:1.5b",
  temperature: 0.2,
  multimodal: false,
};
const openaiEntry: OntologyModel = {
  id: "gpt5",
  provider: "openai",
  name: "gpt-5",
  temperature: 0.2,
  multimodal: false,
};

describe("resolveNodeModel", () => {
  it("resolves a known mock ref to (provider, name)", () => {
    const r = resolveNodeModel("mock_default", { models: [mockEntry] });
    expect(r).toEqual({ ok: true, resolved: { provider: "mock", model: "deterministic-mock-model" } });
  });

  it("resolves an ollama ref", () => {
    const r = resolveNodeModel("qwen-coder", { models: [ollamaEntry] });
    expect(r).toEqual({ ok: true, resolved: { provider: "ollama", model: "qwen2.5-coder:1.5b" } });
  });

  it("returns ref_not_found when the id is missing from the registry", () => {
    const r = resolveNodeModel("does_not_exist", { models: [mockEntry] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("ref_not_found");
      expect(r.message).toContain("does_not_exist");
    }
  });

  it("returns unsupported_provider for entries the dispatcher cannot route yet", () => {
    const r = resolveNodeModel("gpt5", { models: [openaiEntry] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unsupported_provider");
      expect(r.message).toContain("openai");
    }
  });

  it("matches on the FIRST entry with the given id (deterministic on duplicates)", () => {
    const dup: OntologyModel = { ...mockEntry, name: "alt-mock" };
    const r = resolveNodeModel("mock_default", { models: [mockEntry, dup] });
    expect(r).toEqual({ ok: true, resolved: { provider: "mock", model: "deterministic-mock-model" } });
  });

  it("treats an empty registry as ref_not_found, not as a crash", () => {
    const r = resolveNodeModel("anything", { models: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("ref_not_found");
  });
});

describe("resolveTaskModel (per-task routing)", () => {
  const models = [mockEntry, ollamaEntry];

  it("returns null when there is no routing map (per-node fallback)", () => {
    expect(resolveTaskModel("code_sketch", { models })).toBeNull();
  });

  it("returns null when the task has no routing entry", () => {
    expect(resolveTaskModel("inspect", { models, routing: { code_sketch: "qwen-coder" } })).toBeNull();
  });

  it("resolves the routed model id for a task", () => {
    const r = resolveTaskModel("code_sketch", { models, routing: { code_sketch: "qwen-coder" } });
    expect(r).toEqual({ ok: true, resolved: { provider: "ollama", model: "qwen2.5-coder:1.5b" } });
  });

  it("routes different tasks to different models (F code-model vs G reasoning-model intent)", () => {
    const reg = { models, routing: { code_sketch: "qwen-coder", semantic_parse: "mock_default" } };
    expect(resolveTaskModel("code_sketch", reg)).toMatchObject({ ok: true, resolved: { model: "qwen2.5-coder:1.5b" } });
    expect(resolveTaskModel("semantic_parse", reg)).toMatchObject({ ok: true, resolved: { model: "deterministic-mock-model" } });
  });

  it("surfaces an unresolvable routed id as a failed result (not null)", () => {
    const r = resolveTaskModel("code_sketch", { models, routing: { code_sketch: "does-not-exist" } });
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toBe("ref_not_found");
  });

  it("ignores an empty-string routing entry (treated as unset)", () => {
    expect(resolveTaskModel("code_sketch", { models, routing: { code_sketch: "" } })).toBeNull();
  });
});
