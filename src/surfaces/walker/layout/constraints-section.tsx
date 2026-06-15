import React from "react";
import { Box, Text } from "ink";
import type { OntologyNode } from "../../../kernel/schemas/ontology.js";

export interface ConstraintsSectionProps {
  node: OntologyNode;
}

export function ConstraintsSection({ node }: ConstraintsSectionProps): React.ReactElement | null {
  if (!node.rules || node.rules.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Constraints</Text>
      {node.rules.map((rule, i) => (
        <Text key={i}>  • {cleanRule(rule)}</Text>
      ))}
    </Box>
  );
}

// Rules sometimes carry an enumeration prefix ("1. foo"). Strip it so the bullet
// in the rendered list is the only ordinal marker.
function cleanRule(text: string): string {
  return text.replace(/^\d+\.\s*/, "");
}
