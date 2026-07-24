# Bubble Task Manager (MVP)

Monorepo с frontend (React + Vite + TypeScript) и backend (Express + Prisma + SQLite), где задачи визуализируются как пузырьки в общем поле или радиальных секторах.

## Стек
- `client`: React, TypeScript, Vite, Tailwind CSS, Framer Motion
- `server`: Node.js, Express, TypeScript, Prisma
- БД: SQLite (через Prisma)
- Деплой: Render Web Service (single service)

## Структура
```
/
  client/
  server/
  package.json
  render.yaml
  README.md
```

## ENV
Создайте `server/.env`:
```env
PORT=4000
DATABASE_URL="file:./dev.db"
CLIENT_DIST_PATH=../client/dist
OPENAI_API_KEY=your_openai_api_key
# Опционально: переопределить модель (по умолчанию gpt-5.4-mini, быстрый режим)
# OPENAI_MODEL=gpt-5.4-mini
# Опционально: модель для режима "Полный ответ" (по умолчанию gpt-5.4)
# OPENAI_MODEL_FULL=gpt-5.4
# Telegram bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
# Username бота без @, используется для QR/deep-link подключения аккаунта
TELEGRAM_BOT_USERNAME=your_bot_username_without_at
# Опционально, но рекомендуется для защиты webhook
TELEGRAM_WEBHOOK_SECRET=your_random_secret
# Интервал проверки «сияющих» задач в мс (по умолчанию 60000)
TELEGRAM_POLL_INTERVAL_MS=60000
```

## Локальный запуск
1. Установка зависимостей:
```bash
npm install
```
2. Сгенерировать Prisma client и выполнить миграцию:
```bash
npm run db:migrate
```
3. Наполнить демо-данными:
```bash
npm run db:seed
```
4. Запуск frontend + backend:
```bash
npm run dev
```
Откройте `http://localhost:5173`.

## Production / single-service
Backend отдает статические файлы из `client/dist`, поэтому приложение запускается одним сервисом:
```bash
npm run build
npm run start
```
Откройте `http://localhost:4000`.

## Deploy на Render
1. Подключите GitHub репозиторий в Render.
2. Используйте `render.yaml` (Blueprint deploy).
3. Render выполнит:
   - `npm install`
   - `npm run build`
   - `npm run db:migrate`
   - `npm run db:seed`
4. Health check: `/api/health`

> На free-tier файловая система эфемерная. SQLite база будет пересоздаваться при redeploy/restart. Для persistence переходите на managed Postgres.

## Миграция на Postgres позже
1. Измените `DATABASE_URL` на postgres-строку.
2. В `server/prisma/schema.prisma` замените provider datasource `sqlite` -> `postgresql`.
3. Выполните новые миграции Prisma.
4. Код API и сервисов менять не нужно, т.к. доступ к данным идет через Prisma service layer.

## Реализовано в MVP
- CRUD сфер и задач
- Визуализация задач пузырьками
- Режимы: общий и секторный
- Фильтры (сфера/статус), поиск
- Zoom колесом, pan перетаскиванием
- Анимации появления/перестроения/hover
- Заглушки AI + локальная эвристика приоритизации
- AI-чат по задаче в hover-окне пузыря (с памятью диалога в рамках сессии)
- Insights endpoint `/api/dashboard/insights`



## Telegram Mini App
- Мини-приложение доступно по пути: `${PUBLIC_APP_URL}/miniapp`.
- Авторизация в мини-приложении выполняется через Telegram `initData` и поиск пользователя по `telegramChatId` в БД.
- Если задачи не отображаются, сначала авторизуйтесь в боте (`/start` → «Войти» → `логин пароль`), чтобы связать Telegram с аккаунтом.
- На мини-экране доступны:
  - просмотр списка задач;
  - группировка задач по секторам;
  - фильтр по времени (сегодня/завтра/7 дней/30 дней);
  - раскрытие карточки с дедлайном, описанием и подзадачами;
  - редактирование названия, описания и срока для задачи и подзадач.
- Ярлык мини-приложения можно добавить на главный экран телефона:
  - в мини-приложении откройте настройки и нажмите «Добавить ярлык»;
  - пункт «Настройки» в меню `⋯` запускает тот же вызов добавления ярлыка, потому что Telegram не даёт мини-приложению переименовать этот пункт в «Создать ярлык»;
  - приложение не блокирует повторные попытки по статусу `added` и всегда отправляет запрос на добавление ярлыка заново;
  - пункт «Создать ярлык» в системном меню показывает сам клиент Telegram и только на поддерживаемых устройствах/версиях, мини-приложение не может добавить этот пункт принудительно.

## Подключение Telegram webhook
1. Создайте бота у @BotFather и получите токен.
2. В `server/.env` добавьте `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (username бота без `@`) и (рекомендуется) `TELEGRAM_WEBHOOK_SECRET`.
3. После деплоя установите webhook:
```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "${PUBLIC_APP_URL}/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```
4. Для проверки статуса:
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```
5. В боте отправьте `/start`, затем нажмите «Войти» и отправьте одним сообщением: `<логин> <пароль>`.
