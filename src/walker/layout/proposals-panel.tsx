import React from "react";
import { Box, Text } from "ink";
import type { Proposal } from "../../kernel/schemas/ontology.js";
import {
  summarizeProposalRow,
  type ProposalApplyOutcome,
} from "../actions/proposals-from-walker.js";

// Walker v2 PR-1 — proposal review pane.
//
// Renders the pending-proposals list with cursor highlight and an
// inline "last action result" footer. The pane is the only way to
// apply/reject/dry-run proposals without leaving the TUI; Phase ε
// will produce ~90 proposals and a shell loop over them would slow
// the operator to a crawl.
//
// State is owned by app.tsx (`proposalsPanelState`); this component
// is pure-render.

export interface ProposalsActionFeedback {
  /** The proposal id the action ran against. */
  proposalId: string;
  /** What happened. */
  outcome: ProposalApplyOutcome | "rejected" | "reject_failed";
  /** Free-form description. */
  message?: string;
  /** Walltime when the action fired. Surfaces a "(just now / 2s ago)" hint. */
  at: number;
}

export interface ProposalsPanelState {
  open: boolean;
  proposals: Proposal[];
  cursor: number;
  /** True while a reload is in flight; suppresses keys until done. */
  busy?: boolean;
  /** Result of the most recent action; renders as a one-line footer until cleared. */
  lastAction?: ProposalsActionFeedback;
  /** Set when load failed for any reason — prevents the operator from acting on stale state. */
  loadError?: string;
}

export interface ProposalsPanelProps {
  state: ProposalsPanelState;
}

export function ProposalsPanel({ state }: ProposalsPanelProps): React.ReactElement | null {
  if (!state.open) return null;

  const borderColor = state.loadError
    ? "red"
    : state.lastAction?.outcome === "applied"
    ? "green"
    : state.lastAction?.outcome === "dry_run"
    ? "blue"
    : state.lastAction && !isOk(state.lastAction.outcome)
    ? "yellow"
    : "magenta";

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
    >
      <Text bold color="magenta">
        PROPOSALS — {state.proposals.length} pending
        {state.busy ? "  (loading…)" : ""}
      </Text>
      <Text dimColor>
        j/↓ next · k/↑ prev · a apply · r reject · d dry-run · R refresh · Esc close
      </Text>

      {state.loadError ? (
        <Box marginTop={1}>
          <Text color="red">✖ {state.loadError}</Text>
        </Box>
      ) : state.proposals.length === 0 ? (
        <Box marginTop={1}>
          <Text dimColor>(no pending proposals)</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {visibleSlice(state).map(({ proposal, index }) => {
            const focused = index === state.cursor;
            const marker = focused ? "▸" : " ";
            const row = summarizeProposalRow(proposal);
            return (
              <Text key={proposal.id} color={focused ? "cyan" : undefined} bold={focused}>
                {marker} {row}
              </Text>
            );
          })}
          {state.proposals.length > MAX_VISIBLE && (
            <Text dimColor>
              ({state.cursor + 1}/{state.proposals.length})
            </Text>
          )}
        </Box>
      )}

      {state.lastAction && (
        <Box marginTop={1}>
          <Text color={feedbackColor(state.lastAction)}>
            {feedbackIcon(state.lastAction)} {state.lastAction.proposalId}: {state.lastAction.message ?? state.lastAction.outcome}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Number of rows the panel renders before windowing kicks in. The
// scroll window keeps the focused row in view by sliding the slice
// — no scrollback, just a sliding window.
const MAX_VISIBLE = 12;

interface IndexedProposal {
  proposal: Proposal;
  index: number;
}

function visibleSlice(state: ProposalsPanelState): IndexedProposal[] {
  const total = state.proposals.length;
  if (total <= MAX_VISIBLE) {
    return state.proposals.map((proposal, index) => ({ proposal, index }));
  }
  const half = Math.floor(MAX_VISIBLE / 2);
  let start = Math.max(0, state.cursor - half);
  let end = start + MAX_VISIBLE;
  if (end > total) {
    end = total;
    start = end - MAX_VISIBLE;
  }
  return state.proposals.slice(start, end).map((proposal, offset) => ({
    proposal,
    index: start + offset,
  }));
}

function isOk(outcome: ProposalsActionFeedback["outcome"]): boolean {
  return outcome === "applied" || outcome === "dry_run" || outcome === "rejected";
}

function feedbackColor(action: ProposalsActionFeedback): string | undefined {
  if (action.outcome === "applied" || action.outcome === "rejected") return "green";
  if (action.outcome === "dry_run") return "blue";
  return "yellow";
}

function feedbackIcon(action: ProposalsActionFeedback): string {
  if (action.outcome === "applied") return "✓ applied";
  if (action.outcome === "rejected") return "✓ rejected";
  if (action.outcome === "dry_run") return "↻ dry-run";
  if (action.outcome === "stale") return "⏸ staled";
  if (action.outcome === "missing_parent") return "✖ missing parent";
  if (action.outcome === "not_pending") return "✖ not pending";
  if (action.outcome === "not_found") return "✖ not found";
  if (action.outcome === "mutation_failed") return "✖ mutation failed";
  return "✖ error";
}
