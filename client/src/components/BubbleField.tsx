import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronRight, Coins, Gauge, LoaderCircle, MessageCircle, Plus, Repeat, Sparkles } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { buildBubbles, getBubbleSectorIndex, getBubbleSectorSpheres, getTaskCoefficient, type BubbleRankingMode } from '../lib/layout';
import { layoutRectangleBubbles } from '../lib/rectangleBubbleLayout';
import { noteHtmlToPlainText } from '../lib/notes';
import { resolveSphereIcon } from '../lib/sphereIcons';
import type { Sphere, Task } from '../lib/types';
import { InlineDateTimePickerIcon } from './InlineDateTimePickerIcon';
import { LinkifiedText } from './LinkifiedText';
import { CustomSelect } from './CustomSelect';

type Props = {
  tasks: Task[];
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
  isSubtaskFilterActive: boolean;
  onToggleSubtaskFilter: () => void;
  onRenameSphere?: (sphere: Sphere) => void;
  onAddTaskToSphere?: (sphere: Sphere) => void;
  onRescheduleTask?: (task: Task) => void;
  forceTaskContextMenuOpen?: boolean;
  isSearchFiltering?: boolean;
  themeMode?: 'dark' | 'light';
  className?: string;
};

const IMPORTANCE_BUBBLE_COLORS: Record<number, string> = {
  1: '#38bdf8',
  2: '#22d3ee',
  3: '#8b5cf6',
  4: '#f97316',
  5: '#ef4444'
};

// Use real rectangular sector geometry and bubble packing rather than
// distorting circular coordinates after their collision resolution.
const SIZE = 900;
const FIELD_RADIUS = SIZE * 0.47;
const VIEWBOX_WIDTH = 1840;
const VIEWBOX_HEIGHT = 860;
const VIEWBOX_LEFT = 0;
const VIEWBOX_TOP = 0;
const VIEWBOX_RIGHT = VIEWBOX_LEFT + VIEWBOX_WIDTH;
const VIEWBOX_BOTTOM = VIEWBOX_TOP + VIEWBOX_HEIGHT;
const BUBBLE_FIELD_CENTER_X = VIEWBOX_LEFT + VIEWBOX_WIDTH / 2;
const BUBBLE_FIELD_CENTER_Y = VIEWBOX_TOP + VIEWBOX_HEIGHT / 2;
const HOVER_EXIT_DELAY_MS = 120;
const BUBBLE_HOVER_SCALE = 1.08;
const SUBTASK_REMINDER_GLOW_STYLE =
  '0 0 0 1px rgba(56,189,248,0.24), inset 0 0 12px rgba(56,189,248,0.28)';
const SUBTASK_OVERDUE_GLOW_STYLE =
  '0 0 0 1px rgba(239,68,68,0.28), inset 0 0 12px rgba(239,68,68,0.3)';
const MAX_SHINE_WINDOW_MINUTES = 180;
const CONTEXT_MENU_VIEWPORT_MARGIN = 12;
const CONTEXT_MENU_WITH_SUBMENU_WIDTH = 416;
const CONTEXT_MENU_HEIGHT = 188;

function getViewportSafeContextMenuPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y };
  return {
    x: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(x, window.innerWidth - CONTEXT_MENU_WITH_SUBMENU_WIDTH - CONTEXT_MENU_VIEWPORT_MARGIN)),
    y: Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, Math.min(y, window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_VIEWPORT_MARGIN))
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
type BubbleContextMenu = { x: number; y: number; task: Task | null; sphere: Sphere | null };
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

function getBubbleTitleFontSize(title: string, radius: number) {
  const normalizedLength = title.trim().length;
  const baseSize = radius / (radius < 34 ? 6.2 : 5.2);
  const longTitleAdjustment = normalizedLength > 24 ? Math.min(2.8, (normalizedLength - 24) / 12) : 0;

  return Math.max(7, Math.min(18, baseSize - longTitleAdjustment));
}


function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

// Project every sector ray to the actual rectangular boundary, not an ellipse.
// Padding for bubble centers prevents circles from getting cropped at the edges.
function rectangleRayEnd(angle: number, padding = 0) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const xLimit = dx >= 0 ? VIEWBOX_RIGHT - padding - BUBBLE_FIELD_CENTER_X : BUBBLE_FIELD_CENTER_X - VIEWBOX_LEFT - padding;
  const yLimit = dy >= 0 ? VIEWBOX_BOTTOM - padding - BUBBLE_FIELD_CENTER_Y : BUBBLE_FIELD_CENTER_Y - VIEWBOX_TOP - padding;
  const distance = Math.min(xLimit / Math.max(Math.abs(dx), 0.00001), yLimit / Math.max(Math.abs(dy), 0.00001));
  return { x: BUBBLE_FIELD_CENTER_X + dx * distance, y: BUBBLE_FIELD_CENTER_Y + dy * distance };
}

export function BubbleField({
  tasks,
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
  forceTaskContextMenuOpen = false,
  isSearchFiltering = false,
  themeMode = 'dark',
  className
}: Props) {
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const isLightTheme = themeMode === 'light';
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
    const angle = ((Math.atan2(svgPoint.y - BUBBLE_FIELD_CENTER_Y, svgPoint.x - BUBBLE_FIELD_CENTER_X) - sectorRotation) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const sectorIndex = sectorGeometry.findIndex((geometry) => angle >= geometry.startAngle && angle < geometry.endAngle);
    return bubbleSectors[sectorIndex >= 0 ? sectorIndex : 0] ?? null;
  };

  const showContextMenu = (event: MouseEvent, task: Task | null) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      ...getViewportSafeContextMenuPosition(event.clientX, event.clientY),
      task,
      sphere: getSphereAtClientPoint(event.clientX, event.clientY, task)
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
        sphere: spheres.find((sphere) => sphere.id === tourContextMenuTask.sphereId) ?? null
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
      ...tasks.filter((task) => task.status !== 'DONE'),
      ...Object.values(subtaskMap).flat().filter((subtask) => subtask.status !== 'DONE')
    ].map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      isSubtask: Boolean(task.parentTaskId),
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
    [sourceTaskById, spheres, subtaskMap, tasks]
  );

  const sourceBubbles = useMemo(
    () => buildBubbles(tasks, spheres, mode, SIZE, rankingMode, subtaskMap),
    [tasks, spheres, mode, rankingMode, subtaskMap]
  );
  const bubbleSectors = useMemo(() => getBubbleSectorSpheres(tasks, spheres, mode), [tasks, spheres, mode]);
  const sectorCount = Math.max(1, bubbleSectors.length);
  const rectangularLayout = useMemo(
    () => layoutRectangleBubbles(sourceBubbles, sectorCount, {
      left: VIEWBOX_LEFT, top: VIEWBOX_TOP, right: VIEWBOX_RIGHT, bottom: VIEWBOX_BOTTOM
    }),
    [sourceBubbles, sectorCount]
  );
  const visibleBubbles = rectangularLayout.bubbles;
  const sectorGeometry = rectangularLayout.geometry;
  const sectorRotation = rectangularLayout.rotation;
  const hoveredBubble = useMemo(() => visibleBubbles.find((bubble) => bubble.task.id === hoveredTaskId) ?? null, [hoveredTaskId, visibleBubbles]);
  const hoveredSubtasks = hoveredBubble ? (subtaskMap[hoveredBubble.task.id] ?? []).filter((subtask) => subtask.status !== 'DONE') : [];
  const hoveredTaskCoefficient = hoveredBubble ? getTaskCoefficient(getSourceTask(hoveredBubble.task), subtaskMap) : 0;
  const hoveredDescription = hoveredBubble
    ? noteHtmlToPlainText(hoveredBubble.task.description ?? '', { trimEnd: true }).trim()
    : '';

  const orderedBubbles = visibleBubbles;

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

  const sectorLabels = useMemo(() => {
    if (sectorCount === 1) return [];
    return bubbleSectors.map((sphere, idx) => {
      const angle = sectorGeometry[idx]?.midAngle ?? 0;
      const point = rectangleRayEnd(angle + sectorRotation, 76);
      point.x = clamp(point.x, VIEWBOX_LEFT + 96, VIEWBOX_RIGHT - 96);
      point.y = clamp(point.y, VIEWBOX_TOP + 50, VIEWBOX_BOTTOM - 55);
      return {
        sphere,
        x: point.x,
        y: point.y,
      };
    });
  }, [sectorCount, sectorGeometry, bubbleSectors, sectorRotation]);

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


  const hoverInfoCard = { width: 370, height: 224 };
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
  const hoverPoint = hoveredBubble ? { x: hoveredBubble.x, y: hoveredBubble.y } : null;
  const hoverCardX = hoveredBubble && hoverPoint
    ? clamp(
      hoverPoint.x + hoveredBubble.radius + hoverInfoCard.width + 18 < workspaceMaxX
        ? hoverPoint.x + hoveredBubble.radius + 18
        : hoverPoint.x - hoveredBubble.radius - hoverInfoCard.width - 18,
      VIEWBOX_LEFT + 12,
      workspaceMaxX - hoverInfoCard.width - 12
    )
    : VIEWBOX_LEFT;
  const hoverCardY = hoverPoint
    ? clamp(hoverPoint.y - hoverInfoCard.height * 0.34, workspaceMin + 12, workspaceMax - hoverInfoCard.height - 12)
    : workspaceMin;
  const containerShadowClass = isLightTheme
    ? 'shadow-[0_18px_48px_rgba(15,23,42,0.12),0_4px_18px_rgba(14,165,233,0.10),inset_0_1px_32px_rgba(255,255,255,0.72)]'
    : 'shadow-[0_28px_90px_rgba(15,23,42,0.75),inset_0_0_80px_rgba(56,189,248,0.08)]';
  const sectorStroke = 'var(--sector-line)';


  const renderBubble = (bubble: (typeof visibleBubbles)[number]) => {
    const isPopping = poppingTaskId === bubble.task.id;
    const hasUrgentSubtask = bubble.task.status !== 'DONE'
      && (subtaskMap[bubble.task.id] ?? []).some((subtask) => shouldSubtaskAffectParentReminder(subtask));
    const shouldGlow = bubble.task.status !== 'DONE' && (shouldTaskGlow(bubble.task) || hasUrgentSubtask);
    const overdue = isOverdue(bubble.task);
    const isHovered = hoveredTaskId === bubble.task.id;
    const glowPulseState = isHovered
      ? {
        opacity: [0.55, 1, 0.55],
        r: [bubble.radius + 2, bubble.radius + 9, bubble.radius + 2],
        strokeWidth: [2, 4.5, 2]
      }
      : {
        opacity: 0.72,
        r: bubble.radius + 5,
        strokeWidth: 3
      };
    const glowColor = overdue ? '#ef4444' : '#38bdf8';
    const staticGlowStyle = overdue
      ? { filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.8)) drop-shadow(0 0 18px rgba(220,38,38,0.5))' }
      : undefined;
    const glowFilter = shouldGlow && !overdue ? 'url(#bubbleGlow)' : undefined;
    const hoverGlowFilter = overdue
      ? 'drop-shadow(0 0 9px rgba(239,68,68,0.62)) drop-shadow(0 0 16px rgba(220,38,38,0.34))'
      : 'drop-shadow(0 0 9px rgba(56,189,248,0.56)) drop-shadow(0 0 16px rgba(129,140,248,0.3))';
    const bubbleSubtasks = subtaskMap[bubble.task.id] ?? [];
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
    const displayPoint = { x: bubble.x, y: bubble.y };
    const titleLineClamp = bubble.radius < 30 ? 2 : bubble.radius < 44 ? 3 : 4;
    const titleFontSize = getBubbleTitleFontSize(bubble.task.title, bubble.radius);
    const titlePreview = getBubbleTitlePreview(bubble.task.title, bubble.radius);
    const bubbleTextStyle: CSSProperties = {
      fontSize: titleFontSize,
      fontWeight: 600,
      lineHeight: '1.08',
      maxHeight: '100%',
      overflowWrap: 'anywhere',
      wordBreak: 'break-word',
      hyphens: 'auto',
      color: isLightTheme ? '#0f172a' : '#f8fafc',
      textShadow: isLightTheme ? '0 1px 0 rgba(255,255,255,0.68)' : '0 2px 10px rgba(2,6,23,0.72)'
    };

    return (
      <motion.g
        key={bubble.task.id}
        data-bubble-task-id={bubble.task.id}
        initial={false}
        animate={isPopping ? { opacity: 0, scale: 1.28 } : { opacity: 1, scale: isHovered ? BUBBLE_HOVER_SCALE : 1, x: displayPoint.x, y: displayPoint.y }}
        exit={isSearchFiltering ? { opacity: 0, scale: 0.96, x: displayPoint.x, y: displayPoint.y } : { opacity: 1, scale: 1, x: displayPoint.x, y: displayPoint.y }}
        transition={isPopping
          ? { type: 'tween', duration: 0.33, ease: 'easeOut' }
          : isSearchFiltering
            ? { type: 'tween', duration: 0.12, ease: 'easeOut' }
            : { type: 'spring', damping: 24, stiffness: 105, mass: 0.82, restDelta: 0.001 }}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        onClick={() => !isPopping && onSelect(bubble.task)}
        onMouseEnter={() => activateHover(bubble.task.id)}
        onMouseLeave={scheduleHoverExit}
        onContextMenu={(event) => showContextMenu(event, bubble.task)}
        className="cursor-pointer"
      >
        <circle cx={0} cy={0} r={bubble.radius + 10} fill="transparent" />
        <circle
          cx={0}
          cy={0}
          r={bubble.radius}
          fill={getBubbleShade(bubble.color, bubble.distanceRatio)}
          fillOpacity={isLightTheme ? 0.66 : 0.48}
          stroke={selectedId === bubble.task.id ? (isLightTheme ? '#0f172a' : '#f8fafc') : (isLightTheme ? 'rgba(14,116,144,0.56)' : '#bae6fd')}
          strokeOpacity={selectedId === bubble.task.id ? 1 : isLightTheme ? 0.78 : 0.65}
          strokeWidth={selectedId === bubble.task.id ? 3.5 : 2.4}
          filter={glowFilter}
          style={staticGlowStyle}
        />
        {shouldGlow ? (
          <motion.circle
            cx={0}
            cy={0}
            r={bubble.radius + 2}
            fill="none"
            stroke={glowColor}
            strokeOpacity={overdue ? 0.4 : 0.34}
            pointerEvents="none"
            animate={glowPulseState}
            transition={isHovered ? { duration: overdue ? 1.15 : 1.55, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.18, ease: 'easeOut' }}
            style={{ filter: hoverGlowFilter }}
          />
        ) : null}
        {bubbleSubtasks.length > 0 ? (
          <>
            <circle cx={0} cy={0} r={bubble.radius + 6} fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth={4} />
            <circle
              cx={0}
              cy={0}
              r={bubble.radius + 6}
              fill="none"
              stroke="#22c55e"
              strokeWidth={4.4}
              strokeLinecap="round"
              strokeDasharray={progressCircumference}
              strokeDashoffset={progressCircumference * (1 - subtaskProgress)}
              transform="rotate(-90)"
            />
          </>
        ) : null}
        <foreignObject x={-bubble.radius * 0.8} y={-bubble.radius * 0.8} width={bubble.radius * 1.6} height={bubble.radius * 1.6} pointerEvents="none">
          <div className="flex h-full flex-col items-center justify-center overflow-hidden px-1 text-center" lang="ru" style={bubbleTextStyle}>
            <span style={{ display: '-webkit-box', WebkitLineClamp: titleLineClamp, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{titlePreview}</span>
          </div>
        </foreignObject>
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
          <motion.g
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
            pointerEvents="none"
          >
            <circle cx={aiBadgeX} cy={aiBadgeY} r={11} fill="#7c3aed" />
            <foreignObject x={aiBadgeX - 6} y={aiBadgeY - 6} width={12} height={12}>
              <div className="flex h-full w-full items-center justify-center">
                <Sparkles size={12} color="#ffffff" />
              </div>
            </foreignObject>
          </motion.g>
        ) : null}

        {hasComments ? (
          <motion.g
            animate={unreadCommentCount > 0 ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={unreadCommentCount > 0 ? { duration: 1.7, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.15 }}
            pointerEvents="none"
          >
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
          </motion.g>
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
      className={`bubble-field-container surface-canvas relative overflow-hidden rounded-[2.2rem] border ${containerShadowClass} backdrop-blur-sm ${className ?? 'h-full'}`}
      onMouseLeave={() => {
        if (isNativeCalendarOpen) return;
        scheduleHoverExit();
      }}
    >
      <svg ref={svgRef} viewBox={`${VIEWBOX_LEFT} ${VIEWBOX_TOP} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="bubble-field-stage relative z-20 h-full w-full overflow-hidden" onContextMenu={(event) => showContextMenu(event, null)}>
        <motion.g initial={false}>
          <defs>
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
            <filter id="bubbleGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#7dd3fc" floodOpacity="0.42" />
              <feDropShadow dx="0" dy="0" stdDeviation="16" floodColor="#818cf8" floodOpacity="0.22" />
            </filter>
          </defs>
          <rect x={VIEWBOX_LEFT} y={VIEWBOX_TOP} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#bg)" opacity={isLightTheme ? 0.66 : 0.55} pointerEvents="none" />

          {sectorGeometry.map((geometry, idx) => {
            if (sectorCount === 1) return null;
            const angle = geometry.startAngle;
            const point = rectangleRayEnd(angle + sectorRotation);
            return <line key={idx} className="sector-divider" x1={BUBBLE_FIELD_CENTER_X} y1={BUBBLE_FIELD_CENTER_Y} x2={point.x} y2={point.y} stroke={sectorStroke} strokeWidth="1.5" />;
          })}

          <AnimatePresence>{orderedBubbles.map((bubble) => renderBubble(bubble))}</AnimatePresence>

          {sectorLabels.map((item) => {
            const Icon = item.sphere ? resolveSphereIcon(item.sphere.icon) : null;
            return (
              <g key={item.sphere?.id ?? 'unassigned-tasks'} transform={`translate(${item.x} ${item.y})`}>
                <foreignObject x={-88} y={-18} width={176} height={40}>
                  <div className="bubble-sector-label flex w-full items-center justify-center gap-1 rounded border px-2 py-1 text-xs">
                    {item.sphere ? (
                      <button className="inline-flex min-w-0 items-center gap-1" onClick={() => onRenameSphere?.(item.sphere!)}>
                        {Icon ? <Icon size={14} color={item.sphere.color} /> : null}
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

          {hoveredBubble && hoverPoint ? (
            <foreignObject
              x={hoverCardX}
              y={hoverCardY}
              width={hoverInfoCard.width}
              height={hoverInfoCard.height}
              pointerEvents="none"
            >
              <div className="bubble-tooltip-card flex h-full flex-col overflow-hidden rounded-2xl border p-4 text-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-subtle">Задача</p>
                <p className="mt-1 max-h-[88px] overflow-hidden break-words text-[15px] font-semibold leading-snug text-primary" title={hoveredBubble.task.title}>
                  {hoveredBubble.task.title}
                </p>
                <p className="mt-2 min-h-0 flex-1 overflow-hidden break-words text-xs leading-relaxed text-muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {hoveredDescription ? `${hoveredDescription.slice(0, 175)}${hoveredDescription.length > 175 ? '…' : ''}` : 'Без описания'}
                </p>
                <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-[color:var(--panel-border)] pt-3">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted" title="Дедлайн">
                    <CalendarDays size={13} className="shrink-0" />
                    <span className="truncate">{formatDueDate(hoveredBubble.task.dueDate)}</span>
                  </span>
                  <span
                    className="list-task-coefficient-badge inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: getCoefficientBadgeColor(hoveredTaskCoefficient) }}
                    title="Коэффициент важности"
                  >
                    <Gauge size={12} />
                    {hoveredTaskCoefficient.toFixed(2)}
                  </span>
                </div>
              </div>
            </foreignObject>
          ) : null}
        </motion.g>
      </svg>
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
