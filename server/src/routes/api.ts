import { Router } from 'express';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { sphereController } from '../controllers/sphere.controller.js';
import { taskController } from '../controllers/task.controller.js';
import { taskParticipantMessageController } from '../controllers/task-participant-message.controller.js';
import { taskCommentController } from '../controllers/task-comment.controller.js';
import { habitController } from '../controllers/habit.controller.js';
import { taskAttachmentController } from '../controllers/task-attachment.controller.js';
import { insightService } from '../services/insight.service.js';
import { aiController } from '../controllers/ai.controller.js';
import { telegramController } from '../controllers/telegram.controller.js';
import { telegramRelayController } from '../controllers/telegram-relay.controller.js';
import { telegramService } from '../services/telegram.service.js';
import { isGoogleAuthEnabled, passport } from '../auth/passport.js';
import { AUTH_COOKIE_NAME, DEVICE_COOKIE_NAME, authService } from '../auth/auth.service.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../db/prisma.js';
import { onboardingService } from '../services/onboarding.service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { calendarExportController } from '../controllers/calendar-export.controller.js';
import { AccountRegistrationError, PERSONAL_DATA_CONSENT_VERSION, accountRegistrationService, normalizeAccountLogin, validatePersonalDataConsent } from '../services/account-registration.service.js';
import { deductEfficiencyPenalty, EFFICIENCY_BUCKET_ORDER, type EfficiencyBucketKey, type EfficiencyBucketScores } from '../services/efficiency-rating.service.js';
import { creditsToMilli, getAiCreditWallet, grantBonusCreditsMilli, grantBonusCreditsMilliInTransaction } from '../services/ai-credit-wallet.service.js';
import { validateTelegramWebAppInitData } from '../lib/telegram-webapp-auth.js';
import { CREDIT_PACKS, type CreditPackKey } from '../config/credit-packs.js';
import { creditPacksResponse, yookassaPaymentsRouter } from './yookassa-payments.js';
import { buildCreditUsageExcelXml, getCreditUsageStatistics, getMonthlyCreditUsageExport } from '../services/ai-credit-statistics.service.js';

export const apiRouter = Router();
apiRouter.use('/payments/yookassa', yookassaPaymentsRouter);
const ADMIN_PANEL_PASSWORD_ENV = 'ADMIN_PANEL_PASSWORD';
const SUBSCRIPTION_PLAN_KEYS = ['start', 'pro', 'max'] as const;
const ADMIN_SUBSCRIPTION_PLAN_KEYS = ['free', ...SUBSCRIPTION_PLAN_KEYS] as const;
type SubscriptionPlanKey = typeof SUBSCRIPTION_PLAN_KEYS[number];
type AdminSubscriptionPlanKey = typeof ADMIN_SUBSCRIPTION_PLAN_KEYS[number];
const ADMIN_BROADCAST_TARGETS = ['user', 'all', 'paid', 'free'] as const;
const ADMIN_BROADCAST_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const ADMIN_BROADCAST_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const sanitizeLogin = normalizeAccountLogin;
const DEFAULT_TIMEZONE = 'Europe/Moscow';
const CHECKUP_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const normalizeTimeZone = (candidate: string): string | null => {
  const normalized = candidate.trim();
  if (!normalized) return null;
  try {
    Intl.DateTimeFormat('ru-RU', { timeZone: normalized }).format(new Date());
    return normalized;
  } catch {
    return null;
  }
};
const EFFICIENCY_RESET_AT_ISO = '1970-01-01T00:00:00.000Z';
const EFFICIENCY_INACTIVITY_GRACE_HOURS = 3;
const EFFICIENCY_NIGHT_START_HOUR = 0;
const EFFICIENCY_NIGHT_END_HOUR = 8;
const EFFICIENCY_DAY_BUCKET_PENALTY = 1;
const EFFICIENCY_NIGHT_BUCKET_PENALTY = 0.5;
const EFFICIENCY_BUCKET_KEYS = EFFICIENCY_BUCKET_ORDER;
const EFFICIENCY_BONUSES = {
  doneTask: 4,
  doneSubtask: 1.5,
  doneHabit: 3,
  createdHabit: 3.35,
  completedHabit: 20.1,
  createdTask: 1
} as const;
const TRAINING_LESSON_IDS = ['workspace', 'tasks', 'ai', 'features'] as const;
const TRAINING_LESSON_REWARD = 5;

const toAuthUser = (user: {
  id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  googleSub?: string | null;
  deviceId?: string | null;
  aiCredits?: number;
  aiCreditsPeriod?: string;
  aiIncludedCreditsMilli?: number;
  aiBonusCreditsMilli?: number;
  aiPurchasedCreditsMilli?: number;
  aiEfficiencyCreditsSpent?: number;
  aiEfficiencyCreditsPeriod?: string;
  timeZone?: string | null;
  morningAiCheckupEnabled?: boolean;
  morningAiCheckupTime?: string;
  efficiencyResetAt?: string;
  efficiencyScore?: number;
  efficiencyTaskScore?: number;
  efficiencyHabitScore?: number;
  efficiencyAiScore?: number;
  efficiencyFocusScore?: number;
  efficiencyLastActivityAt?: Date | string | null;
  completedLessonIds?: string[];
  passwordHash?: string | null;
}) => {
  const aiCreditsMilli = (user.aiIncludedCreditsMilli ?? creditsToMilli(user.aiCredits ?? 100))
    + (user.aiBonusCreditsMilli ?? 0)
    + (user.aiPurchasedCreditsMilli ?? 0);
  return ({
  id: user.id,
  email: user.email,
  username: user.username,
  name: user.name,
  avatarUrl: user.avatarUrl,
  googleSub: user.googleSub,
  deviceId: user.deviceId,
  aiCredits: Math.floor(aiCreditsMilli / 1000),
  aiCreditsMilli,
  aiCreditsPeriod: user.aiCreditsPeriod ?? '',
  aiEfficiencyCreditsSpent: user.aiEfficiencyCreditsSpent ?? 0,
  aiEfficiencyCreditsPeriod: user.aiEfficiencyCreditsPeriod ?? '',
  timeZone: user.timeZone ?? DEFAULT_TIMEZONE,
  morningAiCheckupEnabled: user.morningAiCheckupEnabled ?? false,
  morningAiCheckupTime: CHECKUP_TIME_PATTERN.test(user.morningAiCheckupTime ?? '') ? user.morningAiCheckupTime : '10:00',
  efficiencyResetAt: user.efficiencyResetAt ?? EFFICIENCY_RESET_AT_ISO,
  efficiencyScore: Math.max(0, Math.min(100, user.efficiencyScore ?? 0)),
  efficiencyTaskScore: Math.max(0, user.efficiencyTaskScore ?? 0),
  efficiencyHabitScore: Math.max(0, user.efficiencyHabitScore ?? 0),
  efficiencyAiScore: Math.max(0, user.efficiencyAiScore ?? 0),
  efficiencyFocusScore: Math.max(0, user.efficiencyFocusScore ?? 0),
  efficiencyLastActivityAt: user.efficiencyLastActivityAt ?? null,
  completedLessonIds: user.completedLessonIds ?? [],
  hasPassword: Boolean(user.passwordHash)
  });
};



const normalizeEfficiencyBucket = (value: unknown): EfficiencyBucketKey | null => (
  typeof value === 'string' && (EFFICIENCY_BUCKET_KEYS as readonly string[]).includes(value) ? value as EfficiencyBucketKey : null
);

const clampEfficiency = (value: number) => Math.max(0, Math.min(100, Number(value.toFixed(6))));
const clampBucketScore = (value: number) => Math.max(0, Number(value.toFixed(6)));
const sumEfficiencyBuckets = (scores: EfficiencyBucketScores) => clampEfficiency(
  scores.task + scores.habit + scores.ai + scores.focus
);

type EfficiencyUserState = {
  efficiencyTaskScore: number;
  efficiencyHabitScore: number;
  efficiencyAiScore: number;
  efficiencyFocusScore: number;
  efficiencyLastActivityAt: Date | null;
  timeZone: string | null;
};

const getEfficiencyBuckets = (user: EfficiencyUserState): EfficiencyBucketScores => ({
  task: Math.max(0, user.efficiencyTaskScore ?? 0),
  habit: Math.max(0, user.efficiencyHabitScore ?? 0),
  ai: Math.max(0, user.efficiencyAiScore ?? 0),
  focus: Math.max(0, user.efficiencyFocusScore ?? 0)
});

const getLocalHour = (timestampMs: number, timeZone: string) => {
  try {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(new Date(timestampMs)));
    return hour === 24 ? 0 : hour;
  } catch {
    return new Date(timestampMs).getHours();
  }
};

const isNightHour = (timestampMs: number, timeZone: string) => {
  const hour = getLocalHour(timestampMs, timeZone);
  return hour >= EFFICIENCY_NIGHT_START_HOUR && hour < EFFICIENCY_NIGHT_END_HOUR;
};

const applyEfficiencyPenalty = (scores: EfficiencyBucketScores, fromMs: number, toMs: number, timeZone: string) => {
  if (toMs <= fromMs || sumEfficiencyBuckets(scores) <= 0) return scores;
  const hourMs = 60 * 60 * 1000;
  const penaltyHours = Math.floor((toMs - fromMs) / hourMs) - EFFICIENCY_INACTIVITY_GRACE_HOURS;
  if (penaltyHours <= 0) return scores;
  let next = { ...scores };
  for (let index = 1; index <= penaltyHours; index += 1) {
    const penaltyAtMs = fromMs + (EFFICIENCY_INACTIVITY_GRACE_HOURS + index) * hourMs;
    const bucketPenalty = isNightHour(penaltyAtMs, timeZone) ? EFFICIENCY_NIGHT_BUCKET_PENALTY : EFFICIENCY_DAY_BUCKET_PENALTY;
    next = deductEfficiencyPenalty(next, bucketPenalty * EFFICIENCY_BUCKET_KEYS.length);
  }
  return next;
};

const buildEfficiencyUpdateData = (scores: EfficiencyBucketScores, activityAt: Date) => ({
  efficiencyTaskScore: scores.task,
  efficiencyHabitScore: scores.habit,
  efficiencyAiScore: scores.ai,
  efficiencyFocusScore: scores.focus,
  efficiencyScore: sumEfficiencyBuckets(scores),
  efficiencyLastActivityAt: activityAt
});

export const persistEfficiencyDelta = async (userId: string, delta: number, bucket: EfficiencyBucketKey = 'task') => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { efficiencyTaskScore: true, efficiencyHabitScore: true, efficiencyAiScore: true, efficiencyFocusScore: true, efficiencyLastActivityAt: true, timeZone: true }
  });
  if (!user) return null;

  const now = new Date();
  const lastActivityAt = user.efficiencyLastActivityAt ?? now;
  const timeZone = user.timeZone ?? DEFAULT_TIMEZONE;
  const scores = applyEfficiencyPenalty(getEfficiencyBuckets(user), lastActivityAt.getTime(), now.getTime(), timeZone);
  if (delta > 0 && sumEfficiencyBuckets(scores) < 100) {
    const available = 100 - sumEfficiencyBuckets(scores);
    scores[bucket] = clampBucketScore(scores[bucket] + Math.min(delta, available));
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: buildEfficiencyUpdateData(scores, now),
    select: { efficiencyScore: true, efficiencyTaskScore: true, efficiencyHabitScore: true, efficiencyAiScore: true, efficiencyFocusScore: true, efficiencyLastActivityAt: true }
  });
  return updated;
};


const authRequestContext = (req: any) => {
  const origin = req.get?.('origin') ?? 'no-origin';
  const host = req.get?.('host') ?? 'unknown-host';
  const forwardedHost = req.get?.('x-forwarded-host') ?? 'no-forwarded-host';
  const userAgent = req.get?.('user-agent') ?? 'unknown-user-agent';
  return `host=${host} forwardedHost=${forwardedHost} origin=${origin} ip=${req.ip ?? 'unknown-ip'} userAgent="${userAgent}"`;
};

const setAuthCookies = (
  res: { cookie: (name: string, value: string, options: ReturnType<typeof authService.cookieOptions>) => void },
  user: {
    id: string;
    email?: string | null;
    username?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    googleSub?: string | null;
    deviceId?: string | null;
  }
) => {
  const token = authService.sign({
    sub: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    avatarUrl: user.avatarUrl,
    googleSub: user.googleSub,
    deviceId: user.deviceId
  });
  res.cookie(AUTH_COOKIE_NAME, token, authService.cookieOptions());
};

const validateTelegramMiniAppInitData = (initDataRaw: string) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required for mini app auth');
  }

  return validateTelegramWebAppInitData(initDataRaw, botToken);
};

const ensureDeviceUser = async (req: any, res: any) => {
  const deviceId = authService.resolveDeviceId(req);

  let user = await prisma.user.findUnique({ where: { deviceId } });
  if (!user) {
    user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          deviceId,
          name: 'Локальный пользователь'
        }
      });
      await onboardingService.ensureDefaultsForNewUser(createdUser.id, createdUser.createdAt, tx);
      return createdUser;
    });
  }

  res.cookie(DEVICE_COOKIE_NAME, deviceId, authService.deviceCookieOptions());
  setAuthCookies(res, user);
  return user;
};

apiRouter.get('/health', (_, res) => res.json({ ok: true, service: 'bubble-task-manager', date: new Date().toISOString() }));

apiRouter.post('/client-errors', async (req, res) => {
  const source = typeof req.body?.source === 'string' ? req.body.source : 'unknown';
  const message = typeof req.body?.message === 'string' ? req.body.message : 'empty-message';
  const stack = typeof req.body?.stack === 'string' ? req.body.stack : '';
  const details = typeof req.body?.details === 'string' ? req.body.details : '';
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  const userId = req.user?.id ?? 'anonymous';
  const userAgent = req.get('user-agent') ?? 'unknown';
  const ip = req.ip ?? 'unknown';

  console.error(
    `[client-error] source=${source} userId=${userId} ip=${ip} userAgent="${userAgent}" url="${url}" message="${message}" details="${details}" stack="${stack.slice(0, 4000)}"`
  );

  res.json({ ok: true });
});

apiRouter.post('/auth/register', async (req, res) => {
  const loginRaw = String(req.body?.login ?? '');
  const passwordRaw = String(req.body?.password ?? '');
  const nameRaw = String(req.body?.name ?? '').trim();

  const login = sanitizeLogin(loginRaw);
  let user;
  try {
    validatePersonalDataConsent(req.body?.consentAccepted);
    user = await accountRegistrationService.register({
      login,
      password: passwordRaw,
      name: nameRaw,
      personalDataConsent: {
        version: PERSONAL_DATA_CONSENT_VERSION,
        ipAddress: req.ip
      }
    });
  } catch (error) {
    if (!(error instanceof AccountRegistrationError)) throw error;
    const response = error.code === 'INVALID_LOGIN'
      ? { status: 400, message: 'Логин должен содержать минимум 3 символа' }
      : error.code === 'INVALID_PASSWORD'
        ? { status: 400, message: 'Пароль должен содержать минимум 6 символов' }
        : error.code === 'CONSENT_REQUIRED'
          ? { status: 400, message: 'Необходимо согласие на обработку персональных данных' }
          : { status: 409, message: 'Логин уже занят' };
    console.warn(`[Auth] register failed reason=${error.code.toLowerCase()} login=${login || 'empty'} ${authRequestContext(req)}`);
    res.status(response.status).json({ error: response.message });
    return;
  }

  setAuthCookies(res, user);
  console.info(`[Auth] register success userId=${user.id} login=${login} ${authRequestContext(req)}`);
  res.json({ user: toAuthUser(user) });
});

apiRouter.post('/auth/login', async (req, res) => {
  const login = sanitizeLogin(String(req.body?.login ?? ''));
  const password = String(req.body?.password ?? '');
  if (!login || !password) {
    console.warn(`[Auth] login validation failed reason=missing_credentials login=${login || 'empty'} ${authRequestContext(req)}`);
    res.status(400).json({ error: 'Укажите логин и пароль' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { username: login } });
  if (!user?.passwordHash || !authService.verifyPassword(password, user.passwordHash)) {
    console.warn(`[Auth] login failed login=${login} reason=invalid_credentials ${authRequestContext(req)}`);
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }

  setAuthCookies(res, user);
  console.info(`[Auth] login success userId=${user.id} login=${login} ${authRequestContext(req)}`);
  res.json({ user: toAuthUser(user) });
});

apiRouter.get('/auth/google', (req, res, next) => {
  if (!isGoogleAuthEnabled) {
    res.status(503).json({ error: 'Google авторизация временно отключена' });
    return;
  }
  passport.authenticate('google', { scope: ['openid', 'email', 'profile'], session: false })(req, res, next);
});

apiRouter.get('/auth/google/callback', (req, res, next) => {
  if (!isGoogleAuthEnabled) {
    res.redirect('/');
    return;
  }

  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/me' })(req, res, async () => {
    const user = req.user as {
      id: string;
      email?: string | null;
      username?: string | null;
      name?: string | null;
      avatarUrl?: string | null;
      googleSub?: string | null;
      deviceId?: string | null;
    };

    setAuthCookies(res, user);
    if (user.deviceId) {
      res.cookie(DEVICE_COOKIE_NAME, user.deviceId, authService.deviceCookieOptions());
    }
    res.redirect('/');
  });
});


apiRouter.get('/subscription-links', async (_req, res) => {
  const links = await prisma.subscriptionLink.findMany({
    where: { planKey: { in: [...SUBSCRIPTION_PLAN_KEYS] } },
    select: { planKey: true, url: true }
  });
  res.json({ links: Object.fromEntries(SUBSCRIPTION_PLAN_KEYS.map((key) => [key, links.find((link) => link.planKey === key)?.url ?? ''])) });
});

apiRouter.get('/credit-packs', async (_req, res) => {
  res.json(await creditPacksResponse());
});

apiRouter.get('/credits/statistics', requireAuth, asyncHandler(async (req, res) => {
  res.json({ statistics: await getCreditUsageStatistics(req.user!.id) });
}));

apiRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authService.cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

apiRouter.patch('/user/profile', requireAuth, async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const emailRaw = String(req.body?.email ?? '').trim().toLowerCase();
  const currentPassword = String(req.body?.currentPassword ?? '');
  const newPassword = String(req.body?.newPassword ?? '');

  if (name.length > 100) {
    res.status(400).json({ error: 'Имя должно содержать не более 100 символов' });
    return;
  }
  if (emailRaw.length > 254 || (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw))) {
    res.status(400).json({ error: 'Укажите корректную почту' });
    return;
  }
  if (newPassword && newPassword.length < 6) {
    res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(user.username || user.email || user.googleSub)) {
    res.status(403).json({ error: 'Настройки профиля доступны только для аккаунта' });
    return;
  }
  if (newPassword && user.passwordHash && !authService.verifyPassword(currentPassword, user.passwordHash)) {
    res.status(400).json({ error: 'Текущий пароль указан неверно' });
    return;
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name || null,
        email: emailRaw || null,
        ...(newPassword ? { passwordHash: authService.hashPassword(newPassword) } : {})
      }
    });
    setAuthCookies(res, updatedUser);
    res.json({ user: toAuthUser(updatedUser) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      res.status(409).json({ error: 'Эта почта уже используется' });
      return;
    }
    throw error;
  }
});

apiRouter.delete('/user/account', requireAuth, async (req, res) => {
  await prisma.user.delete({ where: { id: req.user!.id } });
  res.clearCookie(AUTH_COOKIE_NAME, { ...authService.cookieOptions(), maxAge: undefined });
  res.clearCookie(DEVICE_COOKIE_NAME, { ...authService.deviceCookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

const requireAdminPassword = (req: any, res: any): boolean => {
  const configuredPassword = process.env[ADMIN_PANEL_PASSWORD_ENV]?.trim();
  if (!configuredPassword) {
    res.status(503).json({ error: `Переменная окружения ${ADMIN_PANEL_PASSWORD_ENV} не задана` });
    return false;
  }
  const providedPassword = String(req.body?.password ?? '');
  if (!providedPassword) {
    res.status(400).json({ error: 'Введите пароль администратора' });
    return false;
  }
  if (providedPassword !== configuredPassword) {
    res.status(401).json({ error: 'Неверный пароль администратора' });
    return false;
  }
  return true;
};

apiRouter.post('/admin/users', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      telegramChatId: true,
      subscriptionPlan: true,
      aiCredits: true,
      aiCreditsPeriod: true,
      aiIncludedCreditsMilli: true,
      aiBonusCreditsMilli: true,
      aiPurchasedCreditsMilli: true,
      createdAt: true
    }
  });

  res.json({ users: users.map(({ telegramChatId, ...user }) => ({ ...user, telegramLinked: Boolean(telegramChatId) })) });
});


apiRouter.post('/admin/subscription-links', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;

  const rawLinks = req.body?.links ?? {};
  const links: Record<SubscriptionPlanKey, string> = { start: '', pro: '', max: '' };
  for (const key of SUBSCRIPTION_PLAN_KEYS) {
    const value = String(rawLinks?.[key] ?? '').trim();
    if (value && !/^https?:\/\//i.test(value)) {
      res.status(400).json({ error: `Ссылка для тарифа ${key} должна начинаться с http:// или https://` });
      return;
    }
    links[key] = value;
  }

  await Promise.all(SUBSCRIPTION_PLAN_KEYS.map((key) => prisma.subscriptionLink.upsert({
    where: { planKey: key },
    create: { planKey: key, url: links[key] },
    update: { url: links[key] }
  })));

  res.json({ links });
});

apiRouter.post('/admin/credit-packs', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;

  const rawLinks = req.body?.links ?? {};
  const links = Object.fromEntries(CREDIT_PACKS.map((pack) => [pack.key, ''])) as Record<CreditPackKey, string>;
  for (const pack of CREDIT_PACKS) {
    const value = String(rawLinks?.[pack.key] ?? '').trim();
    if (value && !/^https?:\/\//i.test(value)) {
      res.status(400).json({ error: `Ссылка для пакета ${pack.name} должна начинаться с http:// или https://` });
      return;
    }
    links[pack.key] = value;
  }

  await Promise.all(CREDIT_PACKS.map((pack) => prisma.creditPack.upsert({
    where: { key: pack.key },
    create: { key: pack.key, name: pack.name, creditsAmount: pack.creditsAmount, price: pack.price, paymentUrl: links[pack.key] },
    update: { name: pack.name, creditsAmount: pack.creditsAmount, price: pack.price, paymentUrl: links[pack.key] }
  })));

  res.json({ links });
});

apiRouter.post('/admin/users/:userId/subscription', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const userId = String(req.params.userId ?? '').trim();
  const subscriptionPlan = String(req.body?.subscriptionPlan ?? '').trim() as AdminSubscriptionPlanKey;
  if (!userId) {
    res.status(400).json({ error: 'Не указан пользователь' });
    return;
  }
  if (!(ADMIN_SUBSCRIPTION_PLAN_KEYS as readonly string[]).includes(subscriptionPlan)) {
    res.status(400).json({ error: 'Неизвестный тариф' });
    return;
  }
  const user = await prisma.user.update({
    where: { id: userId },
    data: { subscriptionPlan },
    select: { id: true, subscriptionPlan: true }
  }).catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return null;
    throw error;
  });
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  res.json({ user });
});

apiRouter.post('/admin/broadcasts', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const target = String(req.body?.target ?? '').trim();
  const text = String(req.body?.text ?? '').trim();
  const userId = String(req.body?.userId ?? '').trim();
  if (!(ADMIN_BROADCAST_TARGETS as readonly string[]).includes(target)) {
    res.status(400).json({ error: 'Неизвестная аудитория рассылки' });
    return;
  }

  let image: { fileName: string; mimeType: string; contentBase64: string } | null = null;
  if (req.body?.image) {
    const mimeType = String(req.body.image.mimeType ?? '').trim();
    const fileName = String(req.body.image.fileName ?? 'broadcast-image').trim().slice(0, 160) || 'broadcast-image';
    const contentBase64 = String(req.body.image.contentBase64 ?? '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!(ADMIN_BROADCAST_IMAGE_TYPES as readonly string[]).includes(mimeType)) {
      res.status(400).json({ error: 'Для рассылки поддерживаются JPG, PNG и WEBP' });
      return;
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(contentBase64, 'base64');
    } catch {
      res.status(400).json({ error: 'Не удалось прочитать изображение' });
      return;
    }
    if (!contentBase64 || bytes.byteLength === 0) {
      res.status(400).json({ error: 'Изображение пустое' });
      return;
    }
    if (bytes.byteLength > ADMIN_BROADCAST_MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Изображение должно быть не больше 8 МБ' });
      return;
    }
    image = { fileName, mimeType, contentBase64 };
  }

  if (!text && !image) {
    res.status(400).json({ error: 'Введите текст или прикрепите изображение' });
    return;
  }
  if (text.length > 20_000) {
    res.status(400).json({ error: 'Текст рассылки слишком длинный' });
    return;
  }
  if (target === 'user' && !userId) {
    res.status(400).json({ error: 'Выберите пользователя' });
    return;
  }

  if (target === 'user') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, telegramChatId: true }
    });
    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    if (!user.telegramChatId) {
      res.status(409).json({ error: 'У пользователя не подключён Telegram-бот' });
      return;
    }
  }

  const where = target === 'user'
    ? { id: userId, telegramChatId: { not: null as null } }
    : target === 'paid'
      ? { telegramChatId: { not: null as null }, subscriptionPlan: { in: [...SUBSCRIPTION_PLAN_KEYS] } }
      : target === 'free'
        ? { telegramChatId: { not: null as null }, subscriptionPlan: 'free' }
        : { telegramChatId: { not: null as null } };

  const recipients = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    select: { id: true, telegramChatId: true }
  });

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    if (!recipient.telegramChatId) continue;
    const delivered = await telegramService.sendAdminBroadcast(recipient.telegramChatId, { text, image });
    if (delivered) sent += 1;
    else failed += 1;
    if (recipients.length > 1) await new Promise((resolve) => setTimeout(resolve, 50));
  }

  res.json({ requested: recipients.length, sent, failed });
});

apiRouter.post('/admin/users/:userId/credit-statistics', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const userId = String(req.params.userId ?? '').trim();
  if (!userId) {
    res.status(400).json({ error: 'Не указан пользователь' });
    return;
  }
  try {
    res.json({ statistics: await getCreditUsageStatistics(userId) });
  } catch (error) {
    if (error instanceof Error && error.message === 'User not found') {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }
    throw error;
  }
});

apiRouter.post('/admin/users/:userId/credit-usage-export', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;
  const userId = String(req.params.userId ?? '').trim();
  const month = String(req.body?.month ?? '').trim();
  if (!userId) {
    res.status(400).json({ error: 'Не указан пользователь' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, username: true, email: true }
  });
  if (!user) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }

  try {
    const usage = await getMonthlyCreditUsageExport(userId, month);
    const userLabel = user.name || user.username || user.email || userId;
    const xml = buildCreditUsageExcelXml({ userLabel, month, timeZone: usage.timeZone, rows: usage.rows });
    const safeLabel = userLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48) || 'user';
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="credit-usage-${safeLabel}-${month}.xls"`);
    res.send('\uFEFF' + xml);
  } catch (error) {
    if (error instanceof TypeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});


apiRouter.post('/admin/users/:userId/credits', async (req, res) => {
  if (!requireAdminPassword(req, res)) return;

  const userId = String(req.params.userId ?? '').trim();
  const creditsToAdd = Number(req.body?.creditsToAdd);
  if (!userId) {
    res.status(400).json({ error: 'Не указан пользователь' });
    return;
  }
  if (!Number.isFinite(creditsToAdd) || !Number.isInteger(creditsToAdd)) {
    res.status(400).json({ error: 'Укажите целое количество кредитов' });
    return;
  }
  if (creditsToAdd <= 0) {
    res.status(400).json({ error: 'Количество кредитов должно быть больше нуля' });
    return;
  }

  const updatedUser = await grantBonusCreditsMilli(userId, creditsToMilli(creditsToAdd));

  res.json({ user: {
    id: updatedUser.id,
    aiCredits: updatedUser.aiCredits,
    aiCreditsMilli: updatedUser.aiIncludedCreditsMilli + updatedUser.aiBonusCreditsMilli + updatedUser.aiPurchasedCreditsMilli,
    aiCreditsPeriod: updatedUser.aiCreditsPeriod
  } });
});


apiRouter.patch('/user/settings', requireAuth, async (req, res) => {
  const data: {
    timeZone?: string;
    morningAiCheckupEnabled?: boolean;
    morningAiCheckupTime?: string;
  } = {};

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'timeZone')) {
    const normalizedTimeZone = normalizeTimeZone(String(req.body?.timeZone ?? ''));
    if (!normalizedTimeZone) {
      res.status(400).json({ error: 'Некорректный часовой пояс' });
      return;
    }
    data.timeZone = normalizedTimeZone;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'morningAiCheckupEnabled')) {
    data.morningAiCheckupEnabled = req.body?.morningAiCheckupEnabled === true;
  }

  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'morningAiCheckupTime')) {
    const checkupTime = String(req.body?.morningAiCheckupTime ?? '').trim();
    if (!CHECKUP_TIME_PATTERN.test(checkupTime)) {
      res.status(400).json({ error: 'Укажите время чекапа в формате HH:mm' });
      return;
    }
    data.morningAiCheckupTime = checkupTime;
  }

  const updatedUser = await prisma.user.update({
    where: { id: req.user!.id },
    data,
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      avatarUrl: true,
      googleSub: true,
      deviceId: true,
      aiCredits: true,
      aiCreditsPeriod: true,
      aiIncludedCreditsMilli: true,
      aiBonusCreditsMilli: true,
      aiPurchasedCreditsMilli: true,
      aiEfficiencyCreditsSpent: true,
      aiEfficiencyCreditsPeriod: true,
      timeZone: true,
      morningAiCheckupEnabled: true,
      morningAiCheckupTime: true,
      efficiencyScore: true,
      efficiencyTaskScore: true,
      efficiencyHabitScore: true,
      efficiencyAiScore: true,
      efficiencyFocusScore: true,
      efficiencyLastActivityAt: true,
      completedLessonIds: true
    }
  });

  res.json({ user: toAuthUser(updatedUser) });
});


apiRouter.post('/efficiency/events', requireAuth, async (req, res) => {
  const delta = Number(req.body?.delta ?? 0);
  if (!Number.isFinite(delta) || delta <= 0 || delta > 100) {
    res.status(400).json({ error: 'Некорректное изменение рейтинга' });
    return;
  }

  const bucket = normalizeEfficiencyBucket(req.body?.bucket);
  if (!bucket) {
    res.status(400).json({ error: 'Некорректная категория рейтинга' });
    return;
  }

  const efficiencyState = await persistEfficiencyDelta(req.user!.id, delta, bucket);
  if (efficiencyState === null) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }

  res.json(efficiencyState);
});

apiRouter.post('/training/lessons/:lessonId/complete', requireAuth, async (req, res) => {
  const lessonId = req.params.lessonId;
  if (!(TRAINING_LESSON_IDS as readonly string[]).includes(lessonId)) {
    res.status(400).json({ error: 'Неизвестный урок' });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Сериализуем награждения пользователя, чтобы параллельные запросы не дали награду дважды.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${req.user!.id}))`;
    const user = await tx.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return null;
    if (user.completedLessonIds.includes(lessonId)) return { awarded: false, user };

    const now = new Date();
    const scores = applyEfficiencyPenalty(getEfficiencyBuckets(user), (user.efficiencyLastActivityAt ?? now).getTime(), now.getTime(), user.timeZone ?? DEFAULT_TIMEZONE);
    const available = 100 - sumEfficiencyBuckets(scores);
    scores.task = clampBucketScore(scores.task + Math.min(TRAINING_LESSON_REWARD, Math.max(0, available)));
    await grantBonusCreditsMilliInTransaction(user.id, creditsToMilli(TRAINING_LESSON_REWARD), tx);
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { ...buildEfficiencyUpdateData(scores, now), completedLessonIds: [...user.completedLessonIds, lessonId] }
    });
    return { awarded: true, user: updated };
  });

  if (!result) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }
  res.json({ awarded: result.awarded, reward: result.awarded ? TRAINING_LESSON_REWARD : 0, user: toAuthUser(result.user) });
});

apiRouter.get('/auth/me', async (req, res) => {
  if (req.user?.id) {
    await persistEfficiencyDelta(req.user.id, 0);
    await getAiCreditWallet(req.user.id);
    const freshUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (freshUser) {
      console.info(`[Auth] me success userId=${freshUser.id} source=cookie ${authRequestContext(req)}`);
      res.json({ user: toAuthUser(freshUser) });
      return;
    }
  }

  if (req.user) {
    console.warn(`[Auth] me stale user userId=${req.user.id} ${authRequestContext(req)}`);
    res.json({ user: toAuthUser(req.user) });
    return;
  }

  const user = await ensureDeviceUser(req, res);
  console.info(`[Auth] me created_or_loaded_device_user userId=${user.id} ${authRequestContext(req)}`);
  res.json({ user: toAuthUser(user) });
});


apiRouter.post('/telegram/link-token', requireAuth, async (req, res) => {
  console.info(`[TelegramLink] link-token requested userId=${req.user!.id}`);
  const tokenData = telegramService.createTelegramLinkToken(req.user!.id);
  if (!tokenData) {
    console.warn(`[TelegramLink] link-token request failed: not configured userId=${req.user!.id}`);
    res.status(503).json({ error: 'Telegram link login is not configured' });
    return;
  }

  console.info(`[TelegramLink] link-token response created userId=${req.user!.id} expiresInSeconds=${tokenData.expiresInSeconds}`);
  res.json(tokenData);
});

apiRouter.post('/miniapp/client-log', (req, res) => {
  const event = typeof req.body?.event === 'string' ? req.body.event.trim().slice(0, 80) : 'unknown';
  const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
  const userAgent = req.get('user-agent') ?? 'unknown';
  const safeData = JSON.stringify(data).slice(0, 1500);
  console.info(`[MiniAppClient] event=${event} userId=${req.user?.id ?? 'anonymous'} userAgent="${userAgent.slice(0, 180)}" data=${safeData}`);
  res.json({ ok: true });
});

apiRouter.post('/auth/telegram-miniapp', async (req, res) => {
  const initDataRaw = typeof req.body?.initData === 'string' ? req.body.initData.trim() : '';
  const userAgent = req.get('user-agent') ?? 'unknown';
  const ip = req.ip ?? 'unknown';
  console.info(`[MiniApp] auth attempt ip=${ip} userAgent="${userAgent.slice(0, 180)}" initDataLength=${initDataRaw.length}`);

  if (!initDataRaw) {
    console.warn('[MiniApp] auth failed: initData is empty');
    res.status(400).json({ error: 'initData is required' });
    return;
  }

  let telegramUserId: string;
  try {
    const telegramUser = validateTelegramMiniAppInitData(initDataRaw);
    telegramUserId = String(telegramUser.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown validation error';
    console.warn(`[MiniApp] auth failed: invalid initData (${message})`);
    res.status(401).json({ error: 'Invalid Telegram init data' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { telegramChatId: telegramUserId } });
  if (!user) {
    console.warn(`[MiniApp] auth failed: no user linked for telegramChatId=${telegramUserId}`);
    res.status(403).json({ error: 'Telegram account is not linked. Open bot and login first.' });
    return;
  }

  setAuthCookies(res, user);
  console.info(`[MiniApp] auth success userId=${user.id} telegramChatId=${telegramUserId}`);
  res.json({ user: toAuthUser(user) });
});

apiRouter.post('/auth/telegram-web-login', async (req, res) => {
  const initDataRaw = typeof req.body?.initData === 'string' ? req.body.initData.trim() : '';
  const login = sanitizeLogin(String(req.body?.login ?? ''));
  const password = String(req.body?.password ?? '');
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken || !initDataRaw) {
    res.status(400).json({ error: 'Откройте форму входа кнопкой в Telegram-боте' });
    return;
  }
  if (!login || !password) {
    res.status(400).json({ error: 'Укажите логин и пароль' });
    return;
  }

  let telegramChatId: string;
  try {
    telegramChatId = String(validateTelegramWebAppInitData(initDataRaw, botToken).id);
  } catch (error) {
    console.warn(`[TelegramWebLogin] invalid init data: ${error instanceof Error ? error.message : 'unknown error'}`);
    res.status(401).json({ error: 'Сессия Telegram устарела. Откройте форму заново' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { username: login } });
  if (!user?.passwordHash || !authService.verifyPassword(password, user.passwordHash)) {
    console.warn(`[TelegramWebLogin] invalid credentials chatId=${telegramChatId} login=${login}`);
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }

  await telegramService.completeWebLogin(telegramChatId, user);
  setAuthCookies(res, user);
  console.info(`[TelegramWebLogin] success chatId=${telegramChatId} userId=${user.id}`);
  res.json({ user: toAuthUser(user) });
});

apiRouter.post('/auth/telegram-web-register', async (req, res) => {
  const initDataRaw = typeof req.body?.initData === 'string' ? req.body.initData.trim() : '';
  const login = sanitizeLogin(String(req.body?.login ?? ''));
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '').trim();
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken || !initDataRaw) {
    res.status(400).json({ error: 'Откройте форму регистрации кнопкой в Telegram-боте' });
    return;
  }

  let telegramChatId: string;
  try {
    telegramChatId = String(validateTelegramWebAppInitData(initDataRaw, botToken).id);
  } catch (error) {
    console.warn(`[TelegramWebRegister] invalid init data: ${error instanceof Error ? error.message : 'unknown error'}`);
    res.status(401).json({ error: 'Сессия Telegram устарела. Откройте форму заново' });
    return;
  }

  let user;
  try {
    validatePersonalDataConsent(req.body?.consentAccepted);
    user = await accountRegistrationService.register({
      login,
      password,
      name,
      personalDataConsent: { version: PERSONAL_DATA_CONSENT_VERSION, ipAddress: req.ip }
    });
  } catch (error) {
    if (!(error instanceof AccountRegistrationError)) throw error;
    const response = error.code === 'INVALID_LOGIN'
      ? { status: 400, message: 'Логин должен содержать минимум 3 символа' }
      : error.code === 'INVALID_PASSWORD'
        ? { status: 400, message: 'Пароль должен содержать минимум 6 символов' }
        : error.code === 'CONSENT_REQUIRED'
          ? { status: 400, message: 'Необходимо согласие на обработку персональных данных' }
          : { status: 409, message: 'Логин уже занят' };
    res.status(response.status).json({ error: response.message });
    return;
  }

  await telegramService.completeWebLogin(telegramChatId, user, true);
  setAuthCookies(res, user);
  console.info(`[TelegramWebRegister] success chatId=${telegramChatId} userId=${user.id}`);
  res.json({ user: toAuthUser(user) });
});

apiRouter.get('/spheres', requireAuth, sphereController.list);
apiRouter.post('/spheres', requireAuth, sphereController.create);
apiRouter.patch('/spheres/:id', requireAuth, sphereController.update);
apiRouter.delete('/spheres/:id', requireAuth, sphereController.remove);
apiRouter.get('/tasks', requireAuth, taskController.list);
apiRouter.post('/tasks', requireAuth, taskController.create);
apiRouter.patch('/tasks/:id', requireAuth, taskController.update);
apiRouter.delete('/tasks/:id', requireAuth, taskController.remove);
apiRouter.get('/tasks/:id/comments', requireAuth, taskCommentController.list);
apiRouter.post('/tasks/:id/comments', requireAuth, taskCommentController.create);
apiRouter.post('/tasks/:id/comments/read', requireAuth, taskCommentController.markRead);
apiRouter.post('/tasks/:id/share', requireAuth, asyncHandler(taskController.createShareLink));
apiRouter.patch('/tasks/:id/collaboration', requireAuth, asyncHandler(taskController.updateCollaboration));
apiRouter.delete('/tasks/:id/collaboration/members/:userId', requireAuth, asyncHandler(taskController.removeCollaborator));
apiRouter.delete('/tasks/:id/collaboration', requireAuth, asyncHandler(taskController.disableCollaboration));
apiRouter.get('/task-shares/:token', requireAuth, asyncHandler(taskController.sharePreview));
apiRouter.post('/task-shares/:token/accept', requireAuth, asyncHandler(taskController.acceptShare));
apiRouter.post('/tasks/:id/calendar/ics-link', requireAuth, asyncHandler(calendarExportController.createLink));
apiRouter.get('/calendar/ics/export', asyncHandler(calendarExportController.exportIcs));
apiRouter.get('/habits', requireAuth, asyncHandler(habitController.list));
apiRouter.post('/habits', requireAuth, asyncHandler(habitController.create));
apiRouter.patch('/habits/:id', requireAuth, asyncHandler(habitController.update));
apiRouter.post('/habits/:id/complete', requireAuth, asyncHandler(habitController.complete));
apiRouter.post('/habits/:id/uncomplete', requireAuth, asyncHandler(habitController.uncomplete));
apiRouter.post('/habits/:id/finish', requireAuth, asyncHandler(habitController.finish));
apiRouter.delete('/habits/:id', requireAuth, asyncHandler(habitController.remove));
apiRouter.get('/tasks/:id/attachments', requireAuth, taskAttachmentController.list);
apiRouter.get('/tasks/:id/attachments/:attachmentId/download', requireAuth, taskAttachmentController.download);
apiRouter.post('/tasks/:id/attachments/:attachmentId/download-link', requireAuth, taskAttachmentController.createDownloadLink);
apiRouter.get('/task-attachments/download', taskAttachmentController.downloadWithToken);
apiRouter.post('/tasks/:id/attachments', requireAuth, taskAttachmentController.create);
apiRouter.delete('/tasks/:id/attachments/:attachmentId', requireAuth, taskAttachmentController.remove);
apiRouter.get('/dashboard/insights', requireAuth, async (req, res) => res.json(await insightService.list(req.user!.id)));

apiRouter.get('/ai-chat/projects', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { aiChatProjects: true }
  });
  res.json({ projects: user?.aiChatProjects ?? null });
}));

apiRouter.get('/system-notifications', requireAuth, asyncHandler(async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    prisma.systemNotification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    }),
    prisma.systemNotification.count({ where: { userId: req.user!.id, readAt: null } })
  ]);
  res.json({ notifications: notifications.reverse(), unreadCount });
}));

apiRouter.post('/system-notifications/read', requireAuth, asyncHandler(async (req, res) => {
  await prisma.systemNotification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() }
  });
  res.json({ ok: true });
}));

apiRouter.put('/ai-chat/projects', requireAuth, asyncHandler(async (req, res) => {
  const projects = req.body?.projects;
  if (!Array.isArray(projects)) {
    res.status(400).json({ error: 'Список проектов должен быть массивом' });
    return;
  }
  const serialized = JSON.stringify(projects);
  if (Buffer.byteLength(serialized, 'utf8') > 2_000_000) {
    res.status(413).json({ error: 'История чатов слишком большая' });
    return;
  }
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { aiChatProjects: projects }
  });
  const existingPairs = projects.flatMap((project: unknown) => {
    if (!project || typeof project !== 'object' || typeof (project as { id?: unknown }).id !== 'string' || !Array.isArray((project as { chats?: unknown }).chats)) return [];
    const projectId = (project as { id: string }).id;
    return ((project as { chats: unknown[] }).chats).flatMap((chat) => chat && typeof chat === 'object' && typeof (chat as { id?: unknown }).id === 'string' ? [{ projectId, chatId: (chat as { id: string }).id }] : []);
  });
  await prisma.aiChatConversationMemory.deleteMany({
    where: {
      userId: req.user!.id,
      ...(existingPairs.length ? { NOT: { OR: existingPairs } } : {})
    }
  });
  res.json({ projects });
}));

apiRouter.post('/ai-chat', requireAuth, aiController.askAiChat);
apiRouter.get('/ai-general-chat', requireAuth, aiController.getGeneralAssistantHistory);
apiRouter.post('/ai-general-chat', requireAuth, aiController.askGeneralAssistant);
apiRouter.post('/ai-general-chat/undo', requireAuth, aiController.undoGeneralAssistantAction);
apiRouter.get('/tasks/:id/ai-chat', requireAuth, aiController.getTaskAssistantHistory);
apiRouter.post('/tasks/:id/ai-chat', requireAuth, aiController.askTaskAssistant);
apiRouter.post('/tasks/:id/ai-chat/messages', requireAuth, aiController.appendTaskAssistantMessages);
apiRouter.post('/tasks/:id/participant-messages', requireAuth, asyncHandler(taskParticipantMessageController.send));
apiRouter.post('/tasks/:id/ai-subtasks', requireAuth, aiController.generateSubtasks);
apiRouter.post('/tasks/:id/ai-overdue-nudge', requireAuth, aiController.generateOverdueTaskNudge);
apiRouter.post('/tasks/ai-generate', requireAuth, aiController.generateTaskFromPrompt);
apiRouter.post('/ai/parse-recurrence', requireAuth, aiController.parseRecurrence);
apiRouter.post('/timeline/ai-optimize', requireAuth, aiController.optimizeTimelineSchedule);
apiRouter.post('/timeline/ai-optimize/apply', requireAuth, aiController.applyTimelineOptimization);
apiRouter.post('/timeline/overdue-postpone-ai', requireAuth, aiController.postponeOverdueWithAi);

apiRouter.post('/telegram-relay', telegramRelayController.webhook);
apiRouter.post('/telegram/webhook', asyncHandler(telegramController.webhook));
