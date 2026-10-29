// Public API of the applications module. Status only ever changes through
// transition(); the database enforces the allowed moves.
export {
  countByStatus,
  IllegalTransitionError,
  transition,
  type Application,
} from "./applications.repository";
export * from "./application-status";
