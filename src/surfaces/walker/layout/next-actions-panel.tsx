import React from "react";
import { Box, Text } from "ink";
import type { NextAction } from "../actions/next-actions.js";

// The Walker's "what do I do next?" panel — the human end of the blast-radius /
// trust-tier triage. State is owned by app.tsx; this only renders.

export interface NextActionsPanelState {
  open: boolean;
  syncableNow: number;
  actions: NextAction[];
  cursor: number;
  loading?: boolean;
  message?: string;
}

export interface NextActionsPanelProps {
  state: NextActionsPanelState;
}

export function emptyNextActionsPanelState(): NextActionsPanelState {
  return { open: false, syncableNow: 0, actions: [], cursor: 0 };
}

export function NextActionsPanel({ state }: NextActionsPanelProps): React.ReactElement | null {
  if (!state.open) return null;
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">NEXT SAFE ACTIONS</Text>
      <Box marginTop={1}>
        <Text color={state.syncableNow > 0 ? "green" : undefined}>
          {state.syncableNow} node(s) batch-syncable now
        </Text>
        <Text dimColor>{state.syncableNow > 0 ? "  ·  onto sync" : ""}</Text>
      </Box>
      {renderBody(state)}
      {state.message && (
        <Box marginTop={1}>
          <Text color={state.message.startsWith("✖") ? "red" : "yellow"}>{state.message}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>↑/↓ or j/k navigate · enter focus node · R reload · esc close</Text>
      </Box>
    </Box>
  );
}

function renderBody(state: NextActionsPanelState): React.ReactElement {
  if (state.loading) return <Text dimColor>computing…</Text>;
  if (state.actions.length === 0) {
    return (
      <Box marginTop={1}>
        <Text color="green">✓ no blockers — the whole core is batch-syncable</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>fix-first (highest leverage) —</Text>
      {state.actions.map((a, i) => {
        const selected = i === state.cursor;
        const prefix = selected ? "▶ " : "  ";
        const color = a.tier === "blocked" ? "red" : selected ? "cyan" : undefined;
        return (
          <Box key={a.nodeId} flexDirection="column">
            <Text color={color}>
              {prefix}{a.nodeId.padEnd(12)} {a.reason.padEnd(12)} unblocks {a.unblocks}
            </Text>
            {selected && <Text dimColor>      → {a.suggestion}</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
