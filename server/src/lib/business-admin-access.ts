/** Explicit immutable user-ID allowlist for the initial Work shell. */
export function isBusinessAdmin(userId: string | undefined, configuredIds: string | undefined): boolean {
  return Boolean(userId && configuredIds?.split(',').some(id => id.trim() === userId));
}
