import { loadEdges as coreLoadEdges } from "../../core/project/load.js";
import { OntologyEdge } from "../../schemas/ontology.js";

export function loadEdges(cwd?: string): OntologyEdge[] {
  return coreLoadEdges(cwd);
}
