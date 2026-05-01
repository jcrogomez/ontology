import { createHash } from "node:crypto";
import stringify from "fast-json-stable-stringify";

// Stable hashes are the immune system of Ontology. They let validate detect manual edits outside the CLI mutation path.
export function hashObject(value: unknown): string {
  const json = stringify(value);
  return createHash("sha256").update(json).digest("hex");
}

// The hash field must be removed before hashing. A value cannot certify itself.
export function removeIntegrityHash<T extends { integrity: { hash?: string } }>(value: T): T {
  const { integrity, ...rest } = value;
  const newIntegrity = { ...integrity };
  delete newIntegrity.hash;

  return {
    ...rest,
    integrity: newIntegrity,
  } as unknown as T;
}
