import React from "react";
import { Box, Text } from "ink";

export interface RunResultPanelProps {
  state:
    | { kind: "idle" }
    | { kind: "running"; provider: string; model?: string }
    | { kind: "result"; runId: string; cached: boolean; provider: string; model: string; responseText: string; durationMs: number }
    | { kind: "error"; message: string };
}

// Renders the most recent `:run` result inside the focal cell. Idle = nothing.
// Running = a "..." spinner-equivalent (brutalist: literal ellipsis, no
// animated glyphs). Result = the response text (truncated) plus the runId.
// Error = the failure message in red.
export function RunResultPanel({ state }: RunResultPanelProps): React.ReactElement | null {
  if (state.kind === "idle") return null;

  if (state.kind === "running") {
    const target = state.model ? `${state.provider}/${state.model}` : state.provider;
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">RUN — dispatching to {target} ...</Text>
        <Text dimColor>(walker stays interactive; the dispatch is async)</Text>
      </Box>
    );
  }

  if (state.kind === "error") {
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="red" paddingX={1}>
        <Text bold color="red">RUN — error</Text>
        <Text>{state.message}</Text>
        <Text dimColor>(:clearrun to dismiss)</Text>
      </Box>
    );
  }

  // result
  const text = state.responseText.length > 500
    ? state.responseText.slice(0, 500) + "..."
    : state.responseText;
  const cachedTag = state.cached ? " (cached)" : "";
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">RUN — {state.runId}{cachedTag}</Text>
        <Text dimColor>{state.provider} · {state.model} · {state.durationMs}ms</Text>
      </Box>
      <Box marginTop={1}>
        <Text>{text}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>:clearrun to dismiss · :propose-from-run is a v2 idea</Text>
      </Box>
    </Box>
  );
}
