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
import { loadDraft, saveDraft, clearDraft } from "../core/drafts/persist.js";
import { proposeFromDraft } from "./actions/propose-from-draft.js";
import { runFromWalker } from "./actions/run-from-walker.js";
import { planFromWalker } from "./actions/plan-from-walker.js";
import { compileFromWalker } from "./actions/compile-from-walker.js";
import type { LlmProvider } from "../runtime/llm/types.js";

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
export function App({ initialNodeId, cwd }: AppProps): React.ReactElement {
  const { exit } = useApp();
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

  // Run-result state machine. The walker stays interactive while a dispatch
  // is in flight: kicked off via useEffect on a "running" sentinel.
  const [runState, setRunState] = useState<RunResultPanelProps["state"]>({ kind: "idle" });
  // Pending kickoff: when set, the effect below dispatches to the model and
  // updates runState on resolve. We use this two-stage pattern so the walker
  // re-renders into the "running" panel BEFORE the (potentially slow)
  // dispatch fires.
  const [pendingRun, setPendingRun] = useState<{ provider: LlmProvider } | null>(null);

  // Compile-plan preview state. The plan is computed synchronously (it is a
  // pure topological sort over edges, no I/O beyond loadEdges), so unlike
  // :run there is no pending sentinel.
  const [planState, setPlanState] = useState<CompilePlanPanelProps["state"]>({ kind: "idle" });

  // Compile-run state. Like :run, this is async (dispatches the model for
  // each step in the plan). We use the same two-stage pattern: render
  // "running" synchronously, then carry out the dispatches in a useEffect.
  const [compileState, setCompileState] = useState<CompileResultPanelProps["state"]>({ kind: "idle" });
  const [pendingCompile, setPendingCompile] = useState<{ provider: LlmProvider } | null>(null);

  const neighborhood = useMemo<FocalNeighborhood | { error: string }>(() => {
    try {
      return loadFocalNeighborhood(focalId, cwd);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [focalId, cwd]);

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
      const run = await compileFromWalker({ focalId, provider: pendingCompile.provider, cwd });
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
      setMessage("plane rotation arrives in walker v2");
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
      setMessage("i edit · :propose · :run [ollama] · :plan · :compile [ollama] · :clear{run,plan,compile,draft} · :q");
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
    if (cmd === "cleardraft") {
      const removed = clearDraft(focalId, cwd);
      setDraftTick(t => t + 1);
      setMessage(removed ? `draft cleared for ${focalId}` : `no draft to clear for ${focalId}`);
      return;
    }
    // :run [provider]. Default provider is mock (safe + offline). Accepts
    // ollama for live local model dispatch. Other providers are rejected.
    if (cmd === "run" || cmd.startsWith("run ")) {
      if ("error" in neighborhood) {
        setMessage("cannot run: focal node failed to load");
        return;
      }
      const parts = cmd.split(/\s+/);
      const providerArg = parts[1] ?? "mock";
      if (providerArg !== "mock" && providerArg !== "ollama") {
        setMessage(`unsupported provider: ${providerArg} (try mock or ollama)`);
        return;
      }
      // Show "running ..." synchronously, then schedule the actual dispatch
      // via a useEffect on pendingRun so the walker re-renders before the
      // (potentially slow) network call.
      setRunState({ kind: "running", provider: providerArg });
      setPendingRun({ provider: providerArg });
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
    // :compile [provider] — run the topological plan and write artifacts.
    // Synchronously renders "running"; the dispatch chain lands in a
    // useEffect on pendingCompile.
    if (cmd === "compile" || cmd.startsWith("compile ")) {
      if ("error" in neighborhood) {
        setMessage("cannot compile: focal node failed to load");
        return;
      }
      const parts = cmd.split(/\s+/);
      const providerArg = parts[1] ?? "mock";
      if (providerArg !== "mock" && providerArg !== "ollama") {
        setMessage(`unsupported provider: ${providerArg} (try mock or ollama)`);
        return;
      }
      setCompileState({ kind: "running", provider: providerArg });
      setPendingCompile({ provider: providerArg });
      return;
    }
    if (cmd === "clearcompile") {
      setCompileState({ kind: "idle" });
      setMessage("compile result dismissed");
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
      <IdentityBar node={neighborhood.focal} hasDraft={hasDraft} />
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
      <RunResultPanel state={runState} />
      <CompilePlanPanel state={planState} />
      <CompileResultPanel state={compileState} />
      <HintBar mode={mode === "edit" ? "view" : mode} command={command} message={message} />
    </Box>
  );
}
