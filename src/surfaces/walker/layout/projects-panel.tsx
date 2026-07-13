import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { WalkerProjectRow } from "../actions/projects-from-walker.js";

export interface ProjectsPanelState {
  open: boolean;
  rows: WalkerProjectRow[];
  cursor: number;
  mode: "list" | "create";
  createName: string;
  loading?: boolean;
  message?: string;
}

export interface ProjectsPanelProps {
  state: ProjectsPanelState;
  onCreateNameChange: (value: string) => void;
  onCreateSubmit: (value: string) => void;
}

export function emptyProjectsPanelState(): ProjectsPanelState {
  return {
    open: false,
    rows: [],
    cursor: 0,
    mode: "list",
    createName: "",
  };
}

export function ProjectsPanel({
  state,
  onCreateNameChange,
  onCreateSubmit,
}: ProjectsPanelProps): React.ReactElement | null {
  if (!state.open) return null;
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">PROJECTS</Text>
      {state.mode === "list" ? renderList(state) : renderCreate(state, onCreateNameChange, onCreateSubmit)}
      {state.message && (
        <Box marginTop={1}>
          <Text color={state.message.startsWith("✖") ? "red" : "yellow"}>{state.message}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          {state.mode === "list"
            ? "↑/↓ or j/k navigate · enter open · n new · R reload · esc close"
            : "enter create · esc cancel"}
        </Text>
      </Box>
    </Box>
  );
}

function renderList(state: ProjectsPanelState): React.ReactElement {
  if (state.loading) {
    return <Text dimColor>loading projects…</Text>;
  }
  if (state.rows.length === 0) {
    return <Text dimColor>No projects registered yet. Press n to create one.</Text>;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {state.rows.map((row, i) => {
        const selected = i === state.cursor;
        const prefix = selected ? "▶ " : "  ";
        if (row.kind === "create") {
          return (
            <Text key="create" color={selected ? "green" : undefined}>
              {prefix}+ Create new Ontology project
            </Text>
          );
        }

        const color = !row.live ? "gray" : row.current ? "green" : selected ? "cyan" : undefined;
        const tag = row.current ? "  current" : !row.live ? "  stale" : "";
        return (
          <Box key={row.entry.path} flexDirection="column">
            <Text color={color}>
              {prefix}{row.entry.name}{tag}
            </Text>
            <Text dimColor>    {row.entry.path}</Text>
            <Text dimColor>    last opened {row.entry.lastOpenedAt}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function renderCreate(
  state: ProjectsPanelState,
  onCreateNameChange: (value: string) => void,
  onCreateSubmit: (value: string) => void,
): React.ReactElement {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Create a new `.ontology/` project as a folder under the launch directory.</Text>
      <Box marginTop={1}>
        <Text>name: </Text>
        <TextInput
          value={state.createName}
          onChange={onCreateNameChange}
          onSubmit={onCreateSubmit}
        />
      </Box>
    </Box>
  );
}
