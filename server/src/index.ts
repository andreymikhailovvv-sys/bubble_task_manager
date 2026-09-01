import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';
import { authSession } from './middleware/auth.js';
import { passport } from './auth/passport.js';
import { telegramService } from './services/telegram.service.js';
import { prisma } from './db/prisma.js';
import { aiAssistantService } from './services/ai-assistant.service.js';

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

app.use(express.static(clientDist));
app.get('*', (_, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});


const telegramPollIntervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS ?? 60_000);
if (telegramService.isEnabled()) {
  setInterval(() => {
    telegramService.notifyShiningTasks().catch((error) => {
      console.error('[Telegram] notifyShiningTasks failed', error);
    });
  }, telegramPollIntervalMs).unref();
}

const CHECKUP_POLL_INTERVAL_MS = Number(process.env.AI_CHECKUP_POLL_INTERVAL_MS ?? 60_000);
const DEFAULT_CHECKUP_TIME = '10:00';
const CHECKUP_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
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
      select: { id: true, timeZone: true, morningAiCheckupTime: true, lastMorningAiCheckupDate: true }
    });

    for (const user of users) {
      const timeZone = user.timeZone || 'Europe/Moscow';
      const configuredTime = CHECKUP_TIME_PATTERN.test(user.morningAiCheckupTime) ? user.morningAiCheckupTime : DEFAULT_CHECKUP_TIME;
      const slot = formatLocalCheckupSlot(now, timeZone);
      if (slot.time !== configuredTime || user.lastMorningAiCheckupDate === slot.dateKey) continue;

      const claimed = await prisma.user.updateMany({
        where: {
          id: user.id,
          morningAiCheckupEnabled: true,
          OR: [{ lastMorningAiCheckupDate: null }, { NOT: { lastMorningAiCheckupDate: slot.dateKey } }]
        },
        data: { lastMorningAiCheckupDate: slot.dateKey }
      });
      if (claimed.count === 0) continue;

      try {
        const text = await aiAssistantService.generateDailyCheckup({ userId: user.id });
        await aiAssistantService.appendGeneralDialogMessages({
          userId: user.id,
          messages: [{ role: 'assistant', content: text }]
        });
        await telegramService.notifyDailyAiCheckup({ userId: user.id, text });
      } catch (error) {
        console.error(`[AI] daily checkup failed for userId=${user.id}`, error);
      }
    }
  })().catch((error) => {
    console.error('[AI] daily checkup failed', error);
  });
}, CHECKUP_POLL_INTERVAL_MS).unref();

app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on http://0.0.0.0:${port}`);
});
