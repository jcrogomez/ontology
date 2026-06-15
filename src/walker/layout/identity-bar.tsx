import React from "react";
import { Box, Text } from "ink";
import type { OntologyNode } from "../../kernel/schemas/ontology.js";
import { POSET_COLORS, levelTag, colorsEnabled } from "../theme/colors.js";

export interface IdentityBarProps {
  node: OntologyNode;
  // True when there's a saved draft for this focal node. Surfaced as a small
  // "(draft pending)" annotation so a user returning to a node sees there's
  // unfinished authoring work attached to it.
  hasDraft?: boolean;
  // Shadow freshness vs the last `onto drift --update` anchor. Only the two
  // states that demand attention are annotated; clean/no-anchor/no-shadow
  // stay silent here (the artifact preview panel carries the full detail).
  shadowStatus?: "drifted" | "missing" | null;
}

// The identity bar carries the focal node's id, label, and the three coordinate
// tags (abstraction, plane, manifestation). Color encodes the abstraction level.
// When colors are off we fall back to a textual [LEVEL] marker so the hierarchy
// is still legible.
export function IdentityBar({ node, hasDraft, shadowStatus }: IdentityBarProps): React.ReactElement {
  const color = POSET_COLORS[node.coordinates.abstraction];
  const showColors = colorsEnabled();
  return (
    <Box justifyContent="space-between">
      {/* Graceful degradation on a narrow terminal: the LABEL (long, variable,
          low-priority) absorbs the overflow by truncating, so the high-priority
          id, draft indicator, and coordinate tag stay intact on one line. The
          id and indicator are flexShrink={0} so they are never broken
          mid-token (Ink would otherwise wrap "node_0000_canon" → "node_0000_ca"
          / "on" and "(draft pending)" → "(draft" / "pending)"). */}
      <Box flexShrink={1} minWidth={0}>
        <Box flexShrink={0}>
          <Text color={showColors ? color : undefined} bold>
            {node.id}
          </Text>
          <Text>  </Text>
        </Box>
        <Box flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">{node.label}</Text>
        </Box>
        {hasDraft && (
          <Box flexShrink={0}>
            <Text>  </Text>
            <Text color="yellow">(draft pending)</Text>
          </Box>
        )}
        {shadowStatus === "drifted" && (
          <Box flexShrink={0}>
            <Text>  </Text>
            <Text color="yellow">≠ shadow drifted</Text>
          </Box>
        )}
        {shadowStatus === "missing" && (
          <Box flexShrink={0}>
            <Text>  </Text>
            <Text color="red">? shadow missing</Text>
          </Box>
        )}
      </Box>
      <Box>
        {!showColors && <Text>{levelTag(node.coordinates.abstraction)} </Text>}
        <Text color={showColors ? color : undefined}>
          {node.coordinates.abstraction} · {node.coordinates.plane} · {node.coordinates.manifestation}
        </Text>
        {node.model?.ref && (
          <Text color="gray">  ⚙ {node.model.ref}</Text>
        )}
      </Box>
    </Box>
  );
}
