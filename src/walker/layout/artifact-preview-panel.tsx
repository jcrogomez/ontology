import React from "react";
import { Box, Text } from "ink";
import type { ArtifactPreview, ShadowReport } from "../state/shadow-status.js";

export interface ArtifactPreviewPanelProps {
  open: boolean;
  preview: ArtifactPreview | null;
  shadow: ShadowReport | null;
}

// Read-only preview of the focal node's compiled shadow (outputs.files[0]),
// with its drift status against the last `onto drift --update` anchor in the
// header. This is the editing-loop window: the operator edits INTENT and
// keeps the artifact in sight; when the shadow reads "drifted" they decide
// when to :compile. The panel never edits the file.

function shadowBadge(shadow: ShadowReport | null): { text: string; color?: string } {
  switch (shadow?.status) {
    case "clean":
      return { text: "shadow ✓ matches anchor", color: "green" };
    case "drifted":
      return { text: "shadow ≠ DRIFTED from anchor", color: "yellow" };
    case "missing":
      return { text: "shadow ? file missing", color: "red" };
    case "no_anchor":
      return { text: "shadow (no anchor — onto drift --update)", color: undefined };
    default:
      return { text: "", color: undefined };
  }
}

export function ArtifactPreviewPanel({
  open,
  preview,
  shadow,
}: ArtifactPreviewPanelProps): React.ReactElement | null {
  if (!open) return null;

  if (!preview || preview.file === null) {
    return (
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>ARTIFACT</Text>
        <Text dimColor>
          focal has no compiled shadow (outputs.files is empty) — :compile creates one
        </Text>
      </Box>
    );
  }

  const badge = shadowBadge(shadow);
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="gray" paddingX={1}>
      <Box>
        <Text bold>ARTIFACT — </Text>
        <Text>{preview.file}</Text>
        {badge.text.length > 0 && (
          <>
            <Text>  </Text>
            <Text color={badge.color} dimColor={badge.color === undefined}>
              [{badge.text}]
            </Text>
          </>
        )}
      </Box>
      {preview.error ? (
        <Text color="red">✖ {preview.error}</Text>
      ) : (
        <>
          {preview.lines.map((line, i) => (
            <Text key={i} dimColor wrap="truncate-end">
              {line.length > 0 ? line : " "}
            </Text>
          ))}
          {preview.truncated && (
            <Text dimColor>… (+{preview.totalLines - preview.lines.length} lines)</Text>
          )}
        </>
      )}
      <Text dimColor>a / :preview toggles · :which &lt;file&gt; jumps to a file's owning node</Text>
    </Box>
  );
}
