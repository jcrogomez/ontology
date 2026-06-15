import React from "react";
import { Box, Text } from "ink";

export interface HintBarProps {
  mode: "view" | "command";
  command: string;
  message: string | null;
}

// Bottom hint bar. In VIEW mode it advertises the most useful keys.
// In COMMAND mode it shows the colon prompt with the typed buffer.
// A short transient message ("no parent", "exit walker", etc.) overrides both.
export function HintBar({ mode, command, message }: HintBarProps): React.ReactElement {
  if (message) {
    return (
      <Box marginTop={1}>
        <Text dimColor>{message}</Text>
      </Box>
    );
  }
  if (mode === "command") {
    return (
      <Box marginTop={1}>
        <Text>:{command}</Text>
        <Text dimColor>_</Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1}>
      <Text dimColor>↑ parent  ↓ child  ←/→ sibling  i edit  a artifact  m model  TAB plane  : cmd  q quit</Text>
    </Box>
  );
}
