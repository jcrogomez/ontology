import { describe, it, expect } from "vitest";
import {
  resolveArtifactExtension,
  defaultExtensionForManifestation,
  inferManifestationFromSourcePath,
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

describe("inferManifestationFromSourcePath", () => {
  it("infers code for common source extensions", () => {
    expect(inferManifestationFromSourcePath("src/commands/ingest/index.ts")).toBe("code");
    expect(inferManifestationFromSourcePath("src/foo.tsx")).toBe("code");
    expect(inferManifestationFromSourcePath("scripts/run.js")).toBe("code");
    expect(inferManifestationFromSourcePath("src/lib.py")).toBe("code");
    expect(inferManifestationFromSourcePath("pkg/main.rs")).toBe("code");
    expect(inferManifestationFromSourcePath("cmd/main.go")).toBe("code");
  });

  it("infers test for .test/.spec suffixes (before generic code)", () => {
    expect(inferManifestationFromSourcePath("tests/foo.test.ts")).toBe("test");
    expect(inferManifestationFromSourcePath("tests/foo.spec.tsx")).toBe("test");
    expect(inferManifestationFromSourcePath("a/b.test.py")).toBe("test");
  });

  it("infers build for build.sh / build.bash basenames", () => {
    expect(inferManifestationFromSourcePath("scripts/build.sh")).toBe("build");
    expect(inferManifestationFromSourcePath("build.bash")).toBe("build");
  });

  it("returns undefined for prose, data, or unknown extensions", () => {
    expect(inferManifestationFromSourcePath("README.md")).toBeUndefined();
    expect(inferManifestationFromSourcePath("docs/foo.txt")).toBeUndefined();
    expect(inferManifestationFromSourcePath("config.json")).toBeUndefined();
    expect(inferManifestationFromSourcePath("LICENSE")).toBeUndefined();
    expect(inferManifestationFromSourcePath("")).toBeUndefined();
  });

  it("is case-insensitive on the extension", () => {
    expect(inferManifestationFromSourcePath("src/Foo.TS")).toBe("code");
    expect(inferManifestationFromSourcePath("src/Foo.Test.TS")).toBe("test");
  });
});
