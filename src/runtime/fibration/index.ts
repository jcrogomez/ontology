// Public surface for the branch fibration module.
//
// See docs/BRANCH_FIBRATION.md for the mathematical model and motivation.
// The module is intentionally read-only and additive: it does not mutate
// graph state and does not introduce any new persisted artefacts.

export type {
  FiberInput,
  BranchFiber,
  BranchProjection,
  CartesianLift,
} from "./types.js";

export {
  listBranches,
  computeBranchFiber,
  computeBranchFiberFromArrays,
  computeAllFibers,
  describeCartesianLift,
} from "./branch-fiber.js";
