import React from "react";
import { Box, Text } from "ink";
import type { CompilePlanRunResult } from "../../runtime/compile/compile-plan-runner.js";

export interface CompileResultPanelProps {
  state:
    | { kind: "idle" }
    | { kind: "running"; provider: string; model?: string }
    | { kind: "result"; run: CompilePlanRunResult };
}

// Renders the compile run's outcome. Idle = nothing. Running = "compiling..."
// indicator. Result = full step list with artifact paths, or the failure
// reason in red. The focal step is marked *.
export function CompileResultPanel({ state }: CompileResultPanelProps): React.ReactElement | null {
  if (state.kind === "idle") return null;

  if (state.kind === "running") {
    const target = state.model ? `${state.provider}/${state.model}` : state.provider;
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="magenta" paddingX={1}>
        <Text bold color="magenta">COMPILE — running ({target}) ...</Text>
        <Text dimColor>walking the topological plan; the walker stays interactive</Text>
      </Box>
    );
  }

  const run = state.run;
  if (!run.ok) {
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="red" paddingX={1}>
        <Text bold color="red">COMPILE — failed ({run.reason})</Text>
        <Text>{run.message}</Text>
        {run.completedSteps && run.completedSteps.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>completed before failure:</Text>
            {run.completedSteps.map(s => (
              <Text key={s.nodeId}>
                {s.status === "ok" && s.artifact
                  ? `  ✓ ${s.nodeId}  →  ${s.artifact.relativePath}`
                  : `  ✖ ${s.nodeId}  ${s.reason ?? ""}`}
              </Text>
            ))}
          </Box>
        )}
        <Text dimColor>:clearcompile to dismiss</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="magenta" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="magenta">COMPILE — {run.steps.length} step{run.steps.length === 1 ? "" : "s"}</Text>
        <Text dimColor>focal artifact: {run.focalArtifact.relativePath}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {run.steps.map((s, i) => {
          const marker = s.nodeId === run.focalId ? "*" : " ";
          const cachedTag = s.cached ? " (cached)" : "";
          return (
            <Text key={s.nodeId}>
              {` ${marker} ${String(i + 1).padStart(2, " ")}. ${s.nodeId}${cachedTag}  →  ${s.artifact?.relativePath ?? "(no artifact)"}`}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>:clearcompile to dismiss</Text>
      </Box>
    </Box>
  );
}
