import React from "react";
import { Box, Text } from "ink";
import { colorsEnabled } from "../theme/colors.js";

// AI provider status bar for the walker. Shows the user at a glance
// which LLM service is configured and how it will be reached when
// commands like :run / :compile / :link-analysis dispatch without an
// explicit --provider override.
//
// Detection is env-only (no network probe — would block render). The
// indicator answers "what's set up?", not "what's reachable right
// now". For the latter, `onto model doctor` runs real health checks.
//
// Priority: anthropic > ollama-cloud > ollama-local > none. The
// highest-priority configured provider is what the registry's
// default would route to in most setups; if the user wants to use
// a different one for a single command, they pass --provider on the
// :run / :compile action.

export type AiProvider =
  | { kind: "anthropic" }
  | { kind: "ollama-local"; host: string }
  | { kind: "ollama-cloud"; host: string }
  | { kind: "none" };

// Decides what to show. Exported for testing.
export function detectAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  if (typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY.length > 0) {
    return { kind: "anthropic" };
  }
  const ollamaHost = env.OLLAMA_HOST;
  if (typeof ollamaHost === "string" && ollamaHost.length > 0) {
    const isLocal = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/.test(
      ollamaHost,
    );
    return isLocal
      ? { kind: "ollama-local", host: ollamaHost }
      : { kind: "ollama-cloud", host: ollamaHost };
  }
  return { kind: "none" };
}

export interface AiStatusBarProps {
  provider?: AiProvider; // injected for tests; defaults to env detection
}

export function AiStatusBar({ provider }: AiStatusBarProps): React.ReactElement {
  const p = provider ?? detectAiProvider();
  const showColors = colorsEnabled();

  let label: string;
  let color: string | undefined;
  let trailing: string | undefined;
  switch (p.kind) {
    case "anthropic":
      label = "anthropic";
      color = showColors ? "green" : undefined;
      break;
    case "ollama-local":
      label = "ollama (local)";
      color = showColors ? "cyan" : undefined;
      trailing = p.host;
      break;
    case "ollama-cloud":
      label = "ollama (cloud)";
      color = showColors ? "yellow" : undefined;
      trailing = p.host;
      break;
    case "none":
      label = "none — mock fallback";
      color = showColors ? "red" : undefined;
      break;
  }

  return (
    <Box>
      <Text dimColor>AI:  </Text>
      <Text color={color} bold>
        {label}
      </Text>
      {trailing !== undefined && (
        <>
          <Text dimColor>  ({trailing})</Text>
        </>
      )}
    </Box>
  );
}
