import { Router } from 'express';
import { sphereController } from '../controllers/sphere.controller.js';
import { taskController } from '../controllers/task.controller.js';
import { taskAttachmentController } from '../controllers/task-attachment.controller.js';
import { insightService } from '../services/insight.service.js';
import { aiController } from '../controllers/ai.controller.js';
import { isGoogleAuthEnabled, passport } from '../auth/passport.js';
import { AUTH_COOKIE_NAME, DEVICE_COOKIE_NAME, authService } from '../auth/auth.service.js';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../db/prisma.js';

export const apiRouter = Router();

const sanitizeLogin = (value: string) => value.trim().toLowerCase();

const toAuthUser = (user: {
  id: string;
  email?: string | null;
  username?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  googleSub?: string | null;
  deviceId?: string | null;
}) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  name: user.name,
  avatarUrl: user.avatarUrl,
  googleSub: user.googleSub,
  deviceId: user.deviceId
});

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

const ensureDeviceUser = async (req: any, res: any) => {
  const deviceId = authService.resolveDeviceId(req);

  let user = await prisma.user.findUnique({ where: { deviceId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        deviceId,
        name: 'Локальный пользователь'
      }
    });
  }

  res.cookie(DEVICE_COOKIE_NAME, deviceId, authService.deviceCookieOptions());
  setAuthCookies(res, user);
  return user;
};

apiRouter.get('/health', (_, res) => res.json({ ok: true, service: 'bubble-task-manager', date: new Date().toISOString() }));

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
  const user = await prisma.user.create({
    data: {
      username: login,
      passwordHash,
      name: nameRaw || login
    }
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

apiRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authService.cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

apiRouter.get('/auth/me', async (req, res) => {
  if (req.user) {
    res.json({ user: req.user });
    return;
  }

  const user = await ensureDeviceUser(req, res);
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
apiRouter.get('/tasks/:id/attachments', requireAuth, taskAttachmentController.list);
apiRouter.get('/tasks/:id/attachments/:attachmentId/download', requireAuth, taskAttachmentController.download);
apiRouter.post('/tasks/:id/attachments', requireAuth, taskAttachmentController.create);
apiRouter.delete('/tasks/:id/attachments/:attachmentId', requireAuth, taskAttachmentController.remove);
apiRouter.get('/dashboard/insights', requireAuth, async (req, res) => res.json(await insightService.list(req.user!.id)));

apiRouter.get('/tasks/:id/ai-chat', requireAuth, aiController.getTaskAssistantHistory);
apiRouter.post('/tasks/:id/ai-chat', requireAuth, aiController.askTaskAssistant);
apiRouter.post('/tasks/:id/ai-subtasks', requireAuth, aiController.generateSubtasks);
apiRouter.post('/tasks/:id/ai-overdue-nudge', requireAuth, aiController.generateOverdueTaskNudge);
apiRouter.post('/tasks/ai-generate', requireAuth, aiController.generateTaskFromPrompt);
