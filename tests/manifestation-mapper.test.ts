import { describe, it, expect } from "vitest";
import {
  resolveArtifactExtension,
  defaultExtensionForManifestation,
} from "../src/runtime/compile/manifestation-mapper.js";

describe("manifestation-mapper", () => {
  it("returns the per-manifestation default extension", () => {
    expect(defaultExtensionForManifestation("intent")).toBe("txt");
    expect(defaultExtensionForManifestation("ast")).toBe("json");
    expect(defaultExtensionForManifestation("osl")).toBe("osl");
    expect(defaultExtensionForManifestation("code")).toBe("txt");
    expect(defaultExtensionForManifestation("test")).toBe("txt");
    expect(defaultExtensionForManifestation("build")).toBe("sh");
  });

  it("language tag overrides for manifestation=code", () => {
    expect(resolveArtifactExtension({ manifestation: "code", language: "python" })).toBe("py");
    expect(resolveArtifactExtension({ manifestation: "code", language: "typescript" })).toBe("ts");
    expect(resolveArtifactExtension({ manifestation: "code", language: "rust" })).toBe("rs");
  });

  it("language tag overrides for manifestation=test", () => {
    expect(resolveArtifactExtension({ manifestation: "test", language: "python" })).toBe("py");
  });

  it("language tag is ignored for non-code manifestations", () => {
    expect(resolveArtifactExtension({ manifestation: "intent", language: "python" })).toBe("txt");
    expect(resolveArtifactExtension({ manifestation: "ast", language: "python" })).toBe("json");
    expect(resolveArtifactExtension({ manifestation: "build", language: "python" })).toBe("sh");
  });

  it("falls back to default when language is unknown", () => {
    expect(resolveArtifactExtension({ manifestation: "code", language: "klingon" })).toBe("txt");
  });

  it("language matching is case-insensitive", () => {
    expect(resolveArtifactExtension({ manifestation: "code", language: "PYTHON" })).toBe("py");
    expect(resolveArtifactExtension({ manifestation: "code", language: "TypeScript" })).toBe("ts");
  });
});
