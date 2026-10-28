export function isOwnerId(userId: string | undefined, ownerId: string): boolean {
  return !!userId && userId === ownerId;
}
