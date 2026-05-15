import { describe, it, expect } from "vitest";
import {
  LLM_TASK_KINDS,
  MODEL_CAPABILITY_PROFILES,
  ModelCapabilityProfileSchema,
  getCapabilityProfile,
  isModelBannedForTask,
  modelsPreferredForTask,
} from "../src/runtime/llm/model-capabilities.js";

describe("model-capabilities — initial profiles validate", () => {
  it("every profile parses cleanly against the Zod schema", () => {
    for (const profile of MODEL_CAPABILITY_PROFILES) {
      const result = ModelCapabilityProfileSchema.safeParse(profile);
      if (!result.success) {
        throw new Error(
          `Profile for ${profile.model} failed: ${JSON.stringify(result.error.issues)}`,
        );
      }
      expect(result.success).toBe(true);
    }
  });

  it("every profile has either bannedFor, preferredFor, or notes — no empty entries", () => {
    for (const profile of MODEL_CAPABILITY_PROFILES) {
      const hasContent =
        (profile.bannedFor && profile.bannedFor.length > 0) ||
        (profile.preferredFor && profile.preferredFor.length > 0) ||
        (profile.notes && profile.notes.length > 0);
      expect(hasContent).toBe(true);
    }
  });

  it("includes the four bake-off models", () => {
    const models = MODEL_CAPABILITY_PROFILES.map((p) => p.model);
    expect(models).toContain("qwen2.5-coder:3b");
    expect(models).toContain("llama3.2:3b");
    expect(models).toContain("deepseek-r1:1.5b");
    expect(models).toContain("phi3:mini");
  });
});

describe("model-capabilities — getCapabilityProfile", () => {
  it("returns the profile for an exact-match model id", () => {
    const profile = getCapabilityProfile("qwen2.5-coder:3b");
    expect(profile).toBeDefined();
    expect(profile?.preferredFor).toContain("structured_extraction");
  });

  it("returns undefined for models without a profile", () => {
    expect(getCapabilityProfile("totally-unknown:9b")).toBeUndefined();
  });

  it("is exact-match — no fuzzy / prefix matching", () => {
    // A near-match (right family, wrong size) must not return the
    // calibrated profile. Mistaking one model for another based on
    // partial-string match is the failure mode we want to avoid.
    expect(getCapabilityProfile("qwen2.5-coder")).toBeUndefined();
    expect(getCapabilityProfile("qwen2.5-coder:7b")).toBeUndefined();
  });
});

describe("model-capabilities — isModelBannedForTask", () => {
  it("deepseek-r1:1.5b is banned for structured_extraction", () => {
    expect(isModelBannedForTask("deepseek-r1:1.5b", "structured_extraction")).toBe(true);
  });

  it("deepseek-r1:1.5b is NOT banned for reasoning (no profile declaration)", () => {
    // The profile bans structured_extraction only; absence of an
    // entry for `reasoning` is permission, not prohibition.
    expect(isModelBannedForTask("deepseek-r1:1.5b", "reasoning")).toBe(false);
  });

  it("qwen2.5-coder:3b is not banned for any task", () => {
    for (const task of LLM_TASK_KINDS) {
      expect(isModelBannedForTask("qwen2.5-coder:3b", task)).toBe(false);
    }
  });

  it("models without a profile return false (no opinion = permitted)", () => {
    expect(isModelBannedForTask("some-future-model:42b", "structured_extraction")).toBe(false);
  });
});

describe("model-capabilities — modelsPreferredForTask", () => {
  it("returns both qwen and llama for structured_extraction (in declaration order)", () => {
    const preferred = modelsPreferredForTask("structured_extraction");
    expect(preferred).toContain("qwen2.5-coder:3b");
    expect(preferred).toContain("llama3.2:3b");
    expect(preferred.indexOf("qwen2.5-coder:3b")).toBeLessThan(
      preferred.indexOf("llama3.2:3b"),
    );
  });

  it("returns qwen for code_generation", () => {
    expect(modelsPreferredForTask("code_generation")).toContain("qwen2.5-coder:3b");
  });

  it("returns empty array for tasks no model is preferred for (yet)", () => {
    expect(modelsPreferredForTask("critique")).toEqual([]);
  });
});

describe("model-capabilities — schema rejects malformed profiles", () => {
  it("rejects an empty model id", () => {
    expect(
      ModelCapabilityProfileSchema.safeParse({ model: "" }).success,
    ).toBe(false);
  });

  it("rejects an invalid task kind in bannedFor", () => {
    const result = ModelCapabilityProfileSchema.safeParse({
      model: "x:1b",
      bannedFor: ["not-a-real-task-kind"],
    });
    expect(result.success).toBe(false);
  });
});
