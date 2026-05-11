import { updateNode } from "../../core/nodes/update-node.js";
import { errorMessage } from "../../core/errors.js";

export interface NodeUpdateCommandOptions {
  prompt?: string;
  label?: string;
  rules?: string;
  requires?: string;
  provides?: string;
  forbids?: string;
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
  const nothingPassed =
    options.prompt === undefined
    && options.label === undefined
    && options.rules === undefined
    && options.requires === undefined
    && options.provides === undefined
    && options.forbids === undefined;
  if (nothingPassed) {
    failWith(`onto node update requires at least one of --prompt / --label / --rules / --requires / --provides / --forbids.`, options.json);
    return;
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
