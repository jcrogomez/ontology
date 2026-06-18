import React from "react";
import { Box, Text } from "ink";
import type { ValidateFromWalkerResult } from "../actions/validate-from-walker.js";
import type { BranchListResult } from "../actions/branch-list-from-walker.js";
import type { QueryFromWalkerResult } from "../actions/query-from-walker.js";
import type { ContextFromWalkerResult } from "../actions/context-from-walker.js";
import type { LinkAnalysisFromWalkerResult } from "../actions/link-analysis-from-walker.js";
import type { GraphViewResult, GraphViewNodeRow } from "../actions/graph-view-from-walker.js";
import type { VerifyFromWalkerResult } from "../actions/verify-from-walker.js";
import type { WorkflowFromWalkerResult } from "../actions/workflow-from-walker.js";
import type { ModelsFromWalkerResult } from "../actions/models-from-walker.js";
import { POSET_COLORS } from "../theme/colors.js";

// Unified info panel for read-only walker commands that produce a small,
// inspectable result: `:validate`, `:branch list`, `:query`, `:context`,
// `:link-analysis`, `:graph view`.
//
// One panel instead of N: each command's result is structurally distinct
// but rendering needs are the same — a heading, a body, a dismiss hint.
// The discriminated `state.kind` keeps the rendering logic local while the
// app-level state machine just holds one slot at a time. `:clearinfo`
// dismisses any active variant.

export type InfoPanelState =
  | { kind: "idle" }
  | { kind: "validate"; result: ValidateFromWalkerResult }
  | { kind: "branches"; result: BranchListResult }
  | { kind: "query"; result: QueryFromWalkerResult; shapeSummary: string }
  | { kind: "context"; result: ContextFromWalkerResult; focalId: string }
  | { kind: "link-analysis"; result: LinkAnalysisFromWalkerResult }
  | { kind: "graph-view"; result: GraphViewResult }
  | { kind: "verify"; result: VerifyFromWalkerResult }
  | { kind: "workflow"; result: WorkflowFromWalkerResult }
  | { kind: "models"; result: ModelsFromWalkerResult };

export interface InfoPanelProps {
  state: InfoPanelState;
}

export function InfoPanel({ state }: InfoPanelProps): React.ReactElement | null {
  if (state.kind === "idle") return null;

  const borderColor = state.kind === "validate" && !state.result.ok
    ? "red"
    : state.kind === "link-analysis" && state.result.ok && state.result.requires?.some((r) => !r.satisfied)
    ? "yellow"
    : state.kind === "link-analysis" && !state.result.ok
    ? "red"
    : state.kind === "graph-view" && !state.result.ok
    ? "red"
    : (state.kind === "verify" || state.kind === "workflow") && !state.result.ok
    ? "red"
    : state.kind === "verify"
    ? (state.result.ok && state.result.verdict === "epsilon_equivalent" ? "green" : "yellow")
    : state.kind === "workflow"
    ? (state.result.ok && state.result.verdict === "accept" ? "green" : "red")
    : state.kind === "models" && !state.result.ok
    ? "red"
    : state.kind === "query" || state.kind === "branches" || state.kind === "graph-view" || state.kind === "models"
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

  if (state.kind === "models") {
    const { result } = state;
    if (!result.ok) {
      return (
        <>
          <Text bold color="red">MODELS — error</Text>
          <Text>{result.message ?? "(no detail)"}</Text>
        </>
      );
    }
    return (
      <>
        <Text bold color="yellow">MODEL ROUTING (per task)</Text>
        <Box marginTop={1} flexDirection="column">
          {result.routing.map((r) => {
            const target = r.modelId === null
              ? "· per-node model.ref (no override)"
              : r.resolved
                ? `→ ${r.modelId}  [${r.provider}/${r.modelName}]`
                : `→ ${r.modelId}  ⚠ ${r.problem ?? "unresolved"}`;
            const color = r.modelId === null ? "gray" : r.resolved ? "green" : "red";
            return (
              <Text key={r.task}>
                {"  "}<Text color="cyan">{r.task.padEnd(15)}</Text>
                <Text dimColor>{r.role.padEnd(22)}</Text>
                <Text color={color}>{target}</Text>
              </Text>
            );
          })}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>registered models (use the id with :route):</Text>
          {result.catalog.map((m) => (
            <Text key={m.id}>
              {"  "}<Text color="cyan">{m.id.padEnd(22)}</Text>
              <Text dimColor>{m.provider}/{m.name}{m.role ? `  — ${m.role}` : ""}</Text>
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>:route &lt;task&gt; &lt;model-id&gt;  ·  :route &lt;task&gt; off  (fall back to per-node)</Text>
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

  if (state.kind === "context") {
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

  if (state.kind === "link-analysis") {
    const { result } = state;
    if (!result.ok) {
      return (
        <>
          <Text bold color="red">LINK-ANALYSIS — error</Text>
          <Text>{result.message ?? "(no detail)"}</Text>
        </>
      );
    }
    const requires = result.requires ?? [];
    const provides = result.provides ?? [];
    const forbids = result.forbids ?? [];
    const suggestions = result.suggestions ?? [];
    const validation = result.validation;
    const missingCount = requires.filter((r) => !r.satisfied).length;
    const violatedCount = forbids.filter((f) => f.violated).length;
    const headerColor = missingCount > 0 || violatedCount > 0 || (validation && !validation.ok) ? "yellow" : "green";
    return (
      <>
        <Text bold color={headerColor}>
          LINK-ANALYSIS — {result.focalId}
          {validation && (validation.ok ? " · ✔ valid" : ` · ✖ ${validation.violations.length} violation(s)`)}
        </Text>
        <Text dimColor>
          candidate = focal.prompt.raw — context {result.contextNodeIds?.length ?? 0} node(s)
        </Text>
        {requires.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Requires ({requires.length}, {missingCount} missing)</Text>
            {requires.slice(0, 8).map((r, i) => (
              <Text key={i}>
                {r.satisfied ? "  ✓ " : "  ✖ "}
                {r.token}
                {r.satisfied && r.providers.length > 0 ? ` ← ${r.providers.join(", ")}` : ""}
              </Text>
            ))}
            {requires.length > 8 && (
              <Text dimColor>  ...and {requires.length - 8} more</Text>
            )}
          </Box>
        )}
        {provides.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Provides ({provides.length})</Text>
            {provides.slice(0, 8).map((token, i) => (
              <Text key={i}>  → {token}</Text>
            ))}
            {provides.length > 8 && (
              <Text dimColor>  ...and {provides.length - 8} more</Text>
            )}
          </Box>
        )}
        {forbids.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>Forbids ({forbids.length}, {violatedCount} violated)</Text>
            {forbids.slice(0, 6).map((f, i) => (
              <Text key={i}>
                {f.violated ? "  ✖ " : "  ✓ "}
                {f.token}
                {f.violated ? ` (provided by ${f.violators.join(", ")})` : ""}
              </Text>
            ))}
          </Box>
        )}
        {suggestions.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="yellow">Suggested edge proposals ({suggestions.length})</Text>
            <Text dimColor>  No graph mutation. Run the listed commands.</Text>
            {suggestions.slice(0, 6).map((s, i) => (
              <Box key={i} flexDirection="column">
                <Text>  • <Text color="yellow">{s.type}</Text> → {s.to} <Text dimColor>(satisfies {s.satisfies.join(", ")})</Text></Text>
                <Text dimColor>      onto propose link --from {s.from} --to {s.to} --type {s.type} --rationale "satisfies {s.satisfies.join(", ")}"</Text>
              </Box>
            ))}
            {suggestions.length > 6 && (
              <Text dimColor>  ...and {suggestions.length - 6} more</Text>
            )}
          </Box>
        )}
      </>
    );
  }

  if (state.kind === "verify") {
    const { result } = state;
    if (!result.ok) {
      return (
        <>
          <Text bold color="red">VERIFY — not verifiable</Text>
          <Text>{result.message}</Text>
        </>
      );
    }
    const verdictColor = result.verdict === "epsilon_equivalent" ? "green" : "yellow";
    return (
      <>
        <Text bold color={verdictColor}>
          VERIFY — {result.verdict}
        </Text>
        <Text dimColor>
          source {result.sourcePath} vs last compile {result.artifactPath} ({result.language})
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Text>
            LoC distance:        {result.metrics.locDistance.toFixed(3)} ({result.metrics.originalLineCount} → {result.metrics.regenLineCount} lines)
          </Text>
          <Text>
            structural Jaccard:  {result.metrics.structuralJaccard.toFixed(3)} ({result.metrics.originalDeclarations.length} vs {result.metrics.regenDeclarations.length} declarations)
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            verdict is against the LAST compile — :compile to refresh; full sweep via `onto verify-homeomorphism`
          </Text>
        </Box>
      </>
    );
  }

  if (state.kind === "workflow") {
    const { result } = state;
    if (!result.ok) {
      return (
        <>
          <Text bold color="red">WORKFLOW — error</Text>
          <Text>{result.message}</Text>
        </>
      );
    }
    const headerColor = result.verdict === "accept" ? "green" : "red";
    return (
      <>
        <Text bold color={headerColor}>
          WORKFLOW — {result.verdict === "accept" ? "✓ ACCEPT" : "✗ REJECT"} ({result.graphName})
        </Text>
        <Text dimColor>
          {result.stepCount} step(s) · {result.durationMs}ms
          {result.verdict === "reject" && result.reason ? ` · reason: ${result.reason}` : ""}
        </Text>
        {result.warnings.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            {result.warnings.slice(0, 4).map((w, i) => (
              <Text key={i} color="yellow">⚠ {w}</Text>
            ))}
          </Box>
        )}
        {result.outputPreview.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold>output preview</Text>
            <Text>{result.outputPreview}</Text>
          </Box>
        )}
        {result.proposalId && (
          <Box marginTop={1} flexDirection="column">
            {(result.edgeProposalIds ?? []).map((id) => (
              <Text key={id}>proposal {id} (pending, edge) — apply BEFORE the node update</Text>
            ))}
            <Text>
              proposal {result.proposalId} (pending, node_update on focal) — review via :proposals
            </Text>
            {result.workflowRunId && (
              <Text dimColor>provenance: {result.workflowRunId}</Text>
            )}
          </Box>
        )}
      </>
    );
  }

  // graph-view
  const { result } = state;
  if (!result.ok) {
    return (
      <>
        <Text bold color="red">GRAPH VIEW — error</Text>
        <Text>{result.message ?? "(no detail)"}</Text>
      </>
    );
  }
  const focal = result.focal!;
  const upstream = result.upstream ?? [];
  const downstream = result.downstream ?? [];
  const lateral = result.lateral ?? [];
  const totalNodes = result.totalNodes ?? 0;
  const totalEdges = result.totalEdges ?? 0;
  const skipped = result.skippedNodeIds ?? [];
  const renderedCount = 1 + upstream.length + downstream.length + lateral.length;
  // Honest accounting: hidden-by-cap is what's left over after we subtract
  // both rendered rows and unloadable nodes from the slice size. Without
  // the skipped subtraction the cap message would falsely take credit for
  // rows that never had a chance to load in the first place.
  const hiddenByCap = Math.max(0, totalNodes - renderedCount - skipped.length);
  return (
    <>
      <Text bold color="yellow">
        GRAPH VIEW — {focal.id} (depth {result.depth})
      </Text>
      <Text dimColor>
        slice: {totalNodes} node(s), {totalEdges} edge(s)
        {hiddenByCap > 0 ? ` · showing ${renderedCount}` : ""}
      </Text>
      {upstream.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>↑ Upstream ({upstream.length})</Text>
          {upstream.map((row) => <GraphViewRow key={row.id} row={row} arrow="↑" />)}
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text bold color={POSET_COLORS[focal.abstraction]}>
          ★ {focal.id} <Text dimColor>{focal.kind}/{focal.abstraction}</Text>
          {focal.label ? ` — ${focal.label}` : ""}
        </Text>
      </Box>
      {downstream.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>↓ Downstream ({downstream.length})</Text>
          {downstream.map((row) => <GraphViewRow key={row.id} row={row} arrow="↓" />)}
        </Box>
      )}
      {lateral.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>↔ Lateral ({lateral.length})</Text>
          {lateral.map((row) => <GraphViewRow key={row.id} row={row} arrow="↔" />)}
        </Box>
      )}
      {hiddenByCap > 0 && (
        <Box marginTop={1}>
          <Text dimColor>
            ...{hiddenByCap} more node(s) hidden — drop depth or use `onto graph subgraph` to explore further.
          </Text>
        </Box>
      )}
      {skipped.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>
            {skipped.length} node(s) could not be loaded — run `onto validate` to inspect.
          </Text>
        </Box>
      )}
    </>
  );
}

// Single row in the graph-view buckets. Renders the node id colored by
// its abstraction level, the kind/abstraction tag dimmed, and up to 4
// connecting edges as a compact second line. The arrow argument
// disambiguates the bucket visually so a user scanning a long panel can
// tell upstream from downstream from lateral at a glance.
function GraphViewRow({ row, arrow }: { row: GraphViewNodeRow; arrow: string }): React.ReactElement {
  const indent = "  ".repeat(Math.max(0, row.depth));
  const colorName = POSET_COLORS[row.abstraction];
  return (
    <Box flexDirection="column">
      <Text>
        {indent}{arrow} <Text color={colorName}>{row.id}</Text>{" "}
        <Text dimColor>{row.kind}/{row.abstraction}</Text>
        {row.label ? <Text> — {truncate(row.label, 40)}</Text> : null}
      </Text>
      {row.connectingEdges.length > 0 && (
        <Text dimColor>
          {indent}    {row.connectingEdges.map((e, i) => (
            <Text key={i}>{i > 0 ? " · " : ""}{e.direction === "out" ? "→" : "←"} {e.type} {e.otherEnd}</Text>
          ))}
        </Text>
      )}
    </Box>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
