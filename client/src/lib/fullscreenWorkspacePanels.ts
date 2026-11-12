/**
 * Fullscreen panels describe *what* lives in a split slot, separately from
 * *how* that content is rendered. Real chat/notes widgets can be registered
 * later without rewriting the split layout or changing its resize behavior.
 */
export type FullscreenViewMode = 'bubbles' | 'list' | 'timeline';
export type FullscreenAuxiliaryKind = 'general-ai' | 'task-ai' | 'notes' | 'upcoming-tasks';

export type FullscreenAuxiliaryPanel =
  | { kind: 'general-ai' }
  | { kind: 'task-ai'; taskId: string | null }
  | { kind: 'notes' }
  | { kind: 'upcoming-tasks' };

export type FullscreenWorkspacePanel =
  | { kind: 'mode'; mode: FullscreenViewMode }
  | FullscreenAuxiliaryPanel;

export const FULLSCREEN_AUXILIARY_OPTIONS: ReadonlyArray<{ kind: FullscreenAuxiliaryKind; title: string; description: string }> = [
  { kind: 'general-ai', title: 'Общий чат с ИИ', description: 'Отдельное окно общего помощника' },
  { kind: 'task-ai', title: 'Чат ИИ по задаче', description: 'С привязкой к выбранной задаче' },
  { kind: 'notes', title: 'Заметки', description: 'Доска заметок рабочего пространства' },
  { kind: 'upcoming-tasks', title: 'Ближайшие задачи', description: 'Предстоящие задачи и сроки' }
];

export const createAuxiliaryPanel = (kind: FullscreenAuxiliaryKind): FullscreenAuxiliaryPanel =>
  kind === 'task-ai' ? { kind, taskId: null } : { kind };

const VIEW_TITLES: Record<FullscreenViewMode, string> = {
  bubbles: 'Пузыри', list: 'Список', timeline: 'Таймлайн'
};

export function fullscreenPanelTitle(panel: FullscreenWorkspacePanel): string {
  if (panel.kind === 'mode') return VIEW_TITLES[panel.mode];
  return FULLSCREEN_AUXILIARY_OPTIONS.find(option => option.kind === panel.kind)?.title ?? panel.kind;
}

/** At most two slots are currently rendered. A selected auxiliary panel takes
 * the second slot; otherwise the second checked visualization fills it.
 * The first visualization always remains interactive. */
export function resolveFullscreenPanels(
  modes: readonly FullscreenViewMode[],
  auxiliary: FullscreenAuxiliaryPanel | null
): [FullscreenWorkspacePanel] | [FullscreenWorkspacePanel, FullscreenWorkspacePanel] {
  const primary: FullscreenWorkspacePanel = { kind: 'mode', mode: modes[0] ?? 'bubbles' };
  if (auxiliary) return [primary, auxiliary];
  if (modes[1] && modes[1] !== modes[0]) return [primary, { kind: 'mode', mode: modes[1] }];
  return [primary];
}
