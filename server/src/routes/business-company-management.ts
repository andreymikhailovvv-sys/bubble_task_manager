import { Router, type Request, type Response, type NextFunction } from 'express';
import { Prisma, type OrganizationRole } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { normalizeOrganizationName } from '../lib/organization-access.js';
import {
  canAssignRole, canManageOrganization, isWorkRole, isInvitableRole,
  normalizeDepartmentName, createInvitationToken, invitationTokenHash,
  INVITATION_LIFETIME_MS
} from '../lib/work-company-roles.js';

export const workCompanyRouter = Router();
workCompanyRouter.use(requireAuth, (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

type Actor = { userId: string; role: OrganizationRole };
async function actorFor(req: Request, res: Response): Promise<Actor | null> {
  const organizationId = req.params.organizationId;
  if (!organizationId || organizationId.length > 128) {
    res.status(404).json({ error: 'Организация не найдена' });
    return null;
  }
  const member = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: req.user!.id } },
    select: { userId: true, role: true }
  });
  if (!member) res.status(404).json({ error: 'Организация не найдена' });
  return member;
}
async function managerFor(req: Request, res: Response): Promise<Actor | null> {
  const actor = await actorFor(req, res);
  if (!actor) return null;
  if (!canManageOrganization(actor.role)) {
    res.status(403).json({ error: 'Для этого действия нужны права владельца или администратора' });
    return null;
  }
  return actor;
}
const orgFields = { id: true, name: true, createdAt: true, updatedAt: true } as const;
const dbFailure = (cause: unknown, res: Response): boolean => {
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
    res.status(409).json({ error: 'Такая запись уже существует' });
    return true;
  }
  if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2034') {
    res.status(409).json({ error: 'Данные изменились одновременно. Повторите действие' });
    return true;
  }
  return false;
};
// Mutations of authenticated company data must not be executable as HTML forms.
workCompanyRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.method !== 'DELETE' && !req.is('application/json')) {
    res.status(415).json({ error: 'Нужен Content-Type: application/json' });
    return;
  }
  next();
});

workCompanyRouter.get('/:organizationId/workspace', asyncHandler(async (req, res) => {
  const actor = await actorFor(req, res);
  if (!actor) return;
  const organizationId = req.params.organizationId;
  const [organization, members, departments, invitations] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: orgFields }),
    prisma.organizationMember.findMany({
      where: { organizationId },
      select: { id: true, userId: true, role: true, departmentId: true, createdAt: true,
        user: { select: { name: true, username: true, email: true } } },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.organizationDepartment.findMany({ where: { organizationId }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
    canManageOrganization(actor.role)
      ? prisma.organizationInvitation.findMany({
          where: { organizationId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, role: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' }
        })
      : Promise.resolve([])
  ]);
  if (!organization) { res.status(404).json({ error: 'Организация не найдена' }); return; }
  res.json({ organization: { ...organization, role: actor.role },
    members: members.map(member => ({
      id: member.id, userId: member.userId, role: member.role,
      departmentId: member.departmentId, createdAt: member.createdAt,
      name: member.user.name, username: member.user.username,
      ...(canManageOrganization(actor.role) ? { email: member.user.email } : {})
    })),
    departments, invitations });
}));

workCompanyRouter.patch('/:organizationId', asyncHandler(async (req, res) => {
  const actor = await managerFor(req, res);
  if (!actor) return;
  const name = normalizeOrganizationName(req.body?.name);
  if (!name) { res.status(400).json({ error: 'Название компании должно содержать от 2 до 100 символов' }); return; }
  const updated = await prisma.organization.update({ where: { id: req.params.organizationId }, data: { name }, select: orgFields });
  res.json({ organization: { ...updated, role: actor.role } });
}));

workCompanyRouter.post('/:organizationId/departments', asyncHandler(async (req, res) => {
  if (!await managerFor(req, res)) return;
  const name = normalizeDepartmentName(req.body?.name);
  if (!name) { res.status(400).json({ error: 'Название подразделения: 2–80 символов' }); return; }
  try {
    const department = await prisma.organizationDepartment.create({
      data: { organizationId: req.params.organizationId, name },
      select: { id: true, name: true, createdAt: true }
    });
    res.status(201).json({ department });
  } catch (error) { if (!dbFailure(error, res)) throw error; }
}));
workCompanyRouter.patch('/:organizationId/departments/:departmentId', asyncHandler(async (req, res) => {
  if (!await managerFor(req, res)) return;
  const name = normalizeDepartmentName(req.body?.name);
  if (!name) { res.status(400).json({ error: 'Название подразделения: 2–80 символов' }); return; }
  try {
    const changed = await prisma.organizationDepartment.updateMany({
      where: { id: req.params.departmentId, organizationId: req.params.organizationId }, data: { name }
    });
    if (!changed.count) { res.status(404).json({ error: 'Подразделение не найдено' }); return; }
    res.json({ department: { id: req.params.departmentId, name } });
  } catch (error) { if (!dbFailure(error, res)) throw error; }
}));
workCompanyRouter.delete('/:organizationId/departments/:departmentId', asyncHandler(async (req, res) => {
  if (!await managerFor(req, res)) return;
  const changed = await prisma.organizationDepartment.deleteMany({ where: { id: req.params.departmentId, organizationId: req.params.organizationId } });
  if (!changed.count) { res.status(404).json({ error: 'Подразделение не найдено' }); return; }
  res.json({ ok: true });
}));

workCompanyRouter.patch('/:organizationId/members/:memberId', asyncHandler(async (req, res) => {
  const actor = await managerFor(req, res);
  if (!actor) return;
  const organizationId = req.params.organizationId;
  const changeRole = Object.prototype.hasOwnProperty.call(req.body || {}, 'role');
  const changeDepartment = Object.prototype.hasOwnProperty.call(req.body || {}, 'departmentId');
  if (!changeRole && !changeDepartment) { res.status(400).json({ error: 'Не переданы изменения' }); return; }
  if (changeRole && !isWorkRole(req.body.role)) { res.status(400).json({ error: 'Неизвестная роль' }); return; }
  if (changeDepartment && req.body.departmentId !== null &&
      (typeof req.body.departmentId !== 'string' || req.body.departmentId.length > 128 || !req.body.departmentId)) {
    res.status(400).json({ error: 'Некорректное подразделение' }); return;
  }

  try {
    const member = await prisma.$transaction(async tx => {
      const currentActor = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: req.user!.id } }
      });
      const current = await tx.organizationMember.findFirst({ where: { id: req.params.memberId, organizationId } });
      if (!currentActor || !canManageOrganization(currentActor.role) || !current) return { kind: 'not-found' as const };
      const nextRole = changeRole ? req.body.role as OrganizationRole : current.role;
      if (!canAssignRole(currentActor.role, current.role, nextRole)) return { kind: 'forbidden' as const };
      if (changeDepartment && req.body.departmentId) {
        const department = await tx.organizationDepartment.findFirst({ where: { id: req.body.departmentId, organizationId }, select: { id: true } });
        if (!department) return { kind: 'wrong-department' as const };
      }
      if (current.role === 'OWNER' && nextRole !== 'OWNER') {
        const owners = await tx.organizationMember.count({ where: { organizationId, role: 'OWNER' } });
        if (owners <= 1) return { kind: 'last-owner' as const };
      }
      const updated = await tx.organizationMember.update({
        where: { id: current.id },
        data: { ...(changeRole ? { role: nextRole } : {}), ...(changeDepartment ? { departmentId: req.body.departmentId } : {}) },
        select: { id: true, role: true, departmentId: true }
      });
      return { kind: 'ok' as const, member: updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (member.kind !== 'ok') {
      const statuses = { 'not-found': 404, forbidden: 403, 'wrong-department': 400, 'last-owner': 409 };
      const messages = { 'not-found': 'Участник не найден', forbidden: 'Недостаточно прав для изменения роли', 'wrong-department': 'Подразделение не принадлежит компании', 'last-owner': 'Нельзя снять роль последнего владельца' };
      res.status(statuses[member.kind]).json({ error: messages[member.kind] });
      return;
    }
    res.json({ member: member.member });
  } catch (error) { if (!dbFailure(error, res)) throw error; }
}));

workCompanyRouter.delete('/:organizationId/members/:memberId', asyncHandler(async (req, res) => {
  const actor = await actorFor(req, res);
  if (!actor) return;
  const organizationId = req.params.organizationId;
  try {
    const result = await prisma.$transaction(async tx => {
      const currentActor = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: req.user!.id } } });
      const target = await tx.organizationMember.findFirst({ where: { id: req.params.memberId, organizationId } });
      if (!currentActor || !target) return 'not-found';
      if (currentActor.userId !== target.userId &&
         (!canManageOrganization(currentActor.role) || !canAssignRole(currentActor.role, target.role, target.role))) return 'forbidden';
      if (target.role === 'OWNER') {
        const owners = await tx.organizationMember.count({ where: { organizationId, role: 'OWNER' } });
        if (owners <= 1) return 'last-owner';
      }
      await tx.organizationMember.delete({ where: { id: target.id } });
      return 'ok';
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result !== 'ok') {
      res.status(result === 'not-found' ? 404 : result === 'forbidden' ? 403 : 409).json({
        error: result === 'last-owner' ? 'Последний владелец не может покинуть компанию' : result === 'forbidden' ? 'Недостаточно прав' : 'Участник не найден'
      });
      return;
    }
    res.json({ ok: true });
  } catch (error) { if (!dbFailure(error, res)) throw error; }
}));

workCompanyRouter.post('/:organizationId/invitations', asyncHandler(async (req, res) => {
  const actor = await managerFor(req, res);
  if (!actor) return;
  const role = req.body?.role ?? 'MEMBER';
  if (!isInvitableRole(role) || (role === 'ADMIN' && actor.role !== 'OWNER')) {
    res.status(403).json({ error: 'Недостаточно прав для приглашения на выбранную роль' }); return;
  }
  const organizationId = req.params.organizationId;
  const recent = await prisma.organizationInvitation.count({
    where: { organizationId, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } }
  });
  if (recent >= 15) { res.status(429).json({ error: 'Лимит приглашений: 15 ссылок за час' }); return; }
  const token = createInvitationToken();
  const invitation = await prisma.organizationInvitation.create({
    data: { organizationId, tokenHash: invitationTokenHash(token),
      createdById: req.user!.id, role, expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS) },
    select: { id: true, role: true, expiresAt: true, createdAt: true }
  });
  // The plaintext bearer token is returned only once; only a digest is saved.
  res.status(201).json({ invitation: { ...invitation, url: `https://work.planirovych.ru/join/${token}` } });
}));
workCompanyRouter.delete('/:organizationId/invitations/:invitationId', asyncHandler(async (req, res) => {
  if (!await managerFor(req, res)) return;
  const change = await prisma.organizationInvitation.updateMany({
    where: { id: req.params.invitationId, organizationId: req.params.organizationId, revokedAt: null, usedAt: null },
    data: { revokedAt: new Date() }
  });
  if (!change.count) { res.status(404).json({ error: 'Активное приглашение не найдено' }); return; }
  res.json({ ok: true });
}));
