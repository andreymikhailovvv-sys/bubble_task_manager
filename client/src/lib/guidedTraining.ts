import type { PlanikMode } from '../components/PlanikMascot';
export type AdvancedLesson = 'ai' | 'features';
export type PracticeKind = 'quick' | 'recurrence' | 'monitor' | 'optimize' | 'checkup' | 'focus' | 'focus-timer' | 'telegram' | 'skins';
export type AdvancedTrainingConfig = { id: string; text: string; target?: string; allow?: string; action?: boolean; center?: boolean; practice?: PracticeKind; surface?: string; skin?: string; done?: boolean };
export const BASIC_OFFER_MARKER = 'basic-onboarding-v1-seen';
export const BASIC_LESSON_ID = 'basic';
export const trainingOfferKey = (userId: string) => 'btm:' + userId + ':basic-onboarding-v1-seen';
export const AI_GUIDED_STEPS: AdvancedTrainingConfig[] = [
  { id: 'ai-intro', center: true, text: 'Теперь познакомимся с моими возможностями. Я помогу тебе не только ответами, но и работой с задачами, расписанием и файлами. Ничего отправлять или сохранять в этом уроке не нужно.' },
  { id: 'ai-quick-chat', surface: 'ai-quick-chat', target: '[data-tour="quick-ai"]', text: 'Это быстрый чат. Он удобен для коротких вопросов, небольших поручений и поиска задач. Здесь можно сразу отправить запрос помощнику.' },
  { id: 'ai-open-chat', target: '.planik-launcher-button', allow: '.planik-launcher-button', action: true, text: 'Теперь открой общий чат с ИИ: нажми на меня, на помощника в правом нижнем углу.' },
  { id: 'ai-full-chat', surface: 'ai-full-chat', target: '[data-tour="ai-full-chat"]', text: 'В общем чате можно вести отдельные проекты и беседы, выбирать модели, прикладывать файлы и просить меня подготовить документы. Модели отличаются возможностями и расходом лимитов.' },
  { id: 'ai-task-help', surface: 'ai-task-help', target: '[data-tour="ai-task-help"]', text: 'У каждой задачи есть свой чат. Я учитываю её описание, подзадачи и переписку. Могу предложить план действий, отредактировать описание или создать подзадачи.' },
  { id: 'ai-monitor-button', surface: 'ai-monitor-button', target: '[data-tour="ai-monitor-button"]', text: 'Для особо важных задач есть автомониторинг. Я могу следить за ходом работы и напоминать о задаче по твоим инструкциям. Доступность зависит от подписки.' },
  { id: 'ai-monitor-model', surface: 'ai-monitor-model', target: '[data-tour="ai-monitor-window"]', text: 'Перед включением мониторинга здесь можно выбрать модель. Для простых напоминаний достаточно быстрой модели, для сложных поручений пригодится более мощная.' },
  { id: 'ai-recurrence', surface: 'ai-recurrence', target: '[data-tour="ai-recurrence"]', text: 'Повторение задачи можно задать обычными словами. Включи повторение в настоящей задаче и напиши, например, «каждый понедельник и среду в 12:00».' },
  { id: 'ai-optimize', surface: 'ai-optimize', target: '[data-tour="ai-optimize"]', text: 'В таймлайне можно оптимизировать расписание с учётом выбранного периода. Укажи пожелания, например, распределять задачи равномерно и не переносить их позже 18:00.' },
  { id: 'ai-checkup', surface: 'ai-checkup', target: '[data-tour="ai-checkup-settings"]', text: 'ИИ-чекап — регулярная сводка о ближайших и просроченных задачах, конфликтах и возможных исправлениях. В настройках выбирается удобное время сводки.' },
  { id: 'ai-done', center: true, done: true, text: 'Отлично! Теперь ты знаешь, как поручать мне работу и управлять ИИ-возможностями. Твои настройки остались прежними.' }
];
export const FEATURE_GUIDED_STEPS: AdvancedTrainingConfig[] = [
  { id: 'feature-intro', center: true, text: 'Покажу дополнительные возможности Планировыча: продуктивность, концентрацию, интеграции и мои образы.' },
  { id: 'feature-rating-open', target: '.efficiency-icon-button', allow: '.efficiency-icon-button', action: true, text: 'Нажми на иконку рейтинга эффективности, чтобы открыть подробную статистику.' },
  { id: 'feature-rating', surface: 'feature-rating', target: '[data-tour="feature-rating"]', text: 'Это рейтинг эффективности. Он растёт за выполнение задач, привычек, работу с ИИ и концентрацию. За выполненные уроки тоже предусмотрена награда.' },
  { id: 'feature-focus-button', surface: 'feature-focus-button', target: '[data-tour="feature-focus-button"]', allow: '[data-tour="feature-focus-button"]', action: true, text: 'Нажми кнопку «Фокус». Попробуем выбрать задачи и запустить учебную фокус-сессию.' },
  { id: 'feature-focus-setup', target: '[data-tour="feature-focus-setup"]', allow: '.focus-task-pick, [data-guided-focus-start], [data-guided-focus-auto]', text: 'Выбери несколько учебных задач прямо в этом окне и нажми «Начать».', action: true },
  { id: 'feature-focus-timer', target: '[data-tour="feature-focus-timer"]', allow: '[data-guided-focus-play]', text: 'Нажми кнопку запуска (треугольник). Учебный таймер начнёт обратный отсчёт, как в обычной фокус-сессии.', action: true },
  { id: 'feature-focus-task', target: '[data-tour="feature-focus-task"]', allow: '.focus-stack-arrow', text: 'Здесь можно переключаться между выбранными задачами стрелками. За выполнение задач начисляется дополнительный рейтинг. Справа находится чат с ИИ по текущей задаче.' },
  { id: 'feature-telegram-button', target: '[data-tour="integration-bot"]', surface: 'feature-integration-bot', text: 'Telegram-бот позволяет получать уведомления, управлять задачами и привычками, отправлять голосовые и пользоваться Mini App.' },
  { id: 'feature-telegram-qr', target: '[data-tour="integration-bot"]', surface: 'feature-integration-bot', text: 'Для подключения нажми «Подключить» и отсканируй QR-код в Telegram. Также доступен вход в @planirovych_bot. В рамках урока мы не привязываем аккаунт.' },
  { id: 'feature-integration-send', target: '[data-tour="integration-messages"]', surface: 'feature-integration-send', text: 'Я могу подготовить сообщение для Telegram от твоего имени. Перед отправкой ты проверяешь получателя и текст, а отправка происходит только после подтверждения.' },
  { id: 'feature-open-telegram-assistant', target: '[data-tour="integration-assistant"]', allow: '[data-tour="integration-assistant"] button', action: true, text: 'Чтобы открыть настройки Telegram-ассистента, нажми на его плашку в меню «Интеграции», затем на кнопку «Настроить ассистента».' },
  { id: 'feature-integration-telegram-ai', target: '[data-guided-assistant="telegram"] nav', text: 'Это настоящее окно настроек Telegram-ассистента. Через «Добавить переписку» выбирают личные чаты или группы. Сейчас показан учебный профиль.' },
  { id: 'feature-telegram-conversation', target: '[data-guided-assistant="telegram"] .telegram-ai-settings-section--conversation', text: 'Здесь задают режим участия: наблюдать, предлагать ответы с подтверждением или отправлять их автоматически. Можно описать условия и стиль ответа.' },
  { id: 'feature-telegram-tasks', target: '[data-guided-assistant="telegram"] .telegram-ai-settings-section--tasks', text: 'В этом блоке выбирают, когда предлагать или автоматически создавать задачи из договорённостей и как часто искать поручения.' },
  { id: 'feature-telegram-summaries', target: '[data-guided-assistant="telegram"] .telegram-ai-settings-section--summaries', text: 'Настрой частоту сводок и укажи, на что обращать внимание при анализе переписки.' },
  { id: 'feature-telegram-general', target: '[data-guided-assistant="telegram"] .telegram-ai-settings-section--general', text: 'Общие параметры: модель ИИ, дневной лимит кредитов, уведомления, вложения и доступ к истории. После сохранения реального профиля начинается мониторинг.' },
  { id: 'feature-open-mail-assistant', target: '[data-tour="integration-email"]', allow: '[data-tour="integration-email"] button', action: true, text: 'Теперь в меню «Интеграции» нажми на плашку «Почтовый ИИ-ассистент», затем на «Настроить ассистента».' },
  { id: 'feature-integration-mail', target: '[data-guided-assistant="mail"] nav', text: 'Это окно почтового ассистента. Здесь добавляют ящики Яндекс Почты или Mail.ru и настраивают каждый отдельно. Сейчас открыт учебный ящик.' },
  { id: 'feature-mail-conversation', target: '[data-guided-assistant="mail"] .telegram-ai-settings-section--conversation', text: 'Выбери, должен ли помощник только читать письма, предлагать ответы или отправлять их автоматически по твоим правилам.' },
  { id: 'feature-mail-tasks', target: '[data-guided-assistant="mail"] .telegram-ai-settings-section--tasks', text: 'Настрой поиск поручений и договорённостей в письмах: можно получать предложения задач или разрешить их автоматическое создание.' },
  { id: 'feature-mail-summaries', target: '[data-guided-assistant="mail"] .telegram-ai-settings-section--summaries', text: 'Здесь задают частоту сводок по письмам и инструкции для их составления.' },
  { id: 'feature-mail-general', target: '[data-guided-assistant="mail"] .telegram-ai-settings-section--general', text: 'В общих настройках указывают модель, лимит кредитов и уведомления. В учебном окне ничего не сохраняется и почта не подключается.' },
  { id: 'feature-skins-intro', target: '.mascot-wardrobe-anchor:has(.planik-launcher-button)', text: 'У меня есть гардероб! Наведи курсор на настоящего помощника: рядом появится кнопка «Аксессуары и скины». Сейчас откроем это окно.' },
  { id: 'feature-skins-preview', target: '.mascot-wardrobe-list', skin: 'pirate', text: 'В этом списке можно примерять образы. Классический, Котик концентрации и Маэстро привычек бесплатны. Остальные доступны по подпискам «Про» и «Максимум».' },
  { id: 'feature-skins-space', target: '.mascot-wardrobe-stage', skin: 'space', text: 'Здесь отображается примерка. Каждый образ имеет собственные движения. Например, космонавт летает в невесомости, а ниндзя исчезает в дыму.' },
  { id: 'feature-skins-practice', target: '.mascot-wardrobe-dialog[data-guided-wardrobe]', allow: '.mascot-wardrobe-option, .mascot-wardrobe-animations button', text: 'Выбери другой образ в списке и нажми одну из его особых анимаций прямо в гардеробе. Твой сохранённый образ не изменится.', action: true },
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
