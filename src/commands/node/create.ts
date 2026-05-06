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

  try {
    const { node, event } = createNode({
      level,
      kind,
      prompt: options.prompt,
      label: options.label,
      manifestation,
      language: options.language,
    });

    console.log(`=== ONTOLOGY NODE CREATED ===
Node:          ${node.id}
Label:         ${node.label}
Level:         ${node.coordinates.abstraction}
Kind:          ${node.kind}
Manifestation: ${node.coordinates.manifestation}
Branch:        ${node.coordinates.branch}
Parent:        ${node.graph.parentId}
Event:         ${event.eventId}${node.technical.language ? `\nLanguage:      ${node.technical.language}` : ""}

Next:
  onto node show ${node.id}
  onto validate`);
  } catch (err: unknown) {
    console.error(`✖ Error during node creation: ${errorMessage(err)}`);
    process.exit(1);
  }
}
