import React from "react";
import { Box, Text } from "ink";
import type { OntologyNode } from "../../../kernel/schemas/ontology.js";

export interface PromptSectionProps {
  node: OntologyNode;
}

export function PromptSection({ node }: PromptSectionProps): React.ReactElement {
  const raw = node.prompt.raw ?? "";
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Prompt</Text>
      <Text>{raw.length > 0 ? raw : "(empty)"}</Text>
    </Box>
  );
}
