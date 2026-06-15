import React from "react";
import { render } from "ink";
import { App } from "./app.js";

export interface RunWalkerOptions {
  nodeId: string;
  cwd?: string;
}

// Mounts the walker on the current TTY. Returns a promise that resolves when the user exits.
export async function runWalker(options: RunWalkerOptions): Promise<void> {
  const { waitUntilExit } = render(<App initialNodeId={options.nodeId} cwd={options.cwd} />);
  await waitUntilExit();
}
