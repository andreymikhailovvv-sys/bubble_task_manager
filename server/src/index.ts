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

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(authSession);
app.use('/api', apiRouter);

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

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
