// Public surface for the branch fibration module.
//
// See docs/design/laws/BRANCH_FIBRATION.md for the mathematical model and motivation.
// The module is intentionally read-only and additive: it does not mutate
// graph state and does not introduce any new persisted artefacts.

export type {
  FiberInput,
  BranchFiber,
  BranchProjection,
  CartesianLift,
  FiberByLabel,
} from "./types.js";

export {
  listBranches,
  computeBranchFiber,
  computeBranchFiberFromArrays,
  computeAllFibers,
  describeCartesianLift,
  computeFiberBy,
  pathProjection,
} from "./branch-fiber.js";
