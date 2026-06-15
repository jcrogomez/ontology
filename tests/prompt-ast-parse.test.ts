import { describe, it, expect } from "vitest";
import { parsePromptAST, hasMarkers } from "../src/forward/prompt/parse.js";

describe("parsePromptAST", () => {
  it("returns the raw prompt unchanged", () => {
    const raw = "anything\nat\nall";
    const ast = parsePromptAST(raw);
    expect(ast.raw).toBe(raw);
  });

  it("body equals the trimmed raw when no markers are present", () => {
    const ast = parsePromptAST("\n  Print a greeting.\n  ");
    expect(ast.body).toBe("Print a greeting.");
    expect(ast.markers).toEqual({ requires: [], provides: [], expand: [] });
    expect(hasMarkers(ast)).toBe(false);
  });

  it("strips a single requires marker and collects its tokens", () => {
    const ast = parsePromptAST("@requires: A, B\nbody text");
    expect(ast.body).toBe("body text");
    expect(ast.markers.requires).toEqual(["A", "B"]);
    expect(hasMarkers(ast)).toBe(true);
  });

  it("recognises all three marker types and preserves order across lines", () => {
    const raw = [
      "@requires: cfg",
      "@provides: handler",
      "@expand: node_0001",
      "Compose the request handler from the loaded config.",
      "@requires: env",  // additional requires below the body
    ].join("\n");
    const ast = parsePromptAST(raw);
    expect(ast.body).toBe("Compose the request handler from the loaded config.");
    expect(ast.markers.requires).toEqual(["cfg", "env"]);
    expect(ast.markers.provides).toEqual(["handler"]);
    expect(ast.markers.expand).toEqual(["node_0001"]);
  });

  it("de-duplicates tokens within a marker (first occurrence wins)", () => {
    const ast = parsePromptAST([
      "@requires: A, A, B",
      "@requires: A",
      "body",
    ].join("\n"));
    expect(ast.markers.requires).toEqual(["A", "B"]);
  });

  it("tolerates extra whitespace around tokens and the colon", () => {
    const ast = parsePromptAST("@requires :   A,   B  ,C\nbody");
    expect(ast.markers.requires).toEqual(["A", "B", "C"]);
  });

  it("ignores marker-shaped text inside prose (line anchor required)", () => {
    const ast = parsePromptAST("we @requires: foo because reasons");
    expect(ast.body).toBe("we @requires: foo because reasons");
    expect(ast.markers.requires).toEqual([]);
  });

  it("an empty marker yields an empty token list and is still consumed from the body", () => {
    const ast = parsePromptAST([
      "@requires:",
      "real body",
    ].join("\n"));
    expect(ast.body).toBe("real body");
    expect(ast.markers.requires).toEqual([]);
  });

  it("matches indented marker lines", () => {
    const ast = parsePromptAST("    @provides: tok\nbody");
    expect(ast.markers.provides).toEqual(["tok"]);
  });

  it("normalises CRLF line endings", () => {
    const ast = parsePromptAST("@requires: A\r\nbody\r\n");
    expect(ast.markers.requires).toEqual(["A"]);
    expect(ast.body).toBe("body");
  });

  it("preserves blank lines within the body", () => {
    const ast = parsePromptAST([
      "@requires: A",
      "first paragraph",
      "",
      "second paragraph",
    ].join("\n"));
    expect(ast.body).toBe("first paragraph\n\nsecond paragraph");
  });

  it("does not recognise unknown marker names", () => {
    const ast = parsePromptAST([
      "@arbitrary: nope",
      "body",
    ].join("\n"));
    expect(ast.body).toBe("@arbitrary: nope\nbody");
    expect(hasMarkers(ast)).toBe(false);
  });

  it("returns empty marker arrays as a frozen carrier (no shared mutation)", () => {
    const a = parsePromptAST("body");
    const b = parsePromptAST("body");
    expect(a.markers.requires).not.toBe(b.markers.requires); // distinct arrays
    expect(a.markers).toEqual(b.markers);
  });
});
