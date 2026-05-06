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
let lastCheckupSlotKey = '';
setInterval(() => {
  const now = new Date();
  const mskNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const hh = mskNow.getHours();
  const mm = mskNow.getMinutes();
  if (hh !== 10 || mm !== 0) return;
  const slotKey = `${mskNow.getFullYear()}-${mskNow.getMonth() + 1}-${mskNow.getDate()}`;
  if (slotKey === lastCheckupSlotKey) return;
  lastCheckupSlotKey = slotKey;
  void (async () => {
    const users = await prisma.user.findMany({ select: { id: true } });
    for (const user of users) {
      const text = await aiAssistantService.generateDailyCheckup({ userId: user.id });
      await aiAssistantService.appendGeneralDialogMessages({
        userId: user.id,
        messages: [{ role: 'assistant', content: text }]
      });
      await telegramService.notifyDailyAiCheckup({ userId: user.id, text });
    }
  })().catch((error) => {
    console.error('[AI] daily checkup failed', error);
  });
}, CHECKUP_POLL_INTERVAL_MS).unref();

app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
