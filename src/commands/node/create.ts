import * as fs from "node:fs";
import { createNode } from "../../core/nodes/create-node.js";
import { AbstractionLevelSchema, ManifestationSchema, NodeKindSchema } from "../../schemas/ontology.js";
import { errorMessage } from "../../core/errors.js";
import { z } from "zod";

export interface NodeCreateCommandOptions {
  level: string;
  kind: string;
  prompt: string;
  label?: string;
  manifestation?: string;
  language?: string;
  // Comma-separated lists of structured contract tokens. Land in
  // node.context.{requires, provides, forbids} so the validator and the
  // assembled LLM prompt see them at link/compile time.
  requires?: string;
  provides?: string;
  forbids?: string;
  // Pipe-separated rules (FORBID:/REQUIRE: prose). Pipe rather than comma
  // because rule text often contains commas.
  rules?: string;
  // Literal escape hatch (Project Legend Phase β-2). Either pass the
  // text inline with --literal or point at a file with --literal-file.
  // Mutually exclusive. When set, compile bypasses model dispatch.
  literal?: string;
  literalFile?: string;
}

// Split a comma- or pipe-separated CLI argument into trimmed, non-empty
// tokens. Returns undefined when the input itself is undefined so the
// caller can distinguish "flag not passed" from "flag passed empty".
function splitTokens(raw: string | undefined, separator: "," | "|"): string[] | undefined {
  if (raw === undefined) return undefined;
  return raw.split(separator).map((s) => s.trim()).filter((s) => s.length > 0);
}

export async function createNodeCommand(options: NodeCreateCommandOptions): Promise<void> {
  let level: z.infer<typeof AbstractionLevelSchema>;
  let kind: z.infer<typeof NodeKindSchema>;
  let manifestation: z.infer<typeof ManifestationSchema> | undefined;

  try {
    level = AbstractionLevelSchema.parse(options.level);
  } catch (error) {
    console.error(`✖ Invalid level: "${options.level}". Expected one of: ${AbstractionLevelSchema.options.join(", ")}`);
    process.exit(1);
  }

  try {
    kind = NodeKindSchema.parse(options.kind);
  } catch (error) {
    console.error(`✖ Invalid kind: "${options.kind}". Expected one of: ${NodeKindSchema.options.join(", ")}`);
    process.exit(1);
  }

  if (options.manifestation !== undefined) {
    const r = ManifestationSchema.safeParse(options.manifestation);
    if (!r.success) {
      console.error(`✖ Invalid manifestation: "${options.manifestation}". Expected one of: ${ManifestationSchema.options.join(", ")}`);
      process.exit(1);
    }
    manifestation = r.data;
  }

  if (options.literal !== undefined && options.literalFile !== undefined) {
    console.error(`✖ --literal and --literal-file are mutually exclusive; pick one`);
    process.exit(1);
  }
  let literal: string | undefined;
  if (options.literal !== undefined) {
    literal = options.literal;
  } else if (options.literalFile !== undefined) {
    try {
      literal = fs.readFileSync(options.literalFile, "utf-8");
    } catch (err: unknown) {
      console.error(`✖ Could not read --literal-file "${options.literalFile}": ${errorMessage(err)}`);
      process.exit(1);
    }
    // Binary-content guard. fs.readFileSync(..., "utf8") does not throw
    // on binary input — it silently returns a string of garbled bytes
    // plus U+FFFD replacements. node.literal is load-bearing (it
    // participates in the node hash and propagates verbatim to the
    // compiled artifact), so a binary file slipped in here would land
    // a garbled artifact and break the audit chain. NUL is a
    // high-precision signal of binary; legitimate UTF-8 text essentially
    // never contains U+0000. Same pattern as the --candidate-file fix
    // (commit 14ecc51).
    if (literal.includes("\u0000")) {
      console.error(`✖ --literal-file must be a readable UTF-8 text file — ${options.literalFile} contains binary data.`);
      process.exit(1);
    }
  }

  try {
    const { node, event } = createNode({
      level,
      kind,
      prompt: options.prompt,
      label: options.label,
      manifestation,
      language: options.language,
      requires: splitTokens(options.requires, ","),
      provides: splitTokens(options.provides, ","),
      forbids: splitTokens(options.forbids, ","),
      rules: splitTokens(options.rules, "|"),
      literal,
    });

    console.log(`=== ONTOLOGY NODE CREATED ===
Node:          ${node.id}
Label:         ${node.label}
Level:         ${node.coordinates.abstraction}
Kind:          ${node.kind}
Manifestation: ${node.coordinates.manifestation}
Branch:        ${node.coordinates.branch}
Parent:        ${node.graph.parentId}
Event:         ${event.eventId}${node.technical.language ? `\nLanguage:      ${node.technical.language}` : ""}${node.literal !== undefined ? `\nLiteral:       ${node.literal.length} bytes (compile will emit verbatim, no model dispatch)` : ""}

Next:
  onto node show ${node.id}
  onto validate`);
  } catch (err: unknown) {
    console.error(`✖ Error during node creation: ${errorMessage(err)}`);
    process.exit(1);
  }
}
