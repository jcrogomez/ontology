import React from "react";
import { Box, Text } from "ink";
import type { ValidateFromWalkerResult } from "../actions/validate-from-walker.js";
import type { BranchListResult } from "../actions/branch-list-from-walker.js";
import type { QueryFromWalkerResult } from "../actions/query-from-walker.js";
import type { ContextFromWalkerResult } from "../actions/context-from-walker.js";

// Unified info panel for read-only walker commands that produce a small,
// inspectable result: `:validate`, `:branch list`, `:query`, `:context`.
//
// One panel instead of four: each command's result is structurally distinct
// but rendering needs are the same — a heading, a body, a dismiss hint.
// The discriminated `state.kind` keeps the rendering logic local while the
// app-level state machine just holds one slot at a time. `:clearinfo`
// dismisses any active variant.

export type InfoPanelState =
  | { kind: "idle" }
  | { kind: "validate"; result: ValidateFromWalkerResult }
  | { kind: "branches"; result: BranchListResult }
  | { kind: "query"; result: QueryFromWalkerResult; shapeSummary: string }
  | { kind: "context"; result: ContextFromWalkerResult; focalId: string };

export interface InfoPanelProps {
  state: InfoPanelState;
}

export function InfoPanel({ state }: InfoPanelProps): React.ReactElement | null {
  if (state.kind === "idle") return null;

  const borderColor = state.kind === "validate" && !state.result.ok
    ? "red"
    : state.kind === "query" || state.kind === "branches"
    ? "yellow"
    : "blue";

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={borderColor} paddingX={1}>
      {renderBody(state)}
      <Box marginTop={1}>
        <Text dimColor>:clearinfo to dismiss</Text>
      </Box>
    </Box>
  );
}

function renderBody(state: Exclude<InfoPanelState, { kind: "idle" }>): React.ReactNode {
  if (state.kind === "validate") {
    const { result } = state;
    const headerColor = result.ok ? "green" : "red";
    return (
      <>
        <Text bold color={headerColor}>
          VALIDATE — {result.ok ? "✔ stable" : `✖ ${result.violations.length} violation${result.violations.length === 1 ? "" : "s"}`}
        </Text>
        <Text dimColor>
          scanned {result.scanned.nodes} node(s), {result.scanned.edges} edge(s)
          {!result.scanCompleted ? " (scan aborted)" : ""}
        </Text>
        {result.violations.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {result.violations.slice(0, 12).map((v, i) => (
              <Text key={i}>  [{v.kind}] {v.message}</Text>
            ))}
            {result.violations.length > 12 && (
              <Text dimColor>  ...and {result.violations.length - 12} more (run `onto validate` for full audit)</Text>
            )}
          </Box>
        )}
      </>
    );
  }

  if (state.kind === "branches") {
    const { result } = state;
    if (!result.ok) {
      return (
        <>
          <Text bold color="red">BRANCHES — error</Text>
          <Text>{result.message ?? "(no detail)"}</Text>
        </>
      );
    }
    return (
      <>
        <Text bold color="yellow">BRANCHES — {result.branches.length} branch(es) over {result.nodeCount} node(s)</Text>
        <Box marginTop={1} flexDirection="column">
          {result.branches.map((b) => (
            <Text key={b}>  • {b}</Text>
          ))}
        </Box>
      </>
    );
  }

  if (state.kind === "query") {
    const { result, shapeSummary } = state;
    if (!result.ok) {
      return (
        <>
          <Text bold color="red">QUERY — invalid shape</Text>
          <Text>{result.message ?? "(no detail)"}</Text>
        </>
      );
    }
    return (
      <>
        <Text bold color="yellow">QUERY — {result.matches.length} match(es)</Text>
        <Text dimColor>shape: {shapeSummary || "(empty — every node)"}</Text>
        {result.matches.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            {result.matches.slice(0, 20).map((n) => (
              <Text key={n.id}>  • {n.id}  {n.coordinates.abstraction}/{n.kind}  {n.label ? `— ${n.label}` : ""}</Text>
            ))}
            {result.matches.length > 20 && (
              <Text dimColor>  ...and {result.matches.length - 20} more</Text>
            )}
          </Box>
        )}
      </>
    );
  }

  // context
  const { result, focalId } = state;
  if (!result.ok || !result.output) {
    return (
      <>
        <Text bold color="red">CONTEXT — error</Text>
        <Text>{result.message ?? "(no detail)"}</Text>
      </>
    );
  }
  const o = result.output;
  const warnings = o.warnings ?? [];
  return (
    <>
      <Text bold color="blue">CONTEXT — {focalId}</Text>
      <Text dimColor>
        nodes {o.nodes.length} | constraints {o.constraints.length} | branch {o.branch}
      </Text>
      {warnings.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text color="yellow">warnings:</Text>
          {warnings.slice(0, 6).map((w, i) => (
            <Text key={i}>  • {w}</Text>
          ))}
        </Box>
      )}
      {o.edgeContext && o.edgeContext.edges.length > 0 && (
        <Text dimColor>edge-context: {o.edgeContext.edges.length} edge(s) over {o.edgeContext.nodeIds.length} neighbor(s)</Text>
      )}
    </>
  );
}
