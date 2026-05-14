import { createHash } from "node:crypto";

// Pure transform fixture #1. Predicted: pure-transform via
// /src/core/integrity/ rule (the canonical pure subtree). A frontier
// model regenerating this from the intent prompt should preserve the
// SHA-256 choice and the input/output shape; layout details may
// rotate without breaking semantic equivalence.

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

export function shortHash(input: string, n = 12): string {
  return sha256Hex(input).slice(0, n);
}
