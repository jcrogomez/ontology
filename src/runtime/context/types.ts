import { OntologyNode } from "../../schemas/ontology.js";

export interface ContextAssemblyInput {
  targetNodeId: string;
  branch?: string;
  time?: number;
  mode?: "strict" | "compare" | "propose";
}

export interface ContextAssemblyOutput {
  mode: "strict";
  targetNodeId: string;
  branch: string;
  nodes: OntologyNode[];
  canon: string;
  constraints: string[];
  prompt: string;
}
