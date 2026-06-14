#!/usr/bin/env node
// Deterministic frozen edit-set for LENS_LAWS_2026-06-13. No RNG.
// Pre-registration: docs/legend/calibrations/LENS_LAWS_2026-06-13_HYPOTHESIS.md §2.
import fs from "node:fs";
import path from "node:path";

const REPO = "/Users/juancarlosromero/Development/ontology";
const NODES = ["node_0017", "node_0022", "node_0131", "node_0176", "node_0223", "node_0225"];
const OUT = path.join(REPO, ".ontology.scratch-lens-laws-2026-06-13");
fs.mkdirSync(OUT, { recursive: true });

const editset = NODES.map((id) => {
  const num = id.replace("node_", "");
  const node = JSON.parse(fs.readFileSync(path.join(REPO, ".ontology/nodes", id + ".json"), "utf8"));
  const provides = (node.context?.provides || []).map((p) => (typeof p === "string" ? p : p.key));
  const mainExport = provides[0] ?? "<main>";
  return {
    id,
    srcRel: node.outputs.files[0],
    mainExport,
    e1: {
      marker: `LENS_MARKER_${num}`,
      value: `lens_${num}`,
      promptClause: `\n- LENS_MARKER_${num}: MUST also export a const named LENS_MARKER_${num} with the exact string value "lens_${num}".`,
    },
    e2: {
      rule: `REQUIRE: ${mainExport} is a pure function with no side effects.`,
    },
    e3: {
      marker: `LENS_CODE_MARKER_${num}`,
      value: `code_${num}`,
      codeAppend: `\nexport const LENS_CODE_MARKER_${num} = "code_${num}";\n`,
    },
  };
});

fs.writeFileSync(path.join(OUT, "editset.json"), JSON.stringify(editset, null, 2));
console.log("editset written:", editset.length, "nodes ->", path.join(OUT, "editset.json"));
