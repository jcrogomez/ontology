import React from "react";
import { Box, Text } from "ink";
import type { OntologyNode } from "../../../kernel/schemas/ontology.js";
import { POSET_COLORS, colorsEnabled } from "../theme/colors.js";

export interface PathSectionProps {
  pathToCanon: OntologyNode[];   // canon -> ... -> focal
}

// Renders the breadcrumb from canon to focal with a per-segment color matching
// the abstraction level. The gradient lets you read the poset depth at a glance.
export function PathSection({ pathToCanon }: PathSectionProps): React.ReactElement {
  const showColors = colorsEnabled();
  return (
    <Box marginTop={1}>
      <Text bold>Path  </Text>
      {pathToCanon.map((node, i) => {
        const color = POSET_COLORS[node.coordinates.abstraction];
        const segment = i === pathToCanon.length - 1 ? node.label || node.id : node.coordinates.abstraction;
        return (
          <React.Fragment key={node.id}>
            <Text color={showColors ? color : undefined}>{segment}</Text>
            {i < pathToCanon.length - 1 && <Text> » </Text>}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
