import React from "react";
import { Box, Text } from "ink";
import type { OntologyNode } from "../../schemas/ontology.js";
import { POSET_COLORS, levelTag, colorsEnabled } from "../theme/colors.js";

export interface IdentityBarProps {
  node: OntologyNode;
}

// The identity bar carries the focal node's id, label, and the three coordinate
// tags (abstraction, plane, manifestation). Color encodes the abstraction level.
// When colors are off we fall back to a textual [LEVEL] marker so the hierarchy
// is still legible.
export function IdentityBar({ node }: IdentityBarProps): React.ReactElement {
  const color = POSET_COLORS[node.coordinates.abstraction];
  const showColors = colorsEnabled();
  return (
    <Box justifyContent="space-between">
      <Box>
        <Text color={showColors ? color : undefined} bold>
          {node.id}
        </Text>
        <Text>  </Text>
        <Text>{node.label}</Text>
      </Box>
      <Box>
        {!showColors && <Text>{levelTag(node.coordinates.abstraction)} </Text>}
        <Text color={showColors ? color : undefined}>
          {node.coordinates.abstraction} · {node.coordinates.plane} · {node.coordinates.manifestation}
        </Text>
      </Box>
    </Box>
  );
}
