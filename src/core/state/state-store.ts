import { readJson, writeJson } from "../fs/json.js";
import { getOntologyPaths } from "../project/paths.js";
import { OntologyStateSchema, type OntologyState } from "../../schemas/ontology.js";

// `cwd` is optional. When omitted, both helpers fall back to process.cwd().
// Callers that need to operate against a specific project root (tests, kernels
// invoked programmatically with explicit paths, future MCP surface) pass cwd
// explicitly so they do not depend on the parent process's working directory.

export function readState(cwd?: string): OntologyState {
  const paths = getOntologyPaths(cwd);
  const data = readJson(paths.statePath);
  return OntologyStateSchema.parse(data);
}

export function writeState(state: OntologyState, cwd?: string): void {
  const paths = getOntologyPaths(cwd);
  // Ensure the state matches the schema before writing
  const validatedState = OntologyStateSchema.parse(state);
  writeJson(paths.statePath, validatedState);
}
