import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import {
  loadFocalNeighborhood,
  type FocalNeighborhood,
} from "./state/neighborhood.js";
import {
  navigateUp,
  navigateDown,
  navigateSiblingPrevious,
  navigateSiblingNext,
} from "./state/navigation.js";
import {
  focalRequiresShared,
  focalProvidesShared,
} from "./state/shared-tokens.js";
import { POSET_COLORS, colorsEnabled } from "./theme/colors.js";
import { IdentityBar } from "./layout/identity-bar.js";
import { AiStatusBar } from "./layout/ai-status-bar.js";
import { PromptSection } from "./layout/prompt-section.js";
import { ConstraintsSection } from "./layout/constraints-section.js";
import { RequiresProvidesSection } from "./layout/requires-provides-section.js";
import { EdgesSection } from "./layout/edges-section.js";
import { PathSection } from "./layout/path-section.js";
import { HintBar } from "./layout/hint-bar.js";
import { DraftEditor } from "./layout/draft-editor.js";
import { RunResultPanel, type RunResultPanelProps } from "./layout/run-result-panel.js";
import { CompilePlanPanel, type CompilePlanPanelProps } from "./layout/compile-plan-panel.js";
import { CompileResultPanel, type CompileResultPanelProps } from "./layout/compile-result-panel.js";
import { loadDraft, saveDraft, clearDraft } from "../../kernel/core/drafts/persist.js";
import { proposeFromDraft, proposeUpdateFromDraft } from "./actions/propose-from-draft.js";
import { verifyFromWalker } from "./actions/verify-from-walker.js";
import { workflowFromWalker } from "./actions/workflow-from-walker.js";
import { parseWorkflowArgs, type WorkflowArgs } from "./state/parse-workflow-args.js";
import { runFromWalker } from "./actions/run-from-walker.js";
import { planFromWalker } from "./actions/plan-from-walker.js";
import { compileFromWalker } from "./actions/compile-from-walker.js";
import { validateFromWalker } from "./actions/validate-from-walker.js";
import { branchListFromWalker } from "./actions/branch-list-from-walker.js";
import { contextFromWalker } from "./actions/context-from-walker.js";
import { queryFromWalker } from "./actions/query-from-walker.js";
import { linkAnalysisFromWalker } from "./actions/link-analysis-from-walker.js";
import { graphViewFromWalker } from "./actions/graph-view-from-walker.js";
import { parseGraphViewArgs } from "./state/parse-graph-view-args.js";
import { linkFromWalker } from "./actions/link-from-walker.js";
import { modelsFromWalker, routeFromWalker } from "./actions/models-from-walker.js";
import { nodeHealthFromWalker } from "./actions/node-health-from-walker.js";
import { fichaCleanupFromWalker } from "./actions/ficha-cleanup-from-walker.js";
import { reanchorNodeArtifacts } from "../../laws/reanchor-node.js";
import { InfoPanel, type InfoPanelState } from "./layout/info-panel.js";
import { ArtifactPreviewPanel } from "./layout/artifact-preview-panel.js";
import {
  shadowReport,
  readArtifactPreview,
  nodesOwningFile,
} from "./state/shadow-status.js";
import { ProposalsPanel, type ProposalsPanelState } from "./layout/proposals-panel.js";
import { ProjectsPanel, emptyProjectsPanelState, type ProjectsPanelState } from "./layout/projects-panel.js";
import {
  projectsForWalker,
  openProjectFromWalker,
  createProjectFromWalker,
} from "./actions/projects-from-walker.js";
import { NextActionsPanel, emptyNextActionsPanelState, type NextActionsPanelState } from "./layout/next-actions-panel.js";
import { nextActions, nextActionsFromReport } from "./actions/next-actions.js";
import { ActionBar, type FocalTone } from "./layout/action-bar.js";
import { buildStatusReport } from "../commands/status.js";
import { buildDodReport } from "../commands/dod.js";
import {
  loadProposalsForWalker,
  applyProposalFromWalker,
  rejectProposalFromWalker,
} from "./actions/proposals-from-walker.js";
import { parseProviderArgs } from "./state/parse-provider-args.js";
import { parseQueryArgs } from "./state/parse-query-args.js";
import { parseLinkArgs } from "./state/parse-link-args.js";
import type { LlmProvider } from "../../runtime/llm/types.js";
import { loadModelsRegistry, loadNodes } from "../../kernel/core/project/load.js";
import { updateNode } from "../../kernel/core/nodes/update-node.js";
import { modelTags } from "../../runtime/llm/model-tags.js";

export interface AppProps {
  initialNodeId: string;
  cwd?: string;
}

type WalkerMode = "view" | "command" | "edit";

// The walker root component. Owns the focal node id, the current mode, and the
// transient message channel for boundary hints. Re-renders on every keypress.
//
// v0: read-only navigation.
// v1 PR-A (this PR): adds edit mode (drafts) and `:propose`. Drafts are
// ephemeral on-disk state under .ontology/work/drafts/. They become real
// proposals when the user types `:propose` from the focal node that owns
// the draft.
export function App({ initialNodeId, cwd: initialCwd }: AppProps): React.ReactElement {
  const { exit } = useApp();
  // `cwd` is prop-seeded but stateful so the Projects panel can switch the
  // Walker to another `.ontology/` project in place (setCwd + setFocalId).
  // Every downstream `cwd` reference reads this state unchanged.
  const [cwd, setCwd] = useState(initialCwd ?? process.cwd());
  const [focalId, setFocalId] = useState(initialNodeId);
  const [mode, setMode] = useState<WalkerMode>("view");
  const [command, setCommand] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Edit-mode buffer. Loaded from disk when the user enters edit mode for
  // a focal that already has a saved draft; cleared when they leave edit mode.
  const [draftBuffer, setDraftBuffer] = useState<string>("");
  // Tick state used to force the identity bar's draft indicator to refresh
  // after saveDraft / clearDraft mutations land. Cheaper than re-loading the
  // whole neighborhood on every draft change.
  const [draftTick, setDraftTick] = useState(0);
  // Bumped after an in-place node mutation (e.g. the `m` model-permute) to
  // force the neighborhood useMemo to re-read the node from disk.
  const [reloadTick, setReloadTick] = useState(0);

  // Run-result state machine. The walker stays interactive while a dispatch
  // is in flight: kicked off via useEffect on a "running" sentinel.
  const [runState, setRunState] = useState<RunResultPanelProps["state"]>({ kind: "idle" });
  // Pending kickoff: when set, the effect below dispatches to the model and
  // updates runState on resolve. We use this two-stage pattern so the walker
  // re-renders into the "running" panel BEFORE the (potentially slow)
  // dispatch fires.
  const [pendingRun, setPendingRun] = useState<{ provider: LlmProvider; model?: string; ollamaHost?: string } | null>(null);

  // Compile-plan preview state. The plan is computed synchronously (it is a
  // pure topological sort over edges, no I/O beyond loadEdges), so unlike
  // :run there is no pending sentinel.
  const [planState, setPlanState] = useState<CompilePlanPanelProps["state"]>({ kind: "idle" });

  // Compile-run state. Like :run, this is async (dispatches the model for
  // each step in the plan). We use the same two-stage pattern: render
  // "running" synchronously, then carry out the dispatches in a useEffect.
  const [compileState, setCompileState] = useState<CompileResultPanelProps["state"]>({ kind: "idle" });
  const [pendingCompile, setPendingCompile] = useState<{ provider: LlmProvider; model?: string; ollamaHost?: string; runtimeCheck?: boolean } | null>(null);

  // Unified info panel for read-only commands (:validate, :branch list,
  // :query, :context, :link-analysis). One slot at a time; :clearinfo
  // dismisses any active variant. Most commands build their result
  // synchronously; `:link-analysis` is async (semanticLink) and uses
  // the pendingLinkAnalysis sentinel below to stay interactive.
  const [infoState, setInfoState] = useState<InfoPanelState>({ kind: "idle" });
  // Artifact preview (the editing-loop window): toggled with `a` or
  // `:preview`. Content + shadow status are derived per focal below.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [proposalsPanel, setProposalsPanel] = useState<ProposalsPanelState>({
    open: false,
    proposals: [],
    cursor: 0,
  });
  const [projectsPanel, setProjectsPanel] = useState<ProjectsPanelState>(
    emptyProjectsPanelState(),
  );
  const [nextPanel, setNextPanel] = useState<NextActionsPanelState>(
    emptyNextActionsPanelState(),
  );
  const [pendingLinkAnalysis, setPendingLinkAnalysis] = useState<{ focalId: string } | null>(null);
  // Async sentinel for `:workflow` (v1.5) — same two-stage pattern as :run.
  const [pendingWorkflow, setPendingWorkflow] = useState<WorkflowArgs | null>(null);

  const neighborhood = useMemo<FocalNeighborhood | { error: string }>(() => {
    try {
      return loadFocalNeighborhood(focalId, cwd);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [focalId, cwd, reloadTick]);

  // Action-bar substrate: the status report drives BOTH the fix-first rotation
  // (Tab) and the per-focal recommendation. Memoised on the graph so a keypress
  // is instant; recomputed only when the graph changes (reloadTick).
  const statusReport = useMemo(() => {
    try {
      return buildStatusReport(cwd);
    } catch {
      return null;
    }
  }, [cwd, reloadTick]);
  const safeActions = useMemo(
    () => (statusReport ? nextActionsFromReport(statusReport) : null),
    [statusReport],
  );
  // Tab cycles through the fix-first list like WoW's next-target; the index
  // survives across presses but resets when the list changes.
  const [rotationIdx, setRotationIdx] = useState(0);

  // The recommendation the action bar lights for the CURRENT focal, derived from
  // its tier + drift + whether it sits in the batch-syncable ideal.
  const focalRec = useMemo<{ label: string; tone: FocalTone }>(() => {
    const ns = statusReport?.nodes.find((n) => n.nodeId === focalId);
    if (!ns || !ns.hasShadow) return { label: "intent — i edit / decompose", tone: "intent" };
    if (ns.drifted) return { label: "drifted → :sync", tone: "warn" };
    if (ns.tier === "blocked") return { label: `${ns.ruleViolations} rule-viol → fix`, tone: "warn" };
    if (ns.tier === "lower") return { label: "no fixture → :probe", tone: "todo" };
    const inIdeal = statusReport?.readiness.ideal.includes(focalId) ?? false;
    return inIdeal
      ? { label: "✓ ready → :sync", tone: "ready" }
      : { label: "ready, blocked from below", tone: "todo" };
  }, [statusReport, focalId]);

  // Whether the focal node currently has a saved draft. Recomputed on every
  // focalId change and whenever draftTick advances (i.e., after save/clear).
  const hasDraft = useMemo(() => {
    if ("error" in neighborhood) return false;
    try {
      return loadDraft(focalId, cwd) !== null;
    } catch {
      return false;
    }
    // draftTick is a deliberate invalidation lever; eslint-disable would warn
    // on its inclusion as a dep but the lint rule is not enabled here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focalId, cwd, draftTick, neighborhood]);

  // Shadow freshness of the focal vs the drift anchor + the preview content.
  // Recomputed on focal change and reloadTick (cheap: one snapshot read +
  // one file hash). compileState in the deps refreshes the badge after a
  // :compile lands a new artifact.
  const focalShadow = useMemo(() => {
    if ("error" in neighborhood) return null;
    try {
      return shadowReport(neighborhood.focal, cwd);
    } catch {
      return null;
    }
  }, [neighborhood, cwd, reloadTick, compileState]);

  const artifactPreview = useMemo(() => {
    if (!previewOpen || "error" in neighborhood) return null;
    try {
      return readArtifactPreview(neighborhood.focal, cwd);
    } catch {
      return null;
    }
  }, [previewOpen, neighborhood, cwd, reloadTick, compileState]);

  // Transient messages clear after a brief delay so the UI does not pile up state.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 1500);
    return () => clearTimeout(t);
  }, [message]);

  // Async dispatcher for `:run`. The handler that types pendingRun runs
  // synchronously and immediately re-renders into the "running" panel; this
  // effect then carries out the dispatch off the keystroke path.
  useEffect(() => {
    if (!pendingRun) return;
    if ("error" in neighborhood) {
      setRunState({ kind: "error", message: "focal node failed to load" });
      setPendingRun(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await runFromWalker({
        focal: neighborhood.focal,
        provider: pendingRun.provider,
        model: pendingRun.model,
        ollamaHost: pendingRun.ollamaHost,
        cwd,
      });
      if (cancelled) return;
      if (!result.ok) {
        setRunState({ kind: "error", message: result.message });
      } else {
        setRunState({
          kind: "result",
          runId: result.runId,
          cached: result.cached,
          provider: result.provider,
          model: result.model,
          responseText: result.responseText,
          durationMs: result.durationMs,
        });
      }
      setPendingRun(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRun]);

  // Async dispatcher for `:link-analysis`. Mirrors the :run pattern.
  // The action wraps semanticLink (async by signature) and computes
  // edge suggestions; the panel renders into its "in-flight" state by
  // way of a transient message, then replaces it with the final
  // analysis when the promise resolves.
  useEffect(() => {
    if (!pendingLinkAnalysis) return;
    let cancelled = false;
    (async () => {
      const result = await linkAnalysisFromWalker(pendingLinkAnalysis.focalId, cwd);
      if (cancelled) return;
      setInfoState({ kind: "link-analysis", result });
      if (!result.ok) setMessage(result.message ?? "link-analysis failed");
      setPendingLinkAnalysis(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLinkAnalysis]);

  // Async dispatcher for `:workflow`. Mirrors the :run pattern: the handler
  // sets the sentinel + a transient message synchronously; this effect runs
  // the (potentially long, multi-step) workflow off the keystroke path and
  // lands the result in the info panel.
  useEffect(() => {
    if (!pendingWorkflow) return;
    if ("error" in neighborhood) {
      setInfoState({ kind: "workflow", result: { ok: false, message: "focal node failed to load" } });
      setPendingWorkflow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await workflowFromWalker({
        focal: neighborhood.focal,
        ...pendingWorkflow,
        cwd,
      });
      if (cancelled) return;
      setInfoState({ kind: "workflow", result });
      if (!result.ok) setMessage(result.message);
      else if (result.proposalId) setDraftTick((t) => t + 1);
      setPendingWorkflow(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWorkflow]);

  // Async dispatcher for `:compile`. Mirrors the :run pattern.
  useEffect(() => {
    if (!pendingCompile) return;
    if ("error" in neighborhood) {
      setCompileState({ kind: "result", run: { ok: false, focalId, reason: "missing_node", message: "focal node failed to load" } });
      setPendingCompile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const run = await compileFromWalker({
        focalId,
        provider: pendingCompile.provider,
        model: pendingCompile.model,
        ollamaHost: pendingCompile.ollamaHost,
        runtimeCheck: pendingCompile.runtimeCheck,
        cwd,
      });
      if (cancelled) return;
      setCompileState({ kind: "result", run });
      setPendingCompile(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCompile]);

  // Helper: persist the current edit-mode buffer and exit edit mode.
  function commitDraftAndExit(): void {
    if ("error" in neighborhood) return;
    try {
      saveDraft({ focalNodeId: focalId, draftPrompt: draftBuffer, cwd });
      setDraftTick(t => t + 1);
      setMessage(`draft saved for ${focalId}`);
    } catch (err: unknown) {
      setMessage(`failed to save draft: ${err instanceof Error ? err.message : String(err)}`);
    }
    setMode("view");
    setDraftBuffer("");
  }

  useInput((input, key) => {
    if (mode === "edit") {
      // ink-text-input owns the keyboard while it's mounted. We only need to
      // catch the escape key here to exit; everything else flows into the
      // TextInput's onChange handler. Submitting (Enter) is wired through
      // onSubmit on the TextInput.
      if (key.escape) {
        commitDraftAndExit();
      }
      return;
    }

    if (mode === "command") {
      if (key.escape) {
        setMode("view");
        setCommand("");
        return;
      }
      if (key.return) {
        const cmd = command.trim();
        setMode("view");
        setCommand("");
        handleCommand(cmd);
        return;
      }
      if (key.delete || key.backspace) {
        setCommand(prev => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setCommand(prev => prev + input);
      }
      return;
    }

    if ("error" in neighborhood) {
      if (input === "q" || key.escape) exit();
      return;
    }

    // When the proposals panel is open, its keys take priority over
    // graph navigation. j/k / arrows scroll the proposal list; a/r/d
    // act on the focused proposal; Esc closes the panel and returns
    // control to graph navigation. This is the only place in the
    // walker where the same key (arrows) has a different meaning
    // depending on which panel is open — kept local and obvious.
    if (proposalsPanel.open) {
      if (key.escape) {
        setProposalsPanel({ open: false, proposals: [], cursor: 0 });
        setMessage("proposals panel dismissed");
        return;
      }
      if (proposalsPanel.loadError) {
        // Read-only state; only Esc / R make sense.
        if (input === "R") {
          const reload = loadProposalsForWalker(cwd);
          setProposalsPanel(
            reload.ok
              ? { open: true, proposals: reload.proposals, cursor: 0 }
              : { open: true, proposals: [], cursor: 0, loadError: reload.message ?? "Failed to reload" },
          );
        }
        return;
      }
      if (input === "j" || key.downArrow) {
        setProposalsPanel((s) => ({
          ...s,
          cursor: Math.min(s.proposals.length - 1, s.cursor + 1),
        }));
        return;
      }
      if (input === "k" || key.upArrow) {
        setProposalsPanel((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }));
        return;
      }
      if (input === "R") {
        const reload = loadProposalsForWalker(cwd);
        if (reload.ok) {
          setProposalsPanel({
            open: true,
            proposals: reload.proposals,
            cursor: Math.min(proposalsPanel.cursor, Math.max(0, reload.proposals.length - 1)),
          });
          setMessage(`reloaded — ${reload.proposals.length} pending`);
        } else {
          setProposalsPanel({
            open: true,
            proposals: [],
            cursor: 0,
            loadError: reload.message ?? "Failed to reload",
          });
        }
        return;
      }
      if (proposalsPanel.proposals.length === 0) {
        return; // a/r/d are no-ops without rows
      }
      const focused = proposalsPanel.proposals[proposalsPanel.cursor];
      if (input === "a") {
        const r = applyProposalFromWalker(focused.id, { cwd });
        const at = Date.now();
        // On success we drop the now-applied proposal from the list and
        // keep the cursor on the next item (or the last item if we
        // applied the bottom row). On failure we leave the list as-is.
        if (r.ok && r.outcome === "applied") {
          const remaining = proposalsPanel.proposals.filter((p) => p.id !== focused.id);
          const newCursor = Math.min(proposalsPanel.cursor, Math.max(0, remaining.length - 1));
          setProposalsPanel({
            open: true,
            proposals: remaining,
            cursor: newCursor,
            lastAction: {
              proposalId: focused.id,
              outcome: r.outcome,
              message: r.createdId ? `applied — created ${r.createdId}` : "applied",
              at,
            },
          });
        } else {
          setProposalsPanel((s) => ({
            ...s,
            lastAction: { proposalId: focused.id, outcome: r.outcome, message: r.message, at },
          }));
        }
        return;
      }
      if (input === "d") {
        const r = applyProposalFromWalker(focused.id, { dryRun: true, cwd });
        setProposalsPanel((s) => ({
          ...s,
          lastAction: {
            proposalId: focused.id,
            outcome: r.outcome,
            message: r.message,
            at: Date.now(),
          },
        }));
        return;
      }
      if (input === "r") {
        const r = rejectProposalFromWalker(focused.id, { cwd });
        if (r.ok) {
          const remaining = proposalsPanel.proposals.filter((p) => p.id !== focused.id);
          const newCursor = Math.min(proposalsPanel.cursor, Math.max(0, remaining.length - 1));
          setProposalsPanel({
            open: true,
            proposals: remaining,
            cursor: newCursor,
            lastAction: { proposalId: focused.id, outcome: "rejected", message: "rejected", at: Date.now() },
          });
        } else {
          setProposalsPanel((s) => ({
            ...s,
            lastAction: {
              proposalId: focused.id,
              outcome: "reject_failed",
              message: r.message,
              at: Date.now(),
            },
          }));
        }
        return;
      }
      // Any other key is ignored — keep the panel focused.
      return;
    }

    // When the projects panel is open its keys take priority, mirroring the
    // proposals panel. In create sub-mode the TextInput owns the keyboard —
    // only Esc (cancel) is handled here; typing + Enter flow to the TextInput.
    if (projectsPanel.open) {
      if (projectsPanel.mode === "create") {
        if (key.escape) {
          setProjectsPanel((s) => ({ ...s, mode: "list", createName: "", message: undefined }));
        }
        return;
      }
      if (key.escape) {
        setProjectsPanel(emptyProjectsPanelState());
        setMessage("projects panel dismissed");
        return;
      }
      if (input === "R") {
        const reload = projectsForWalker(cwd);
        setProjectsPanel((s) => ({
          ...s,
          rows: reload.rows,
          cursor: Math.min(s.cursor, Math.max(0, reload.rows.length - 1)),
          message: reload.ok ? undefined : `✖ ${reload.message ?? "reload failed"}`,
        }));
        return;
      }
      if (input === "j" || key.downArrow) {
        setProjectsPanel((s) => ({ ...s, cursor: Math.min(s.rows.length - 1, s.cursor + 1) }));
        return;
      }
      if (input === "k" || key.upArrow) {
        setProjectsPanel((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }));
        return;
      }
      if (input === "n") {
        setProjectsPanel((s) => ({ ...s, mode: "create", createName: "", message: undefined }));
        return;
      }
      if (key.return) {
        const row = projectsPanel.rows[projectsPanel.cursor];
        if (!row) return;
        if (row.kind === "create") {
          setProjectsPanel((s) => ({ ...s, mode: "create", createName: "", message: undefined }));
          return;
        }
        const opened = openProjectFromWalker(row.entry.path);
        if (opened.ok && opened.cwd && opened.rootNodeId) {
          setCwd(opened.cwd);
          setFocalId(opened.rootNodeId);
          setProjectsPanel(emptyProjectsPanelState());
          setMessage(`opened ${row.entry.name}`);
        } else {
          setProjectsPanel((s) => ({ ...s, message: `✖ ${opened.message ?? "open failed"}` }));
        }
        return;
      }
      // Any other key is ignored — keep the panel focused.
      return;
    }

    // The "next safe action" panel: j/k scroll the fix-first list, enter FOCUSES
    // the selected node (so you can act on it), R recomputes, Esc closes.
    if (nextPanel.open) {
      if (key.escape) {
        setNextPanel(emptyNextActionsPanelState());
        setMessage("next-actions panel dismissed");
        return;
      }
      if (input === "R") {
        const r = nextActions(cwd);
        setNextPanel((s) => ({
          ...s,
          syncableNow: r.syncableNow,
          actions: r.actions,
          cursor: Math.min(s.cursor, Math.max(0, r.actions.length - 1)),
          message: r.ok ? undefined : `✖ ${r.message ?? "reload failed"}`,
        }));
        return;
      }
      if (input === "j" || key.downArrow) {
        setNextPanel((s) => ({ ...s, cursor: Math.min(s.actions.length - 1, s.cursor + 1) }));
        return;
      }
      if (input === "k" || key.upArrow) {
        setNextPanel((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }));
        return;
      }
      if (key.return) {
        const a = nextPanel.actions[nextPanel.cursor];
        if (a) {
          setFocalId(a.nodeId);
          setNextPanel(emptyNextActionsPanelState());
          setMessage(`focal → ${a.nodeId}  (${a.suggestion})`);
        }
        return;
      }
      // Any other key ignored — keep the panel focused.
      return;
    }

    // VIEW mode bindings.
    if (key.upArrow) {
      const next = navigateUp(neighborhood);
      if (next) setFocalId(next);
      else setMessage("no parent (canon)");
      return;
    }
    if (key.downArrow) {
      const next = navigateDown(neighborhood);
      if (next) setFocalId(next);
      else setMessage("no children");
      return;
    }
    if (key.leftArrow) {
      const next = navigateSiblingPrevious(neighborhood);
      if (next) setFocalId(next);
      else setMessage("no previous sibling");
      return;
    }
    if (key.rightArrow) {
      const next = navigateSiblingNext(neighborhood);
      if (next) setFocalId(next);
      else setMessage("no next sibling");
      return;
    }
    if (input === "a") {
      // Toggle the artifact preview — the read-only window on the focal's
      // compiled shadow. Same toggle as `:preview`.
      setPreviewOpen((open) => !open);
      return;
    }
    if (input === "i") {
      // Enter edit mode. Pre-populate the buffer from any existing draft so
      // the user resumes mid-thought instead of starting fresh.
      try {
        const existing = loadDraft(focalId, cwd);
        setDraftBuffer(existing?.draftPrompt ?? "");
      } catch {
        setDraftBuffer("");
      }
      setMode("edit");
      return;
    }
    if (key.tab) {
      // WoW's next-target, for development: cycle the fix-first list, focusing
      // the highest-leverage node first. Shift+Tab steps back. The action bar
      // then lights what that node needs.
      const acts = safeActions?.actions ?? [];
      if (acts.length === 0) {
        setMessage(`no blockers — ${safeActions?.syncableNow ?? 0} node(s) batch-syncable`);
        return;
      }
      const idx = key.shift
        ? (rotationIdx - 1 + acts.length) % acts.length
        : rotationIdx % acts.length;
      const a = acts[idx];
      setRotationIdx(key.shift ? idx : idx + 1);
      setFocalId(a.nodeId);
      setMessage(`▶ ${a.nodeId}  ${a.reason} → ${a.suggestion}  (unblocks ${a.unblocks})`);
      return;
    }
    if (input === "d") {
      // Focal definition-of-done at a glance — the "why is this not done?"
      // reflex. Read-only, no fixture execution (structural stays, pure compare).
      try {
        const rep = buildDodReport(focalId, cwd, { runBehaviour: false });
        if ("error" in rep) {
          setMessage(`dod: ${rep.error}`);
        } else {
          const g = rep.gates;
          const cell = (s: string): string =>
            s === "pass" ? "✓" : s === "fail" ? "✖" : s === "no-fixture" ? "no-fix" : "—";
          setMessage(
            `dod ${rep.nodeId} · ${rep.tier} · rules ${cell(g.rules.state)} struct ${cell(g.structural.state)} behav ${cell(g.behaviour.state)} · blocks ${rep.blastRadius} · ${rep.drift}`,
          );
        }
      } catch (err) {
        setMessage(`dod: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    if (input === "T") {
      setMessage("time scrub arrives in walker v2");
      return;
    }
    if (input === "B") {
      setMessage("branch hop arrives in walker v2");
      return;
    }
    if (input === "M") {
      setMessage("manifestation rotation arrives in walker v2");
      return;
    }
    if (input === "g") {
      setMessage("shared-token jump arrives in walker v2");
      return;
    }
    if (input === "E") {
      setMessage("edge walk arrives in walker v2");
      return;
    }
    if (input === "m") {
      // Permuta el modelo del nodo focal entre los del registry (locales + APIs).
      // Cada toque avanza al siguiente y muestra para que es bueno ese modelo.
      if ("error" in neighborhood) {
        setMessage("sin focal");
        return;
      }
      try {
        const models = loadModelsRegistry(cwd).models;
        if (models.length === 0) {
          setMessage("sin modelos en el registry");
          return;
        }
        const currentRef = neighborhood.focal.model?.ref;
        const idx = models.findIndex((mm) => mm.id === currentRef);
        const next = models[(idx + 1) % models.length];
        updateNode({ id: focalId, model: { ref: next.id }, cwd });
        setReloadTick((t) => t + 1);
        setMessage(
          `modelo → ${next.id}  [${next.name}]  · bueno para: ${modelTags(next).join(", ")}`,
        );
      } catch (err) {
        setMessage(`m: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    if (input === ":") {
      setMode("command");
      return;
    }
    if (input === "q" || key.escape) {
      exit();
      return;
    }
  });

  // Command-mode dispatch. Kept separate from useInput's body to keep the
  // bindings table readable.
  function handleCommand(cmd: string): void {
    if (cmd === "q" || cmd === "quit") {
      exit();
      return;
    }
    if (cmd === "help") {
      setMessage("i edit · a/:preview artifact · :which <file> · :health (node dashboard) · :next (what to do next) · :projects (switch/create project) · :fichacleanup · :reanchor · :propose · :propose-update · :verify · :workflow <graph> --input <f> [--propose-update] · :link --to <id> --type <edgeType> · :link-analysis · :graph view [depth] · :run [ollama] [--model X] · :plan · :compile [ollama] [--model X] [--runtime-check] · :validate · :branch list · :context · :query [--kind X] · :models · :route <task> <model-id|off> · :clear{run,plan,compile,info,draft,preview} · :q");
      return;
    }
    if (cmd === "propose") {
      if ("error" in neighborhood) {
        setMessage("cannot propose: focal node failed to load");
        return;
      }
      const result = proposeFromDraft({ focal: neighborhood.focal, cwd });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      // Re-evaluate hasDraft (clearDraft may have been called by the action).
      setDraftTick(t => t + 1);
      setMessage(`proposal ${result.proposalId} created (pending)`);
      return;
    }
    // :propose-update — the draft becomes a node_update proposal on the
    // focal ITSELF (in-place refinement; :propose creates a child instead).
    // Pinned to the focal's hash; apply via :proposals or the CLI.
    if (cmd === "propose-update") {
      if ("error" in neighborhood) {
        setMessage("cannot propose: focal node failed to load");
        return;
      }
      const result = proposeUpdateFromDraft({ focal: neighborhood.focal, cwd });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setDraftTick(t => t + 1);
      setMessage(`proposal ${result.proposalId} created (pending node_update on ${focalId})`);
      return;
    }
    // :verify — the focal's round-trip verdict against the LAST compiled
    // artifact. Pure + synchronous (no dispatch); :compile first to refresh.
    if (cmd === "verify") {
      if ("error" in neighborhood) {
        setMessage("cannot verify: focal node failed to load");
        return;
      }
      const result = verifyFromWalker(neighborhood.focal, cwd);
      setInfoState({ kind: "verify", result });
      setMessage(result.ok ? `verify: ${result.verdict}` : result.message);
      return;
    }
    // :workflow <graph> --input <file> [provider] [--model X] [--propose-update]
    // Run a Phase ζ workflow graph from the TUI. With --propose-update an
    // ACCEPTED run proposes a node_update of the focal via the §3.6 path
    // (wfrun_* record + proposals, same substrate as the CLI).
    if (cmd === "workflow" || cmd.startsWith("workflow ")) {
      if ("error" in neighborhood) {
        setMessage("cannot run workflow: focal node failed to load");
        return;
      }
      const parsed = parseWorkflowArgs(cmd.slice("workflow".length));
      if (!parsed.ok) {
        setMessage(parsed.message);
        return;
      }
      setMessage(`running workflow ${parsed.args.graphFile}…`);
      setPendingWorkflow(parsed.args);
      return;
    }
    // :link --to <nodeId> --type <edgeType> [--rationale <text>]
    // Source endpoint is always the focal cell. Mirrors `onto propose link`
    // semantics: validates edge type + poset direction + endpoint hashes,
    // creates a `pending` edge_create proposal, and surfaces the proposal
    // id via the message bar. Apply still happens via `onto proposal apply`
    // — this keeps the explicit two-step graph-mutation flow consistent
    // with how nodes are created from drafts.
    if (cmd === "link" || cmd.startsWith("link ")) {
      if ("error" in neighborhood) {
        setMessage("cannot link: focal node failed to load");
        return;
      }
      const parsed = parseLinkArgs(cmd.slice("link".length));
      if (!parsed.ok) {
        setMessage(parsed.message);
        return;
      }
      const result = linkFromWalker({
        focal: neighborhood.focal,
        to: parsed.args.to,
        type: parsed.args.type,
        ...(parsed.args.rationale !== undefined && { rationale: parsed.args.rationale }),
        cwd,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMessage(`proposal ${result.proposalId} created (pending) — ${result.from} → ${result.to} (${result.type})`);
      return;
    }
    if (cmd === "cleardraft") {
      const removed = clearDraft(focalId, cwd);
      setDraftTick(t => t + 1);
      setMessage(removed ? `draft cleared for ${focalId}` : `no draft to clear for ${focalId}`);
      return;
    }
    // :run [provider] [--model <name>] [--host <url>]. Default provider is
    // mock (safe + offline). For ollama, --model is recommended on modest
    // hardware: the adapter default (`llama3.1:8b`) does not fit comfortably
    // on 8GB Macs and tends to hit undici's fetch timeout. Try
    // `:run ollama --model llama3.2:3b`.
    if (cmd === "run" || cmd.startsWith("run ")) {
      if ("error" in neighborhood) {
        setMessage("cannot run: focal node failed to load");
        return;
      }
      const parsed = parseProviderArgs(cmd.slice("run".length));
      if (!parsed.ok) {
        setMessage(parsed.message);
        return;
      }
      // Show "running ..." synchronously, then schedule the actual dispatch
      // via a useEffect on pendingRun so the walker re-renders before the
      // (potentially slow) network call.
      setRunState({ kind: "running", provider: parsed.args.provider, model: parsed.args.model });
      setPendingRun(parsed.args);
      return;
    }
    if (cmd === "clearrun") {
      setRunState({ kind: "idle" });
      setMessage("run result dismissed");
      return;
    }
    if (cmd === "plan" || cmd === "compile --plan" || cmd === "compile-plan") {
      // Topological compile-plan preview. Read-only: we never write any
      // artifact or event here; the real compiler ships in Bootstrap 0.8.
      const plan = planFromWalker({ focalId, cwd });
      setPlanState({ kind: "result", plan });
      if (!plan.ok) {
        setMessage(`plan failed: ${plan.reason}`);
      } else {
        setMessage(`plan: ${plan.steps.length} step(s)`);
      }
      return;
    }
    if (cmd === "clearplan") {
      setPlanState({ kind: "idle" });
      setMessage("plan dismissed");
      return;
    }
    // :compile [provider] [--model <name>] [--host <url>] [--runtime-check]
    // Run the topological plan and write artifacts. See :run for the
    // rationale on --model. `--runtime-check` matches the CLI flag — after
    // parse-validation, executes the artifact under a timeout and fails
    // the step with runtime_failed on non-zero exit.
    if (cmd === "compile" || cmd.startsWith("compile ")) {
      if ("error" in neighborhood) {
        setMessage("cannot compile: focal node failed to load");
        return;
      }
      const parsed = parseProviderArgs(cmd.slice("compile".length));
      if (!parsed.ok) {
        setMessage(parsed.message);
        return;
      }
      setCompileState({ kind: "running", provider: parsed.args.provider, model: parsed.args.model });
      setPendingCompile(parsed.args);
      return;
    }
    if (cmd === "clearcompile") {
      setCompileState({ kind: "idle" });
      setMessage("compile result dismissed");
      return;
    }
    // :validate — lightweight topology + integrity check against the
    // current network. Re-uses the production hash + poset primitives;
    // runs synchronously. For the full audit (events, registry contents,
    // root canon phrases) the user runs `onto validate` from a shell.
    if (cmd === "validate") {
      const result = validateFromWalker(cwd);
      setInfoState({ kind: "validate", result });
      setMessage(
        result.ok
          ? `network kernel stable (${result.scanned.nodes} node(s), ${result.scanned.edges} edge(s))`
          : `${result.violations.length} violation(s); see panel`,
      );
      return;
    }
    // :branch list — list distinct branches in the network. Read-only,
    // synchronous, wraps `listBranches` from the fibration library
    // (Bootstrap 0.9, PR #111).
    if (cmd === "branch list" || cmd === "branches") {
      const result = branchListFromWalker(cwd);
      setInfoState({ kind: "branches", result });
      if (!result.ok) setMessage(result.message ?? "branch list failed");
      return;
    }
    // :context — assemble the focal node's context (presheaf preview).
    // Same path the dispatcher uses for `:run`, stopped before the model
    // call — purely "what does this node see?".
    if (cmd === "context") {
      if ("error" in neighborhood) {
        setMessage("cannot assemble context: focal node failed to load");
        return;
      }
      const result = contextFromWalker(focalId, cwd);
      setInfoState({ kind: "context", result, focalId });
      if (!result.ok) setMessage(result.message ?? "context assembly failed");
      return;
    }
    // :graph view [depth] — render the focal's k-hop subgraph as a
    // structured panel. Read-only; synchronous (extractSubgraph is pure
    // over the on-disk edges + nodes). Wraps `extractSubgraph` from the
    // traversal helpers so the walker and the CLI's `onto graph subgraph`
    // agree on the slice membership; the only difference is presentation.
    if (cmd === "graph view" || cmd.startsWith("graph view")) {
      if ("error" in neighborhood) {
        setMessage("cannot render graph view: focal node failed to load");
        return;
      }
      const parsed = parseGraphViewArgs(cmd.slice("graph view".length));
      if (!parsed.ok) {
        setMessage(parsed.message);
        return;
      }
      const result = graphViewFromWalker(focalId, { depth: parsed.depth, cwd });
      setInfoState({ kind: "graph-view", result });
      if (!result.ok) setMessage(result.message ?? "graph view failed");
      return;
    }
    // :link-analysis — semantic-linker analysis against the focal cell.
    // Defaults the candidate to focal.prompt.raw (the question becomes
    // "does my own prompt satisfy my context contract?"). Surfaces the
    // requires/provides/forbids matrix and any edge proposal
    // suggestions for unsatisfied requirements. Read-only; for a
    // different candidate, run `onto link <focalId> --candidate ...`
    // from a shell.
    if (cmd === "link-analysis") {
      if ("error" in neighborhood) {
        setMessage("cannot run link-analysis: focal node failed to load");
        return;
      }
      setMessage("running link-analysis…");
      setPendingLinkAnalysis({ focalId });
      return;
    }
    // :query [--kind X] [--has-incoming refines] [--provides spec] ...
    // Yoneda-shape search across every node in the network. Wraps
    // `queryNodes` from the representable-functor module (PR #111).
    if (cmd === "query" || cmd.startsWith("query ")) {
      const parsed = parseQueryArgs(cmd.slice("query".length));
      if (!parsed.ok) {
        setMessage(parsed.message);
        return;
      }
      const result = queryFromWalker(parsed.shape, cwd);
      const summary = Object.entries(parsed.shape)
        .map(([k, v]) => Array.isArray(v) ? `${k}=${v.join(",")}` : `${k}=${String(v)}`)
        .join(" ");
      setInfoState({ kind: "query", result, shapeSummary: summary });
      if (!result.ok) setMessage(result.message ?? "query failed");
      return;
    }
    // :models — view the per-task model routing + the registry catalog.
    // The policy layer between a CLI --model override and a node's model.ref
    // (REGEN_ORACLE_REFINE): put a code-expert on F (code_sketch), a stronger
    // reasoning model on G-extraction (semantic_parse/inspect) + verification.
    if (cmd === "models" || cmd === "routing") {
      setInfoState({ kind: "models", result: modelsFromWalker(cwd) });
      return;
    }
    // :health  ·  :status — the Walker v2 node dashboard. Composes shadow +
    // fixture + rule + ficha + drift + closure for the FOCAL node and names the
    // next safe action in the governed loop. Read-only; writes nothing.
    if (cmd === "health" || cmd === "status") {
      setInfoState({ kind: "node-health", result: nodeHealthFromWalker(focalId, cwd) });
      return;
    }
    // :fichacleanup — governed one-shot control: run the deterministic ficha
    // reconciliation (complete + prune) on the focal, then refresh :health so
    // the user SEES the contract gap close without leaving Walker.
    if (cmd === "fichacleanup" || cmd === "ficha cleanup") {
      const r = fichaCleanupFromWalker(focalId, cwd);
      setMessage(`ficha cleanup ${focalId}: ${r.message}`);
      if (r.ok && (r.added.length > 0 || r.pruned.length > 0)) setReloadTick((t) => t + 1);
      setInfoState({ kind: "node-health", result: nodeHealthFromWalker(focalId, cwd) });
      return;
    }
    // :reanchor — governed one-shot control: refresh THIS node's drift anchor
    // (accept the current shadow as the baseline), then refresh :health.
    if (cmd === "reanchor") {
      const r = reanchorNodeArtifacts(focalId, cwd ?? process.cwd());
      setMessage(r.anchored ? `re-anchored ${focalId}: ${r.paths.join(", ")}` : `re-anchor skipped: ${r.reason ?? "no change"}`);
      if (r.anchored) setReloadTick((t) => t + 1);
      setInfoState({ kind: "node-health", result: nodeHealthFromWalker(focalId, cwd) });
      return;
    }
    // :route <task> <model-id>  ·  :route <task> off
    // Re-point a task at a registered model (governed write to registry.json),
    // or clear it (fall back to per-node model.ref). Refreshes the :models view.
    if (cmd === "route" || cmd.startsWith("route ")) {
      const args = cmd.slice("route".length).trim().split(/\s+/).filter(Boolean);
      if (args.length !== 2) {
        setMessage("usage: :route <task> <model-id|off>  — e.g. :route code_sketch extract_local  ·  :route inspect off  (see :models)");
        return;
      }
      const [task, target] = args;
      const res = routeFromWalker(task, target === "off" ? null : target, cwd);
      setMessage(res.message);
      // Always refresh the panel so the user immediately SEES the new routing.
      setInfoState({ kind: "models", result: modelsFromWalker(cwd) });
      return;
    }
    if (cmd === "clearinfo") {
      setInfoState({ kind: "idle" });
      setMessage("info panel dismissed");
      return;
    }
    if (cmd === "preview" || cmd === "clearpreview") {
      // Same semantics as the `a` key; :clearpreview always closes.
      setPreviewOpen((open) => (cmd === "clearpreview" ? false : !open));
      return;
    }
    if (cmd.startsWith("which")) {
      // Inverse traceability: which intention built this file? Accepts a
      // cwd-relative or absolute path and jumps the focal to the owning
      // node (the node whose outputs.files contains it).
      const fileArg = cmd.slice("which".length).trim();
      if (fileArg.length === 0) {
        setMessage("usage: :which <file> — e.g. :which src/core/errors.ts");
        return;
      }
      try {
        const owners = nodesOwningFile(loadNodes(cwd), fileArg, cwd);
        if (owners.length === 0) {
          setMessage(`no node owns ${fileArg} — not yet ingested/compiled?`);
          return;
        }
        setFocalId(owners[0].id);
        setPreviewOpen(true);
        setMessage(
          owners.length === 1
            ? `${owners[0].id} owns ${fileArg}`
            : `${owners.length} nodes own ${fileArg} — focal on ${owners[0].id} (also: ${owners.slice(1).map((n) => n.id).join(", ")})`,
        );
      } catch (err) {
        setMessage(`which: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    if (cmd === "proposals" || cmd === "p") {
      // Walker v2 PR-1 — proposal review pane. Loads the pending list
      // and opens the panel. The operator drives it with j/k navigation
      // and a/r/d action keys; see proposalsPanel mode below.
      const result = loadProposalsForWalker(cwd);
      if (!result.ok) {
        setProposalsPanel({
          open: true,
          proposals: [],
          cursor: 0,
          loadError: result.message ?? "Failed to load proposals",
        });
      } else {
        setProposalsPanel({
          open: true,
          proposals: result.proposals,
          cursor: 0,
        });
        setMessage(
          result.proposals.length === 0
            ? "no pending proposals"
            : `${result.proposals.length} pending proposal${result.proposals.length === 1 ? "" : "s"} — j/k to navigate, a/r/d to act`,
        );
      }
      return;
    }
    if (cmd === "clearproposals") {
      setProposalsPanel({ open: false, proposals: [], cursor: 0 });
      setMessage("proposals panel dismissed");
      return;
    }
    if (cmd === "projects" || cmd === "proj") {
      // Walker v2 — project switcher. Lists registered `.ontology/` projects
      // (live + stale) plus a create row; the operator drives it with j/k,
      // enter to open (switches cwd + focal in place), n to create.
      const result = projectsForWalker(cwd);
      const projectCount = result.rows.filter((r) => r.kind === "project").length;
      setProjectsPanel({
        ...emptyProjectsPanelState(),
        open: true,
        rows: result.rows,
        message: result.ok ? undefined : `✖ ${result.message ?? "failed to load projects"}`,
      });
      setMessage(
        projectCount === 0
          ? "no projects registered — n to create one"
          : `${projectCount} project${projectCount === 1 ? "" : "s"} — j/k navigate, enter open, n new`,
      );
      return;
    }
    if (cmd === "clearprojects") {
      setProjectsPanel(emptyProjectsPanelState());
      setMessage("projects panel dismissed");
      return;
    }
    if (cmd === "next" || cmd === "actions") {
      // Walker v2 — the "what do I do next?" cockpit. Reuses the sync-readiness
      // triage (`onto status`/`onto dod`): syncable-now count + the fix-first
      // frontier ranked by leverage. enter focuses a node so you can act on it.
      const r = nextActions(cwd);
      setNextPanel({
        ...emptyNextActionsPanelState(),
        open: true,
        syncableNow: r.syncableNow,
        actions: r.actions,
        message: r.ok ? undefined : `✖ ${r.message ?? "failed to compute next actions"}`,
      });
      setMessage(
        r.actions.length === 0
          ? `${r.syncableNow} node(s) syncable — no blockers`
          : `next: ${r.actions.length} fix-first action(s) — j/k, enter to focus`,
      );
      return;
    }
    if (cmd === "clearnext") {
      setNextPanel(emptyNextActionsPanelState());
      setMessage("next-actions panel dismissed");
      return;
    }
    setMessage(`unknown command: :${cmd}`);
  }

  if ("error" in neighborhood) {
    return (
      <Box flexDirection="column">
        <Text color="red">✖ {neighborhood.error}</Text>
        <Text dimColor>press q to exit</Text>
      </Box>
    );
  }

  const requiresShared = focalRequiresShared(neighborhood);
  const providesShared = focalProvidesShared(neighborhood);
  const showColors = colorsEnabled();
  const borderColor = showColors ? POSET_COLORS[neighborhood.focal.coordinates.abstraction] : undefined;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
      <IdentityBar
        node={neighborhood.focal}
        hasDraft={hasDraft}
        shadowStatus={
          focalShadow?.status === "drifted" || focalShadow?.status === "missing"
            ? focalShadow.status
            : null
        }
      />
      <AiStatusBar />
      <PromptSection node={neighborhood.focal} />
      <ConstraintsSection node={neighborhood.focal} />
      <RequiresProvidesSection requires={requiresShared} provides={providesShared} />
      <EdgesSection
        edgesOut={neighborhood.edgesOut}
        edgesIn={neighborhood.edgesIn}
        edgeNeighbors={neighborhood.edgeNeighbors}
      />
      <PathSection pathToCanon={neighborhood.pathToCanon} />
      {mode === "edit" && (
        <DraftEditor
          focalLabel={neighborhood.focal.label || neighborhood.focal.id}
          value={draftBuffer}
          onChange={setDraftBuffer}
          onSubmit={commitDraftAndExit}
        />
      )}
      <ArtifactPreviewPanel open={previewOpen} preview={artifactPreview} shadow={focalShadow} />
      <RunResultPanel state={runState} />
      <CompilePlanPanel state={planState} />
      <CompileResultPanel state={compileState} />
      <InfoPanel state={infoState} />
      <ProposalsPanel state={proposalsPanel} />
      <ProjectsPanel
        state={projectsPanel}
        onCreateNameChange={(value) =>
          setProjectsPanel((s) => ({ ...s, createName: value }))
        }
        onCreateSubmit={(value) => {
          setProjectsPanel((s) => ({ ...s, loading: true, message: undefined }));
          // baseDir is the launch directory (matches the panel's help text),
          // so a new project always lands under where the Walker started even
          // after switching into another project in-session.
          void createProjectFromWalker({ name: value, baseDir: initialCwd ?? process.cwd() }).then((res) => {
            if (res.ok && res.cwd && res.rootNodeId) {
              setCwd(res.cwd);
              setFocalId(res.rootNodeId);
              setProjectsPanel(emptyProjectsPanelState());
              setMessage(`created & opened ${res.name ?? value}`);
            } else {
              setProjectsPanel((s) => ({
                ...s,
                loading: false,
                message: `✖ ${res.message ?? "create failed"}`,
              }));
            }
          });
        }}
      />
      <NextActionsPanel state={nextPanel} />
      <ActionBar
        syncableNow={safeActions?.syncableNow ?? 0}
        next={
          safeActions && safeActions.actions.length > 0
            ? { nodeId: safeActions.actions[0].nodeId, unblocks: safeActions.actions[0].unblocks }
            : null
        }
        focal={focalRec}
      />
      <HintBar mode={mode === "edit" ? "view" : mode} command={command} message={message} />
    </Box>
  );
}
