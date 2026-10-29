/**
 * Whether a signed-in user is the single allowed owner.
 *
 * @param userId - The authenticated user's id, if any.
 * @param ownerId - `OWNER_USER_ID` from the environment.
 */
export function isOwnerId(userId: string | undefined, ownerId: string): boolean {
  return !!userId && userId === ownerId;
}
