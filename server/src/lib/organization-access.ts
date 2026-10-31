/**
 * Tenant access must be scoped to an authenticated User.id, never to a client
 * selected organizationId alone. Reuse this filter for every organization
 * lookup and future company-owned project/task query.
 */
export const organizationMemberWhere = (userId: string) => ({
  members: { some: { userId } }
});

export function normalizeOrganizationName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length >= 2 && name.length <= 100 ? name : null;
}
