import { Router } from 'express';
import crypto from 'node:crypto';
import { sphereController } from '../controllers/sphere.controller.js';
import { taskController } from '../controllers/task.controller.js';
import { habitController } from '../controllers/habit.controller.js';
import { taskAttachmentController } from '../controllers/task-attachment.controller.js';
import { insightService } from '../services/insight.service.js';
import { aiController } from '../controllers/ai.controller.js';
import { telegramController } from '../controllers/telegram.controller.js';
import { telegramService } from '../services/telegram.service.js';
import { isGoogleAuthEnabled, passport } from '../auth/passport.js';
import { AUTH_COOKIE_NAME, DEVICE_COOKIE_NAME, authService } from '../auth/auth.service.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../db/prisma.js';
import { onboardingService } from '../services/onboarding.service.js';

export const apiRouter = Router();
const ADMIN_PANEL_PASSWORD_ENV = 'ADMIN_PANEL_PASSWORD';
const SUBSCRIPTION_PLAN_KEYS = ['start', 'pro', 'max'] as const;
type SubscriptionPlanKey = typeof SUBSCRIPTION_PLAN_KEYS[number];


const sanitizeLogin = (value: string) => value.trim().toLowerCase();
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
const EFFICIENCY_RESET_AT = new Date(EFFICIENCY_RESET_AT_ISO);
const EFFICIENCY_INACTIVE_PENALTY_PER_HOUR = 3.5;
const EFFICIENCY_INACTIVITY_GRACE_HOURS = 3;
const EFFICIENCY_NIGHT_START_HOUR = 0;
const EFFICIENCY_NIGHT_END_HOUR = 8;
const EFFICIENCY_NIGHT_PENALTY_MULTIPLIER = 0.25;
const EFFICIENCY_AI_CREDIT_BONUS = 0.2;
const EFFICIENCY_BONUSES = {
  doneTask: 5,
  doneSubtask: 2,
  doneHabit: 6.7,
  createdHabit: 3.35,
  completedHabit: 20.1,
  createdTask: 1
} as const;

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
  timeZone?: string | null;
  morningAiCheckupEnabled?: boolean;
  morningAiCheckupTime?: string;
  efficiencyResetAt?: string;
  efficiencyScore?: number;
}) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  name: user.name,
  avatarUrl: user.avatarUrl,
  googleSub: user.googleSub,
  deviceId: user.deviceId,
  aiCredits: user.aiCredits ?? 100,
  aiCreditsPeriod: user.aiCreditsPeriod ?? '',
  timeZone: user.timeZone ?? DEFAULT_TIMEZONE,
  morningAiCheckupEnabled: user.morningAiCheckupEnabled ?? false,
  morningAiCheckupTime: CHECKUP_TIME_PATTERN.test(user.morningAiCheckupTime ?? '') ? user.morningAiCheckupTime : '10:00',
  efficiencyResetAt: user.efficiencyResetAt ?? EFFICIENCY_RESET_AT_ISO,
  efficiencyScore: Math.max(0, Math.min(100, user.efficiencyScore ?? 0))
});



const clampEfficiency = (value: number) => Math.max(0, Math.min(100, Number(value.toFixed(6))));

type EfficiencyScoreEvent = { atMs: number; delta: number };

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

const calculateEfficiencyScore = (events: EfficiencyScoreEvent[], nowMs: number, resetAtMs: number, timeZone: string) => {
  const sortedEvents = events
    .filter((event) => Number.isFinite(event.atMs) && event.atMs >= resetAtMs && event.atMs <= nowMs && event.delta > 0)
    .sort((a, b) => a.atMs - b.atMs);

  let score = 0;
  let cursorMs = resetAtMs;

  const applyInactivePenalty = (nextMs: number) => {
    if (nextMs <= cursorMs || score <= 0) {
      cursorMs = Math.max(cursorMs, nextMs);
      return;
    }

    const hourMs = 60 * 60 * 1000;
    const inactiveMs = nextMs - cursorMs;
    const penaltyHours = Math.floor(inactiveMs / hourMs) - EFFICIENCY_INACTIVITY_GRACE_HOURS;
    if (penaltyHours <= 0) {
      cursorMs = nextMs;
      return;
    }

    let penalty = 0;
    for (let index = 1; index <= penaltyHours; index += 1) {
      const penaltyAtMs = cursorMs + (EFFICIENCY_INACTIVITY_GRACE_HOURS + index) * hourMs;
      const multiplier = isNightHour(penaltyAtMs, timeZone) ? EFFICIENCY_NIGHT_PENALTY_MULTIPLIER : 1;
      penalty += EFFICIENCY_INACTIVE_PENALTY_PER_HOUR * multiplier;
    }
    score = Math.max(0, score - penalty);
    cursorMs = nextMs;
  };

  for (const event of sortedEvents) {
    applyInactivePenalty(event.atMs);
    score = clampEfficiency(score + event.delta);
    cursorMs = event.atMs;
  }

  applyInactivePenalty(nowMs);
  return clampEfficiency(score);
};


const applyEfficiencyDecay = (score: number, fromMs: number, toMs: number, timeZone: string) => calculateEfficiencyScore(
  [{ atMs: fromMs, delta: clampEfficiency(score) }],
  toMs,
  fromMs,
  timeZone
);

const persistEfficiencyDelta = async (userId: string, delta: number) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { efficiencyScore: true, updatedAt: true, timeZone: true }
  });
  if (!user) return null;

  const nowMs = Date.now();
  const fromMs = user.updatedAt.getTime();
  const decayedScore = applyEfficiencyDecay(user.efficiencyScore ?? 0, fromMs, nowMs, user.timeZone || DEFAULT_TIMEZONE);
  const efficiencyScore = clampEfficiency(decayedScore + Math.max(0, delta));
  await prisma.user.update({ where: { id: userId }, data: { efficiencyScore } });
  return efficiencyScore;
};

const recalculateAndPersistEfficiency = async (userId: string) => {
  const now = new Date();
  const [user, tasks, habits, habitCompletions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { aiCredits: true, aiCreditsPeriod: true, timeZone: true } }),
    prisma.task.findMany({ where: { userId }, select: { parentTaskId: true, status: true, createdAt: true, updatedAt: true } }),
    prisma.habit.findMany({ where: { userId }, select: { createdAt: true, isAutoCompleted: true, autoCompletedAt: true } }),
    prisma.habitCompletion.findMany({ where: { userId }, select: { amount: true, completedAt: true, source: true } })
  ]);
  if (!user) return null;
  const resetAtMs = EFFICIENCY_RESET_AT.getTime();
  const nowMs = now.getTime();
  const userTimeZone = user.timeZone || DEFAULT_TIMEZONE;
  const isToday = (value: Date) => Number.isFinite(value.getTime())
    && value.getTime() >= resetAtMs
    && value.getFullYear() === now.getFullYear()
    && value.getMonth() === now.getMonth()
    && value.getDate() === now.getDate();
  const events: EfficiencyScoreEvent[] = [];

  for (const task of tasks) {
    if (isToday(task.createdAt)) {
      events.push({ atMs: task.createdAt.getTime(), delta: EFFICIENCY_BONUSES.createdTask });
    }

    if (task.status !== 'DONE' || !isToday(task.updatedAt)) continue;
    events.push({
      atMs: task.updatedAt.getTime(),
      delta: task.parentTaskId ? EFFICIENCY_BONUSES.doneSubtask : EFFICIENCY_BONUSES.doneTask
    });
  }

  for (const habit of habits) {
    if (isToday(habit.createdAt)) {
      events.push({ atMs: habit.createdAt.getTime(), delta: EFFICIENCY_BONUSES.createdHabit });
    }
    if (habit.isAutoCompleted && habit.autoCompletedAt && isToday(habit.autoCompletedAt)) {
      events.push({ atMs: habit.autoCompletedAt.getTime(), delta: EFFICIENCY_BONUSES.completedHabit });
    }
  }

  for (const completion of habitCompletions) {
    if (!isToday(completion.completedAt) || completion.source === 'AUTO_DURATION') continue;
    for (let index = 0; index < completion.amount; index += 1) {
      events.push({ atMs: completion.completedAt.getTime(), delta: EFFICIENCY_BONUSES.doneHabit });
    }
  }

  const spentCredits = Math.max(0, 100 - (user.aiCreditsPeriod ? user.aiCredits : 100));
  if (spentCredits > 0) {
    events.push({ atMs: nowMs, delta: spentCredits * EFFICIENCY_AI_CREDIT_BONUS });
  }

  const efficiencyScore = calculateEfficiencyScore(events, nowMs, resetAtMs, userTimeZone);
  await prisma.user.update({ where: { id: userId }, data: { efficiencyScore } });
  return efficiencyScore;
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

  const parsed = new URLSearchParams(initDataRaw);
  const hash = parsed.get('hash');
  if (!hash) {
    throw new Error('Missing hash in init data');
  }

  const pairs: string[] = [];
  parsed.forEach((value, key) => {
    if (key === 'hash') return;
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (expectedHash.length !== hash.length) {
    throw new Error('Invalid init data signature length');
  }
  const isValid = crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(hash));
  if (!isValid) {
    throw new Error('Invalid init data signature');
  }

  const authDateRaw = parsed.get('auth_date');
  const authDate = authDateRaw ? Number(authDateRaw) : Number.NaN;
  if (!Number.isFinite(authDate)) {
    throw new Error('Invalid auth_date in init data');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = 24 * 60 * 60;
  if (nowSeconds - authDate > maxAgeSeconds) {
    throw new Error('Init data is too old');
  }

  const userRaw = parsed.get('user');
  if (!userRaw) {
    throw new Error('Missing user in init data');
  }

  let user: { id: number; username?: string; first_name?: string; last_name?: string };
  try {
    user = JSON.parse(userRaw) as { id: number; username?: string; first_name?: string; last_name?: string };
  } catch {
    throw new Error('Invalid user payload in init data');
  }

  if (!user?.id) {
    throw new Error('Missing telegram user id in init data');
  }

  return user;
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
  if (!login || login.length < 3) {
    res.status(400).json({ error: 'Логин должен содержать минимум 3 символа' });
    return;
  }
  if (!passwordRaw || passwordRaw.length < 6) {
    res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
    return;
  }

  const exists = await prisma.user.findUnique({ where: { username: login } });
  if (exists) {
    res.status(409).json({ error: 'Логин уже занят' });
    return;
  }

  const passwordHash = authService.hashPassword(passwordRaw);
  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        username: login,
        passwordHash,
        name: nameRaw || login
      }
    });
    await onboardingService.ensureDefaultsForNewUser(createdUser.id, createdUser.createdAt, tx);
    return createdUser;
  });

  setAuthCookies(res, user);
  res.json({ user: toAuthUser(user) });
});

apiRouter.post('/auth/login', async (req, res) => {
  const login = sanitizeLogin(String(req.body?.login ?? ''));
  const password = String(req.body?.password ?? '');
  if (!login || !password) {
    res.status(400).json({ error: 'Укажите логин и пароль' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { username: login } });
  if (!user?.passwordHash || !authService.verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Неверный логин или пароль' });
    return;
  }

  setAuthCookies(res, user);
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

apiRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authService.cookieOptions(), maxAge: undefined });
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
      aiCredits: true,
      aiCreditsPeriod: true,
      createdAt: true
    }
  });

  res.json({ users });
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

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { aiCredits: { increment: creditsToAdd } },
    select: {
      id: true,
      aiCredits: true,
      aiCreditsPeriod: true
    }
  });

  res.json({ user: updatedUser });
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
      timeZone: true,
      morningAiCheckupEnabled: true,
      morningAiCheckupTime: true,
      efficiencyScore: true
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

  const efficiencyScore = await persistEfficiencyDelta(req.user!.id, delta);
  if (efficiencyScore === null) {
    res.status(404).json({ error: 'Пользователь не найден' });
    return;
  }

  res.json({ efficiencyScore });
});

apiRouter.get('/auth/me', async (req, res) => {
  if (req.user?.id) {
    await persistEfficiencyDelta(req.user.id, 0);
    const freshUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (freshUser) {
      res.json({ user: toAuthUser(freshUser) });
      return;
    }
  }

  if (req.user) {
    res.json({ user: toAuthUser(req.user) });
    return;
  }

  const user = await ensureDeviceUser(req, res);
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

apiRouter.get('/spheres', requireAuth, sphereController.list);
apiRouter.post('/spheres', requireAuth, sphereController.create);
apiRouter.patch('/spheres/:id', requireAuth, sphereController.update);
apiRouter.delete('/spheres/:id', requireAuth, sphereController.remove);
apiRouter.get('/tasks', requireAuth, taskController.list);
apiRouter.post('/tasks', requireAuth, taskController.create);
apiRouter.patch('/tasks/:id', requireAuth, taskController.update);
apiRouter.delete('/tasks/:id', requireAuth, taskController.remove);
apiRouter.get('/habits', requireAuth, habitController.list);
apiRouter.post('/habits', requireAuth, habitController.create);
apiRouter.patch('/habits/:id', requireAuth, habitController.update);
apiRouter.post('/habits/:id/complete', requireAuth, habitController.complete);
apiRouter.post('/habits/:id/uncomplete', requireAuth, habitController.uncomplete);
apiRouter.delete('/habits/:id', requireAuth, habitController.remove);
apiRouter.get('/tasks/:id/attachments', requireAuth, taskAttachmentController.list);
apiRouter.get('/tasks/:id/attachments/:attachmentId/download', requireAuth, taskAttachmentController.download);
apiRouter.post('/tasks/:id/attachments', requireAuth, taskAttachmentController.create);
apiRouter.delete('/tasks/:id/attachments/:attachmentId', requireAuth, taskAttachmentController.remove);
apiRouter.get('/dashboard/insights', requireAuth, async (req, res) => res.json(await insightService.list(req.user!.id)));

apiRouter.get('/ai-general-chat', requireAuth, aiController.getGeneralAssistantHistory);
apiRouter.post('/ai-general-chat', requireAuth, aiController.askGeneralAssistant);
apiRouter.post('/ai-general-chat/undo', requireAuth, aiController.undoGeneralAssistantAction);
apiRouter.get('/tasks/:id/ai-chat', requireAuth, aiController.getTaskAssistantHistory);
apiRouter.post('/tasks/:id/ai-chat', requireAuth, aiController.askTaskAssistant);
apiRouter.post('/tasks/:id/ai-chat/messages', requireAuth, aiController.appendTaskAssistantMessages);
apiRouter.post('/tasks/:id/ai-subtasks', requireAuth, aiController.generateSubtasks);
apiRouter.post('/tasks/:id/ai-overdue-nudge', requireAuth, aiController.generateOverdueTaskNudge);
apiRouter.post('/tasks/ai-generate', requireAuth, aiController.generateTaskFromPrompt);
apiRouter.post('/ai/parse-recurrence', requireAuth, aiController.parseRecurrence);
apiRouter.post('/timeline/ai-optimize', requireAuth, aiController.optimizeTimelineSchedule);
apiRouter.post('/timeline/ai-optimize/apply', requireAuth, aiController.applyTimelineOptimization);
apiRouter.post('/timeline/overdue-postpone-ai', requireAuth, aiController.postponeOverdueWithAi);

apiRouter.post('/telegram/webhook', telegramController.webhook);
