import type { PlanikMode } from '../components/PlanikMascot';
export type AdvancedLesson = 'ai' | 'features';
export type PracticeKind = 'quick' | 'recurrence' | 'monitor' | 'optimize' | 'checkup' | 'focus' | 'focus-timer' | 'telegram' | 'skins';
export type AdvancedTrainingConfig = { id: string; text: string; target?: string; allow?: string; action?: boolean; center?: boolean; practice?: PracticeKind; surface?: string; skin?: string; done?: boolean };
export const BASIC_OFFER_MARKER = 'basic-onboarding-v1-seen';
export const BASIC_LESSON_ID = 'basic';
export const trainingOfferKey = (userId: string) => 'btm:' + userId + ':basic-onboarding-v1-seen';
export const AI_GUIDED_STEPS: AdvancedTrainingConfig[] = [
  { id: 'ai-intro', center: true, text: 'Теперь познакомимся с моими возможностями. Я помогу тебе не только ответами, но и работой с задачами, расписанием и файлами. Все упражнения в этом уроке бесплатные и учебные.' },
  { id: 'ai-quick-chat', surface: 'ai-quick-chat', target: '[data-tour="quick-ai"]', text: 'Это быстрый чат. Он удобен для коротких вопросов, небольших поручений и поиска задач. Давай попробуем отправить учебный запрос.', practice: 'quick', action: true },
  { id: 'ai-full-chat', surface: 'ai-full-chat', target: '[data-tour="ai-full-chat"]', text: 'В общем чате можно вести отдельные проекты и беседы, выбирать модели, прикладывать файлы и просить меня подготовить документы. Модели отличаются возможностями и расходом лимитов.' },
  { id: 'ai-task-help', surface: 'ai-task-help', target: '[data-tour="ai-task-help"]', text: 'У каждой задачи есть свой чат. Я учитываю её описание, подзадачи и переписку. Могу предложить план действий, отредактировать описание или создать подзадачи.' },
  { id: 'ai-monitor-button', surface: 'ai-monitor-button', target: '[data-tour="ai-monitor-button"]', text: 'Для особо важных задач есть автомониторинг. Я могу следить за ходом работы и напоминать о задаче по твоим инструкциям. Доступность зависит от подписки.' },
  { id: 'ai-monitor-model', surface: 'ai-monitor-model', target: '[data-tour="ai-monitor-window"]', text: 'Выбери пример режима мониторинга. Для простых напоминаний достаточно быстрой модели, для сложных поручений пригодится более мощная. Реальный мониторинг сейчас не включится.', practice: 'monitor', action: true },
  { id: 'ai-recurrence', surface: 'ai-recurrence', target: '[data-tour="ai-recurrence"]', text: 'Повторение задачи можно задать обычными словами. Напиши, по каким дням и во сколько она должна повторяться.', practice: 'recurrence', action: true },
  { id: 'ai-optimize', surface: 'ai-optimize', target: '[data-tour="ai-optimize"]', text: 'В таймлайне можно оптимизировать расписание с учётом выбранного периода. Попробуй указать пожелание к учебному расписанию.', practice: 'optimize', action: true },
  { id: 'ai-checkup', surface: 'ai-checkup', target: '[data-tour="ai-checkup-settings"]', text: 'ИИ-чекап — это регулярная сводка по ближайшим и просроченным задачам, конфликтам и возможным исправлениям. Выбери удобное время для учебного примера.', practice: 'checkup', action: true },
  { id: 'ai-done', center: true, done: true, text: 'Отлично! Теперь ты знаешь, как поручать мне работу и управлять ИИ-возможностями. Учебные запросы не списали кредиты, а твои настройки остались прежними.' }
];
export const FEATURE_GUIDED_STEPS: AdvancedTrainingConfig[] = [
  { id: 'feature-intro', center: true, text: 'Покажу дополнительные возможности Планировыча: продуктивность, концентрацию, интеграции и мои образы.' },
  { id: 'feature-rating', surface: 'feature-rating', target: '[data-tour="feature-rating"]', text: 'Это рейтинг эффективности. Он растёт за выполнение задач, привычек, работу с ИИ и концентрацию. За выполненные уроки тоже предусмотрена награда.' },
  { id: 'feature-focus-button', surface: 'feature-focus-button', target: '[data-tour="feature-focus-button"]', allow: '[data-tour="feature-focus-button"]', action: true, text: 'Нажми кнопку «Фокус». Попробуем выбрать, над чем работать, без запуска настоящего таймера.' },
  { id: 'feature-focus-setup', surface: 'feature-focus-setup', target: '[data-tour="feature-focus-setup"]', text: 'В фокусе можно выбрать от одной до пяти задач. Отметь хотя бы одну учебную задачу.', practice: 'focus', action: true },
  { id: 'feature-focus-timer', target: '[data-tour="feature-focus-button"]', text: 'Укажи длительность учебной сессии. В настоящем режиме таймер продолжает работать даже после сворачивания окна.', practice: 'focus-timer', action: true },
  { id: 'feature-focus-task', target: '[data-tour="feature-focus-button"]', text: 'В режиме концентрации можно переключаться между выбранными задачами. За их выполнение начисляется дополнительный рейтинг. Чат с ИИ учитывает текущую задачу.' },
  { id: 'feature-telegram-button', target: '[data-tour="integration-bot"]', surface: 'feature-integration-bot', text: 'Telegram-бот позволяет получать уведомления, управлять задачами и привычками, отправлять голосовые и пользоваться Mini App.' },
  { id: 'feature-telegram-qr', target: '[data-tour="integration-bot"]', surface: 'feature-integration-bot', text: 'Для подключения нажми «Подключить» и отсканируй QR-код в Telegram. Также доступен вход в @planirovych_bot. В рамках урока мы не привязываем аккаунт.' },
  { id: 'feature-integration-send', target: '[data-tour="integration-messages"]', surface: 'feature-integration-send', text: 'Я могу подготовить сообщение для Telegram от твоего имени. Перед отправкой ты проверяешь получателя и текст. Подтверди учебный пример — сообщение никуда не уйдёт.', practice: 'telegram', action: true },
  { id: 'feature-integration-telegram-ai', target: '[data-tour="integration-assistant"]', surface: 'feature-integration-telegram-ai', text: 'ИИ-ассистент Telegram анализирует только выбранные тобой переписки, предлагает ответы, сводки и задачи. Ты задаёшь правила, режим работы и лимиты.' },
  { id: 'feature-integration-mail', target: '[data-tour="integration-email"]', surface: 'feature-integration-mail', text: 'Почтовый помощник работает с подключённой почтой Яндекса или Mail.ru. Он помогает находить письма, готовить сводки и предложения по задачам.' },
  { id: 'feature-skins-intro', target: '.mascot-wardrobe-anchor', text: 'У меня есть гардероб! Наведи курсор на помощника и открой «Аксессуары и скины». Смотри, как я могу выглядеть. Классический образ, Котик концентрации и Маэстро привычек бесплатны.' },
  { id: 'feature-skins-preview', target: '.mascot-wardrobe-anchor', skin: 'pirate', text: 'Некоторые образы доступны по подписке «Про», а особые — по подписке «Максимум». Примерять любые скины и смотреть их анимации можно бесплатно.' },
  { id: 'feature-skins-space', target: '.mascot-wardrobe-anchor', skin: 'space', text: 'У каждого образа свои детали и движения. Например, космонавт летает в невесомости, а ниндзя исчезает в дыму.' },
  { id: 'feature-skins-practice', target: '.mascot-wardrobe-anchor', text: 'Теперь твоя очередь: выбери другой скин и запусти одну из его анимаций. Это примерка — твой сохранённый образ не изменится.', practice: 'skins', action: true },
  { id: 'feature-done', center: true, done: true, text: 'Готово! Теперь ты знаешь, как концентрироваться, подключать сервисы и менять мой внешний вид. Увидимся в рабочем пространстве!' }
];
export const guidedSteps = (lesson: AdvancedLesson) => lesson === 'ai' ? AI_GUIDED_STEPS : FEATURE_GUIDED_STEPS;
export const nextGuidedStep = (lesson: AdvancedLesson, id: string) => {
  const steps = guidedSteps(lesson);
  const index = steps.findIndex(step => step.id === id);
  return index < 0 ? undefined : steps[index + 1];
};
export const TRAINING_SKINS = [
  { id: 'classic', name: 'Верный помощник', rank: 0 },
  { id: 'cat', name: 'Котик концентрации', rank: 0 },
  { id: 'maestro', name: 'Маэстро привычек', rank: 0 },
  { id: 'northern', name: 'Полярник фокуса', rank: 2 },
  { id: 'zoomer', name: 'Зумер рабочего потока', rank: 2 },
  { id: 'pirate', name: 'Расхититель задач', rank: 2 },
  { id: 'wizard', name: 'Астролог приоритетов', rank: 3 },
  { id: 'ninja', name: 'Ниндзя дедлайнов', rank: 3 },
  { id: 'space', name: 'Космонавт продуктивности', rank: 3 }
] as const;
export const TRAINING_ANIMATIONS: { id: Exclude<PlanikMode, 'showcase'>; name: string }[] = [
  { id: 'idle', name: 'Ожидание' }, { id: 'thinking', name: 'Думает' },
  { id: 'hover', name: 'Наведение' }, { id: 'typing', name: 'Ответ' }, { id: 'celebrating', name: 'Радость' }
];
