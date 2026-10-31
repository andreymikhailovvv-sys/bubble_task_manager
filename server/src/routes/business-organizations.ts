import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { isBusinessAdmin } from '../lib/business-admin-access.js';
import { isGuestAccount } from '../lib/guest-account.js';
import { normalizeOrganizationName, organizationMemberWhere } from '../lib/organization-access.js';

/**
 * First B2B slice. Only explicitly allowlisted Work administrators can create
 * organizations; reading is scoped to *current* DB membership. No endpoint
 * here can manage other members, remove an owner or touch personal tasks.
 */
export const businessOrganizationsRouter = Router();
businessOrganizationsRouter.use(requireAuth);
businessOrganizationsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

businessOrganizationsRouter.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.organizationMember.findMany({
    where: { userId: req.user!.id },
    select: {
      role: true,
      organization: { select: { id: true, name: true, createdAt: true, updatedAt: true } }
    },
    orderBy: { createdAt: 'asc' }
  });
  res.json({ organizations: rows.map(row => ({ ...row.organization, role: row.role })) });
}));

businessOrganizationsRouter.post('/', asyncHandler(async (req, res) => {
  const actorId = req.user!.id;
  const admins = process.env.BUSINESS_ADMIN_USER_IDS?.trim();
  if (!admins) {
    res.status(503).json({ error: 'Корпоративная платформа пока закрыта' });
    return;
  }
  if (!isBusinessAdmin(actorId, admins)) {
    res.status(403).json({ error: 'Создание организаций пока доступно только администратору Work' });
    return;
  }
  const name = normalizeOrganizationName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: 'Название организации должно содержать от 2 до 100 символов, без управляющих символов' });
    return;
  }
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, deviceId: true, username: true, passwordHash: true, googleSub: true, email: true, telegramChatId: true }
  });
  if (!actor || isGuestAccount(actor)) {
    res.status(403).json({ error: 'Требуется зарегистрированный аккаунт Планировыча' });
    return;
  }

  // Atomic creation: no company can exist without its founding OWNER member.
  const organization = await prisma.organization.create({
    data: { name, members: { create: { userId: actorId, role: 'OWNER' } } },
    select: { id: true, name: true, createdAt: true, updatedAt: true }
  });
  res.status(201).json({ organization: { ...organization, role: 'OWNER' } });
}));

businessOrganizationsRouter.get('/:organizationId', asyncHandler(async (req, res) => {
  if (!req.params.organizationId || req.params.organizationId.length > 128) {
    res.status(404).json({ error: 'Организация не найдена' });
    return;
  }
  // A non-member gets an identical 404 to a nonexistent organization.
  const organization = await prisma.organization.findFirst({
    where: { id: req.params.organizationId, ...organizationMemberWhere(req.user!.id) },
    select: {
      id: true, name: true, createdAt: true, updatedAt: true,
      members: { where: { userId: req.user!.id }, select: { role: true } }
    }
  });
  if (!organization) {
    res.status(404).json({ error: 'Организация не найдена' });
    return;
  }
  const { members, ...fields } = organization;
  res.json({ organization: { ...fields, role: members[0]?.role } });
}));
