#!/usr/bin/env -S npx tsx

// Move 3α bake-off synthesis driver.
//
// Reads the three verify-homeomorphism --json sidecars (Arm A qwen,
// Arm B granite, Arm C-local starcoder), feeds them to the
// synthesizeBakeoff reducer in src/runtime/legend/bakeoff-synthesis.ts,
// and writes both a markdown report and a JSON sidecar under
// docs/legend/calibrations/. Pure read+write — no LLM dispatch.
//
// This is the "tiny hand-rolled driver" the TODO mentions (line 172):
// the synthesis module is fully tested as a library; once a CLI
// surface ships, this script is the migration path.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadAggregateReport,
  synthesizeBakeoff,
  renderBakeoffSynthesisMarkdown,
  BakeoffSynthesisSchema,
} from "../src/runtime/legend/bakeoff-synthesis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const arms = [
  {
    label: "A",
    provider: "ollama",
    model: "qwen2.5-coder:7b",
    sidecar: path.join(repoRoot, ".ontology.self-ingest-epsilon-3a-arm-a.json"),
  },
  {
    label: "B",
    provider: "ollama",
    model: "granite4.1:8b",
    sidecar: path.join(repoRoot, ".ontology.self-ingest-epsilon-3a-arm-b.json"),
  },
  {
    label: "C-local",
    provider: "ollama",
    model: "starcoder2:7b",
    sidecar: path.join(
      repoRoot,
      ".ontology.self-ingest-epsilon-3a-arm-c-local.json",
    ),
  },
];

for (const arm of arms) {
  if (!fs.existsSync(arm.sidecar)) {
    console.error(`✖ missing sidecar for arm ${arm.label}: ${arm.sidecar}`);
    process.exit(1);
  }
}

const bakeoffArms = arms.map((a) => ({
  label: a.label,
  provider: a.provider,
  model: a.model,
  report: loadAggregateReport(a.sidecar),
}));

const synthesis = synthesizeBakeoff(bakeoffArms);

// Validate against the module's own Zod schema — fails loudly if the
// reducer ever drifts from its declared output shape.
BakeoffSynthesisSchema.parse(synthesis);

const markdown = renderBakeoffSynthesisMarkdown(synthesis);

const outMd = path.join(
  repoRoot,
  "docs/legend/calibrations/SELF_INGEST_EPSILON_3A_2026-05-19_SYNTHESIS.md",
);
const outJson = path.join(
  repoRoot,
  ".ontology.self-ingest-epsilon-3a-synthesis.json",
);

fs.writeFileSync(outMd, markdown);
fs.writeFileSync(outJson, JSON.stringify(synthesis, null, 2));

console.log(`✓ markdown → ${path.relative(repoRoot, outMd)}`);
console.log(`✓ json     → ${path.relative(repoRoot, outJson)}`);
console.log(``);
console.log(`Summary:`);
console.log(`  arms              : ${synthesis.armCount}`);
console.log(`  baseline          : ${synthesis.baselineLabel}`);
console.log(`  H1 floor          : ${synthesis.h1.jaccardFloor}`);
console.log(`  H1 allPass        : ${synthesis.h1.allPass}`);
console.log(`  H1 anyPass        : ${synthesis.h1.anyPass}`);
for (const arm of synthesis.h1.perArm) {
  const mj =
    arm.meanStructuralJaccard === null
      ? "—"
      : arm.meanStructuralJaccard.toFixed(3);
  console.log(
    `    arm ${arm.label.padEnd(8)}: meanJaccard=${mj.padStart(5)}  passes=${arm.passes}`,
  );
}
