import crypto from 'node:crypto';
import type { OrganizationRole } from '@prisma/client';

export type WorkRole = OrganizationRole;
export const WORK_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as const;
export const INVITABLE_ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'] as const;
export const canManageOrganization = (role: WorkRole) => role === 'OWNER' || role === 'ADMIN';
export const isWorkRole = (value: unknown): value is WorkRole =>
  typeof value === 'string' && (WORK_ROLES as readonly string[]).includes(value);
export const isInvitableRole = (value: unknown): value is Exclude<WorkRole, 'OWNER'> =>
  typeof value === 'string' && (INVITABLE_ROLES as readonly string[]).includes(value);
/** Only an OWNER may assign/alter OWNER or ADMIN membership. */
export function canAssignRole(actor: WorkRole, current: WorkRole, next: WorkRole): boolean {
  if (!canManageOrganization(actor)) return false;
  if (actor === 'OWNER') return true;
  return current !== 'OWNER' && current !== 'ADMIN' && next !== 'OWNER' && next !== 'ADMIN';
}
export function normalizeDepartmentName(value: unknown): string | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}
export function createInvitationToken(): string { return crypto.randomBytes(32).toString('hex'); }
export function invitationTokenHash(token: string): string { return crypto.createHash('sha256').update(token).digest('hex'); }
export function validInvitationToken(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
