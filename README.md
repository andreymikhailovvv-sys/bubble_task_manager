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
# Опционально: переопределить модель (по умолчанию gpt-5-mini, быстрый режим)
# OPENAI_MODEL=gpt-5-mini
# Опционально: модель для режима "Полный ответ" (по умолчанию gpt-5.4)
# OPENAI_MODEL_FULL=gpt-5.4
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
