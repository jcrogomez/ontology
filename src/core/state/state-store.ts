import { readJson, writeJson } from "../fs/json.js";
import { getOntologyPaths } from "../project/paths.js";
import { OntologyStateSchema, type OntologyState } from "../../schemas/ontology.js";

export function readState(): OntologyState {
  const paths = getOntologyPaths();
  const data = readJson(paths.statePath);
  return OntologyStateSchema.parse(data);
}

export function writeState(state: OntologyState): void {
  const paths = getOntologyPaths();
  // Ensure the state matches the schema before writing
  const validatedState = OntologyStateSchema.parse(state);
  writeJson(paths.statePath, validatedState);
}
