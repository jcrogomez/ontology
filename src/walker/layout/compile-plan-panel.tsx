import React from "react";
import { Box, Text } from "ink";
import type { CompilePlan } from "../../kernel/graph/compile-plan.js";

export interface CompilePlanPanelProps {
  state:
    | { kind: "idle" }
    | { kind: "result"; plan: CompilePlan };
}

// Renders the topological compile-plan preview. Each step lists the node
// that would compile at that step; the focal is marked with *. Failure
// states (today only "cycle") render in red.
export function CompilePlanPanel({ state }: CompilePlanPanelProps): React.ReactElement | null {
  if (state.kind === "idle") return null;
  const plan = state.plan;
  if (!plan.ok) {
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="red" paddingX={1}>
        <Text bold color="red">PLAN — cannot compute ({plan.reason})</Text>
        <Text>Focal: {plan.focalId}</Text>
        {plan.reason === "cycle" && (
          <Text>Unresolved (cycle): {plan.unresolved.join(", ")}</Text>
        )}
        <Text dimColor>:clearplan to dismiss</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="green" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="green">PLAN — {plan.steps.length} step{plan.steps.length === 1 ? "" : "s"}</Text>
        <Text dimColor>preview · no artifact written</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {plan.steps.map((step, i) => {
          const marker = step.nodeId === plan.focalId ? "*" : " ";
          const depsTag = step.dependsOn.length > 0 ? `  (deps: ${step.dependsOn.length})` : "";
          return (
            <Text key={step.nodeId}>
              {` ${marker} ${String(i + 1).padStart(2, " ")}. ${step.nodeId}${depsTag}`}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>:clearplan to dismiss · the real compiler ships in Bootstrap 0.8</Text>
      </Box>
    </Box>
  );
}
