// Pure navigation transitions for the walker.
// Each function takes the current focal id and a precomputed neighborhood snapshot,
// and returns either the next focal id or null if the move is impossible from here.
//
// "Impossible" is not an error; it is information. The walker will treat null as
// "no-op" and the hint bar can flash to communicate the boundary.

import type { FocalNeighborhood } from "./neighborhood.js";

// Move up the poset: focal -> parent.
export function navigateUp(neighborhood: FocalNeighborhood): string | null {
  return neighborhood.parent ? neighborhood.parent.id : null;
}

// Move down the poset: focal -> first child by deterministic order.
// Children are already sorted by (time, id) by loadNodes.
export function navigateDown(neighborhood: FocalNeighborhood): string | null {
  return neighborhood.children.length > 0 ? neighborhood.children[0].id : null;
}

// Move laterally among siblings (same parent). previous = ←, next = →.
// The siblings array does not include the focal node, so we compose the full sibling
// row with focal in its sorted position to compute prev/next.
export function navigateSiblingPrevious(neighborhood: FocalNeighborhood): string | null {
  return navigateSibling(neighborhood, -1);
}

export function navigateSiblingNext(neighborhood: FocalNeighborhood): string | null {
  return navigateSibling(neighborhood, 1);
}

function navigateSibling(neighborhood: FocalNeighborhood, direction: -1 | 1): string | null {
  const all = [...neighborhood.siblings, neighborhood.focal].sort((a, b) => {
    if (a.coordinates.time !== b.coordinates.time) return a.coordinates.time - b.coordinates.time;
    return a.id.localeCompare(b.id);
  });
  const focalIdx = all.findIndex(n => n.id === neighborhood.focal.id);
  const targetIdx = focalIdx + direction;
  if (targetIdx < 0 || targetIdx >= all.length) return null;
  return all[targetIdx].id;
}
