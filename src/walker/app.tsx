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

export interface AppProps {
  initialNodeId: string;
  cwd?: string;
}

// The walker root component. Owns the focal node id, the current mode, and the
// transient message channel for boundary hints. Re-renders on every keypress.
//
// Read-only in v0: no edits, no proposals, no runs. Pure exploration.
export function App({ initialNodeId, cwd }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [focalId, setFocalId] = useState(initialNodeId);
  const [mode, setMode] = useState<"view" | "command">("view");
  const [command, setCommand] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const neighborhood = useMemo<FocalNeighborhood | { error: string }>(() => {
    try {
      return loadFocalNeighborhood(focalId, cwd);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [focalId, cwd]);

  // Transient messages clear after a brief delay so the UI does not pile up state.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 1500);
    return () => clearTimeout(t);
  }, [message]);

  useInput((input, key) => {
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
        if (cmd === "q" || cmd === "quit") {
          exit();
          return;
        }
        if (cmd === "help") {
          setMessage("v0: arrows navigate the poset, q quits. v1 adds edit/run/propose.");
          return;
        }
        setMessage(`unknown command: :${cmd}`);
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
      // Only escape hatches when the focal node failed to load.
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
    if (key.tab) {
      setMessage("plane rotation arrives in walker v1");
      return;
    }
    if (input === "T") {
      setMessage("time scrub arrives in walker v1");
      return;
    }
    if (input === "B") {
      setMessage("branch hop arrives in walker v1");
      return;
    }
    if (input === "M") {
      setMessage("manifestation rotation arrives in walker v1");
      return;
    }
    if (input === "g") {
      setMessage("shared-token jump arrives in walker v1");
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
      <IdentityBar node={neighborhood.focal} />
      <PromptSection node={neighborhood.focal} />
      <ConstraintsSection node={neighborhood.focal} />
      <RequiresProvidesSection requires={requiresShared} provides={providesShared} />
      <EdgesSection
        edgesOut={neighborhood.edgesOut}
        edgesIn={neighborhood.edgesIn}
        edgeNeighbors={neighborhood.edgeNeighbors}
      />
      <PathSection pathToCanon={neighborhood.pathToCanon} />
      <HintBar mode={mode} command={command} message={message} />
    </Box>
  );
}
