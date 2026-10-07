import { prisma } from '../db/prisma.js';

const CHARGE_BILLING_MODE = 'CHARGE';
const DAY_MS = 24 * 60 * 60 * 1000;

const FEATURE_LABELS: Record<string, string> = {
  ai_chat: 'Общий чат с ИИ',
  ai_chat_planner: 'Планирование в AI-чате',
  task_chat: 'Помощь ИИ в задаче',
  general_assistant: 'Быстрые запросы и управление задачами',
  recurrence: 'Настройка повторения',
  generate_subtasks: 'Создание подзадач',
  generate_task: 'Создание задачи',
  optimize_timeline: 'Оптимизация таймлайна',
  overdue_postpone: 'Перенос просроченных задач',
  overdue_nudge: 'Подсказка по просроченной задаче',
  daily_checkup: 'Утренний ИИ-чекап',
  audio_transcription: 'Расшифровка голосового',
  web_search: 'Веб-поиск'
};

const MODEL_LABELS: Record<string, string> = {
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gpt-6-luna': 'GPT-6 Luna',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5-mini': 'GPT-5 Mini',
  'gpt-5-nano': 'GPT-5 Nano',
  'gpt-4o-mini-transcribe': 'GPT-4o Mini Transcribe',
  'gpt-4o-transcribe': 'GPT-4o Transcribe',
  'gpt-4o-transcribe-diarize': 'GPT-4o Transcribe Diarize',
  'openai-web-search': 'Веб-поиск',
  'fixed-credit': 'Системная ИИ-функция'
};

type CreditChargeEvent = {
  id: string;
  requestId: string;
  actionId: string | null;
  feature: string;
  model: string;
  estimatedCreditsMilli: number | null;
  createdAt: Date;
};

export type CreditUsageBreakdownItem = {
  key: string;
  label: string;
  creditsMilli: number;
};

export type CreditUsageDailyItem = {
  date: string;
  creditsMilli: number;
};

export type CreditUsageStatistics = {
  todayCreditsMilli: number;
  weekCreditsMilli: number;
  monthCreditsMilli: number;
  averageDailyCreditsMilli: number;
  byModel: CreditUsageBreakdownItem[];
  byFeature: CreditUsageBreakdownItem[];
  daily: CreditUsageDailyItem[];
  trackingStartedAt: string | null;
};

export type CreditUsageExportRow = {
  date: string;
  time: string;
  feature: string;
  model: string;
  creditsMilli: number;
};

const safeTimeZone = (timeZone?: string | null) => {
  const candidate = timeZone?.trim() || 'Europe/Moscow';
  try {
    Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'Europe/Moscow';
  }
};

const localDateKey = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const localTimeLabel = (date: Date, timeZone: string) => new Intl.DateTimeFormat('ru-RU', {
  timeZone,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
}).format(date);

const shiftDateKey = (dateKey: string, deltaDays: number) => {
  const base = new Date(`${dateKey}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
};

const dateKeySet = (todayKey: string, days: number) =>
  new Set(Array.from({ length: days }, (_, index) => shiftDateKey(todayKey, -index)));

const featureLabel = (feature: string) => FEATURE_LABELS[feature] ?? feature.replaceAll('_', ' ');

const modelLabel = (model: string) => {
  const normalized = model.trim().toLowerCase();
  const exact = MODEL_LABELS[normalized];
  if (exact) return exact;
  const known = Object.entries(MODEL_LABELS)
    .filter(([key]) => key !== 'fixed-credit')
    .sort(([left], [right]) => right.length - left.length)
    .find(([key]) => normalized === key || normalized.startsWith(`${key}-`));
  return known?.[1] ?? model;
};

const chargeAmount = (event: CreditChargeEvent) => Math.max(0, event.estimatedCreditsMilli ?? 0);

const sortBreakdown = (items: Map<string, number>, labelFor: (key: string) => string): CreditUsageBreakdownItem[] =>
  [...items.entries()]
    .filter(([, creditsMilli]) => creditsMilli > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([key, creditsMilli]) => ({ key, label: labelFor(key), creditsMilli }));

export async function getCreditUsageStatistics(userId: string): Promise<CreditUsageStatistics> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timeZone: true }
  });
  if (!user) throw new Error('User not found');

  const timeZone = safeTimeZone(user.timeZone);
  const now = new Date();
  const todayKey = localDateKey(now, timeZone);
  const weekKeys = dateKeySet(todayKey, 7);
  const monthKeys = dateKeySet(todayKey, 30);
  const queryStart = new Date(now.getTime() - 32 * DAY_MS);

  const events = await prisma.aiUsageEvent.findMany({
    where: {
      userId,
      billingMode: CHARGE_BILLING_MODE,
      estimatedCreditsMilli: { gt: 0 },
      createdAt: { gte: queryStart }
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      requestId: true,
      actionId: true,
      feature: true,
      model: true,
      estimatedCreditsMilli: true,
      createdAt: true
    }
  });

  let todayCreditsMilli = 0;
  let weekCreditsMilli = 0;
  let monthCreditsMilli = 0;
  const modelTotals = new Map<string, number>();
  const featureTotals = new Map<string, number>();
  const dailyTotals = new Map<string, number>();

  for (const event of events) {
    const amount = chargeAmount(event);
    if (amount <= 0) continue;
    const dateKey = localDateKey(event.createdAt, timeZone);
    if (dateKey === todayKey) todayCreditsMilli += amount;
    if (weekKeys.has(dateKey)) weekCreditsMilli += amount;
    if (!monthKeys.has(dateKey)) continue;
    monthCreditsMilli += amount;
    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + amount);
    modelTotals.set(event.model, (modelTotals.get(event.model) ?? 0) + amount);
    featureTotals.set(event.feature, (featureTotals.get(event.feature) ?? 0) + amount);
  }

  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = shiftDateKey(todayKey, -(29 - index));
    return { date, creditsMilli: dailyTotals.get(date) ?? 0 };
  });

  return {
    todayCreditsMilli,
    weekCreditsMilli,
    monthCreditsMilli,
    averageDailyCreditsMilli: Math.round(monthCreditsMilli / 30),
    byModel: sortBreakdown(modelTotals, modelLabel),
    byFeature: sortBreakdown(featureTotals, featureLabel),
    daily,
    trackingStartedAt: events[0]?.createdAt.toISOString() ?? null
  };
}

export async function getMonthlyCreditUsageExport(userId: string, month: string): Promise<{ timeZone: string; rows: CreditUsageExportRow[] }> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new TypeError('Месяц должен быть в формате YYYY-MM');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
  if (!user) throw new Error('User not found');
  const timeZone = safeTimeZone(user.timeZone);
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || monthNumber < 1 || monthNumber > 12) throw new TypeError('Некорректный месяц');

  const broadStart = new Date(Date.UTC(year, monthNumber - 1, 1) - 2 * DAY_MS);
  const broadEnd = new Date(Date.UTC(year, monthNumber, 1) + 2 * DAY_MS);
  const events = await prisma.aiUsageEvent.findMany({
    where: {
      userId,
      billingMode: CHARGE_BILLING_MODE,
      estimatedCreditsMilli: { gt: 0 },
      createdAt: { gte: broadStart, lt: broadEnd }
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      requestId: true,
      actionId: true,
      feature: true,
      model: true,
      estimatedCreditsMilli: true,
      createdAt: true
    }
  });

  const rows = events
    .filter((event) => localDateKey(event.createdAt, timeZone).slice(0, 7) === month && chargeAmount(event) > 0)
    .map((event) => ({
      date: localDateKey(event.createdAt, timeZone),
      time: localTimeLabel(event.createdAt, timeZone),
      feature: featureLabel(event.feature),
      model: modelLabel(event.model),
      creditsMilli: chargeAmount(event)
    }));

  return { timeZone, rows };
}

const xmlEscape = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export function buildCreditUsageExcelXml(input: {
  userLabel: string;
  month: string;
  timeZone: string;
  rows: CreditUsageExportRow[];
}) {
  const totalMilli = input.rows.reduce((sum, row) => sum + row.creditsMilli, 0);
  const row = (cells: Array<{ value: string | number; type?: 'String' | 'Number' }>) =>
    `<Row>${cells.map((cell) => `<Cell><Data ss:Type="${cell.type ?? (typeof cell.value === 'number' ? 'Number' : 'String')}">${xmlEscape(String(cell.value))}</Data></Cell>`).join('')}</Row>`;
  let currentDate = '';
  const dataRows = input.rows.map((item) => {
    const daySeparator = item.date !== currentDate
      ? (currentDate = item.date, row([{ value: `День: ${item.date}` }, { value: '' }, { value: '' }, { value: '' }, { value: '' }]))
      : '';
    return daySeparator + row([
      { value: item.date },
      { value: item.time },
      { value: item.feature },
      { value: item.model },
      { value: Math.round(item.creditsMilli) / 1000, type: 'Number' }
    ]);
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Траты кредитов">
  <Table>
   ${row([{ value: 'Пользователь' }, { value: input.userLabel }])}
   ${row([{ value: 'Месяц' }, { value: input.month }])}
   ${row([{ value: 'Часовой пояс' }, { value: input.timeZone }])}
   ${row([{ value: '' }])}
   ${row([{ value: 'Дата' }, { value: 'Время' }, { value: 'На что списано' }, { value: 'Модель' }, { value: 'Кредиты' }])}
   ${dataRows}
   ${row([{ value: '' }, { value: '' }, { value: 'Итого' }, { value: '' }, { value: Math.round(totalMilli) / 1000, type: 'Number' }])}
  </Table>
 </Worksheet>
</Workbook>`;
}
