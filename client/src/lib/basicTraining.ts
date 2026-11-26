import type { Task, Sphere } from './types';

export const TRAINING_SPHERES: Sphere[] = [
  { id: 'planik-training-work', name: 'Работа', color: '#3b82f6', icon: 'briefcase' },
  { id: 'planik-training-personal', name: 'Личное', color: '#14b8a6', icon: 'heart' },
  { id: 'planik-training-project', name: 'Проекты', color: '#8b5cf6', icon: 'briefcase' }
];
export const TRAINING_COMPLETE_ID = 'planik-training-complete';
export const TRAINING_COMPLETE_TITLE = 'Освоить управление пузырями';
const task = (id: string, title: string, sphere: number, importance: number): Task => ({
  id, title, sphereId: TRAINING_SPHERES[sphere].id, importance, urgency: importance,
  priorityScore: importance * importance, status: 'TODO', taskType: 'TASK'
});
export const createTrainingTasks = (): Task[] => [
  task('planik-training-a', 'Составить план', 0, 4),
  task('planik-training-b', 'Подготовить материалы', 1, 3),
  task('planik-training-c', 'Разобрать идеи', 2, 3),
  task('planik-training-d', 'Проверить список', 0, 2)
];
export const createCompletionTrainingTask = () => task(TRAINING_COMPLETE_ID, TRAINING_COMPLETE_TITLE, 1, 5);

export type TrainingBubbleAction = {
  action: 'move' | 'link' | 'unlink' | 'nest';
  targetTaskId?: string; sphereId?: string | null; mode?: 'global' | 'sectors'; x?: number; y?: number;
};
export type BasicTrainingStep = 'intro' | 'intro-next' | 'workspace' | 'bubbles' | 'grab' | 'move' | 'link' | 'linked' | 'nest' | 'nested' | 'complete' | 'report' | 'sector' | 'sector-editor' | 'modes' | 'two-modes' | 'divider' | 'block' | 'block-added' | 'notes' | 'habits' | 'integrations' | 'android' | 'goodbye';
export type TrainingStepConfig = { id: BasicTrainingStep; text: string; target?: string; allow?: string; action?: boolean; center?: boolean };
const field = '[data-tour="bubbles-workspace"]';
const bubbles = field + ' [data-bubble-task-id]';
const completionBubble = field + ' [data-bubble-task-id="' + TRAINING_COMPLETE_ID + '"]';
const sector = field + ' [data-planik-sector="' + TRAINING_SPHERES[0].id + '"]';
export const BASIC_TRAINING_STEPS: TrainingStepConfig[] = [
  { id: 'intro', center: true, text: 'Привет! Я Планик, твой личный ИИ-ассистент. Помогу с работой, проектами, личными делами и многим другим.' },
  { id: 'intro-next', center: true, text: 'Сейчас проведу короткую экскурсию по рабочему пространству. Попробуем всё на учебных задачах: твои настоящие задачи останутся нетронутыми.' },
  { id: 'workspace', target: '[data-tour="workspace"]', text: 'Это твоё рабочее пространство. Отсюда доступно почти всё, что умеет Планировыч.' },
  { id: 'bubbles', target: field, text: '«Пузыри» — стандартный режим отображения. Сразу видно все задачи и понятно, какие из них важнее остальных.' },
  { id: 'grab', target: field, allow: bubbles, action: true, text: 'Попробуй зажать любой пузырь левой кнопкой мыши.' },
  { id: 'move', target: field, allow: bubbles, action: true, text: 'Перемещай пузыри, связывай задачи или вкладывай их друг в друга. Для начала перенеси пузырь в другой сектор и отпусти.' },
  { id: 'link', target: field, allow: bubbles, action: true, text: 'Отлично! Теперь подведи один пузырь к краю другого, дождись подсветки связи и отпусти.' },
  { id: 'linked', target: field, text: 'Молодец! Связанные задачи останутся рядом. Так можно создавать небольшие кластеры.' },
  { id: 'nest', target: field, allow: bubbles, action: true, text: 'Теперь перемести один пузырь внутрь другого. Дождись жёлтой подсветки, задержись на полсекунды и отпусти.' },
  { id: 'nested', target: field, text: 'Супер! Вложенные задачи помогают группировать дела. Их исходные данные сохраняются внутри.' },
  { id: 'complete', target: completionBubble, allow: completionBubble + ', [data-planik-complete-action]', action: true, text: 'Кажется, с управлением пузырями мы справились! Кликни по новой задаче правой кнопкой мыши и выбери «Выполнить».' },
  { id: 'report', target: '[data-planik-report-dialog]', text: 'После выполнения задачи можно подготовить Word-отчёт с историей изменений, подзадач и обсуждений. Особенно удобно для больших задач. Сейчас отчёт не нужен.' },
  { id: 'sector', target: sector, allow: sector, action: true, text: 'Нажми на плашку сектора над кнопкой «+», чтобы открыть его настройки.' },
  { id: 'sector-editor', target: '[data-planik-sector-editor]', text: 'Здесь можно изменить название, цвет, иконку и общий промпт сектора. Укажи, например, рабочий график, должность или другие особенности — это поможет мне точнее работать с задачами.' },
  { id: 'modes', target: '.fullscreen-mode-picker', allow: '.fullscreen-mode-picker', action: true, text: 'Здесь можно выбрать другой режим или сразу два. Включи «Список» или «Таймлайн».' },
  { id: 'two-modes', target: '.fullscreen-mode-picker', text: 'Теперь у тебя два режима одновременно! Отключить любой из них можно повторным нажатием на его чекбокс.' },
  { id: 'divider', target: '.fullscreen-workspace-divider', allow: '.fullscreen-workspace-divider', text: 'Перемычка между окнами меняет их размеры. Попробуй потянуть её мышью.' },
  { id: 'block', target: '.workspace-block-submenu, .workspace-block-target', allow: '.workspace-block-menu, .workspace-block-target', action: true, text: 'Теперь добавим другое окно. Перетащи блок из меню в рабочую область (можно также выбрать его и нажать на область). Выбери не режим, а другой блок, например «Заметки».' },
  { id: 'block-added', target: '[data-tour="workspace"]', text: 'Так можно комбинировать окна и режимы под свои задачи. Всё зависит от твоего рабочего процесса.' },
  { id: 'notes', target: '[data-primary-widget="notes"]', text: 'Создавай заметки и объединяй их в группы. Не обязательно делать это вручную: попроси меня создать, найти или изменить заметку.' },
  { id: 'habits', target: '[data-primary-widget="habits"]', text: 'Создавай привычки и следи за прогрессом самостоятельно или с моей помощью. Особенно удобно отмечать привычки с телефона.' },
  { id: 'integrations', target: '[data-tour="integration-bot"]', text: 'Подключи Telegram-бота, чтобы отмечать привычки и отправлять мне голосовые. В Mini App доступна почти вся функциональность сайта.' },
  { id: 'android', target: '[data-tour="integration-android"]', text: 'Здесь можно скачать официальное Android-приложение в формате APK. Оно доступно на сайте, а приложение для iPhone готовится к публикации в App Store.' },
  { id: 'goodbye', center: true, text: 'Вот и всё! Теперь ты знаешь основные возможности Планировыча. Удачной работы! Если понадобится помощь — я рядом.' }
];
export const nextBasicTrainingStep = (step: BasicTrainingStep) => BASIC_TRAINING_STEPS[BASIC_TRAINING_STEPS.findIndex(item => item.id === step) + 1]?.id ?? null;

// Only local exercises are mutable. Unexpected gestures do not touch the real workspace.
export function applyTrainingBubbleAction(tasks: Task[], step: BasicTrainingStep, id: string, payload: TrainingBubbleAction): { tasks: Task[]; next: BasicTrainingStep | null } {
  const source = tasks.find(item => item.id === id && !item.parentTaskId);
  const target = tasks.find(item => item.id === payload.targetTaskId && item.id !== id && !item.parentTaskId);
  if (!source) return { tasks, next: null };
  if ((step === 'grab' || step === 'move') && payload.action === 'move') {
    const moved = payload.sphereId !== undefined && payload.sphereId !== source.sphereId;
    return { tasks: tasks.map(item => item.id === id ? { ...item, sphereId: payload.sphereId ?? item.sphereId, bubbleSectorX: payload.x, bubbleSectorY: payload.y } : item), next: moved ? 'link' : null };
  }
  if (step === 'link' && payload.action === 'link' && target) {
    return { tasks: tasks.map(item => item.id === id || item.id === target.id ? { ...item, linkedTaskIds: [item.id === id ? target.id : id], bubbleLinkAnchorId: target.id } : item), next: 'linked' };
  }
  if (step === 'nest' && payload.action === 'nest' && target) {
    return { tasks: tasks.map(item => item.id === id ? { ...item, parentTaskId: target.id, sphereId: target.sphereId, linkedTaskIds: [], bubbleLinkAnchorId: null } : { ...item, linkedTaskIds: item.linkedTaskIds?.filter(peer => peer !== id), bubbleLinkAnchorId: item.bubbleLinkAnchorId === id ? null : item.bubbleLinkAnchorId }), next: 'nested' };
  }
  return { tasks, next: null };
}
