import React from "react";
import { Box, Text } from "ink";
import type { SharedTokenInfo } from "../state/shared-tokens.js";

export interface RequiresProvidesSectionProps {
  requires: SharedTokenInfo[];
  provides: SharedTokenInfo[];
}

// Two-column block under the focal cell. Tokens that overlap with the local
// neighborhood are underlined and tagged "shared:N" — the visual proof of the
// presheaf gluing condition.
export function RequiresProvidesSection({ requires, provides }: RequiresProvidesSectionProps): React.ReactElement | null {
  if (requires.length === 0 && provides.length === 0) return null;
  const rows = Math.max(requires.length, provides.length);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Box width={36}>
          <Text bold>Requires</Text>
        </Box>
        <Text bold>Provides</Text>
      </Box>
      {Array.from({ length: rows }).map((_, i) => {
        const r = requires[i];
        const p = provides[i];
        return (
          <Box key={i}>
            <Box width={36}>
              {r ? <TokenCell info={r} /> : <Text> </Text>}
            </Box>
            {p ? <TokenCell info={p} /> : null}
          </Box>
        );
      })}
    </Box>
  );
}

function TokenCell({ info }: { info: SharedTokenInfo }): React.ReactElement {
  const isShared = info.sharedWith.length > 0;
  return (
    <Box>
      <Text underline={isShared}>{info.token}</Text>
      {isShared && <Text dimColor>{`  shared:${info.sharedWith.length}`}</Text>}
    </Box>
  );
}
