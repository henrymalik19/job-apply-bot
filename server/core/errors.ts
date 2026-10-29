/** A database call failed; the message names the operation and Postgres' reason. */
export class RepositoryError extends Error {
  constructor(
    operation: string,
    message: string,
    /** Postgres/PostgREST error code, e.g. `23505` for a unique violation. */
    readonly code?: string,
  ) {
    super(`${operation}: ${message}`);
  }

  /** True when the failure was a unique-constraint violation. */
  get isDuplicate(): boolean {
    return this.code === "23505";
  }
}

type Result<T> = { data: T; error: { message: string; code?: string } | null };

/**
 * Returns a query's data or throws {@link RepositoryError}. Use for queries
 * that must return something (`.single()`, selects, RPCs with results).
 *
 * @param res - A Supabase query result.
 * @param operation - Short name for error messages, e.g. "list companies".
 */
export function unwrap<T>(res: Result<T>, operation: string): NonNullable<T> {
  if (res.error) throw new RepositoryError(operation, res.error.message, res.error.code);
  if (res.data == null) throw new RepositoryError(operation, "no data returned");
  return res.data as NonNullable<T>;
}

/**
 * Throws {@link RepositoryError} when a write failed. Use for updates and
 * deletes that return no rows.
 */
export function check(res: { error: { message: string; code?: string } | null }, operation: string): void {
  if (res.error) throw new RepositoryError(operation, res.error.message, res.error.code);
}

/**
 * Input the owner can fix (bad token, duplicate board, …). The message is
 * written for the UI and is safe to show as-is.
 */
export class ValidationError extends Error {}
