import { OntologyEdge, OntologyNode } from "../../kernel/schemas/ontology.js";

export interface ContextAssemblyInput {
  targetNodeId: string;
  branch?: string;
  time?: number;
  mode?: "strict" | "compare" | "propose";
  includeEdges?: boolean;
  edgeTypes?: OntologyEdge["type"][];
}

export interface ContextAssemblyOutput {
  mode: "strict";
  targetNodeId: string;
  branch: string;
  nodes: OntologyNode[];
  canon: string;
  constraints: string[];
  prompt: string;
  warnings?: string[];
  edgeContext?: {
    edges: OntologyEdge[];
    nodeIds: string[];
  };
}
