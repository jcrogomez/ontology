import React from "react";
import { Box, Text } from "ink";
import type { OntologyEdge, OntologyNode } from "../../schemas/ontology.js";

export interface EdgesSectionProps {
  edgesOut: OntologyEdge[];
  edgesIn: OntologyEdge[];
  edgeNeighbors: OntologyNode[];
}

// Renders incident edges with direction arrows: outgoing → and incoming ←.
// When a neighbor node id can be resolved to a node we render its label too.
export function EdgesSection({ edgesOut, edgesIn, edgeNeighbors }: EdgesSectionProps): React.ReactElement | null {
  if (edgesOut.length === 0 && edgesIn.length === 0) return null;
  const labelById = new Map(edgeNeighbors.map(n => [n.id, n.label]));

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Edges</Text>
      {edgesOut.map(e => (
        // Prefix the React key by direction so out/in lists never collide on the same edgeId
        // (e.g. if a self-link were ever permitted by a future bootstrap; today it is rejected).
        <Text key={`out:${e.edgeId}`}>
          {`  → ${e.type.padEnd(20)} ${e.to.padEnd(18)} ${labelById.get(e.to) ?? ""}`}
        </Text>
      ))}
      {edgesIn.map(e => (
        <Text key={`in:${e.edgeId}`}>
          {`  ← ${e.type.padEnd(20)} ${e.from.padEnd(18)} ${labelById.get(e.from) ?? ""}`}
        </Text>
      ))}
    </Box>
  );
}
