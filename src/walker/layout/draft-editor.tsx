import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export interface DraftEditorProps {
  focalLabel: string;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}

// Edit-mode panel. The user is composing a candidate child of the focal node,
// not editing the focal node itself — that distinction matters because the
// invariant says only explicit graph commands may mutate the network. A draft
// is intent-being-typed; it becomes a real proposal via `:propose`.
export function DraftEditor({ focalLabel, value, onChange, onSubmit }: DraftEditorProps): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text bold color="yellow">EDIT — drafting a candidate child of {focalLabel}</Text>
      <Box marginTop={1}>
        <Text>Prompt: </Text>
        <TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Esc save & exit · Enter save & exit · type to compose · :propose creates the proposal · :cleardraft removes it
        </Text>
      </Box>
    </Box>
  );
}
