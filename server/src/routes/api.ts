import { Router } from 'express';
import { sphereController } from '../controllers/sphere.controller.js';
import { taskController } from '../controllers/task.controller.js';
import { insightService } from '../services/insight.service.js';
import { aiController } from '../controllers/ai.controller.js';
import { passport } from '../auth/passport.js';
import { AUTH_COOKIE_NAME, authService } from '../auth/auth.service.js';
import { requireAuth } from '../middleware/auth.js';

export const apiRouter = Router();

apiRouter.get('/health', (_, res) => res.json({ ok: true, service: 'bubble-task-manager', date: new Date().toISOString() }));

apiRouter.get('/auth/google', passport.authenticate('google', { scope: ['openid', 'email', 'profile'], session: false }));

apiRouter.get(
  '/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/me' }),
  (req, res) => {
    const user = req.user as {
      id: string;
      email: string;
      name?: string | null;
      avatarUrl?: string | null;
      googleSub: string;
    };

    const token = authService.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      googleSub: user.googleSub
    });

    res.cookie(AUTH_COOKIE_NAME, token, authService.cookieOptions());
    res.redirect('/');
  }
);

apiRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...authService.cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

apiRouter.get('/spheres', requireAuth, sphereController.list);
apiRouter.post('/spheres', requireAuth, sphereController.create);
apiRouter.patch('/spheres/:id', requireAuth, sphereController.update);
apiRouter.delete('/spheres/:id', requireAuth, sphereController.remove);
apiRouter.get('/tasks', requireAuth, taskController.list);
apiRouter.post('/tasks', requireAuth, taskController.create);
apiRouter.patch('/tasks/:id', requireAuth, taskController.update);
apiRouter.delete('/tasks/:id', requireAuth, taskController.remove);
apiRouter.get('/dashboard/insights', requireAuth, async (req, res) => res.json(await insightService.list(req.user!.id)));

apiRouter.post('/tasks/:id/ai-chat', requireAuth, aiController.askTaskAssistant);
