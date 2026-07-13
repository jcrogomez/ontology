import React from "react";
import { Box, Text } from "ink";

// The always-visible ACTION BAR — the cockpit's "what's the move?" strip, the
// WoW-style bar that lights the recommended next action so the human plays by
// muscle memory instead of reading menus. Pure render; app.tsx computes the
// values from the memoised status report (no new analysis).

export type FocalTone = "ready" | "todo" | "warn" | "intent";

export interface ActionBarProps {
  /** Nodes batch-syncable right now (the down-closed ideal). */
  syncableNow: number;
  /** The single highest-leverage fix-first node, or null when nothing blocks. */
  next: { nodeId: string; unblocks: number } | null;
  /** The recommendation for the CURRENT focal, already phrased. */
  focal: { label: string; tone: FocalTone };
  /** The provider `s` fires against (settable with :prov). */
  provider: string;
}

const TONE_COLOR: Record<FocalTone, string | undefined> = {
  ready: "green",
  todo: "yellow",
  warn: "red",
  intent: "cyan",
};

export function ActionBar({ syncableNow, next, focal, provider }: ActionBarProps): React.ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      <Box>
        <Text color="cyan">⚔ </Text>
        {next ? (
          <Text>
            next <Text color="cyan">▶ {next.nodeId}</Text>
            <Text dimColor> (unblocks {next.unblocks})</Text>
          </Text>
        ) : (
          <Text dimColor>no blockers</Text>
        )}
        <Text dimColor>{"  ·  "}</Text>
        <Text color={syncableNow > 0 ? "green" : undefined}>{syncableNow} syncable</Text>
        <Text dimColor>{"     focal: "}</Text>
        <Text color={TONE_COLOR[focal.tone]}>{focal.label}</Text>
      </Box>
      <Box>
        <Text dimColor>  Tab next · s sync · p probe · d dod · i edit · fire:</Text>
        <Text color="magenta">{provider}</Text>
        <Text dimColor> (:prov)</Text>
      </Box>
    </Box>
  );
}
