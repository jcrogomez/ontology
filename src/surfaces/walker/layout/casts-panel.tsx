import React from "react";
import { Box, Text } from "ink";

// In-flight async actions ("casts") + their completion "procs". The raid-tempo
// window: you fire a governed action on a node, it runs in the background while
// you Tab to the next target, and when it resolves a green/red proc flashes here.
// Pure render; app.tsx owns the cast pool.

export interface CastView {
  id: number;
  nodeId: string;
  verb: string;
  status: "casting" | "done";
  proc?: { ok: boolean; label: string };
}

export interface CastsPanelProps {
  casts: CastView[];
}

export function CastsPanel({ casts }: CastsPanelProps): React.ReactElement | null {
  if (casts.length === 0) return null;
  const casting = casts.filter((c) => c.status === "casting");
  // Keep the last few procs visible; older ones scroll off (or :clearcasts).
  const done = casts.filter((c) => c.status === "done").slice(-4);
  return (
    <Box flexDirection="column" marginTop={1}>
      {casting.length > 0 && (
        <Box>
          <Text color="yellow">⟳ casting  </Text>
          <Text dimColor>{casting.map((c) => `${c.nodeId} ${c.verb}`).join("   ")}</Text>
        </Box>
      )}
      {done.map((c) => (
        <Text key={c.id} color={c.proc?.ok ? "green" : "red"}>
          {c.proc?.ok ? "✓" : "✖"} {c.nodeId} {c.verb} → {c.proc?.label}
        </Text>
      ))}
    </Box>
  );
}
