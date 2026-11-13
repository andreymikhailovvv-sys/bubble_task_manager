import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { TaskMonitoringBadge } from './TaskMonitoringBadge';
import { CalendarDays, ChevronRight, Coins, Gauge, LoaderCircle, MessageCircle, Plus, Repeat, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { buildSectorGeometry, getBubbleSectorIndex, getBubbleSectorSpheres, getTaskCoefficient, type BubbleRankingMode } from '../lib/layout';
import { hillBoundaryCurve, hillSectorIndexAtAngle } from '../lib/hillSectors';
import { noteHtmlToPlainText } from '../lib/notes';
import { bubbleLinkSegment, detectBubbleDrop, getLinkedBubbleGroups, type DropIntent, type VisualBubble } from '../lib/bubbleInteractions';
import { useBubbleLayoutWorker } from '../hooks/useBubbleLayoutWorker';
import { resolveSphereIcon } from '../lib/sphereIcons';
import type { Sphere, Task } from '../lib/types';
import { InlineDateTimePickerIcon } from './InlineDateTimePickerIcon';
import { LinkifiedText } from './LinkifiedText';
import { CustomSelect } from './CustomSelect';

type Props = {
  tasks: Task[];
  timelinePreviewTasks?: Task[];
  subtaskMap: Record<string, Task[]>;
  spheres: Sphere[];
  mode: 'global' | 'sectors';
  rankingMode: BubbleRankingMode;
  selectedId?: string;
  poppingTaskId?: string | null;
  hasAiNotification?: (taskId: string) => boolean;
  onSelect: (task: Task) => void;
  onSelectSubtask: (subtask: Task) => void;
  onToggleSubtaskDone: (subtask: Task) => Promise<void>;
  onUpdateSubtaskDueDate: (subtask: Task, dueDate: string | null) => Promise<void>;
  onQuickCompleteTask: (task: Task) => Promise<void>;
  onQuickChangeTaskImportance: (task: Task, importanceDelta: number) => Promise<void>;
  onQuickPostponeTask: (task: Task, option: '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart') => Promise<string | null>;
  onCreateSubtask: (parentTask: Task, payload: Partial<Task>) => Promise<void>;
  onBubbleAction: (task: Task, payload: { action: 'move' | 'link' | 'unlink' | 'nest'; targetTaskId?: string; sphereId?: string | null; mode?: 'global' | 'sectors'; x?: number; y?: number }) => Promise<void>;
  isSubtaskFilterActive: boolean;
  onToggleSubtaskFilter: () => void;
  onRenameSphere?: (sphere: Sphere) => void;
  onAddTaskToSphere?: (sphere: Sphere) => void;
  onRescheduleTask?: (task: Task) => void;
  onOpenInOtherPane?: (task: Task, sourcePaneIndex: 0 | 1) => void;
  forceTaskContextMenuOpen?: boolean;
  isSearchFiltering?: boolean;
  showTrainingInvitation?: boolean;
  onOpenTraining?: () => void;
  onDismissTraining?: () => void;
  themeMode?: 'dark' | 'light';
  /** Use the full viewport for the oval; hide the normal side information panel. */
  fullscreen?: boolean;
  /** Crop the large desktop information rail when the oval is in a split pane. */
  compact?: boolean;
  className?: string;
};

const IMPORTANCE_BUBBLE_COLORS: Record<number, string> = {
  1: '#38bdf8',
  2: '#22d3ee',
  3: '#8b5cf6',
  4: '#f97316',
  5: '#ef4444'
};

const SIZE = 900;
const WORKSPACE_PADDING = 80;
const FIELD_RADIUS = SIZE * 0.47;
const VIEWBOX_HEIGHT = SIZE + WORKSPACE_PADDING * 2;
const VIEWBOX_WIDTH = 1840;
const VIEWBOX_LEFT = -180;
const VIEWBOX_TOP = -WORKSPACE_PADDING;
const VIEWBOX_RIGHT = VIEWBOX_LEFT + VIEWBOX_WIDTH;
const VIEWBOX_BOTTOM = VIEWBOX_TOP + VIEWBOX_HEIGHT;
const TASK_INFO_PANEL_WIDTH = 620;
const TASK_INFO_PANEL_X = VIEWBOX_LEFT + 24;
const FULLSCREEN_TASK_INFO_PANEL_X = VIEWBOX_LEFT + 48;
const FULLSCREEN_TASK_INFO_PANEL_WIDTH = 560;
const BUBBLE_WORKSPACE_GAP = 36;
const BUBBLE_WORKSPACE_X = TASK_INFO_PANEL_X + TASK_INFO_PANEL_WIDTH + BUBBLE_WORKSPACE_GAP;
const BUBBLE_WORKSPACE_WIDTH = VIEWBOX_RIGHT - BUBBLE_WORKSPACE_X - 8;
const BUBBLE_FIELD_CENTER_X = BUBBLE_WORKSPACE_X + BUBBLE_WORKSPACE_WIDTH / 2;
const BUBBLE_FIELD_CENTER_Y = SIZE / 2;
const ELLIPSE_RADIUS_X = BUBBLE_WORKSPACE_WIDTH / 2 - 16;
const ELLIPSE_RADIUS_Y = VIEWBOX_HEIGHT / 2 - 38;
const ELLIPSE_X_SCALE = ELLIPSE_RADIUS_X / FIELD_RADIUS;
const ELLIPSE_Y_SCALE = ELLIPSE_RADIUS_Y / FIELD_RADIUS;
const HOVER_EXIT_DELAY_MS = 120;
// Deterministic, small particle burst. No continuous physics or random re-renders.
const BUBBLE_COMPLETION_CONFETTI = Array.from({ length: 16 }, (_, index) => {
  const angle = (index / 16) * Math.PI * 2;
  const distance = 25 + (index % 4) * 11;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance - 8,
    rotation: index % 2 ? -125 - index * 8 : 125 + index * 8,
    color: ['#fcd34d', '#67e8f9', '#c4b5fd', '#f9a8d4', '#86efac'][index % 5]
  };
});
const ENABLE_BUBBLE_HOVER_DETAILS = false;
const SUBTASK_REMINDER_GLOW_STYLE =
  '0 0 0 1px rgba(56,189,248,0.24), inset 0 0 12px rgba(56,189,248,0.28)';
const SUBTASK_OVERDUE_GLOW_STYLE =
  '0 0 0 1px rgba(239,68,68,0.28), inset 0 0 12px rgba(239,68,68,0.3)';
const MAX_SHINE_WINDOW_MINUTES = 180;
const CONTEXT_MENU_VIEWPORT_MARGIN = 12;
const CONTEXT_MENU_WITH_SUBMENU_WIDTH = 416;
const CONTEXT_MENU_HEIGHT = 258;

function getViewportSafeContextMenuPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y };
  return {
    x: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(x, window.innerWidth - CONTEXT_MENU_WITH_SUBMENU_WIDTH - CONTEXT_MENU_VIEWPORT_MARGIN)),
    y: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(y, window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_VIEWPORT_MARGIN))
  };
}
/** Keep a compact hover card outside its bubble and within the viewport. */
function compactBubbleHoverPlacement(rect: DOMRect, viewportWidth: number, viewportHeight: number) {
  const margin = 12;
  const gap = 16;
  const preferredWidth = 288;
  const preferredHeight = 315;
  const viewportCardHeight = Math.min(preferredHeight, Math.max(0, viewportHeight - 2 * margin));
  const rightSpace = viewportWidth - rect.right - gap - margin;
  const leftSpace = rect.left - gap - margin;
  if (Math.max(rightSpace, leftSpace) >= 190) {
    const right = rightSpace >= leftSpace;
    const width = Math.min(preferredWidth, right ? rightSpace : leftSpace);
    return {
      left: right ? rect.right + gap : rect.left - gap - width,
      top: Math.max(margin, Math.min((rect.top + rect.bottom - viewportCardHeight) / 2, viewportHeight - viewportCardHeight - margin)),
      width,
      maxHeight: viewportCardHeight
    };
  }
  const belowSpace = viewportHeight - rect.bottom - gap - margin;
  const aboveSpace = rect.top - gap - margin;
  const below = belowSpace >= aboveSpace;
  const maxHeight = Math.min(preferredHeight, Math.max(0, below ? belowSpace : aboveSpace));
  const width = Math.min(preferredWidth, Math.max(0, viewportWidth - 2 * margin));
  return {
    left: Math.max(margin, Math.min(rect.left + rect.width / 2 - width / 2, viewportWidth - width - margin)),
    top: below ? rect.bottom + gap : rect.top - gap - maxHeight,
    width,
    maxHeight
  };
}

const POSTPONE_OPTIONS = [
  { value: '15m', label: 'На 15 мин' },
  { value: '30m', label: 'На 30 мин' },
  { value: '1h', label: 'На час' },
  { value: '3h', label: 'На 3 часа' },
  { value: 'tomorrow', label: 'На завтра' },
  { value: 'smart', label: '✦ Ближайшее окно' }
] as const;
type PostponeOption = (typeof POSTPONE_OPTIONS)[number]['value'];
type BubbleContextMenu = { x: number; y: number; task: Task | null; sphere: Sphere | null; sourcePaneIndex: 0 | 1 };
type BubbleDragSession = {
  taskId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startSvgX: number;
  startSvgY: number;
  lastSvgX: number;
  lastSvgY: number;
  moved: boolean;
  target: DropIntent | null;
  targetSince: number;
};
type BubbleDragView = {
  taskId: string;
  dx: number;
  dy: number;
  target: DropIntent | null;
  destinationSectorIndex: number;
  destinationSectorName: string | null;
  changesSector: boolean;
};

type SubtaskDraft = {
  title: string;
  description: string;
  dueDate: string;
  notifyPreset: string;
};

function formatPostponeDelta(previousDueDate: string | null | undefined, nextDueDate: string | null | undefined) {
  if (!previousDueDate || !nextDueDate) return null;
  const prev = new Date(previousDueDate);
  const next = new Date(nextDueDate);
  if (Number.isNaN(prev.getTime()) || Number.isNaN(next.getTime())) return null;
  const diffMinutes = Math.round((next.getTime() - prev.getTime()) / 60_000);
  if (diffMinutes === 0) return null;
  const sign = diffMinutes > 0 ? '+' : '-';
  const absMinutes = Math.abs(diffMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  if (hours > 0 && minutes > 0) return `${sign}${hours} ч ${minutes} мин`;
  if (hours > 0) return `${sign}${hours} ч`;
  return `${sign}${minutes} мин`;
}

function formatDueDate(value?: string | null) {
  if (!value) return 'Не указан';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Не указан';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDeadlineLeft(value?: string | null) {
  if (!value) return 'Без дедлайна';
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return 'Без дедлайна';
  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) return 'Истёк';
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} мин`;
  return `${hours} ч ${minutes} мин`;
}

function shouldTaskGlow(task: Task) {
  if (task.status === 'DONE') return false;
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const diff = due.getTime() - Date.now();
  if (diff < 0) return true;
  if (!Number.isFinite(task.notifyBeforeMinutes)) return false;
  const notifyBefore = Math.min(Number(task.notifyBeforeMinutes), MAX_SHINE_WINDOW_MINUTES) * 60_000;
  if (notifyBefore <= 0) return false;
  return diff <= notifyBefore;
}

function shouldSubtaskAffectParentReminder(subtask: Task) {
  if (subtask.status === 'DONE') return false;
  return shouldTaskGlow(subtask);
}

function isOverdue(task: Task) {
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function hexToRgb(hex: string) {
  const m = hex.replace('#', '');
  const normalized = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function getBubbleShade(hex: string, distanceRatio: number) {
  const { r, g, b } = hexToRgb(hex);
  const fade = 0.04 + distanceRatio * 0.72;
  const nextR = Math.round(r + (255 - r) * fade);
  const nextG = Math.round(g + (255 - g) * fade);
  const nextB = Math.round(b + (255 - b) * fade);
  return `rgb(${nextR}, ${nextG}, ${nextB})`;
}



function getCoefficientBadgeColor(coefficient: number) {
  const intensity = Math.max(0, Math.min(1, coefficient));
  const red = Math.round(80 + intensity * 170);
  const green = Math.round(165 - intensity * 95);
  const blue = Math.round(220 - intensity * 190);
  return `rgba(${red}, ${green}, ${blue}, 0.32)`;
}

function getInfoBadgeStyle(color: string, isLightTheme: boolean) {
  const { r, g, b } = hexToRgb(color);
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${isLightTheme ? 0.2 : 0.24})`,
    borderColor: `rgba(${r}, ${g}, ${b}, ${isLightTheme ? 0.78 : 0.62})`,
    boxShadow: 'none'
  };
}

function getBubbleTitlePreview(title: string, radius: number) {
  const normalized = title.trim();
  if (!normalized) return '';

  const maxWords = radius < 26 ? 2 : radius < 36 ? 4 : radius < 50 ? 6 : radius < 68 ? 9 : 14;
  const maxChars = Math.max(12, Math.floor(radius * (radius < 36 ? 0.9 : 1.18)));
  const words = normalized.split(/\s+/);
  let preview = words.slice(0, maxWords).join(' ');

  if (preview.length > maxChars) {
    preview = `${preview.slice(0, Math.max(9, maxChars - 1)).trimEnd()}…`;
  } else if (words.length > maxWords) {
    preview = `${preview}…`;
  }

  return preview;
}

/** Native SVG text remains crisp at fractional viewBox scales. */
function wrapBubbleTitleForSvg(text: string, radius: number, fontSize: number, maxLines: number): string[] {
  const maxChars = Math.max(4, Math.floor(radius * 1.5 / (fontSize * 0.56)));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const parts = words.flatMap((word) => word.length > maxChars
    ? Array.from({ length: Math.ceil(word.length / maxChars) }, (_, index) =>
        word.slice(index * maxChars, (index + 1) * maxChars))
    : [word]);
  const lines: string[] = [];
  let current = '';
  for (const part of parts) {
    const next = current ? `${current} ${part}` : part;
    if (next.length <= maxChars) current = next;
    else { if (current) lines.push(current); current = part; }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  const last = visible[maxLines - 1].replace(/…$/, '');
  visible[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  return visible;
}

function getBubbleTitleFontSize(title: string, radius: number) {
  const normalizedLength = title.trim().length;
  const baseSize = radius / (radius < 34 ? 6.2 : 5.2);
  const longTitleAdjustment = normalizedLength > 24 ? Math.min(2.8, (normalizedLength - 24) / 12) : 0;

  return Math.max(7, Math.min(18, baseSize - longTitleAdjustment));
}


function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function BubbleField({
  tasks,
  timelinePreviewTasks,
  subtaskMap,
  spheres,
  mode,
  rankingMode,
  selectedId,
  poppingTaskId,
  hasAiNotification,
  onSelect,
  onSelectSubtask,
  onCreateSubtask,
  onBubbleAction,
  isSubtaskFilterActive,
  onToggleSubtaskFilter,
  onToggleSubtaskDone,
  onUpdateSubtaskDueDate,
  onQuickCompleteTask,
  onQuickChangeTaskImportance,
  onQuickPostponeTask,
  onRenameSphere,
  onAddTaskToSphere,
  onRescheduleTask,
  onOpenInOtherPane,
  forceTaskContextMenuOpen = false,
  isSearchFiltering = false,
  showTrainingInvitation = false,
  onOpenTraining,
  onDismissTraining,
  themeMode = 'dark',
  fullscreen = false,
  compact = false,
  className
}: Props) {
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [compactHoverPoint, setCompactHoverPoint] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const isLightTheme = themeMode === 'light';
  const reducedMotion = useReducedMotion();
  const [completionBursts, setCompletionBursts] = useState<Array<{
    id: string; x: number; y: number; radius: number
  }>>([]);
  const capturedCompletionIdRef = useRef<string | null>(null);
  const completionBurstTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, SubtaskDraft>>({});
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [smartPostponeTaskId, setSmartPostponeTaskId] = useState<string | null>(null);
  const [postponeResultByTaskId, setPostponeResultByTaskId] = useState<Record<string, string>>({});
  const [isNativeCalendarOpen, setIsNativeCalendarOpen] = useState(false);
  const [deadlineShiftMinutes, setDeadlineShiftMinutes] = useState('30');
  const [contextMenu, setContextMenu] = useState<BubbleContextMenu | null>(null);
  const [contextPostponeSubmenuOpen, setContextPostponeSubmenuOpen] = useState(false);
  const subtaskTitleInputRef = useRef<HTMLInputElement | null>(null);
  const hoverExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeCalendarCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragSessionRef = useRef<BubbleDragSession | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const queuedDragViewRef = useRef<BubbleDragView | null>(null);
  const cancelDragFrame = () => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
    queuedDragViewRef.current = null;
  };
  const queueDragView = (view: BubbleDragView) => {
    queuedDragViewRef.current = view;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      if (queuedDragViewRef.current) setDragView(queuedDragViewRef.current);
      queuedDragViewRef.current = null;
    });
  };
  const ignoreClickRef = useRef<string | null>(null);
  const [dragView, setDragView] = useState<BubbleDragView | null>(null);
  const [bubbleActionPending, setBubbleActionPending] = useState(false);
  const [bubbleDragNotice, setBubbleDragNotice] = useState<string | null>(null);
  const [bubbleNoticeKind, setBubbleNoticeKind] = useState<'success' | 'warning' | 'error'>('success');
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cancelOnBlur = () => {
      dragSessionRef.current = null;
      cancelDragFrame();
      setDragView(null);
    };
    window.addEventListener('blur', cancelOnBlur);
    return () => {
      window.removeEventListener('blur', cancelOnBlur);
      cancelDragFrame();
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);
  const showBubbleNotice = (message: string, kind: 'success' | 'warning' | 'error' = 'success') => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setBubbleNoticeKind(kind);
    setBubbleDragNotice(message);
    noticeTimerRef.current = setTimeout(() => setBubbleDragNotice(null), 3200);
  };
  const toSvgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const converted = point.matrixTransform(matrix.inverse());
    return { x: converted.x, y: converted.y };
  };

  const defaultSubtaskDraft = () => ({ title: '', description: '', dueDate: '', notifyPreset: '0' } satisfies SubtaskDraft);

  const getDraftForTask = (taskId: string): SubtaskDraft => subtaskDrafts[taskId] ?? defaultSubtaskDraft();

  const patchDraftForTask = (taskId: string, patch: Partial<SubtaskDraft>) => {
    setSubtaskDrafts((prev) => ({
      ...prev,
      [taskId]: { ...getDraftForTask(taskId), ...patch }
    }));
  };

  const parsedDeadlineShiftMinutes = (() => {
    const parsed = Number.parseInt(deadlineShiftMinutes, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 30;
    return Math.min(parsed, 1440);
  })();


  const getSphereAtClientPoint = (clientX: number, clientY: number, fallbackTask?: Task | null) => {
    if (fallbackTask) {
      return fallbackTask.sphereId ? spheres.find((sphere) => sphere.id === fallbackTask.sphereId) ?? null : null;
    }
    if (mode !== 'sectors' || bubbleSectors.length === 0) return spheres[0] ?? null;

    const svg = svgRef.current;
    if (!svg) return spheres[0] ?? null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return spheres[0] ?? null;
    const svgPoint = point.matrixTransform(matrix.inverse());
    if (sectorCount <= 1) return bubbleSectors[0] ?? null;
    const dx = (svgPoint.x - BUBBLE_FIELD_CENTER_X) / ELLIPSE_X_SCALE;
    const dy = (svgPoint.y - BUBBLE_FIELD_CENTER_Y) / ELLIPSE_Y_SCALE;
    const sectorIndex = hillSectorIndexAtAngle(Math.atan2(dy, dx), Math.hypot(dx, dy) / FIELD_RADIUS, sectorGeometry);
    return bubbleSectors[sectorIndex] ?? null;
  };

  const showContextMenu = (event: MouseEvent, task: Task | null) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      ...getViewportSafeContextMenuPosition(event.clientX, event.clientY),
      task,
      sphere: getSphereAtClientPoint(event.clientX, event.clientY, task),
      sourcePaneIndex: event.currentTarget.closest('[data-fullscreen-pane-index]')?.getAttribute('data-fullscreen-pane-index') === '1' ? 1 : 0
    });
    setContextPostponeSubmenuOpen(false);
  };

  const tourContextMenuTask = tasks.find((task) => task.status !== 'DONE') ?? tasks[0] ?? null;
  useLayoutEffect(() => {
    if (!forceTaskContextMenuOpen || !tourContextMenuTask) return;
    const frame = requestAnimationFrame(() => {
      const bubble = document.querySelector<SVGGElement>(`[data-bubble-task-id="${CSS.escape(tourContextMenuTask.id)}"]`);
      const bubbleRect = bubble?.getBoundingClientRect();
      const anchorX = bubbleRect ? bubbleRect.left + bubbleRect.width / 2 : window.innerWidth / 2;
      const anchorY = bubbleRect ? bubbleRect.top + bubbleRect.height / 2 : window.innerHeight / 2;
      setContextMenu({
        ...getViewportSafeContextMenuPosition(anchorX, anchorY),
        task: tourContextMenuTask,
        sphere: spheres.find((sphere) => sphere.id === tourContextMenuTask.sphereId) ?? null,
        sourcePaneIndex: bubble?.closest('[data-fullscreen-pane-index]')?.getAttribute('data-fullscreen-pane-index') === '1' ? 1 : 0
      });
      setContextPostponeSubmenuOpen(false);
    });
    return () => {
      cancelAnimationFrame(frame);
      setContextMenu(null);
      setContextPostponeSubmenuOpen(false);
    };
  }, [forceTaskContextMenuOpen, spheres, tourContextMenuTask]);

  const runQuickPostpone = (task: Task, option: PostponeOption) => {
    if (option === 'smart') {
      setSmartPostponeTaskId(task.id);
    }
    const previousDueDateSnapshot = task.dueDate ?? null;
    void onQuickPostponeTask(task, option)
      .then((nextDueDate) => {
        const deltaLabel = formatPostponeDelta(previousDueDateSnapshot, nextDueDate);
        if (!deltaLabel) return;
        setPostponeResultByTaskId((prev) => ({ ...prev, [task.id]: deltaLabel }));
        window.setTimeout(() => {
          setPostponeResultByTaskId((prev) => {
            if (!prev[task.id]) return prev;
            const next = { ...prev };
            delete next[task.id];
            return next;
          });
        }, 1200);
      })
      .catch(() => undefined)
      .finally(() => {
        if (option === 'smart') {
          setSmartPostponeTaskId((prev) => (prev === task.id ? null : prev));
        }
      });
  };

  useEffect(() => {
    // Во время тура меню должно оставаться целью до срабатывания onClick кнопки «Дальше».
    if (!contextMenu || forceTaskContextMenuOpen) return;
    const close = () => {
      setContextMenu(null);
      setContextPostponeSubmenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu, forceTaskContextMenuOpen]);

  const sourceTaskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const getSourceTask = (task: Task) => sourceTaskById.get(task.id) ?? task;
  const timelinePickerTasks = useMemo(
    () => [
      ...(timelinePreviewTasks ?? tasks).filter((task) => task.status !== 'DONE'),
      ...Object.values(subtaskMap).flat().filter((subtask) => subtask.status !== 'DONE')
    ].map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      isSubtask: Boolean(task.parentTaskId),
      taskType: task.taskType,
      sphereColor: (() => {
        if (task.parentTaskId) {
          const parentTask = sourceTaskById.get(task.parentTaskId);
          const parentSphere = parentTask?.sphereId ? spheres.find((sphere) => sphere.id === parentTask.sphereId) : null;
          return parentSphere?.color ?? '#64748b';
        }
        const sphere = task.sphereId ? spheres.find((item) => item.id === task.sphereId) : null;
        return sphere?.color ?? '#64748b';
      })()
    })),
    [sourceTaskById, spheres, subtaskMap, tasks, timelinePreviewTasks]
  );

  const bubbleSectors = useMemo(() => getBubbleSectorSpheres(tasks, spheres, mode), [tasks, spheres, mode]);
  const sectorCount = Math.max(1, bubbleSectors.length);
  const sectorTaskCounts = useMemo(() => {
    if (sectorCount === 1) return [tasks.length];
    const counts = Array.from({ length: sectorCount }, () => 0);
    tasks.forEach((task) => { counts[getBubbleSectorIndex(task, bubbleSectors)] += 1; });
    return counts;
  }, [sectorCount, bubbleSectors, tasks]);
  const sectorGeometry = useMemo(
    () => buildSectorGeometry(sectorCount, sectorTaskCounts),
    [sectorCount, sectorTaskCounts]
  );

  // First-pass physics and final magnetic packing both run in a Web Worker.
  // Cached layouts also survive normal/fullscreen remounts, so switching back
  // to an already visited mode does not repeat any expensive work.
  const packedLayout = useBubbleLayoutWorker({
    tasks, spheres, subtaskMap, rankingMode, mode, size: SIZE,
    bounds: {
      minX: BUBBLE_WORKSPACE_X + 10, maxX: VIEWBOX_RIGHT - 10,
      minY: VIEWBOX_TOP + 20, maxY: VIEWBOX_BOTTOM - 20,
      ellipse: { cx: BUBBLE_FIELD_CENTER_X, cy: BUBBLE_FIELD_CENTER_Y,
        rx: ELLIPSE_RADIUS_X, ry: ELLIPSE_RADIUS_Y }
    }
  });
  const bubbles = useMemo(() => {
    if (!packedLayout) return [];
    return packedLayout.bubbles.flatMap((packed) => {
      const sourceTask = sourceTaskById.get(packed.id);
      if (!sourceTask) return [];
      const task = packed.effectiveDueDate === sourceTask.dueDate ? sourceTask
        : { ...sourceTask, dueDate: packed.effectiveDueDate };
      return [{
        task,
        x: packed.x, y: packed.y, radius: packed.radius,
        color: packed.color, sectorIndex: packed.sectorIndex,
        distanceRatio: packed.distanceRatio
      }];
    });
  }, [packedLayout, sourceTaskById]);
  const mapToOval = useCallback((x: number, y: number) => ({
    x: BUBBLE_FIELD_CENTER_X + (x - SIZE / 2) * ELLIPSE_X_SCALE,
    y: BUBBLE_FIELD_CENTER_Y + (y - SIZE / 2) * ELLIPSE_Y_SCALE
  }), []);

  const visibleBubbles = bubbles;
  const bubbleVisualPositions = useMemo(
    () => new Map(packedLayout?.positions ?? []),
    [packedLayout]
  );
  const getBubbleVisualPoint = (bubble: (typeof bubbles)[number]) =>
    bubbleVisualPositions.get(bubble.task.id) ?? mapToOval(bubble.x, bubble.y);

  useEffect(() => () => {
    completionBurstTimersRef.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!poppingTaskId) {
      capturedCompletionIdRef.current = null;
      return;
    }
    if (capturedCompletionIdRef.current === poppingTaskId || reducedMotion) return;
    const bubble = bubbles.find((item) => item.task.id === poppingTaskId);
    if (!bubble) return;
    capturedCompletionIdRef.current = poppingTaskId;
    // Snapshot the position before the worker packs the remaining bubbles.
    const point = bubbleVisualPositions.get(bubble.task.id) ?? mapToOval(bubble.x, bubble.y);
    const burst = { id: `${poppingTaskId}:${Date.now()}`, x: point.x, y: point.y, radius: bubble.radius };
    setCompletionBursts((current) => [...current.slice(-3), burst]);
    const timeout = setTimeout(() => {
      setCompletionBursts((current) => current.filter((item) => item.id !== burst.id));
      completionBurstTimersRef.current = completionBurstTimersRef.current.filter((item) => item !== timeout);
    }, 1100);
    completionBurstTimersRef.current.push(timeout);
  }, [poppingTaskId, bubbles, bubbleVisualPositions, mapToOval, reducedMotion]);

  const getSectorIndexAtPoint = (point: { x: number; y: number }) => {
    if (mode !== 'sectors' || sectorCount <= 1) return 0;
    const dx = (point.x - BUBBLE_FIELD_CENTER_X) / ELLIPSE_X_SCALE;
    const dy = (point.y - BUBBLE_FIELD_CENTER_Y) / ELLIPSE_Y_SCALE;
    return hillSectorIndexAtAngle(Math.atan2(dy, dx), Math.hypot(dx, dy) / FIELD_RADIUS, sectorGeometry);
  };
  const eligibleBubbleTargets = (): VisualBubble[] => visibleBubbles
    .filter((bubble) => !bubble.task.isCollaborative && !bubble.task.parentTaskId && (bubble.task.taskType ?? 'TASK') === 'TASK')
    .map((bubble) => ({ id: bubble.task.id, ...getBubbleVisualPoint(bubble), radius: bubble.radius }));

  const onBubblePointerDown = (event: ReactPointerEvent<SVGGElement>, bubble: (typeof bubbles)[number]) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || bubbleActionPending || isSearchFiltering ||
        bubble.task.isCollaborative || bubble.task.parentTaskId || (bubble.task.taskType ?? 'TASK') !== 'TASK') return;
    const point = toSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    event.preventDefault();
    setBubbleDragNotice(null);
    dragSessionRef.current = {
      taskId: bubble.task.id, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY,
      startSvgX: point.x, startSvgY: point.y, lastSvgX: point.x, lastSvgY: point.y,
      moved: false, target: null, targetSince: 0
    };
    // The stable root SVG holds capture, not a moving/reordered bubble group.
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onBubblePointerMove = (event: ReactPointerEvent<SVGElement>, bubble: (typeof bubbles)[number]) => {
    const session = dragSessionRef.current;
    if (!session || session.taskId !== bubble.task.id || session.pointerId !== event.pointerId) return;
    const point = toSvgPoint(event.clientX, event.clientY);
    if (!point) return;
    session.lastSvgX = point.x;
    session.lastSvgY = point.y;
    if (!session.moved && Math.hypot(event.clientX - session.startClientX, event.clientY - session.startClientY) < 7) return;
    session.moved = true;
    event.preventDefault();
    event.stopPropagation();
    cancelHoverExit();
    setHoveredTaskId(null);
    setCompactHoverPoint(null);
    const position = getBubbleVisualPoint(bubble);
    const center = { x: position.x + point.x - session.startSvgX, y: position.y + point.y - session.startSvgY };
    const target = detectBubbleDrop(center, session.taskId, bubble.radius, eligibleBubbleTargets());
    const destinationSectorIndex = getSectorIndexAtPoint(center);
    const destinationSector = bubbleSectors[destinationSectorIndex] ?? null;
    const changesSector = mode === 'sectors' && sectorCount > 1 &&
      (destinationSector?.id ?? null) !== (bubble.task.sphereId ?? null);
    if (session.target?.targetId !== target?.targetId || session.target?.kind !== target?.kind) {
      session.targetSince = Date.now();
    }
    session.target = target;
    queueDragView({
      taskId: session.taskId, dx: point.x - session.startSvgX, dy: point.y - session.startSvgY, target,
      destinationSectorIndex, destinationSectorName: destinationSector?.name ?? 'Без сектора', changesSector
    });
  };

  const isPoppingTask = (taskId: string) => poppingTaskId === taskId;

  const onBubblePointerUp = (event: ReactPointerEvent<SVGElement>, bubble: (typeof bubbles)[number]) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId || session.taskId !== bubble.task.id) return;
    dragSessionRef.current = null;
    cancelDragFrame();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragView(null);
    if (!session.moved) {
      // Pointer capture targets the root SVG, so a browser click no longer
      // reaches the bubble. Open the task directly on a stationary release.
      ignoreClickRef.current = session.taskId;
      setTimeout(() => { if (ignoreClickRef.current === session.taskId) ignoreClickRef.current = null; }, 0);
      if (!isPoppingTask(bubble.task.id)) onSelect(bubble.task);
      return;
    }
    ignoreClickRef.current = session.taskId;
    setTimeout(() => { if (ignoreClickRef.current === session.taskId) ignoreClickRef.current = null; }, 0);
    event.preventDefault();
    event.stopPropagation();
    if (session.target?.kind === 'nest' && Date.now() - session.targetSince < 550) {
      showBubbleNotice('Для создания подзадачи задержите пузырь внутри другого на полсекунды.', 'warning');
      return;
    }
    const dropPoint = getBubbleVisualPoint(bubble);
    const px = dropPoint.x + session.lastSvgX - session.startSvgX;
    const py = dropPoint.y + session.lastSvgY - session.startSvgY;
    const normalizedX = SIZE / 2 + (px - BUBBLE_FIELD_CENTER_X) / ELLIPSE_X_SCALE;
    const normalizedY = SIZE / 2 + (py - BUBBLE_FIELD_CENTER_Y) / ELLIPSE_Y_SCALE;
    const distance = Math.hypot(normalizedX - SIZE / 2, normalizedY - SIZE / 2);
    const destinationIndex = getSectorIndexAtPoint({ x: px, y: py });
    const destinationSector = bubbleSectors[destinationIndex] ?? null;
    const changesSector = mode === 'sectors' && sectorCount > 1 &&
      (destinationSector?.id ?? null) !== (bubble.task.sphereId ?? null);
    // A highlighted destination remains valid just outside the oval.
    if (!session.target && distance > FIELD_RADIUS + bubble.radius && !changesSector) {
      showBubbleNotice('Отпустите пузырь внутри поля задач.', 'warning');
      return;
    }
    const x = clamp(normalizedX, 0, SIZE);
    const y = clamp(normalizedY, 0, SIZE);
    const target = session.target ? tasks.find((task) => task.id === session.target?.targetId) : null;
    const sectorChange = mode === 'sectors' ? { sphereId: destinationSector?.id ?? null } : {};
    const action = session.target
      ? { action: session.target.kind, targetTaskId: session.target.targetId }
      : bubble.task.linkedTaskIds?.length
        ? { action: 'unlink' as const, x, y, mode, ...sectorChange }
        : { action: 'move' as const, x, y, mode, ...sectorChange };
    setBubbleActionPending(true);
    void onBubbleAction(bubble.task, action).then(() => {
      if (action.action === 'link' && target) showBubbleNotice(`Задачи «${bubble.task.title}» и «${target.title}» теперь связаны.`);
      else if (action.action === 'nest' && target) showBubbleNotice(`«${bubble.task.title}» теперь подзадача «${target.title}».`);
      else if (action.action === 'unlink') {
        showBubbleNotice(changesSector
          ? `Связь разорвана. «${bubble.task.title}» перенесена в сектор «${destinationSector?.name ?? 'Без сектора'}».`
          : 'Связь между задачами удалена.');
      } else showBubbleNotice(changesSector
        ? `«${bubble.task.title}» перенесена в сектор «${destinationSector?.name ?? 'Без сектора'}».`
        : 'Положение пузыря сохранено.');
    }).catch((error: unknown) => {
      showBubbleNotice(error instanceof Error ? error.message : 'Не удалось переместить пузырь.', 'error');
    }).finally(() => setBubbleActionPending(false));
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const session = dragSessionRef.current;
    if (!session) return;
    const source = visibleBubbles.find((bubble) => bubble.task.id === session.taskId);
    if (source) onBubblePointerMove(event, source);
  };
  const onCanvasPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const session = dragSessionRef.current;
    if (!session) return;
    const source = visibleBubbles.find((bubble) => bubble.task.id === session.taskId);
    if (source) onBubblePointerUp(event, source);
  };
  const cancelCanvasPointer = () => {
    dragSessionRef.current = null;
    cancelDragFrame();
    setDragView(null);
  };

  const hoveredBubble = useMemo(() => visibleBubbles.find((bubble) => bubble.task.id === hoveredTaskId) ?? null, [hoveredTaskId, visibleBubbles]);
  const hoveredSubtasks = hoveredBubble ? (subtaskMap[hoveredBubble.task.id] ?? []).filter((subtask) => subtask.status !== 'DONE') : [];
  const hoveredSphere = hoveredBubble?.task.sphereId ? spheres.find((sphere) => sphere.id === hoveredBubble.task.sphereId) : null;
  const hoveredTaskCoefficient = hoveredBubble ? getTaskCoefficient(getSourceTask(hoveredBubble.task), subtaskMap) : 0;
  const visibleHoverSubtasks = hoveredSubtasks.slice(0, 6);
  const hiddenHoverSubtaskCount = Math.max(0, hoveredSubtasks.length - visibleHoverSubtasks.length);


  // Render connected components atomically: all members and all real edges
  // share a parent transform and the same transition when filtering modes.
  type BubbleGroup = {
    key: string;
    anchor: (typeof bubbles)[number];
    members: (typeof bubbles)[number][];
    edges: Array<[string, string]>;
  };
  const bubbleGroups = useMemo<BubbleGroup[]>(() => {
    const byId = new Map(visibleBubbles.map((bubble) => [bubble.task.id, bubble]));
    const components = getLinkedBubbleGroups(visibleBubbles.map((bubble) => ({
      id: bubble.task.id, ...getBubbleVisualPoint(bubble),
      radius: bubble.radius, linkedTaskIds: bubble.task.linkedTaskIds,
      bubbleLinkAnchorId: bubble.task.bubbleLinkAnchorId
    })));
    return components.map((component) => ({
      key: component.ids.join(':'), anchor: byId.get(component.anchorId)!,
      members: component.ids.map((id) => byId.get(id)!),
      edges: component.edges
    }));
  }, [visibleBubbles, bubbleVisualPositions]);
  const orderedGroups = dragView
    ? [...bubbleGroups].sort((a, b) =>
        Number(a.members.some((member) => member.task.id === dragView.taskId)) -
        Number(b.members.some((member) => member.task.id === dragView.taskId)))
    : bubbleGroups;

  useEffect(() => {
    if (isAddingSubtask) {
      subtaskTitleInputRef.current?.focus();
    }
  }, [isAddingSubtask]);

  const handleNativeCalendarOpenChange = (nextOpen: boolean) => {
    if (nativeCalendarCloseTimer.current) {
      clearTimeout(nativeCalendarCloseTimer.current);
      nativeCalendarCloseTimer.current = null;
    }

    if (nextOpen) {
      setIsNativeCalendarOpen(true);
      cancelHoverExit();
      return;
    }

    nativeCalendarCloseTimer.current = setTimeout(() => {
      setIsNativeCalendarOpen(false);
      nativeCalendarCloseTimer.current = null;
    }, 320);
  };

  useEffect(() => () => {
    if (nativeCalendarCloseTimer.current) {
      clearTimeout(nativeCalendarCloseTimer.current);
    }
  }, []);

  const ellipsePoint = (point: { x: number; y: number }) => ({
    x: BUBBLE_FIELD_CENTER_X + point.x * ELLIPSE_RADIUS_X,
    y: BUBBLE_FIELD_CENTER_Y + point.y * ELLIPSE_RADIUS_Y
  });
  const hillBoundaryPath = (boundaryIndex: number, startRatio = 0) => {
    const curve = hillBoundaryCurve(sectorGeometry, boundaryIndex);
    const t = Math.min(1, Math.max(0, startRatio));
    // A quadratic subcurve is still one quadratic, not a polyline.
    const start = ellipsePoint({
      x: 2 * (1 - t) * t * curve.control.x + t * t * curve.end.x,
      y: 2 * (1 - t) * t * curve.control.y + t * t * curve.end.y
    });
    const control = ellipsePoint({
      x: (1 - t) * curve.control.x + t * curve.end.x,
      y: (1 - t) * curve.control.y + t * curve.end.y
    });
    const end = ellipsePoint(curve.end);
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  };
  const hillRegionPath = (sectorIndex: number) => {
    const geometry = sectorGeometry[sectorIndex];
    if (!geometry || sectorCount <= 1) return '';
    const first = hillBoundaryCurve(sectorGeometry, sectorIndex);
    const last = hillBoundaryCurve(sectorGeometry, (sectorIndex + 1) % sectorCount);
    const firstControl = ellipsePoint(first.control);
    const firstEnd = ellipsePoint(first.end);
    const lastControl = ellipsePoint(last.control);
    const lastEnd = ellipsePoint(last.end);
    return `M ${BUBBLE_FIELD_CENTER_X} ${BUBBLE_FIELD_CENTER_Y} Q ${firstControl.x.toFixed(2)} ${firstControl.y.toFixed(2)} ${firstEnd.x.toFixed(2)} ${firstEnd.y.toFixed(2)} A ${ELLIPSE_RADIUS_X} ${ELLIPSE_RADIUS_Y} 0 ${geometry.span > Math.PI ? 1 : 0} 1 ${lastEnd.x.toFixed(2)} ${lastEnd.y.toFixed(2)} Q ${lastControl.x.toFixed(2)} ${lastControl.y.toFixed(2)} ${BUBBLE_FIELD_CENTER_X} ${BUBBLE_FIELD_CENTER_Y} Z`;
  };

  const sectorLabels = useMemo(() => {
    if (sectorCount === 1) return [];
    return bubbleSectors.map((sphere, idx) => {
      const angle = sectorGeometry[idx]?.midAngle ?? 0;
      const distance = SIZE * 0.46;
      const point = mapToOval(SIZE / 2 + Math.cos(angle) * distance, SIZE / 2 + Math.sin(angle) * distance);
      return {
        sphere,
        x: point.x,
        y: point.y,
      };
    });
  }, [mapToOval, sectorCount, sectorGeometry, bubbleSectors]);

  const cancelHoverExit = () => {
    if (hoverExitTimer.current) {
      clearTimeout(hoverExitTimer.current);
      hoverExitTimer.current = null;
    }
  };

  const activateHover = (taskId: string) => {
    cancelHoverExit();
    if (taskId !== hoveredTaskId) {
      setIsAddingSubtask(false);
    }
    setHoveredTaskId(taskId);
  };

  const scheduleHoverExit = () => {
    if (isNativeCalendarOpen) return;
    cancelHoverExit();
    hoverExitTimer.current = setTimeout(() => {
      setHoveredTaskId(null);
      setIsAddingSubtask(false);
    }, HOVER_EXIT_DELAY_MS);
  };

  const onAddSubtask = async (parentTask: Task) => {
    const draft = getDraftForTask(parentTask.id);
    const nextTitle = draft.title.trim() || 'Новая доп задача';
    const nextDescription = draft.description.trim();
    const nextNotifyBeforeMinutes = draft.notifyPreset === 'null' ? null : Number(draft.notifyPreset);

    await onCreateSubtask(parentTask, {
      title: nextTitle,
      description: nextDescription || undefined,
      dueDate: draft.dueDate || null,
      notifyBeforeMinutes: Number.isFinite(nextNotifyBeforeMinutes) ? nextNotifyBeforeMinutes : null
    });
    setSubtaskDrafts((prev) => ({ ...prev, [parentTask.id]: defaultSubtaskDraft() }));
    setIsAddingSubtask(false);
  };


  const hoverInfoCard = { width: 340, height: 228 };
  const hoverSubtasksCard = { width: 400, height: 340 };

  const getSubtasksCardY = (bubbleY: number, bubbleRadius: number) => {
    const belowY = bubbleY + bubbleRadius + 18;
    const aboveY = bubbleY - bubbleRadius - hoverSubtasksCard.height - 18;

    if (belowY + hoverSubtasksCard.height <= workspaceMax - 8) {
      return clamp(belowY, workspaceMin + 8, workspaceMax - hoverSubtasksCard.height - 8);
    }

    if (aboveY >= workspaceMin + 8) {
      return aboveY;
    }

    return clamp(belowY, workspaceMin + 8, workspaceMax - hoverSubtasksCard.height - 8);
  };
  const workspaceMin = VIEWBOX_TOP;
  const workspaceMax = VIEWBOX_BOTTOM;
  const workspaceMaxX = VIEWBOX_RIGHT;


  const renderBubble = (bubble: (typeof bubbles)[number], groupOrigin?: { x: number; y: number }) => {
    const isPopping = poppingTaskId === bubble.task.id;
    const active = bubble.task.status !== 'DONE';
    const bubbleSubtasks = subtaskMap[bubble.task.id] ?? [];
    const ownDeadlineOverdue = active && isOverdue(bubble.task);
    const subtaskDeadlineOverdue = active && bubbleSubtasks.some((subtask) =>
      subtask.status !== 'DONE' && isOverdue(subtask));
    const isHovered = hoveredTaskId === bubble.task.id;
    const isDragged = dragView?.taskId === bubble.task.id;
    const isDragTarget = dragView?.target?.targetId === bubble.task.id;
    const doneSubtasksCount = bubbleSubtasks.filter((task) => task.status === 'DONE').length;
    const subtaskProgress = bubbleSubtasks.length > 0 ? doneSubtasksCount / bubbleSubtasks.length : 0;
    const progressCircumference = 2 * Math.PI * (bubble.radius + 6);
    const hasAiMessage = hasAiNotification?.(bubble.task.id) ?? false;
    const commentCount = bubble.task.commentCount ?? 0;
    const unreadCommentCount = bubble.task.unreadCommentCount ?? 0;
    const hasComments = commentCount > 0;
    const aiBadgeX = -bubble.radius * 0.78;
    const aiBadgeY = -bubble.radius * 0.78;
    const commentBadgeX = bubble.radius * 0.78;
    const commentBadgeY = bubble.radius * 0.78;
    const isSmartPostponing = smartPostponeTaskId === bubble.task.id;
    const baseVisualPoint = getBubbleVisualPoint(bubble);
    const displayPoint = isDragged && dragView
      ? { x: baseVisualPoint.x + dragView.dx, y: baseVisualPoint.y + dragView.dy }
      : baseVisualPoint;
    const animatedPoint = groupOrigin
      ? { x: displayPoint.x - groupOrigin.x, y: displayPoint.y - groupOrigin.y }
      : displayPoint;
    const titleLineClamp = bubble.radius < 30 ? 2 : bubble.radius < 44 ? 3 : 4;
    const titleFontSize = getBubbleTitleFontSize(bubble.task.title, bubble.radius);
    const titlePreview = getBubbleTitlePreview(bubble.task.title, bubble.radius);
    const vectorTitleLines = wrapBubbleTitleForSvg(titlePreview, bubble.radius, titleFontSize, titleLineClamp);

    return (
      <motion.g
        key={bubble.task.id}
        data-bubble-task-id={bubble.task.id}
        initial={false}
        animate={isPopping ? { opacity: 0, scale: 1.28 } : { opacity: 1, scale: isDragged ? 1.05 : isDragTarget ? 1.04 : isHovered ? 1.075 : 1, x: animatedPoint.x, y: animatedPoint.y }}
        exit={isSearchFiltering ? { opacity: 0, scale: 0.96, x: animatedPoint.x, y: animatedPoint.y } : { opacity: 0, scale: isPopping ? 1.28 : 0.96, x: animatedPoint.x, y: animatedPoint.y }}
        transition={isDragged ? { duration: 0 } : isPopping
          ? { type: 'tween', duration: 0.33, ease: 'easeOut' }
          : { type: 'tween', duration: 0.34, ease: 'easeInOut' }}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        onClick={() => {
          if (ignoreClickRef.current === bubble.task.id) { ignoreClickRef.current = null; return; }
          if (!isPopping && !dragSessionRef.current) onSelect(bubble.task);
        }}
        onPointerDown={(event) => onBubblePointerDown(event, bubble)}
         onMouseEnter={(event) => {
          if (dragSessionRef.current) return;
          activateHover(bubble.task.id);
          if (compact) {
            setCompactHoverPoint(compactBubbleHoverPlacement(
              event.currentTarget.getBoundingClientRect(), window.innerWidth, window.innerHeight
            ));
          }
        }}
        onMouseLeave={() => {
          setCompactHoverPoint(null);
          if (!dragSessionRef.current) scheduleHoverExit();
        }}
        onContextMenu={(event) => showContextMenu(event, bubble.task)}
        className={bubble.task.isCollaborative || bubble.task.taskType === 'EVENT' || bubble.task.taskType === 'REMINDER' ? 'cursor-pointer' : isDragged ? 'cursor-grabbing' : 'cursor-grab'}
      >
        <circle cx={0} cy={0} r={bubble.radius + 10} fill="transparent" />
        <circle
          cx={0}
          cy={0}
          r={bubble.radius}
          fill={getBubbleShade(bubble.color, bubble.distanceRatio)}
          fillOpacity={isLightTheme ? 0.66 : 0.48}
          stroke={isDragTarget ? (dragView?.target?.kind === 'nest' ? '#f59e0b' : '#a78bfa') : selectedId === bubble.task.id ? (isLightTheme ? '#0f172a' : '#f8fafc') : (isLightTheme ? 'rgba(14,116,144,0.56)' : '#bae6fd')}
          strokeOpacity={selectedId === bubble.task.id ? 1 : isLightTheme ? 0.78 : 0.65}
          strokeWidth={isDragTarget || isDragged ? 5 : selectedId === bubble.task.id ? 3.5 : 2.4}
        />
        {ownDeadlineOverdue || subtaskDeadlineOverdue ? (
          <circle cx={0} cy={0} r={bubble.radius - 1.5}
            fill={ownDeadlineOverdue ? 'url(#overdueTaskBlush)' : 'url(#overdueSubtaskBlush)'}
            stroke="none" pointerEvents="none" />
        ) : null}
        {/* All tasks share the same neutral progress track. No subtasks = 0%. */}
        <circle cx={0} cy={0} r={bubble.radius + 6} fill="none"
          stroke={isLightTheme ? 'rgba(100,116,139,0.42)' : 'rgba(148,163,184,0.43)'}
          strokeWidth={4} pointerEvents="none" />
        {subtaskProgress > 0 ? (
          <circle cx={0} cy={0} r={bubble.radius + 6} fill="none"
            stroke="#22c55e" strokeWidth={4.4} strokeLinecap="round"
            strokeDasharray={progressCircumference}
            strokeDashoffset={progressCircumference * (1 - subtaskProgress)}
            transform="rotate(-90)" pointerEvents="none" />
        ) : null}
        <text x={0}
            y={-((vectorTitleLines.length - 1) * titleFontSize * 1.12) / 2 + titleFontSize * 0.32}
            textAnchor="middle" fontSize={titleFontSize} fontWeight={600}
            fill={isLightTheme ? '#0f172a' : '#f8fafc'}
            stroke="none" pointerEvents="none"
            style={{ userSelect: 'none', textRendering: 'optimizeLegibility' }}>
            {vectorTitleLines.map((line, index) => (
              <tspan key={index} x={0} dy={index ? titleFontSize * 1.12 : 0}>{line}</tspan>
            ))}
          </text>
        {bubble.task.aiMonitoringEnabled ? (
          <g pointerEvents="none" aria-label="Автомониторинг включён">
            <circle cx={0} cy={-bubble.radius - 3} r={12} fill="#10b981" stroke={isLightTheme ? '#fff' : '#0f172a'} strokeWidth={2} />
            <text x={0} y={-bubble.radius + 1} textAnchor="middle" fontSize={13} fontWeight={800} fill="white">A</text>
          </g>
        ) : null}
        {bubble.task.isRecurring ? (
          <g pointerEvents="none">
            <circle cx={0} cy={-bubble.radius * 0.72} r={10} fill={isLightTheme ? 'rgba(255,255,255,0.86)' : 'rgba(15,23,42,0.75)'} stroke={isLightTheme ? 'rgba(14,116,144,0.24)' : undefined} />
            <foreignObject x={-6} y={-bubble.radius * 0.72 - 6} width={12} height={12}>
              <div className="flex h-full w-full items-center justify-center">
                <Repeat size={12} color={isLightTheme ? '#0e7490' : '#bae6fd'} />
              </div>
            </foreignObject>
          </g>
        ) : null}

        {hasAiMessage ? (
          <g pointerEvents="none">
            <circle cx={aiBadgeX} cy={aiBadgeY} r={11} fill="#7c3aed" />
            <foreignObject x={aiBadgeX - 6} y={aiBadgeY - 6} width={12} height={12}>
              <div className="flex h-full w-full items-center justify-center">
                <Sparkles size={12} color="#ffffff" />
              </div>
            </foreignObject>
          </g>
        ) : null}

        {hasComments ? (
          <g pointerEvents="none">
            <circle cx={commentBadgeX} cy={commentBadgeY} r={11} fill="#2563eb" />
            <foreignObject x={commentBadgeX - 6} y={commentBadgeY - 6} width={12} height={12}>
              <div className="flex h-full w-full items-center justify-center">
                <MessageCircle size={12} color="#ffffff" />
              </div>
            </foreignObject>
            {unreadCommentCount > 0 ? (
              <>
                <circle cx={commentBadgeX + 8} cy={commentBadgeY - 8} r={7} fill="#7c3aed" />
                <foreignObject x={commentBadgeX + 2} y={commentBadgeY - 14} width={12} height={12}>
                  <div className="flex h-full w-full items-center justify-center text-[7px] font-bold leading-none text-white">
                    {unreadCommentCount > 9 ? '9+' : unreadCommentCount}
                  </div>
                </foreignObject>
              </>
            ) : null}
          </g>
        ) : null}

        {isSmartPostponing ? (
          <motion.g initial={{ opacity: 0, y: -1 }} animate={{ opacity: 1, y: -6 }} exit={{ opacity: 0, y: -10 }} pointerEvents="none">
            <foreignObject x={-10} y={-bubble.radius - 30} width={20} height={20}>
              <div className="flex h-full w-full items-center justify-center">
                <LoaderCircle size={14} className="animate-spin text-cyan-200" />
              </div>
            </foreignObject>
          </motion.g>
        ) : null}

        {postponeResultByTaskId[bubble.task.id] ? (
          <motion.g initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: -8 }} exit={{ opacity: 0, y: -14 }} pointerEvents="none">
            <foreignObject x={-44} y={-bubble.radius - 26} width={88} height={16}>
              <div className="w-full text-center text-[10px] font-semibold text-primary">{postponeResultByTaskId[bubble.task.id]}</div>
            </foreignObject>
          </motion.g>
        ) : null}
      </motion.g>
    );
  };

  return (
    <div
      className={`bubble-field-container surface-canvas relative ${fullscreen
        ? 'overflow-hidden rounded-none border-0'
        : 'overflow-visible rounded-[2.2rem] border'} ${className ?? 'h-full'}`}
      style={{
        boxShadow: fullscreen ? 'none' : '0 6px 18px rgba(15,23,42,0.08)',
        background: fullscreen ? 'transparent' : undefined,
        backdropFilter: 'none'
      }}
      onMouseLeave={() => {
        if (isNativeCalendarOpen) return;
        scheduleHoverExit();
      }}
    >
      <svg ref={svgRef} style={{ userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'pan-x pan-y' }}
        onDragStart={(event) => event.preventDefault()}
        onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp}
        onPointerCancel={cancelCanvasPointer} onLostPointerCapture={cancelCanvasPointer}
        viewBox={compact
          ? `${BUBBLE_WORKSPACE_X - 32} ${VIEWBOX_TOP} ${BUBBLE_WORKSPACE_WIDTH + 64} ${VIEWBOX_HEIGHT}`
          : `${VIEWBOX_LEFT} ${VIEWBOX_TOP} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className={`bubble-field-stage relative z-20 h-full w-full ${fullscreen ? 'overflow-hidden' : 'overflow-visible'}`}
        onContextMenu={(event) => showContextMenu(event, null)}>
        <motion.g initial={false}>
          <defs>
            {/* Darker crimson at the rim stays distinguishable even on pink/orange
                spheres, while the centre retains its original sector colour. */}
            <radialGradient id="overdueTaskBlush" cx="49%" cy="46%" r="72%">
              <stop offset="0%" stopColor="#fb7185" stopOpacity={isLightTheme ? 0.06 : 0.08} />
              <stop offset="48%" stopColor="#ef4444" stopOpacity={isLightTheme ? 0.15 : 0.17} />
              <stop offset="80%" stopColor="#dc2626" stopOpacity={isLightTheme ? 0.39 : 0.42} />
              <stop offset="100%" stopColor="#881337" stopOpacity={isLightTheme ? 0.59 : 0.62} />
            </radialGradient>
            {/* Overdue subtasks have a weaker edge blush than overdue parents. */}
            <radialGradient id="overdueSubtaskBlush" cx="50%" cy="48%" r="69%">
              <stop offset="0%" stopColor="#fb7185" stopOpacity="0" />
              <stop offset="50%" stopColor="#fb7185" stopOpacity={isLightTheme ? 0.06 : 0.07} />
              <stop offset="78%" stopColor="#dc2626" stopOpacity={isLightTheme ? 0.25 : 0.27} />
              <stop offset="100%" stopColor="#881337" stopOpacity={isLightTheme ? 0.46 : 0.49} />
            </radialGradient>
            <radialGradient id="bg" cx="50%" cy="50%" r="60%">
              {isLightTheme ? (
                <>
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
                  <stop offset="58%" stopColor="#dff6ff" stopOpacity="0.54" />
                  <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.22" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.18" />
                  <stop offset="55%" stopColor="#1d4ed8" stopOpacity="0.11" />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0.58" />
                </>
              )}
            </radialGradient>
            <radialGradient id="fieldHalo" cx="50%" cy="50%" r="62%">
              {isLightTheme ? (
                <>
                  <stop offset="62%" stopColor="#7dd3fc" stopOpacity="0" />
                  <stop offset="88%" stopColor="#38bdf8" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.04" />
                </>
              ) : (
                <>
                  <stop offset="68%" stopColor="#67e8f9" stopOpacity="0" />
                  <stop offset="88%" stopColor="#67e8f9" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.02" />
                </>
              )}
            </radialGradient>
            {mode === 'sectors' && sectorCount > 1 && sectorGeometry.map((_, index) => (
              <radialGradient key={`petal-fill-${index}`} id={`petal-sector-gradient-${index}`}
                cx="48%" cy="45%" r="85%">
                <stop offset="0%" stopColor={bubbleSectors[index]?.color ?? '#94a3b8'}
                  stopOpacity={isLightTheme ? 0.057 : 0.028} />
                <stop offset="100%" stopColor={bubbleSectors[index]?.color ?? '#94a3b8'}
                  stopOpacity={isLightTheme ? 0.108 : 0.060} />
              </radialGradient>
            ))}
            {/* Blur only the color wash. The outer clip preserves the oval edge
                and keeps SVG bubbles, progress rings and controls razor-sharp. */}
            <clipPath id="petal-sector-oval-clip">
              <ellipse cx={BUBBLE_FIELD_CENTER_X} cy={BUBBLE_FIELD_CENTER_Y}
                rx={ELLIPSE_RADIUS_X} ry={ELLIPSE_RADIUS_Y} />
            </clipPath>
            <filter id="petal-sector-feather" x="-20%" y="-20%" width="140%" height="140%"
              colorInterpolationFilters="sRGB">
              <feGaussianBlur stdDeviation={isLightTheme ? 15 : 20} />
            </filter>
          </defs>
          {!compact ? <foreignObject
            x={fullscreen ? FULLSCREEN_TASK_INFO_PANEL_X : TASK_INFO_PANEL_X}
            y={workspaceMin + 24}
            width={fullscreen ? FULLSCREEN_TASK_INFO_PANEL_WIDTH : TASK_INFO_PANEL_WIDTH}
            height={VIEWBOX_HEIGHT - 48}
            pointerEvents="none">
            <div className={`bubble-tooltip-card bubble-task-info-panel flex h-full flex-col rounded-[2.15rem] border ${fullscreen ? 'p-4' : 'p-6'}`}>
              {hoveredBubble ? (
                <div className="min-h-0 space-y-4 overflow-hidden">
                  <div>
                    <p className="bubble-task-info-eyebrow text-sm font-semibold uppercase tracking-[0.28em]">Информация о задаче</p>
                    <h3 className="mt-3 break-words text-3xl font-semibold leading-tight text-primary">
                      <LinkifiedText text={hoveredBubble.task.title} stopPropagationOnLinkClick />
                    </h3>
                  </div>
                  <div className="bubble-task-info-section rounded-[1.35rem] border p-3">
                    <p className="text-sm uppercase tracking-[0.18em] text-subtle">Описание</p>
                    <div className="mt-2 max-h-44 overflow-hidden break-words text-lg leading-relaxed text-muted">
                      <LinkifiedText text={noteHtmlToPlainText(hoveredBubble.task.description ?? '', { trimEnd: true })} fallback="Без описания" stopPropagationOnLinkClick />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-base">
                    <div className="bubble-info-badge rounded-[1.2rem] border p-3">
                      <p className="text-subtle">Дедлайн</p>
                      <p className="mt-1 font-semibold text-primary">{hoveredBubble.task.aiMonitoringEnabled ? <span className="inline-flex items-center gap-1"><TaskMonitoringBadge /> На усмотрение ИИ</span> : formatDueDate(hoveredBubble.task.dueDate)}</p>
                    </div>
                    <div className="bubble-info-badge rounded-[1.2rem] border p-3">
                      <p className="text-subtle">{hoveredBubble.task.aiMonitoringEnabled ? 'Следующие действия' : 'Осталось'}</p>
                      <p className="mt-1 font-semibold text-primary">{hoveredBubble.task.aiMonitoringEnabled ? `${hoveredBubble.task.monitoringTriggers?.length ?? 0} триггеров` : formatDeadlineLeft(hoveredBubble.task.dueDate)}</p>
                    </div>
                    <div className="bubble-info-badge rounded-[1.2rem] border p-3" style={getInfoBadgeStyle(IMPORTANCE_BUBBLE_COLORS[hoveredBubble.task.importance] ?? '#64748b', isLightTheme)}>
                      <p className="text-subtle">Важность</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className="list-task-importance-badge inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-semibold"
                          style={{ backgroundColor: IMPORTANCE_BUBBLE_COLORS[hoveredBubble.task.importance] ?? '#64748b' }}
                          title="Важность задачи"
                        >
                          {hoveredBubble.task.importance}
                        </span>
                        <span
                          className="list-task-coefficient-badge inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm font-semibold"
                          style={{ backgroundColor: getCoefficientBadgeColor(hoveredTaskCoefficient) }}
                          title="Коэффициент важности задачи"
                        >
                          <Gauge size={14} />
                          {hoveredTaskCoefficient.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="bubble-info-badge rounded-[1.2rem] border p-3" style={getInfoBadgeStyle(hoveredSphere?.color ?? '#64748b', isLightTheme)}>
                      <p className="text-subtle">Сектор</p>
                      <p className="mt-1 truncate font-semibold text-primary">{hoveredSphere?.name ?? 'Без сектора'}</p>
                    </div>
                  </div>
                  <div className="bubble-info-badge rounded-[1.5rem] border p-4 text-base">
                    <div className="mb-2">
                      <p className="font-semibold text-primary">Подзадачи</p>
                    </div>
                    <ul className="grid grid-cols-2 gap-2 overflow-hidden text-muted">
                      {hoveredSubtasks.length === 0 ? <li className="col-span-2 text-subtle">Пока нет активных подзадач</li> : null}
                      {visibleHoverSubtasks.map((subtask) => {
                        const glowClass = subtask.status !== 'DONE' && isOverdue(subtask)
                          ? 'bubble-subtask-preview-overdue'
                          : subtask.status !== 'DONE' && shouldTaskGlow(subtask)
                            ? 'bubble-subtask-preview-reminder'
                            : '';
                        return (
                          <li key={subtask.id} className={`bubble-subtask-preview rounded-[1rem] border px-2 py-1.5 ${glowClass}`}>
                            <span className="bubble-subtask-preview-title break-words" title={subtask.title}>{subtask.title}</span>
                            <span className="bubble-subtask-preview-date mt-0.5 block truncate text-sm text-subtle">{hoveredBubble.task.aiMonitoringEnabled ? 'На усмотрение ИИ' : `Срок: ${formatDueDate(subtask.dueDate)}`}</span>
                          </li>
                        );
                      })}
                      {hiddenHoverSubtaskCount > 0 ? <li className="col-span-2 text-subtle">Ещё осталось: {hiddenHoverSubtaskCount}</li> : null}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-subtle">
                  <p className="bubble-task-info-eyebrow text-[11px] font-semibold uppercase tracking-[0.28em]">Информация о задаче</p>
                  <p className="mt-3 text-lg leading-relaxed">Наведи на пузырь, чтобы увидеть полное название, описание, дедлайн и подзадачи.</p>
                </div>
              )}
            </div>
          </foreignObject> : null}
          <ellipse cx={BUBBLE_FIELD_CENTER_X} cy={BUBBLE_FIELD_CENTER_Y} rx={ELLIPSE_RADIUS_X} ry={ELLIPSE_RADIUS_Y}
            fill={mode === 'sectors' && sectorCount > 1
              ? (isLightTheme ? '#f7fbff' : '#152034')
              : 'url(#bg)'}
            opacity={isLightTheme ? 0.94 : 0.86} />
          <ellipse cx={BUBBLE_FIELD_CENTER_X} cy={BUBBLE_FIELD_CENTER_Y} rx={ELLIPSE_RADIUS_X + 22} ry={ELLIPSE_RADIUS_Y + 16} fill="url(#fieldHalo)" opacity={isLightTheme ? 0.48 : 0.7} />

          {/* Feather the tint across neighbouring sector boundaries without
              changing their mathematical geometry or drag/drop hit areas. */}
          {mode === 'sectors' && sectorCount > 1 && (
            <g clipPath="url(#petal-sector-oval-clip)" pointerEvents="none">
              <g filter="url(#petal-sector-feather)">
                {sectorGeometry.map((_, idx) => (
                  <path key={`hill-area-${idx}`} d={hillRegionPath(idx)}
                    fill={`url(#petal-sector-gradient-${idx})`} />
                ))}
              </g>
            </g>
          )}
          {dragView?.changesSector && !dragView.target && sectorCount > 1 && (
            <path d={hillRegionPath(dragView.destinationSectorIndex)}
              fill={bubbleSectors[dragView.destinationSectorIndex]?.color ?? '#22d3ee'}
              fillOpacity={0.15} stroke={bubbleSectors[dragView.destinationSectorIndex]?.color ?? '#22d3ee'}
              strokeWidth={1.6} strokeOpacity={0.5} strokeDasharray="9 9" pointerEvents="none" />
          )}
          {mode === 'sectors' && sectorCount > 1 && sectorGeometry.map((_, idx) => (
            <path key={`hill-wall-${idx}`}
              d={hillBoundaryPath(idx)} fill="none"
              stroke={isLightTheme ? '#7898ac' : '#cbd5e1'}
              strokeWidth={isLightTheme ? 1.9 : 1.5}
              strokeOpacity={isLightTheme ? 0.48 : 0.28}
              strokeLinecap="round" pointerEvents="none" />
          ))}
          {mode === 'sectors' && sectorCount > 2 && (
            <circle cx={BUBBLE_FIELD_CENTER_X} cy={BUBBLE_FIELD_CENTER_Y} r={9}
              fill={isLightTheme ? '#ffffff' : '#344960'}
              fillOpacity={isLightTheme ? 0.95 : 0.91}
              stroke={isLightTheme ? '#7293a8' : '#a5b7ca'}
              strokeWidth={1.45} strokeOpacity={isLightTheme ? 0.8 : 0.7}
              pointerEvents="none" />
          )}

          {!packedLayout && (
            <text x={BUBBLE_FIELD_CENTER_X} y={BUBBLE_FIELD_CENTER_Y}
              textAnchor="middle" fill="currentColor" opacity={0.5}
              fontSize={18} pointerEvents="none">
              Расставляем задачи…
            </text>
          )}
          <AnimatePresence>
            {orderedGroups.map(({ key, anchor, members, edges }) => {
              if (members.length === 1) return renderBubble(anchor);
              const origin = getBubbleVisualPoint(anchor);
              const memberById = new Map(members.map((bubble) => [bubble.task.id, bubble]));
              const draggingMember = members.some((bubble) => bubble.task.id === dragView?.taskId);
              const transition = draggingMember ? { duration: 0 }
                : { type: 'tween' as const, duration: 0.34, ease: 'easeInOut' as const };
              return (
                <motion.g key={key} initial={false}
                  animate={{ x: origin.x, y: origin.y }}
                  exit={isSearchFiltering ? { opacity: 0, scale: 0.96 } : { opacity: 0, scale: 0.98 }}
                  transition={transition}>
                  {edges.map(([firstId, secondId]) => {
                    const first = memberById.get(firstId)!;
                    const second = memberById.get(secondId)!;
                    const pa = getBubbleVisualPoint(first);
                    const pb = getBubbleVisualPoint(second);
                    const a = { x: pa.x - origin.x + (dragView?.taskId === firstId ? dragView.dx : 0),
                                y: pa.y - origin.y + (dragView?.taskId === firstId ? dragView.dy : 0) };
                    const b = { x: pb.x - origin.x + (dragView?.taskId === secondId ? dragView.dx : 0),
                                y: pb.y - origin.y + (dragView?.taskId === secondId ? dragView.dy : 0) };
                    const segment = bubbleLinkSegment(a, b, first.radius, second.radius);
                    return (
                      <motion.line key={`${firstId}:${secondId}`} initial={false} animate={segment} transition={transition}
                        stroke="#8b5cf6" strokeWidth={3.4} strokeDasharray="4 4.5" strokeLinecap="round"
                        opacity={0.98} pointerEvents="none" />
                    );
                  })}
                  {members.map((bubble) => renderBubble(bubble, origin))}
                </motion.g>
              );
            })}
          </AnimatePresence>
          {/* A separate overlay holds the final location, so the completed bubble
              and any reshuffling of linked groups cannot restart the particles. */}
          {completionBursts.map((burst) => {
            const size = Math.max(0.7, Math.min(1.3, burst.radius / 48));
            return (
              <g key={burst.id} transform={`translate(${burst.x} ${burst.y})`} pointerEvents="none" aria-hidden="true">
                <motion.circle
                  cx={0} cy={0} r={burst.radius * 0.45}
                  fill="none" stroke="#fde68a" strokeWidth={2}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: [0, 0.38, 0], scale: [0.7, 1.3, 1.65] }}
                  transition={{ duration: 0.55, delay: 0.22, ease: 'easeOut' }}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                />
                {BUBBLE_COMPLETION_CONFETTI.map((piece, index) => (
                  <motion.rect key={index} x={-2.5} y={-2.5}
                    width={index % 3 === 0 ? 7 : 4.5} height={index % 3 === 0 ? 3 : 5}
                    rx={1} fill={piece.color}
                    initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.65 }}
                    animate={{
                      opacity: [0, 0.92, 0.86, 0],
                      x: piece.x * size, y: (piece.y + 12) * size,
                      rotate: piece.rotation, scale: [0.65, 1, 0.9, 0.55]
                    }}
                    transition={{ duration: 0.72, delay: 0.23 + index * 0.006, ease: 'easeOut' }}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  />
                ))}
              </g>
            );
          })}
          {/* This preview is intentionally ABOVE all circles. Large-to-large
              drops overlap both interiors and would hide any line below them. */}
          {dragView?.target && (() => {
            const from = visibleBubbles.find((bubble) => bubble.task.id === dragView.taskId);
            const to = visibleBubbles.find((bubble) => bubble.task.id === dragView.target?.targetId);
            if (!from || !to) return null;
            const original = getBubbleVisualPoint(from);
            const start = { x: original.x + dragView.dx, y: original.y + dragView.dy };
            const end = getBubbleVisualPoint(to);
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const distance = Math.hypot(dx, dy);
            const ux = distance > 0.001 ? dx / distance : 1;
            const uy = distance > 0.001 ? dy / distance : 0;
            const overlapping = distance < from.radius + to.radius + 18;
            const segment = overlapping
              ? {
                x1: start.x + ux * Math.min(from.radius * 0.38, distance * 0.26),
                y1: start.y + uy * Math.min(from.radius * 0.38, distance * 0.26),
                x2: end.x - ux * Math.min(to.radius * 0.38, distance * 0.26),
                y2: end.y - uy * Math.min(to.radius * 0.38, distance * 0.26)
              } : bubbleLinkSegment(start, end, from.radius, to.radius);
            // Keep the preview in the foreground, like a normal connection:
            // no thick opaque underlay that makes short dashes look solid.
            const color = dragView.target.kind === 'nest'
              ? (isLightTheme ? '#b45309' : '#fbbf24')
              : (isLightTheme ? '#6d28d9' : '#a78bfa');
            return <g pointerEvents="none">
              <circle cx={end.x} cy={end.y} r={to.radius + 6} fill="none"
                stroke={color} strokeWidth={2} strokeDasharray="3.5 5" opacity={0.9} />
              <line {...segment} stroke={color} strokeWidth={3.1}
                strokeDasharray="4 5" strokeLinecap="round" opacity={1} />
            </g>;
          })()}
          {/* Persistent first-visit training invitation, anchored to the same
              oval-relative coordinates and surface style as bubble notices. */}
          {showTrainingInvitation && (
            <foreignObject
              x={BUBBLE_FIELD_CENTER_X - 335}
              y={VIEWBOX_TOP + 8}
              width={670}
              height={76}
            >
              <div className="flex h-full w-full items-start justify-center px-3 pt-1">
                <div className={`inline-flex max-w-full items-center gap-2 rounded-2xl border px-3 py-2.5 text-base font-medium leading-snug shadow-lg backdrop-blur-md ${
                  isLightTheme
                    ? 'border-sky-300/80 bg-white/95 text-slate-800 shadow-slate-300/30'
                    : 'border-cyan-400/35 bg-slate-900/95 text-slate-100 shadow-slate-950/45'
                }`}>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-0.5 font-semibold transition hover:text-cyan-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                    onClick={(event) => { event.stopPropagation(); onOpenTraining?.(); }}
                  >
                    Пройти обучение
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition hover:bg-slate-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
                    aria-label="Закрыть приглашение пройти обучение"
                    title="Закрыть приглашение"
                    onClick={(event) => { event.stopPropagation(); onDismissTraining?.(); }}
                  >
                    <X size={17} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </foreignObject>
          )}
          {/* Unified notifications anchored to the oval rather than the full
              canvas. Preview, sector changes, errors and successes use one place. */}
          {(dragView || bubbleActionPending || bubbleDragNotice) && (
            <foreignObject
              x={BUBBLE_FIELD_CENTER_X - 335}
              y={VIEWBOX_TOP + (showTrainingInvitation ? 82 : 8)}
              width={670}
              height={76}
              pointerEvents="none"
            >
              <div className="flex h-full w-full items-start justify-center px-3 pt-1">
                <div
                  role="status"
                  aria-live="polite"
                  className={`inline-flex max-w-full items-center gap-2 rounded-2xl border px-4 py-2.5 text-center text-base font-medium leading-snug shadow-lg backdrop-blur-md ${
                    isLightTheme
                      ? 'border-sky-300/80 bg-white/95 text-slate-800 shadow-slate-300/30'
                      : 'border-cyan-400/35 bg-slate-900/95 text-slate-100 shadow-slate-950/45'
                  }`}
                >
                  {bubbleActionPending ? (
                    <LoaderCircle size={18} className="shrink-0 animate-spin text-cyan-500" aria-hidden="true" />
                  ) : dragView ? (
                    <Sparkles size={18} className="shrink-0 text-cyan-500" aria-hidden="true" />
                  ) : (
                    <span className="shrink-0 text-lg" aria-hidden="true">{bubbleNoticeKind === 'success' ? '✅' : '⚠️'}</span>
                  )}
                  <span className="min-w-0 line-clamp-2">
                    {bubbleActionPending ? 'Сохраняем изменение…'
                      : dragView?.target
                        ? dragView.target.kind === 'nest'
                          ? 'Сделать подзадачей: удерживайте внутри пузыря 0,5 секунды'
                          : 'Связать задачи'
                        : dragView?.changesSector
                          ? `Переместить в сектор «${dragView.destinationSectorName}»`
                          : dragView
                            ? 'Переместить пузырь или оттянуть связанную задачу, чтобы разъединить'
                            : bubbleDragNotice}
                  </span>
                </div>
              </div>
            </foreignObject>
          )}
          {sectorLabels.map((item) => {
            const Icon = item.sphere ? resolveSphereIcon(item.sphere.icon) : null;
            return (
              <g key={item.sphere?.id ?? 'unassigned-tasks'} transform={`translate(${item.x} ${item.y})`}>
                <foreignObject x={-88} y={-18} width={176} height={40}>
                  <div className="bubble-sector-label flex w-full items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold"
                    style={item.sphere ? {
                      borderColor: `color-mix(in srgb, ${item.sphere.color} 29%, ${isLightTheme ? '#ffffff' : '#475569'})`,
                      background: `color-mix(in srgb, ${item.sphere.color} ${isLightTheme ? '9%' : '15%'}, ${isLightTheme ? '#ffffff' : '#0f172a'})`
                    } : undefined}>
                    {item.sphere ? (
                      <button className="inline-flex min-w-0 items-center gap-2" onClick={() => onRenameSphere?.(item.sphere!)}>
                        {Icon ? <Icon size={15} color={item.sphere.color} /> : null}
                        <span className="truncate" style={{ color: item.sphere.color }}>{item.sphere.name}</span>
                      </button>
                    ) : <span className="truncate text-muted">Без сектора</span>}
                  </div>
                </foreignObject>
                {item.sphere ? <foreignObject x={-12} y={20} width={24} height={24}>
                  <button data-tour="sphere-add" className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-primary" onClick={() => onAddTaskToSphere?.(item.sphere!)}>
                    <Plus size={14} />
                  </button>
                </foreignObject> : null}
              </g>
            );
          })}

          {ENABLE_BUBBLE_HOVER_DETAILS && hoveredBubble ? (
            <>
              <foreignObject
                x={clamp(mapToOval(hoveredBubble.x, hoveredBubble.y).x - hoverInfoCard.width / 2, BUBBLE_WORKSPACE_X + 8, workspaceMaxX - hoverInfoCard.width - 8)}
                y={clamp(mapToOval(hoveredBubble.x, hoveredBubble.y).y - hoveredBubble.radius - hoverInfoCard.height - 10, workspaceMin + 8, workspaceMax - hoverInfoCard.height - 8)}
                width={hoverInfoCard.width}
                height={hoverInfoCard.height}
                onMouseEnter={cancelHoverExit}
                onMouseLeave={scheduleHoverExit}
              >
                <div className="bubble-tooltip-card rounded-xl border p-3 text-xs">
                  <p className="mb-1 font-semibold break-words"><LinkifiedText text={hoveredBubble.task.title} stopPropagationOnLinkClick /></p>
                  <p className="mb-2 text-muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}><LinkifiedText text={noteHtmlToPlainText(hoveredBubble.task.description ?? '', { trimEnd: true })} fallback="Без описания" stopPropagationOnLinkClick /></p>
                  <p className="text-muted">{hoveredBubble.task.aiMonitoringEnabled ? 'На усмотрение ИИ' : `Срок: ${formatDueDate(hoveredBubble.task.dueDate)}`}</p>
                  <p className="inline-flex items-center gap-1 text-muted">
                    {smartPostponeTaskId === hoveredBubble.task.id ? <LoaderCircle size={12} className="animate-spin text-cyan-200" /> : null}
                    {hoveredBubble.task.aiMonitoringEnabled ? <TaskMonitoringBadge /> : formatDeadlineLeft(hoveredBubble.task.dueDate)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-[11px] text-muted">Коэффициент важности</p>
                    <div
                      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--panel-border)] px-2 py-0.5 text-[11px] font-semibold text-primary"
                      style={{ backgroundColor: getCoefficientBadgeColor(getTaskCoefficient(getSourceTask(hoveredBubble.task), subtaskMap)) }}
                    >
                      <Gauge size={11} />
                      {getTaskCoefficient(getSourceTask(hoveredBubble.task), subtaskMap).toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-2 border-t border-[color:var(--panel-border)] pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-primary transition hover:bg-emerald-500"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onQuickCompleteTask(hoveredBubble.task);
                        }}
                      >
                        Выполнить
                      </button>
                      <div className="ml-auto flex items-center gap-2">
                        <div className="flex items-center">
                          {!hoveredBubble.task.aiMonitoringEnabled ? <CustomSelect
                            className="w-[136px]"
                            value=""
                            onChange={(value) => {
                              if (!value) return;
                              runQuickPostpone(hoveredBubble.task, value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart');
                            }}
                            options={[{ value: '', label: 'Отложить' }, { value: '15m', label: 'На 15 мин' }, { value: '30m', label: 'На 30 мин' }, { value: '1h', label: 'На час' }, { value: '3h', label: 'На 3 часа' }, { value: 'tomorrow', label: 'На завтра' }, { value: 'smart', label: '✦ Ближайшее окно (◍ 1)' }]}
                            buttonClassName="h-7 px-2 py-1 text-[11px]"
                            ariaLabel="Отложить задачу"
                          /> : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" className="surface-muted rounded px-2 py-1 text-[11px] font-semibold text-primary hover:brightness-110" onClick={(event) => {
                            event.stopPropagation();
                            void onQuickChangeTaskImportance(hoveredBubble.task, -1);
                          }}>-</button>
                          <div
                            className="h-7 min-w-8 rounded px-2 text-center text-[11px] font-semibold leading-7 text-primary"
                            style={{ backgroundColor: IMPORTANCE_BUBBLE_COLORS[hoveredBubble.task.importance] ?? '#64748b' }}
                          >
                            {hoveredBubble.task.importance}
                          </div>
                          <button type="button" className="surface-muted rounded px-2 py-1 text-[11px] font-semibold text-primary hover:brightness-110" onClick={(event) => {
                            event.stopPropagation();
                            void onQuickChangeTaskImportance(hoveredBubble.task, 1);
                          }}>+</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </foreignObject>
              <foreignObject
                x={clamp(mapToOval(hoveredBubble.x, hoveredBubble.y).x - hoverSubtasksCard.width / 2, BUBBLE_WORKSPACE_X + 8, workspaceMaxX - hoverSubtasksCard.width - 8)}
                y={getSubtasksCardY(mapToOval(hoveredBubble.x, hoveredBubble.y).y, hoveredBubble.radius)}
                width={hoverSubtasksCard.width}
                height={hoverSubtasksCard.height}
                onMouseEnter={cancelHoverExit}
                onMouseLeave={scheduleHoverExit}
              >
                <div
                  className="bubble-tooltip-card rounded-xl border p-3 text-xs"
                  data-no-field-zoom="true"
                >
                  <div className="mb-2 flex justify-end">
                    <button
                    type="button"
                    className={`mb-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${isSubtaskFilterActive
                      ? 'border-cyan-300 bg-cyan-600/90 text-primary'
                      : 'border-[color:var(--panel-border)] surface-muted text-muted hover:brightness-110'}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSubtaskFilter();
                    }}
                  >
                    Фильтровать
                    </button>
                  </div>
                  <ul className="mb-3 max-h-40 space-y-1.5 overflow-y-auto pr-1" data-no-field-zoom="true">
                    {hoveredSubtasks.length === 0 ? <li className="text-subtle">Пока нет подзадач</li> : null}
                    {hoveredSubtasks.map((subtask) => (
                      <li
                        key={subtask.id}
                        className="relative surface-muted overflow-hidden rounded px-2 py-1.5"
                        style={subtask.status !== 'DONE' && isOverdue(subtask)
                          ? { boxShadow: SUBTASK_OVERDUE_GLOW_STYLE }
                          : subtask.status !== 'DONE' && shouldTaskGlow(subtask)
                            ? { boxShadow: SUBTASK_REMINDER_GLOW_STYLE }
                            : undefined}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 shrink-0"
                            checked={subtask.status === 'DONE'}
                            onChange={(event) => {
                              event.stopPropagation();
                              onToggleSubtaskDone(subtask);
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div
                              className={`cursor-pointer break-words text-left leading-snug ${subtask.status === 'DONE' ? 'line-through text-subtle' : ''}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectSubtask(subtask);
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <LinkifiedText text={subtask.title} stopPropagationOnLinkClick />
                            </div>
                            <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[10px] text-muted">
                              <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{hoveredBubble.task.aiMonitoringEnabled ? 'На усмотрение ИИ' : `Срок: ${formatDueDate(subtask.dueDate)}`}</span>
                              {!hoveredBubble.task.aiMonitoringEnabled ? <InlineDateTimePickerIcon
                                value={subtask.dueDate}
                                title="Изменить срок подзадачи"
                                className="shrink-0"
                                detachedPopup
                                timelineTasks={timelinePickerTasks}
                                onOpenChange={handleNativeCalendarOpenChange}
                                onChange={(dueDate) => onUpdateSubtaskDueDate(subtask, dueDate)}
                              /> : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {isAddingSubtask ? (() => {
                    const activeDraft = getDraftForTask(hoveredBubble.task.id);
                    return (
                    <div className="space-y-2">
                      <input
                        ref={subtaskTitleInputRef}
                        className="w-full surface-input rounded border px-2 py-1.5 text-[11px]"
                        placeholder="Название доп задачи"
                        value={activeDraft.title}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => patchDraftForTask(hoveredBubble.task.id, { title: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void onAddSubtask(hoveredBubble.task);
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          className="primary-button flex-1 rounded px-2 py-1.5 text-[11px] font-semibold"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onAddSubtask(hoveredBubble.task);
                          }}
                        >
                          Сохранить
                        </button>
                        <button
                          className="secondary-button rounded px-2 py-1.5 text-[11px] font-semibold"
                          onClick={(event) => {
                            event.stopPropagation();
                            setIsAddingSubtask(false);
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  );
                  })() : (
                    <button
                      className="w-full rounded bg-cyan-600 px-2 py-1.5 text-[11px]"
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsAddingSubtask(true);
                      }}
                    >
                      Добавить доп задачу
                    </button>
                  )}
                </div>
              </foreignObject>
            </>
          ) : null}
        </motion.g>
      </svg>
      {compact && hoveredBubble && compactHoverPoint && !dragSessionRef.current ? createPortal(
        <div className="timeline-hover-card pointer-events-none fixed z-[2147483647] overflow-y-auto rounded-lg border p-2.5 text-[11px]"
          style={compactHoverPoint} aria-label={`Информация о задаче: ${hoveredBubble.task.title}`}>
          <p className="font-semibold text-primary">{hoveredBubble.task.title}</p>
          <p className="mt-1 min-w-0 max-w-full whitespace-pre-wrap break-words text-muted [overflow-wrap:anywhere]">
            <LinkifiedText
              text={(() => {
                const description = noteHtmlToPlainText(hoveredBubble.task.description ?? '', { trimEnd: true });
                return description.length > 240 ? `${description.slice(0, 240)}...` : description;
              })()}
              fallback="Без описания" stopPropagationOnLinkClick />
          </p>
          <p className="mt-1 text-muted">{hoveredBubble.task.aiMonitoringEnabled
            ? <span className="inline-flex items-center gap-1"><TaskMonitoringBadge /> На усмотрение ИИ</span>
            : <>Дедлайн: {formatDueDate(hoveredBubble.task.dueDate)} · {formatDeadlineLeft(hoveredBubble.task.dueDate)}</>}</p>
          <div className="timeline-hover-card-section mt-2 border-t pt-2">
            <p className="text-[10px] uppercase tracking-wide text-subtle">Ближайшие подзадачи</p>
            {hoveredSubtasks.length ? (
              <ul className="mt-1 space-y-1.5">
                {hoveredSubtasks.slice(0, 3).map(subtask => (
                  <li key={subtask.id} className="rounded border border-[color:var(--timeline-grid-border)] bg-[color:var(--muted-bg)] px-2 py-1 text-muted">
                    <span className="block whitespace-normal break-words leading-snug">• {subtask.title}</span>
                    <span className="mt-0.5 block text-[10px] text-subtle">
                      {hoveredBubble.task.aiMonitoringEnabled ? 'На усмотрение ИИ' : subtask.dueDate
                        ? `Срок: ${formatDueDate(subtask.dueDate)} · ${formatDeadlineLeft(subtask.dueDate)}`
                        : 'Срок не задан'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-1 text-subtle">Нет активных подзадач</p>}
            {hoveredSubtasks.length > 3 ? <p className="mt-1 text-subtle">+ ещё {hoveredSubtasks.length - 3} подзадач</p> : null}
          </div>
        </div>,
        document.body
      ) : null}
      {contextMenu ? createPortal(
        <div
          data-tour={forceTaskContextMenuOpen ? 'bubble-task-context-menu' : undefined}
          className="fixed z-[130]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="surface-popover relative min-w-44 rounded-xl border p-2 shadow-2xl">
            <button
              type="button"
              disabled={!contextMenu.task}
              className="surface-muted flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:text-slate-500"
              onMouseEnter={() => contextMenu.task && setContextPostponeSubmenuOpen(true)}
              onClick={() => {
                if (!contextMenu.task) return;
                setContextPostponeSubmenuOpen((prev) => !prev);
              }}
            >
              <span>Отложить</span>
              <ChevronRight size={13} className="text-muted" />
            </button>
            <button
              type="button"
              className="primary-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!contextMenu.sphere || !onAddTaskToSphere}
              onClick={() => {
                if (!contextMenu.sphere || !onAddTaskToSphere) return;
                onAddTaskToSphere(contextMenu.sphere);
                setContextMenu(null);
              }}
            >
              Добавить задачу
            </button>
            {fullscreen && onOpenInOtherPane && contextMenu.task && !contextMenu.task.parentTaskId &&
              (contextMenu.task.taskType ?? 'TASK') === 'TASK' ? (
              <button type="button"
                className="surface-muted mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm hover:brightness-110"
                onClick={() => {
                  onOpenInOtherPane(contextMenu.task!, contextMenu.sourcePaneIndex);
                  setContextMenu(null);
                  setContextPostponeSubmenuOpen(false);
                }}>Открыть в отдельном окне</button>
            ) : null}
            <button
              type="button"
              disabled={!contextMenu.task}
              className="success-button mt-1.5 w-full rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (!contextMenu.task) return;
                void onQuickCompleteTask(contextMenu.task);
                setContextMenu(null);
                setContextPostponeSubmenuOpen(false);
              }}
            >
              Выполнить
            </button>
            <button
              type="button"
              disabled={!contextMenu.task || !onRescheduleTask}
              className="timeline-pick-button mt-1.5 flex w-full items-center justify-start gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (!contextMenu.task || !onRescheduleTask) return;
                onRescheduleTask(contextMenu.task);
                setContextMenu(null);
                setContextPostponeSubmenuOpen(false);
              }}
            >
              <CalendarDays size={14} />
              Перенести
            </button>
            {contextPostponeSubmenuOpen && contextMenu.task ? (
              <div className="surface-popover absolute left-full top-[46px] ml-1 w-56 rounded-md border p-1.5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
                {POSTPONE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-primary hover:brightness-110"
                    onClick={() => {
                      if (!contextMenu.task) return;
                      runQuickPostpone(contextMenu.task, option.value);
                      setContextMenu(null);
                      setContextPostponeSubmenuOpen(false);
                    }}
                  >
                    <span className={option.value === 'smart' ? 'text-pink-300' : ''}>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
