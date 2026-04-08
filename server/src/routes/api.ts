import { Router } from 'express';
import { sphereController } from '../controllers/sphere.controller.js';
import { taskController } from '../controllers/task.controller.js';
import { insightService } from '../services/insight.service.js';
import { aiController } from '../controllers/ai.controller.js';

export const apiRouter = Router();

apiRouter.get('/health', (_, res) => res.json({ ok: true, service: 'bubble-task-manager', date: new Date().toISOString() }));
apiRouter.get('/spheres', sphereController.list);
apiRouter.post('/spheres', sphereController.create);
apiRouter.patch('/spheres/:id', sphereController.update);
apiRouter.delete('/spheres/:id', sphereController.remove);
apiRouter.get('/tasks', taskController.list);
apiRouter.post('/tasks', taskController.create);
apiRouter.patch('/tasks/:id', taskController.update);
apiRouter.delete('/tasks/:id', taskController.remove);
apiRouter.get('/dashboard/insights', async (_, res) => res.json(await insightService.list()));

apiRouter.post('/tasks/:id/ai-chat', aiController.askTaskAssistant);
