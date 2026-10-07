import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('новость о статистике кредитов опубликована поверх новости о совместных задачах', async () => {
  const updates = await readFile(new URL('../../client/src/components/UpdatesMenu.tsx', import.meta.url), 'utf8');
  const creditIndex = updates.indexOf('Теперь можно посмотреть, куда уходят AI-кредиты');
  const collaborationIndex = updates.indexOf('Совместные задачи стали удобнее для общения');
  assert.ok(creditIndex >= 0);
  assert.ok(collaborationIndex > creditIndex);
  assert.match(updates, /LATEST_NEWS_ID = '2026-10-07-credit-usage-statistics'/);
});

test('переключатель кредитов адаптирован под светлую тему сайта и Mini App', async () => {
  const [web, mini, styles] = await Promise.all([
    readFile(new URL('../../client/src/App.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(web, /credit-view-toggle/);
  assert.match(mini, /credit-view-toggle/);
  assert.match(styles, /body\[data-theme='light'\] \.credit-view-toggle/);
  assert.match(styles, /miniapp-shell\.miniapp-light \.credit-view-toggle/);
  assert.match(styles, /miniapp-credit-popover-hero/);
});

test('Mini App закрывает окно кредитов при прокрутке основного экрана', async () => {
  const mini = await readFile(new URL('../../client/src/MiniApp.tsx', import.meta.url), 'utf8');
  assert.match(mini, /onScroll=\{\(event\) => \{[\s\S]*setIsCreditPurchaseOpen\(false\)/);
  assert.match(mini, /miniapp-credit-popover[\s\S]*onTouchMove/);
});

test('админская рассылка поддерживает аудитории, подписки и изображения', async () => {
  const [schema, routes, telegram, admin, api] = await Promise.all([
    readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/api.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/telegram.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/AdminPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../client/src/lib/api.ts', import.meta.url), 'utf8')
  ]);

  assert.match(schema, /subscriptionPlan String @default\("free"\)/);
  assert.match(routes, /ADMIN_BROADCAST_TARGETS = \['user', 'all', 'paid', 'free'\]/);
  assert.match(routes, /\/admin\/broadcasts/);
  assert.match(routes, /subscriptionPlan: \{ in: \[\.\.\.SUBSCRIPTION_PLAN_KEYS\] \}/);
  assert.match(telegram, /sendPhoto/);
  assert.match(telegram, /sendAdminBroadcast/);
  assert.match(admin, /Рассылка в Telegram-боте «Планировыч»/);
  assert.match(admin, /Прикрепить изображение/);
  assert.match(admin, /Тариф для сегментации рассылок/);
  assert.match(api, /adminSendBroadcast/);
  assert.match(api, /adminSetSubscriptionPlan/);
});
