import { runWalker } from "../walker/index.js";
import { loadNodeById } from "../kernel/core/project/load.js";

export interface WalkOptions {
  cwd?: string;
}

// CLI entry for the walker. Validates the focal node exists before mounting the
// TUI so that errors fail fast in the parent shell instead of inside the render loop.
export async function walkCommand(nodeId: string, _options: WalkOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const node = loadNodeById(nodeId, cwd);
  if (!node) {
    console.error(`✖ Node not found: ${nodeId}`);
    process.exit(1);
  }

  // The walker requires an interactive TTY for keyboard input. If stdin is not a TTY
  // (piped, in CI without a fake terminal) we refuse rather than hang waiting for keys.
  if (!process.stdin.isTTY) {
    console.error("✖ The walker requires an interactive terminal (TTY). Detected non-interactive stdin.");
    process.exit(1);
  }

  await runWalker({ nodeId, cwd });
}
