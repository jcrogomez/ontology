import * as fs from "node:fs";
import { CLEAR_LITERAL, updateNode } from "../../../kernel/core/nodes/update-node.js";
import { errorMessage } from "../../../kernel/core/errors.js";

export interface NodeUpdateCommandOptions {
  prompt?: string;
  label?: string;
  rules?: string;
  requires?: string;
  provides?: string;
  forbids?: string;
  // Literal escape hatch (Project Legend Phase β-2). --literal sets a
  // new value (inline); --literal-file reads from disk; --clear-literal
  // strips the field so the node returns to model-driven compile.
  // The three are mutually exclusive.
  literal?: string;
  literalFile?: string;
  clearLiteral?: boolean;
  json?: boolean;
}

function splitTokens(raw: string | undefined, separator: "," | "|"): string[] | undefined {
  if (raw === undefined) return undefined;
  // Empty string means "clear" — return an empty array, not undefined.
  if (raw === "") return [];
  return raw.split(separator).map((s) => s.trim()).filter((s) => s.length > 0);
}

export async function nodeUpdateCommand(
  id: string,
  options: NodeUpdateCommandOptions,
): Promise<void> {
  // Refuse a no-op call so the user does not silently emit an event with
  // identical old and new hashes — guides them toward passing at least one
  // mutating flag.
  const literalFlagPassed =
    options.literal !== undefined
    || options.literalFile !== undefined
    || options.clearLiteral === true;
  const nothingPassed =
    options.prompt === undefined
    && options.label === undefined
    && options.rules === undefined
    && options.requires === undefined
    && options.provides === undefined
    && options.forbids === undefined
    && !literalFlagPassed;
  if (nothingPassed) {
    failWith(`onto node update requires at least one of --prompt / --label / --rules / --requires / --provides / --forbids / --literal / --literal-file / --clear-literal.`, options.json);
    return;
  }

  // --literal / --literal-file / --clear-literal: at most one.
  const literalFlagCount =
    (options.literal !== undefined ? 1 : 0)
    + (options.literalFile !== undefined ? 1 : 0)
    + (options.clearLiteral === true ? 1 : 0);
  if (literalFlagCount > 1) {
    failWith(`--literal, --literal-file and --clear-literal are mutually exclusive; pick one`, options.json);
    return;
  }

  let literalArg: string | typeof CLEAR_LITERAL | undefined;
  if (options.clearLiteral === true) {
    literalArg = CLEAR_LITERAL;
  } else if (options.literal !== undefined) {
    literalArg = options.literal;
  } else if (options.literalFile !== undefined) {
    try {
      literalArg = fs.readFileSync(options.literalFile, "utf-8");
    } catch (err: unknown) {
      failWith(`Could not read --literal-file "${options.literalFile}": ${errorMessage(err)}`, options.json);
      return;
    }
    // Binary-content guard. Same shape as the --candidate-file fix
    // (commit 14ecc51) and the create-side guard in
    // src/surfaces/commands/node/create.ts. NUL is a high-precision signal of
    // binary content; legitimate UTF-8 text essentially never contains
    // U+0000. node.literal is load-bearing (hashed, emitted verbatim),
    // so a garbled body would silently corrupt the audit chain.
    if (typeof literalArg === "string" && literalArg.includes("\u0000")) {
      failWith(`--literal-file must be a readable UTF-8 text file — ${options.literalFile} contains binary data.`, options.json);
      return;
    }
  }

  try {
    const { node, event } = updateNode({
      id,
      prompt: options.prompt,
      label: options.label,
      rules: splitTokens(options.rules, "|"),
      requires: splitTokens(options.requires, ","),
      provides: splitTokens(options.provides, ","),
      forbids: splitTokens(options.forbids, ","),
      literal: literalArg,
    });

    if (options.json) {
      console.log(JSON.stringify({
        ok: true,
        nodeId: node.id,
        eventId: event.eventId,
        oldHash: event.payload.oldHash,
        newHash: event.payload.newHash,
      }, null, 2));
      return;
    }

    console.log(`=== ONTOLOGY NODE UPDATED ===
Node:      ${node.id}
Label:     ${node.label}
Event:     ${event.eventId}
Old hash:  ${event.payload.oldHash}
New hash:  ${event.payload.newHash}

Next:
  onto node show ${node.id}
  onto validate`);
  } catch (err: unknown) {
    failWith(`Error updating node ${id}: ${errorMessage(err)}`, options.json);
  }
}

function failWith(msg: string, json?: boolean): void {
  if (json) {
    console.log(JSON.stringify({ ok: false, error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
  process.exit(1);
}
