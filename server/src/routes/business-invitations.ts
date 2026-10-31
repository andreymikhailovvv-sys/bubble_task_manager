import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { isGuestAccount } from '../lib/guest-account.js';
import { invitationTokenHash, validInvitationToken } from '../lib/work-company-roles.js';

export const workInvitationRouter = Router();
workInvitationRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'private, no-store'); next(); });

// Unlike /api/auth/me, this endpoint never silently creates a guest identity.
workInvitationRouter.get('/session', asyncHandler(async (req, res) => {
  if (!req.user?.id) { res.json({ registered: false }); return; }
  const user = await prisma.user.findUnique({ where: { id: req.user.id },
    select: { id: true, deviceId: true, username: true, passwordHash: true, googleSub: true, email: true, telegramChatId: true } });
  res.json({ registered: Boolean(user && !isGuestAccount(user)) });
}));

workInvitationRouter.get('/:token', asyncHandler(async (req, res) => {
  if (!validInvitationToken(req.params.token)) { res.status(404).json({ error: 'Приглашение недействительно' }); return; }
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: invitationTokenHash(req.params.token) },
    select: { role: true, expiresAt: true, usedAt: true, revokedAt: true,
      organization: { select: { name: true } } }
  });
  if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    res.status(404).json({ error: 'Приглашение недействительно или истекло' }); return;
  }
  res.json({ invitation: { name: invitation.organization.name, role: invitation.role, expiresAt: invitation.expiresAt } });
}));

workInvitationRouter.post('/:token/accept', requireAuth, asyncHandler(async (req, res) => {
  if (!req.is('application/json')) { res.status(415).json({ error: 'Нужен Content-Type: application/json' }); return; }
  if (!validInvitationToken(req.params.token)) { res.status(404).json({ error: 'Приглашение недействительно' }); return; }
  const actor = await prisma.user.findUnique({ where: { id: req.user!.id },
    select: { id: true, deviceId: true, username: true, passwordHash: true, googleSub: true, email: true, telegramChatId: true } });
  if (!actor || isGuestAccount(actor)) {
    res.status(403).json({ error: 'Для вступления нужен зарегистрированный аккаунт' }); return;
  }
  const tokenHash = invitationTokenHash(req.params.token);
  try {
    const result = await prisma.$transaction(async tx => {
      const invitation = await tx.organizationInvitation.findUnique({
        where: { tokenHash },
        select: { id: true, role: true, organizationId: true, expiresAt: true, usedAt: true, revokedAt: true }
      });
      if (!invitation || invitation.usedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) return { status: 'invalid' as const };
      const member = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: actor.id } }, select: { id: true }
      });
      if (member) return { status: 'already' as const, organizationId: invitation.organizationId };
      const updated = await tx.organizationInvitation.updateMany({
        where: { id: invitation.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() }
      });
      if (updated.count !== 1) return { status: 'invalid' as const };
      await tx.organizationMember.create({
        data: { organizationId: invitation.organizationId, userId: actor.id, role: invitation.role }
      });
      return { status: 'joined' as const, organizationId: invitation.organizationId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (result.status === 'invalid') { res.status(404).json({ error: 'Приглашение уже использовано или истекло' }); return; }
    if (result.status === 'already') { res.status(409).json({ error: 'Вы уже состоите в компании' }); return; }
    res.status(201).json({ organizationId: result.organizationId });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      res.status(409).json({ error: 'Приглашение уже использовано или запрошено одновременно. Обновите страницу' });
      return;
    }
    throw error;
  }
}));
