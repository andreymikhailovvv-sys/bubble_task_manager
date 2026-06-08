import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Coins, Gauge, LoaderCircle, Plus, Repeat, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { buildBubbles, buildSectorGeometry, getTaskCoefficient, type BubbleRankingMode } from '../lib/layout';
import { resolveSphereIcon } from '../lib/sphereIcons';
import type { Sphere, Task } from '../lib/types';
import { InlineDateTimePickerIcon } from './InlineDateTimePickerIcon';
import { LinkifiedText } from './LinkifiedText';

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
const BUBBLE_HOVER_SCALE = 1.08;
const ENABLE_BUBBLE_HOVER_DETAILS = false;
const SUBTASK_REMINDER_GLOW_STYLE =
  '0 0 0 1px rgba(56,189,248,0.24), inset 0 0 12px rgba(56,189,248,0.28)';
const SUBTASK_OVERDUE_GLOW_STYLE =
  '0 0 0 1px rgba(239,68,68,0.28), inset 0 0 12px rgba(239,68,68,0.3)';
const MAX_SHINE_WINDOW_MINUTES = 180;
const SMART_POSTPONE_CREDITS_COST = 1;
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
    boxShadow: `0 10px 24px rgba(${r}, ${g}, ${b}, ${isLightTheme ? 0.14 : 0.2})`
  };
}

function getBubbleTitlePreview(title: string, radius: number) {
  const normalized = title.trim();
  if (!normalized) return '';

  const maxWords = radius < 26 ? 2 : radius < 36 ? 3 : radius < 50 ? 5 : radius < 68 ? 8 : 12;
  const maxChars = Math.max(10, Math.floor(radius * (radius < 36 ? 0.62 : 0.9)));
  const words = normalized.split(/\s+/);
  let preview = words.slice(0, maxWords).join(' ');

  if (preview.length > maxChars) {
    preview = `${preview.slice(0, Math.max(7, maxChars - 1)).trimEnd()}…`;
  } else if (words.length > maxWords) {
    preview = `${preview}…`;
  }

  return preview;
}


function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

  const defaultSubtaskDraft = () => ({ title: '', description: '', dueDate: '', notifyPreset: '30' } satisfies SubtaskDraft);

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
    if (fallbackTask?.sphereId) {
      return spheres.find((sphere) => sphere.id === fallbackTask.sphereId) ?? null;
    }
    if (mode !== 'sectors' || spheres.length === 0) return spheres[0] ?? null;

    const svg = svgRef.current;
    if (!svg) return spheres[0] ?? null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return spheres[0] ?? null;
    const svgPoint = point.matrixTransform(matrix.inverse());
    if (sectorCount <= 1) return spheres[0] ?? null;
    const angle = ((Math.atan2((svgPoint.y - BUBBLE_FIELD_CENTER_Y) / ELLIPSE_Y_SCALE, (svgPoint.x - BUBBLE_FIELD_CENTER_X) / ELLIPSE_X_SCALE) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const sectorIndex = sectorGeometry.findIndex((geometry) => angle >= geometry.startAngle && angle < geometry.endAngle);
    return spheres[sectorIndex >= 0 ? sectorIndex : 0] ?? null;
  };

  const showContextMenu = (event: MouseEvent, task: Task | null) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      task,
      sphere: getSphereAtClientPoint(event.clientX, event.clientY, task)
    });
    setContextPostponeSubmenuOpen(false);
  };

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
    if (!contextMenu) return;
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
  }, [contextMenu]);

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

  const bubbles = useMemo(
    () => buildBubbles(tasks, spheres, mode, SIZE, rankingMode, subtaskMap),
    [tasks, spheres, mode, rankingMode, subtaskMap]
  );
  const mapToOval = useCallback((x: number, y: number) => ({
    x: BUBBLE_FIELD_CENTER_X + (x - SIZE / 2) * ELLIPSE_X_SCALE,
    y: BUBBLE_FIELD_CENTER_Y + (y - SIZE / 2) * ELLIPSE_Y_SCALE
  }), []);

  const visibleBubbles = bubbles;

  const hoveredBubble = useMemo(() => visibleBubbles.find((bubble) => bubble.task.id === hoveredTaskId) ?? null, [hoveredTaskId, visibleBubbles]);
  const hoveredSubtasks = hoveredBubble ? (subtaskMap[hoveredBubble.task.id] ?? []).filter((subtask) => subtask.status !== 'DONE') : [];
  const hoveredSphere = hoveredBubble?.task.sphereId ? spheres.find((sphere) => sphere.id === hoveredBubble.task.sphereId) : null;
  const hoveredTaskCoefficient = hoveredBubble ? getTaskCoefficient(getSourceTask(hoveredBubble.task), subtaskMap) : 0;
  const visibleHoverSubtasks = hoveredSubtasks.slice(0, 6);
  const hiddenHoverSubtaskCount = Math.max(0, hoveredSubtasks.length - visibleHoverSubtasks.length);
  const sectorCount = mode === 'sectors' && spheres.length > 1 ? spheres.length : 1;
  const sectorTaskCounts = useMemo(() => {
    if (sectorCount === 1) return [tasks.length];
    const counts = Array.from({ length: sectorCount }, () => 0);
    tasks.forEach((task) => {
      const sectorIndex = Math.max(0, spheres.findIndex((sphere) => sphere.id === task.sphereId));
      counts[sectorIndex] += 1;
    });
    return counts;
  }, [sectorCount, spheres, tasks]);
  const sectorGeometry = useMemo(() => buildSectorGeometry(sectorCount, sectorTaskCounts), [sectorCount, sectorTaskCounts]);

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
    return spheres.map((sphere, idx) => {
      const angle = sectorGeometry[idx]?.midAngle ?? 0;
      const distance = SIZE * 0.46;
      const point = mapToOval(SIZE / 2 + Math.cos(angle) * distance, SIZE / 2 + Math.sin(angle) * distance);
      return {
        sphere,
        x: point.x,
        y: point.y,
      };
    });
  }, [mapToOval, sectorCount, sectorGeometry, spheres]);

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
  const containerShadowClass = isLightTheme
    ? 'shadow-[0_18px_48px_rgba(15,23,42,0.12),0_4px_18px_rgba(14,165,233,0.10),inset_0_1px_32px_rgba(255,255,255,0.72)]'
    : 'shadow-[0_28px_90px_rgba(15,23,42,0.75),inset_0_0_80px_rgba(56,189,248,0.08)]';
  const sectorStroke = 'var(--sector-line)';


  const renderBubble = (bubble: (typeof bubbles)[number]) => {
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
    const hoverGlowFilter = overdue
      ? 'drop-shadow(0 0 9px rgba(239,68,68,0.62)) drop-shadow(0 0 16px rgba(220,38,38,0.34))'
      : 'drop-shadow(0 0 9px rgba(56,189,248,0.56)) drop-shadow(0 0 16px rgba(129,140,248,0.3))';
    const bubbleSubtasks = subtaskMap[bubble.task.id] ?? [];
    const doneSubtasksCount = bubbleSubtasks.filter((task) => task.status === 'DONE').length;
    const subtaskProgress = bubbleSubtasks.length > 0 ? doneSubtasksCount / bubbleSubtasks.length : 0;
    const progressCircumference = 2 * Math.PI * (bubble.radius + 6);
    const hasAiMessage = hasAiNotification?.(bubble.task.id) ?? false;
    const aiBadgeX = bubble.radius * 0.66;
    const aiBadgeY = -bubble.radius * 0.66;
    const isSmartPostponing = smartPostponeTaskId === bubble.task.id;
    const displayPoint = mapToOval(bubble.x, bubble.y);
    const titleLineClamp = bubble.radius < 30 ? 2 : bubble.radius < 44 ? 3 : 4;
    const titleFontSize = Math.max(8, Math.min(18, bubble.radius / (bubble.radius < 34 ? 6.2 : 5.2)));
    const titlePreview = getBubbleTitlePreview(bubble.task.title, bubble.radius);
    const bubbleTextStyle = {
      fontSize: titleFontSize,
      fontWeight: 600,
      lineHeight: '1.15',
      maxHeight: '100%',
      color: isLightTheme ? '#0f172a' : '#f8fafc',
      textShadow: isLightTheme ? '0 1px 0 rgba(255,255,255,0.68)' : '0 2px 10px rgba(2,6,23,0.72)'
    };

    return (
      <motion.g
        key={bubble.task.id}
        initial={false}
        animate={isPopping ? { opacity: 0, scale: 1.28 } : { opacity: 1, scale: isHovered ? BUBBLE_HOVER_SCALE : 1, x: displayPoint.x, y: displayPoint.y }}
        exit={{ opacity: 1, scale: 1, x: displayPoint.x, y: displayPoint.y }}
        transition={isPopping
          ? { type: 'tween', duration: 0.33, ease: 'easeOut' }
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
          filter={shouldGlow && !overdue ? 'url(#bubbleGlow)' : undefined}
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
            style={{ filter: glowFilter }}
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
        <foreignObject x={-bubble.radius * 0.74} y={-bubble.radius * 0.74} width={bubble.radius * 1.48} height={bubble.radius * 1.48} pointerEvents="none">
          <div className="flex h-full flex-col items-center justify-center overflow-hidden break-words px-1.5 text-center" style={bubbleTextStyle}>
            <span style={{ display: '-webkit-box', WebkitLineClamp: titleLineClamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{titlePreview}</span>
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
      className={`bubble-field-container surface-canvas relative overflow-visible rounded-[2.2rem] border ${containerShadowClass} backdrop-blur-sm ${className ?? 'h-full'}`}
      onMouseLeave={() => {
        if (isNativeCalendarOpen) return;
        scheduleHoverExit();
      }}
    >
      <svg ref={svgRef} viewBox={`${VIEWBOX_LEFT} ${VIEWBOX_TOP} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="bubble-field-stage relative z-20 h-full w-full overflow-visible" onContextMenu={(event) => showContextMenu(event, null)}>
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
          <foreignObject x={TASK_INFO_PANEL_X} y={workspaceMin + 24} width={TASK_INFO_PANEL_WIDTH} height={VIEWBOX_HEIGHT - 48} pointerEvents="none">
            <div className="bubble-tooltip-card flex h-full flex-col rounded-[1.8rem] border p-6">
              {hoveredBubble ? (
                <div className="min-h-0 space-y-4 overflow-hidden">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted">Информация о задаче</p>
                    <h3 className="mt-3 break-words text-3xl font-semibold leading-tight text-primary">
                      <LinkifiedText text={hoveredBubble.task.title} stopPropagationOnLinkClick />
                    </h3>
                  </div>
                  <div className="surface-card rounded-2xl border p-3">
                    <p className="text-sm uppercase tracking-[0.18em] text-subtle">Описание</p>
                    <div className="mt-2 max-h-44 overflow-hidden break-words text-lg leading-relaxed text-muted">
                      <LinkifiedText text={hoveredBubble.task.description} fallback="Без описания" stopPropagationOnLinkClick />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-base">
                    <div className="surface-card bubble-info-badge rounded-xl border p-3">
                      <p className="text-subtle">Дедлайн</p>
                      <p className="mt-1 font-semibold text-primary">{formatDueDate(hoveredBubble.task.dueDate)}</p>
                    </div>
                    <div className="surface-card bubble-info-badge rounded-xl border p-3">
                      <p className="text-subtle">Осталось</p>
                      <p className="mt-1 font-semibold text-primary">{formatDeadlineLeft(hoveredBubble.task.dueDate)}</p>
                    </div>
                    <div className="surface-card bubble-info-badge rounded-xl border p-3" style={getInfoBadgeStyle(IMPORTANCE_BUBBLE_COLORS[hoveredBubble.task.importance] ?? '#64748b', isLightTheme)}>
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
                    <div className="surface-card bubble-info-badge rounded-xl border p-3" style={getInfoBadgeStyle(hoveredSphere?.color ?? '#64748b', isLightTheme)}>
                      <p className="text-subtle">Сектор</p>
                      <p className="mt-1 truncate font-semibold text-primary">{hoveredSphere?.name ?? 'Без сектора'}</p>
                    </div>
                  </div>
                  <div className="surface-card bubble-info-badge rounded-2xl border p-4 text-base">
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
                          <li key={subtask.id} className={`bubble-subtask-preview surface-muted rounded border px-2 py-1.5 ${glowClass}`}>
                            <span className="bubble-subtask-preview-title break-words" title={subtask.title}>{subtask.title}</span>
                            <span className="bubble-subtask-preview-date mt-0.5 block truncate text-sm text-subtle">Срок: {formatDueDate(subtask.dueDate)}</span>
                          </li>
                        );
                      })}
                      {hiddenHoverSubtaskCount > 0 ? <li className="col-span-2 text-subtle">Ещё осталось: {hiddenHoverSubtaskCount}</li> : null}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-subtle">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Информация о задаче</p>
                  <p className="mt-3 text-lg leading-relaxed">Наведи на пузырь, чтобы увидеть полное название, описание, дедлайн и подзадачи.</p>
                </div>
              )}
            </div>
          </foreignObject>
          <ellipse cx={BUBBLE_FIELD_CENTER_X} cy={BUBBLE_FIELD_CENTER_Y} rx={ELLIPSE_RADIUS_X} ry={ELLIPSE_RADIUS_Y} fill="url(#bg)" opacity={isLightTheme ? 0.94 : 0.86} />
          <ellipse cx={BUBBLE_FIELD_CENTER_X} cy={BUBBLE_FIELD_CENTER_Y} rx={ELLIPSE_RADIUS_X + 22} ry={ELLIPSE_RADIUS_Y + 16} fill="url(#fieldHalo)" filter="url(#bubbleGlow)" opacity={isLightTheme ? 0.48 : 0.7} />

          {sectorGeometry.map((geometry, idx) => {
            if (sectorCount === 1) return null;
            const angle = geometry.startAngle;
            const point = mapToOval(SIZE / 2 + Math.cos(angle) * FIELD_RADIUS, SIZE / 2 + Math.sin(angle) * FIELD_RADIUS);
            return <line key={idx} className="sector-divider" x1={BUBBLE_FIELD_CENTER_X} y1={BUBBLE_FIELD_CENTER_Y} x2={point.x} y2={point.y} stroke={sectorStroke} strokeWidth="1.5" />;
          })}

          <AnimatePresence>{orderedBubbles.map((bubble) => renderBubble(bubble))}</AnimatePresence>

          {sectorLabels.map((item) => {
            const Icon = resolveSphereIcon(item.sphere.icon);
            return (
              <g key={item.sphere.id} transform={`translate(${item.x} ${item.y})`}>
                <foreignObject x={-88} y={-18} width={176} height={40}>
                  <div className="bubble-sector-label flex w-full items-center justify-center gap-1 rounded border px-2 py-1 text-xs">
                    <button className="inline-flex min-w-0 items-center gap-1" onClick={() => onRenameSphere?.(item.sphere)}>
                      {Icon ? <Icon size={14} color={item.sphere.color} /> : null}
                      <span className="truncate" style={{ color: item.sphere.color }}>{item.sphere.name}</span>
                    </button>
                  </div>
                </foreignObject>
                <foreignObject x={-12} y={20} width={24} height={24}>
                  <button className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-primary" onClick={() => onAddTaskToSphere?.(item.sphere)}>
                    <Plus size={14} />
                  </button>
                </foreignObject>
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
                  <p className="mb-2 text-muted" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}><LinkifiedText text={hoveredBubble.task.description} fallback="Без описания" stopPropagationOnLinkClick /></p>
                  <p className="text-muted">Срок: {formatDueDate(hoveredBubble.task.dueDate)}</p>
                  <p className="inline-flex items-center gap-1 text-muted">
                    {smartPostponeTaskId === hoveredBubble.task.id ? <LoaderCircle size={12} className="animate-spin text-cyan-200" /> : null}
                    {formatDeadlineLeft(hoveredBubble.task.dueDate)}
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
                          <select
                            className="h-7 max-w-[136px] surface-input rounded border px-2 text-[11px] text-primary"
                            defaultValue=""
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const value = event.target.value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart' | '';
                              if (!value) return;
                              runQuickPostpone(hoveredBubble.task, value);
                              event.target.value = '';
                            }}
                          >
                            <option value="" disabled>Отложить</option>
                            <option value="15m">На 15 мин</option>
                            <option value="30m">На 30 мин</option>
                            <option value="1h">На час</option>
                            <option value="3h">На 3 часа</option>
                            <option value="tomorrow">На завтра</option>
                            <option value="smart">✦ Ближайшее окно (◍ 1)</option>
                          </select>
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
                  <p className="mb-2 font-semibold text-primary">Подзадачи</p>
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
                              <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">Срок: {formatDueDate(subtask.dueDate)}</span>
                              <InlineDateTimePickerIcon
                                value={subtask.dueDate}
                                title="Изменить срок подзадачи"
                                className="shrink-0"
                                detachedPopup
                                timelineTasks={timelinePickerTasks}
                                onOpenChange={handleNativeCalendarOpenChange}
                                onChange={(dueDate) => onUpdateSubtaskDueDate(subtask, dueDate)}
                              />
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
      {contextMenu ? createPortal(
        <div
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
                    {option.value === 'smart' ? <span className="ml-auto inline-flex items-center text-pink-300"><Coins size={12} className="mr-1 text-rose-300" />{SMART_POSTPONE_CREDITS_COST}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      ) : null}
      <div className="bubble-zoom-badge pointer-events-none absolute bottom-3 left-3 rounded border px-3 py-1 text-xs">Наведи на пузырь</div>
    </div>
  );
}
