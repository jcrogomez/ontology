import * as fs from "node:fs";
import * as path from "node:path";
import React, { useState } from "react";
import { render, Box, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  loadProjectRegistry,
  projectsByRecency,
  partitionByLiveness,
  registerProject,
  touchProject,
  type ProjectRegistryEntry,
} from "../../kernel/core/projects/registry.js";
import { runWalker } from "../walker/index.js";
import { initCommand } from "./init.js";
import { loadState } from "../../kernel/core/project/load.js";

export interface OpenOptions {
  // Bypass the picker and open a specific project path directly. Useful for
  // scripts and for the `onto open <path>` shorthand.
  path?: string;
}

// Picker entry: a project the user can select. The "create" sentinel is a
// virtual entry rendered last in the list.
type PickerItem =
  | { kind: "project"; entry: ProjectRegistryEntry; live: boolean }
  | { kind: "create" };

interface PickerProps {
  items: PickerItem[];
  onSelect: (item: PickerItem) => void;
  onQuit: () => void;
}

function Picker({ items, onSelect, onQuit }: PickerProps): React.ReactElement {
  const [cursor, setCursor] = useState(0);
  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow || input === "j") {
      setCursor((c) => Math.min(items.length - 1, c + 1));
    } else if (key.return) {
      onSelect(items[cursor]!);
    } else if (input === "q" || key.escape) {
      onQuit();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold>=== ONTOLOGY OPEN ===</Text>
      <Text> </Text>
      <Text dimColor>↑/↓ navigate · enter open · q quit</Text>
      <Text> </Text>
      {items.map((item, i) => {
        const selected = i === cursor;
        const prefix = selected ? "▶ " : "  ";
        if (item.kind === "create") {
          return (
            <Text key="create" color={selected ? "green" : undefined}>
              {prefix}+ Create new project here…
            </Text>
          );
        }
        const e = item.entry;
        const color = !item.live ? "gray" : selected ? "cyan" : undefined;
        const tag = !item.live ? " (stale)" : "";
        return (
          <Box key={e.path} flexDirection="column">
            <Text color={color}>
              {prefix}
              {e.name}
              {tag}
            </Text>
            <Text dimColor>      {e.path}</Text>
            <Text dimColor>      last opened {e.lastOpenedAt}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

interface CreateFormProps {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

function CreateForm({ onSubmit, onCancel }: CreateFormProps): React.ReactElement {
  const [name, setName] = useState("");
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });
  return (
    <Box flexDirection="column">
      <Text bold>=== CREATE NEW PROJECT ===</Text>
      <Text> </Text>
      <Text dimColor>Name (will become a subdirectory of the current working directory)</Text>
      <Text dimColor>Press enter to confirm · esc to cancel</Text>
      <Text> </Text>
      <Box>
        <Text>name: </Text>
        <TextInput
          value={name}
          onChange={setName}
          onSubmit={(v) => {
            const trimmed = v.trim();
            if (trimmed.length > 0) onSubmit(trimmed);
          }}
        />
      </Box>
    </Box>
  );
}

type Selection =
  | { action: "open"; path: string; rootNodeId: string }
  | { action: "create"; name: string }
  | { action: "quit" };

interface AppProps {
  items: PickerItem[];
  onResolve: (sel: Selection) => void;
}

function PickerApp({ items, onResolve }: AppProps): React.ReactElement {
  const [mode, setMode] = useState<"picker" | "create">("picker");
  const { exit } = useApp();

  if (mode === "picker") {
    return (
      <Picker
        items={items}
        onSelect={(item) => {
          if (item.kind === "create") {
            setMode("create");
            return;
          }
          if (!item.live) {
            // Stale entries cannot be opened — bounce back so the user can
            // forget them via `onto projects forget` and pick a live one.
            return;
          }
          onResolve({
            action: "open",
            path: item.entry.path,
            rootNodeId: item.entry.rootNodeId ?? "node_0000_canon",
          });
          exit();
        }}
        onQuit={() => {
          onResolve({ action: "quit" });
          exit();
        }}
      />
    );
  }

  return (
    <CreateForm
      onSubmit={(name) => {
        onResolve({ action: "create", name });
        exit();
      }}
      onCancel={() => setMode("picker")}
    />
  );
}

function pickInteractively(items: PickerItem[]): Promise<Selection> {
  return new Promise((resolve) => {
    let resolved = false;
    const handle = (sel: Selection) => {
      if (resolved) return;
      resolved = true;
      resolve(sel);
    };
    const { waitUntilExit } = render(<PickerApp items={items} onResolve={handle} />);
    void waitUntilExit().then(() => {
      // Defense in depth: if the app exits without firing onResolve (e.g.
      // SIGINT during render) we still resolve so the parent does not hang.
      if (!resolved) resolve({ action: "quit" });
    });
  });
}

export async function openCommand(options: OpenOptions = {}): Promise<void> {
  // Direct-open shortcut: `onto open /path/to/project`. No TUI, no picker —
  // just resolve the path, sanity-check `.ontology/`, register/touch, and
  // mount the walker.
  if (options.path) {
    await openByPath(options.path);
    return;
  }

  if (!process.stdin.isTTY) {
    console.error("✖ `onto open` requires an interactive terminal (TTY). For non-interactive use, pass --path.");
    process.exit(1);
  }

  const registry = loadProjectRegistry();
  const sorted = projectsByRecency(registry);
  const { live, stale } = partitionByLiveness({ ...registry, projects: sorted });

  const items: PickerItem[] = [
    ...live.map((entry) => ({ kind: "project" as const, entry, live: true })),
    ...stale.map((entry) => ({ kind: "project" as const, entry, live: false })),
    { kind: "create" as const },
  ];

  const selection = await pickInteractively(items);

  if (selection.action === "quit") {
    return;
  }

  if (selection.action === "open") {
    await openByPath(selection.path);
    return;
  }

  // create new
  const baseDir = process.cwd();
  const projectPath = path.join(baseDir, selection.name);
  if (fs.existsSync(projectPath)) {
    console.error(`✖ Path already exists: ${projectPath}`);
    process.exit(1);
  }
  fs.mkdirSync(projectPath, { recursive: true });
  const previousCwd = process.cwd();
  try {
    process.chdir(projectPath);
    await initCommand({ name: selection.name });
  } finally {
    // initCommand registers the project; chdir back so the rest of the
    // open flow runs from a known place.
    process.chdir(previousCwd);
  }
  await openByPath(projectPath);
}

async function openByPath(targetPath: string): Promise<void> {
  const absPath = path.resolve(targetPath);
  const ontologyDir = path.join(absPath, ".ontology");
  if (!fs.existsSync(ontologyDir)) {
    console.error(`✖ No .ontology/ found at: ${absPath}`);
    console.error(`  Run \`onto init\` from inside that directory to create one.`);
    process.exit(1);
  }

  // Re-register on open so a project init'd with an older version (no
  // registry entry) shows up next time, and bump lastOpenedAt either way.
  let rootNodeId: string;
  try {
    const state = loadState(absPath);
    rootNodeId = state.rootNodeId;
    registerProject({
      name: path.basename(absPath),
      path: absPath,
      rootNodeId,
    });
  } catch (err: unknown) {
    console.error(`✖ Could not read state.json at ${absPath}/.ontology/state.json`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  touchProject(absPath);

  if (!process.stdin.isTTY) {
    console.error("✖ Walker requires an interactive terminal (TTY).");
    process.exit(1);
  }

  await runWalker({ nodeId: rootNodeId, cwd: absPath });
}
