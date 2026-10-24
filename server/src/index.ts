import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';
import { giftWishlistRouter } from './routes/gift-wishlist.js';
import { authSession } from './middleware/auth.js';
import { passport } from './auth/passport.js';
import { telegramService } from './services/telegram.service.js';
import { prisma } from './db/prisma.js';
import { reconcilePendingCreditPurchases } from './services/credit-purchase-recovery.service.js';
import { createAiCheckup } from './services/ai-checkup-delivery.service.js';
import { resolveAiCheckupSchedules } from './lib/ai-checkup-schedules.js';
import { Prisma } from '@prisma/client';
import { telegramUpdateQueue, TelegramUpdateWorker } from './services/telegram-update-queue.service.js';
import { telegramQuickShare } from './services/telegram-quick-share.service.js';
import { telegramAiMonitorWorker } from './services/telegram-ai-monitor-worker.service.js';
import { deliverTelegramAiBotNotifications } from './services/telegram-ai-inbox.service.js';
import { createPublicSeoPagesMiddleware } from './lib/public-seo-pages.js';
import { startTaskMonitoringWorker } from './services/task-monitoring-worker.service.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT?.trim() || '15mb';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CORS_ORIGINS = [
  'https://planirovych.ru',
  'https://www.planirovych.ru',
  'https://bubble-task-manager.onrender.com'
];
const URL_ENV_KEYS = ['APP_URL', 'PUBLIC_APP_URL', 'CLIENT_URL', 'CORS_ORIGIN'] as const;
const parseOriginList = (value: string | undefined) => (value ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedCorsOrigins = new Set([
  ...DEFAULT_CORS_ORIGINS,
  ...URL_ENV_KEYS.flatMap((key) => parseOriginList(process.env[key]))
]);

app.use(cors((req, callback) => {
  callback(null, {
    credentials: true,
    origin(originValue, originCallback) {
      if (!originValue || allowedCorsOrigins.has(originValue)) {
        originCallback(null, true);
        return;
      }

      console.warn(`[Auth/CORS] blocked origin=${originValue} method=${req.method} path=${req.originalUrl} host=${req.get('host') ?? 'unknown-host'} allowed=${Array.from(allowedCorsOrigins).join(',')}`);
      originCallback(new Error(`Origin ${originValue} is not allowed by CORS`));
    }
  });
}));
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(authSession);
app.use('/api/gift-wishlist', giftWishlistRouter);
app.use('/api', apiRouter);

app.use('/api', (error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const errorCode = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';
  const status = errorCode === 'P2025' ? 404 : 500;
  const message = status === 404
    ? 'Запрошенный объект не найден или уже изменён'
    : 'Не удалось выполнить запрос. Попробуйте ещё раз';

  console.error(`[API] ${req.method} ${req.originalUrl} failed`, error);
  res.status(status).json({ error: message });
});

const clientDist = process.env.CLIENT_DIST_PATH
  ? path.resolve(__dirname, process.env.CLIENT_DIST_PATH)
  : path.resolve(__dirname, '../../client/dist');

// Serve public HTML landing pages before the SPA fallback (static uses index:false).
app.get(['/birthday-wishlist', '/birthday-wishlist/'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.sendFile(path.join(clientDist, 'birthday-wishlist', 'index.html'));
});
app.use(createPublicSeoPagesMiddleware(clientDist));

// HTML must be revalidated after each Timeweb deployment. Bundled JS/CSS
// filenames carry content hashes and may keep their ordinary static caching.
app.use(express.static(clientDist, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, must-revalidate');
  }
}));
app.get('*', (_, res) => {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.sendFile(path.join(clientDist, 'index.html'));
});


// Payment confirmation may arrive while the customer has closed the page.
// Background recovery is deliberately independent of user requests and webhooks.
let paymentRecoveryRunning = false;
const runPaymentRecovery = async () => {
  if (paymentRecoveryRunning) return;
  paymentRecoveryRunning = true;
  try {
    const result = await reconcilePendingCreditPurchases();
    if (result.scanned) console.info('[Payments] pending purchase recovery cycle', result);
  } catch (error) {
    console.error('[Payments] pending purchase recovery cycle failed', {
      name: error instanceof Error ? error.name : 'UnknownError'
    });
  } finally {
    paymentRecoveryRunning = false;
  }
};
setTimeout(() => { void runPaymentRecovery(); }, 15_000).unref();
setInterval(() => { void runPaymentRecovery(); }, 60_000).unref();

const telegramPollIntervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS ?? 60_000);
setInterval(() => {
  telegramService.notifyShiningTasks().catch((error) => {
    console.error('[Notifications] notifyShiningTasks failed', error);
  });
}, telegramPollIntervalMs).unref();

// Event-driven queue: each monitored task owns an absolute persisted deadline.
// A lightweight safety tick watches the queue, never scans all overdue tasks.
startTaskMonitoringWorker();

const CHECKUP_POLL_INTERVAL_MS = Number(process.env.AI_CHECKUP_POLL_INTERVAL_MS ?? 60_000);
const formatLocalCheckupSlot = (date: Date, timeZone: string) => {
  const format = (targetTimeZone: string) => new Intl.DateTimeFormat('en-CA', {
    timeZone: targetTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone);
  } catch {
    parts = format('Europe/Moscow');
  }
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  return { dateKey: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
};

setInterval(() => {
  void (async () => {
    const now = new Date();
    const users = await prisma.user.findMany({
      where: { morningAiCheckupEnabled: true },
      select: { id: true, timeZone: true, morningAiCheckupTime: true, lastMorningAiCheckupDate: true, aiCheckupSchedules: true }
    });

    for (const user of users) {
      const timeZone = user.timeZone || 'Europe/Moscow';
      const local = formatLocalCheckupSlot(now, timeZone);
      const schedules = resolveAiCheckupSchedules(user.aiCheckupSchedules, user.morningAiCheckupTime);
      for (const schedule of schedules) {
        if (schedule.time !== local.time) continue;
        // Preserve the legacy one-per-day claim for users whose settings have
        // not yet migrated to the multi-checkup editor.
        if (schedule.id === 'legacy' && user.lastMorningAiCheckupDate === local.dateKey) continue;
        try {
          await prisma.aiCheckupRun.create({
            data: { userId: user.id, scheduleId: schedule.id, dateKey: local.dateKey }
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
          throw error;
        }
        try {
          await createAiCheckup({
            userId: user.id,
            requestId: 'daily-checkup:' + local.dateKey + ':' + schedule.id,
            instructions: schedule.instructions,
            sendTelegram: true
          });
        } catch (error) {
          // Retain the unique claim if generation fails. An automatic retry
          // in the same minute could otherwise duplicate paid AI requests.
          console.error(`[AI] scheduled checkup failed for userId=${user.id} scheduleId=${schedule.id}`, error);
        }
      }
    }
  })().catch((error) => {
    console.error('[AI] daily checkup failed', error);
  });
}, CHECKUP_POLL_INTERVAL_MS).unref();

app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on http://0.0.0.0:${port}`);
});

const telegramUpdateWorker = new TelegramUpdateWorker(
  telegramUpdateQueue,
  (payload) => telegramService.processWebhookUpdate(payload as Parameters<typeof telegramService.processWebhookUpdate>[0])
);
const runTelegramWorker = () => telegramUpdateWorker.drain().catch((error) => {
  console.error('[TelegramWorker] polling failed', error);
});
telegramUpdateQueue.recoverStaleJobs()
  .then((count) => {
    if (count > 0) console.info(`[TelegramWorker] recovered jobs=${count}`);
    return runTelegramWorker();
  })
  .catch((error) => console.error('[TelegramWorker] recovery failed', error));
setInterval(runTelegramWorker, Number(process.env.TELEGRAM_WORKER_POLL_INTERVAL_MS ?? 1_000)).unref();

// Durable personal-Telegram quick-share worker. Jobs survive closing the web
// window and container restarts; per-recipient audit makes delivery at-most-once.
const runTelegramQuickShare = () => telegramQuickShare.drain().catch(() => {
  console.warn('[TelegramQuickShare] queue poll failed');
});
setTimeout(runTelegramQuickShare, 3_000).unref();
setInterval(runTelegramQuickShare, 2_500).unref();

// Database-leased chat monitoring: at most one worker owns a chat at a time,
// even when the application runs in multiple replicas. Disabled by default
// per chat; no environment variable or separate Telegram connection required.
const runTelegramAiMonitor = () => telegramAiMonitorWorker.drain().catch(() => {
  console.warn('[TelegramMonitor] scheduler iteration failed');
});
setTimeout(runTelegramAiMonitor, 8_000).unref();
setInterval(runTelegramAiMonitor, 10_000).unref();

// Durable outgoing summaries to the linked Telegram bot, distinct from
// monitored peers. Each event is claimed at most once across replicas.
const sendTelegramAssistantInbox = () => deliverTelegramAiBotNotifications().catch(() => {
  console.warn('[TelegramAIInbox] delivery iteration failed');
});
setTimeout(sendTelegramAssistantInbox, 10_000).unref();
setInterval(sendTelegramAssistantInbox, 20_000).unref();
