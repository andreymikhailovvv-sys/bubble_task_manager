import { AnimatePresence, motion } from 'framer-motion';
import { Gauge, LoaderCircle, Plus, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
const WORKSPACE_PADDING = 320;
const HOVER_EXIT_DELAY_MS = 220;
const SUBTASK_REMINDER_GLOW =
  'subtask-reminder-glow 2.3s ease-in-out infinite';
const SUBTASK_OVERDUE_GLOW =
  'subtask-overdue-glow 2.3s ease-in-out infinite';
const MAX_SHINE_WINDOW_MINUTES = 180;
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
  if (diffMs <= 0) return 'Дедлайн истёк';
  const totalMinutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `Дедлайн через ${minutes} мин`;
  return `Дедлайн через ${hours} ч ${minutes} мин`;
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
  className
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, SubtaskDraft>>({});
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [smartPostponeTaskId, setSmartPostponeTaskId] = useState<string | null>(null);
  const [postponeResultByTaskId, setPostponeResultByTaskId] = useState<Record<string, string>>({});
  const [isNativeCalendarOpen, setIsNativeCalendarOpen] = useState(false);
  const [deadlineShiftMinutes, setDeadlineShiftMinutes] = useState('30');
  const subtaskTitleInputRef = useRef<HTMLInputElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const hoverExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeCalendarCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const sourceTaskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const getSourceTask = (task: Task) => sourceTaskById.get(task.id) ?? task;

  const bubbles = useMemo(
    () => buildBubbles(tasks, spheres, mode, SIZE, rankingMode, subtaskMap),
    [tasks, spheres, mode, rankingMode, subtaskMap]
  );
  const hoveredBubble = useMemo(() => bubbles.find((bubble) => bubble.task.id === hoveredTaskId) ?? null, [bubbles, hoveredTaskId]);
  const hoveredSubtasks = hoveredBubble ? (subtaskMap[hoveredBubble.task.id] ?? []).filter((subtask) => subtask.status !== 'DONE') : [];
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

  const inactiveBubbles = hoveredTaskId ? bubbles.filter((bubble) => bubble.task.id !== hoveredTaskId) : bubbles;
  const activeBubble = hoveredTaskId ? bubbles.find((bubble) => bubble.task.id === hoveredTaskId) ?? null : null;

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
      return {
        sphere,
        x: SIZE / 2 + Math.cos(angle) * distance,
        y: SIZE / 2 + Math.sin(angle) * distance
      };
    });
  }, [sectorCount, sectorGeometry, spheres]);

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
  const hoverSubtasksCard = { width: 360, height: 310 };

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
  const workspaceMin = -WORKSPACE_PADDING;
  const workspaceMax = SIZE + WORKSPACE_PADDING;


  const renderBubble = (bubble: (typeof bubbles)[number], isRaisedLayer = false) => {
    const isPopping = poppingTaskId === bubble.task.id;
    const hasUrgentSubtask = bubble.task.status !== 'DONE'
      && (subtaskMap[bubble.task.id] ?? []).some((subtask) => shouldSubtaskAffectParentReminder(subtask));
    const shouldGlow = bubble.task.status !== 'DONE' && (shouldTaskGlow(bubble.task) || hasUrgentSubtask);
    const overdue = isOverdue(bubble.task);
    const isHovered = hoveredTaskId === bubble.task.id;
    const bubbleSubtasks = subtaskMap[bubble.task.id] ?? [];
    const doneSubtasksCount = bubbleSubtasks.filter((task) => task.status === 'DONE').length;
    const subtaskProgress = bubbleSubtasks.length > 0 ? doneSubtasksCount / bubbleSubtasks.length : 0;
    const progressCircumference = 2 * Math.PI * (bubble.radius + 6);
    const hasAiMessage = hasAiNotification?.(bubble.task.id) ?? false;
    const aiBadgeX = bubble.radius * 0.66;
    const aiBadgeY = -bubble.radius * 0.66;

    return (
      <motion.g
        key={bubble.task.id}
        initial={false}
        animate={isPopping ? { opacity: 0, scale: 1.28 } : { opacity: isRaisedLayer ? 1 : activeBubble ? 0.25 : 1, scale: isHovered ? 1.2 : 1, x: bubble.x, y: bubble.y }}
        exit={{ opacity: 1, scale: 1, x: bubble.x, y: bubble.y }}
        transition={{ type: isPopping ? 'tween' : 'spring', duration: isPopping ? 0.33 : undefined, damping: 30, stiffness: 140, mass: 0.95 }}
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        onClick={() => !isPopping && onSelect(bubble.task)}
        onMouseEnter={() => activateHover(bubble.task.id)}
        onMouseLeave={scheduleHoverExit}
        className="cursor-pointer"
      >
        <circle cx={0} cy={0} r={bubble.radius + 10} fill="transparent" />
        <circle
          cx={0}
          cy={0}
          r={bubble.radius}
          fill={getBubbleShade(bubble.color, bubble.distanceRatio)}
          fillOpacity={0.48}
          stroke={selectedId === bubble.task.id ? '#f8fafc' : '#bae6fd'}
          strokeOpacity={selectedId === bubble.task.id ? 1 : 0.65}
          strokeWidth={selectedId === bubble.task.id ? 3.5 : 2.4}
          filter={shouldGlow ? 'url(#bubbleGlow)' : undefined}
          className={shouldGlow ? 'animate-pulse' : ''}
          style={overdue ? { filter: 'drop-shadow(0 0 10px rgba(239,68,68,0.8)) drop-shadow(0 0 18px rgba(220,38,38,0.5))' } : undefined}
        />
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
          <div className="flex h-full items-center justify-center overflow-hidden break-words px-2 text-center text-slate-100" style={{ fontSize: Math.max(9, bubble.radius / 4.8), fontWeight: 600, lineHeight: '1.2', maxHeight: '100%' }}>
            <span style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bubble.task.title}</span>
          </div>
        </foreignObject>

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

        {postponeResultByTaskId[bubble.task.id] ? (
          <motion.g initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: -8 }} exit={{ opacity: 0, y: -14 }} pointerEvents="none">
            <foreignObject x={-44} y={-bubble.radius - 26} width={88} height={16}>
              <div className="w-full text-center text-[10px] font-semibold text-cyan-100">{postponeResultByTaskId[bubble.task.id]}</div>
            </foreignObject>
          </motion.g>
        ) : null}
      </motion.g>
    );
  };

  return (
    <div
      className={`relative overflow-visible rounded-[2.2rem] border border-cyan-300/20 bg-gradient-to-br from-slate-900/80 via-slate-950/76 to-indigo-950/72 shadow-[0_28px_90px_rgba(15,23,42,0.75),inset_0_0_80px_rgba(56,189,248,0.08)] backdrop-blur-sm ${className ?? 'h-full'}`}
      onWheel={(event) => {
        if (event.target instanceof Element && event.target.closest('[data-no-field-zoom="true"]')) {
          event.stopPropagation();
          return;
        }
        if (isNativeCalendarOpen) return;
        event.preventDefault();
        const svgRect = event.currentTarget.getBoundingClientRect();
        const workspaceSize = SIZE + WORKSPACE_PADDING * 2;
        const mouseX = workspaceMin + ((event.clientX - svgRect.left) / svgRect.width) * workspaceSize;
        const mouseY = workspaceMin + ((event.clientY - svgRect.top) / svgRect.height) * workspaceSize;
        const nextZoom = Math.min(2.2, Math.max(0.6, zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
        const worldX = (mouseX - offset.x) / zoom;
        const worldY = (mouseY - offset.y) / zoom;
        setOffset({ x: mouseX - worldX * nextZoom, y: mouseY - worldY * nextZoom });
        setZoom(nextZoom);
      }}
      onMouseDown={(event) => {
        if (isNativeCalendarOpen) return;
        dragStart.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
      }}
      onMouseMove={(event) => {
        if (isNativeCalendarOpen || !dragStart.current) return;
        setOffset({ x: event.clientX - dragStart.current.x, y: event.clientY - dragStart.current.y });
      }}
      onMouseUp={() => {
        if (isNativeCalendarOpen) return;
        dragStart.current = null;
      }}
      onMouseLeave={() => {
        if (isNativeCalendarOpen) return;
        dragStart.current = null;
        scheduleHoverExit();
      }}
    >
      <svg viewBox={`${workspaceMin} ${workspaceMin} ${SIZE + WORKSPACE_PADDING * 2} ${SIZE + WORKSPACE_PADDING * 2}`} className="relative z-20 h-full w-full overflow-visible">
        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          <defs>
            <radialGradient id="bg" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.18" />
              <stop offset="55%" stopColor="#1d4ed8" stopOpacity="0.11" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0.58" />
            </radialGradient>
            <radialGradient id="fieldHalo" cx="50%" cy="50%" r="62%">
              <stop offset="68%" stopColor="#67e8f9" stopOpacity="0" />
              <stop offset="88%" stopColor="#67e8f9" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.02" />
            </radialGradient>
            <filter id="bubbleGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#7dd3fc" floodOpacity="0.42" />
              <feDropShadow dx="0" dy="0" stdDeviation="16" floodColor="#818cf8" floodOpacity="0.22" />
            </filter>
          </defs>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE * 0.47} fill="url(#bg)" opacity={0.86} />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE * 0.485} fill="url(#fieldHalo)" filter="url(#bubbleGlow)" opacity={0.7} />

          {sectorGeometry.map((geometry, idx) => {
            if (sectorCount === 1) return null;
            const angle = geometry.startAngle;
            const x = SIZE / 2 + Math.cos(angle) * SIZE * 0.47;
            const y = SIZE / 2 + Math.sin(angle) * SIZE * 0.47;
            return <line key={idx} x1={SIZE / 2} y1={SIZE / 2} x2={x} y2={y} stroke="#334155" strokeWidth="1.5" />;
          })}

          <AnimatePresence>{inactiveBubbles.map((bubble) => renderBubble(bubble))}</AnimatePresence>

          {activeBubble ? <rect x={0} y={0} width={SIZE} height={SIZE} fill="#020617" fillOpacity={0.58} pointerEvents="none" /> : null}

          <AnimatePresence>{activeBubble ? renderBubble(activeBubble, true) : null}</AnimatePresence>

          {sectorLabels.map((item) => {
            const Icon = resolveSphereIcon(item.sphere.icon);
            return (
              <g key={item.sphere.id} transform={`translate(${item.x} ${item.y})`}>
                <foreignObject x={-88} y={-18} width={176} height={40}>
                  <button className="flex w-full items-center justify-center gap-1 rounded bg-slate-900/90 px-2 py-1 text-xs text-slate-100" onClick={() => onRenameSphere?.(item.sphere)}>
                    {Icon ? <Icon size={14} color={item.sphere.color} /> : null}
                    <span style={{ color: item.sphere.color }}>{item.sphere.name}</span>
                  </button>
                </foreignObject>
                <foreignObject x={-12} y={20} width={24} height={24}>
                  <button className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white" onClick={() => onAddTaskToSphere?.(item.sphere)}>
                    <Plus size={14} />
                  </button>
                </foreignObject>
              </g>
            );
          })}

          {hoveredBubble ? (
            <>
              <foreignObject
                x={clamp(hoveredBubble.x - hoverInfoCard.width / 2, workspaceMin + 8, workspaceMax - hoverInfoCard.width - 8)}
                y={clamp(hoveredBubble.y - hoveredBubble.radius - hoverInfoCard.height - 10, workspaceMin + 8, workspaceMax - hoverInfoCard.height - 8)}
                width={hoverInfoCard.width}
                height={hoverInfoCard.height}
                onMouseEnter={cancelHoverExit}
                onMouseLeave={scheduleHoverExit}
              >
                <div className="rounded-xl border border-slate-200/30 bg-slate-950/92 p-3 text-xs text-slate-100 shadow-[0_16px_30px_rgba(2,6,23,0.8)]">
                  <p className="mb-1 font-semibold break-words"><LinkifiedText text={hoveredBubble.task.title} stopPropagationOnLinkClick /></p>
                  <p className="mb-2 text-slate-200" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}><LinkifiedText text={hoveredBubble.task.description} fallback="Без описания" stopPropagationOnLinkClick /></p>
                  <p className="text-slate-300">Срок: {formatDueDate(hoveredBubble.task.dueDate)}</p>
                  <p className="inline-flex items-center gap-1 text-slate-300">
                    {formatDeadlineLeft(hoveredBubble.task.dueDate)}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-[11px] text-slate-300">Коэффициент важности</p>
                    <div
                      className="inline-flex items-center gap-1 rounded-full border border-slate-400/50 px-2 py-0.5 text-[11px] font-semibold text-slate-100"
                      style={{ backgroundColor: getCoefficientBadgeColor(getTaskCoefficient(getSourceTask(hoveredBubble.task), subtaskMap)) }}
                    >
                      <Gauge size={11} />
                      {getTaskCoefficient(getSourceTask(hoveredBubble.task), subtaskMap).toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-2 border-t border-slate-700/80 pt-2">
                    <div className="flex items-center gap-2">
                      {smartPostponeTaskId === hoveredBubble.task.id ? <LoaderCircle size={12} className="animate-spin text-cyan-200" /> : null}
                      <button
                        type="button"
                        className="rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-emerald-500"
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
                            className="h-7 max-w-[136px] rounded bg-slate-800 px-2 text-[11px] text-white"
                            defaultValue=""
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => {
                              const value = event.target.value as '15m' | '30m' | '1h' | '3h' | 'tomorrow' | 'smart' | '';
                              if (!value) return;
                              if (value === 'smart') {
                                setSmartPostponeTaskId(hoveredBubble.task.id);
                              }
                              const previousDueDateSnapshot = hoveredBubble.task.dueDate ?? null;
                              void onQuickPostponeTask(hoveredBubble.task, value)
                                .then((nextDueDate) => {
                                  if (value !== 'smart') return;
                                  const deltaLabel = formatPostponeDelta(previousDueDateSnapshot, nextDueDate);
                                  if (!deltaLabel) return;
                                  setPostponeResultByTaskId((prev) => ({ ...prev, [hoveredBubble.task.id]: deltaLabel }));
                                  setTimeout(() => {
                                    setPostponeResultByTaskId((prev) => {
                                      if (!prev[hoveredBubble.task.id]) return prev;
                                      const next = { ...prev };
                                      delete next[hoveredBubble.task.id];
                                      return next;
                                    });
                                  }, 1000);
                                })
                                .catch(() => undefined)
                                .finally(() => {
                                  if (value === 'smart') {
                                    setSmartPostponeTaskId((prev) => (prev === hoveredBubble.task.id ? null : prev));
                                  }
                                });
                              event.target.value = '';
                            }}
                          >
                            <option value="" disabled>Отложить</option>
                            <option value="15m">На 15 мин</option>
                            <option value="30m">На 30 мин</option>
                            <option value="1h">На час</option>
                            <option value="3h">На 3 часа</option>
                            <option value="tomorrow">На завтра</option>
                            <option value="smart">✦ Ближайшее окно</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" className="rounded bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-600" onClick={(event) => {
                            event.stopPropagation();
                            void onQuickChangeTaskImportance(hoveredBubble.task, -1);
                          }}>-</button>
                          <div
                            className="h-7 min-w-8 rounded px-2 text-center text-[11px] font-semibold leading-7 text-white"
                            style={{ backgroundColor: IMPORTANCE_BUBBLE_COLORS[hoveredBubble.task.importance] ?? '#64748b' }}
                          >
                            {hoveredBubble.task.importance}
                          </div>
                          <button type="button" className="rounded bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-slate-600" onClick={(event) => {
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
                x={clamp(hoveredBubble.x - hoverSubtasksCard.width / 2, workspaceMin + 8, workspaceMax - hoverSubtasksCard.width - 8)}
                y={getSubtasksCardY(hoveredBubble.y, hoveredBubble.radius)}
                width={hoverSubtasksCard.width}
                height={hoverSubtasksCard.height}
                onMouseEnter={cancelHoverExit}
                onMouseLeave={scheduleHoverExit}
              >
                <div
                  className="rounded-xl border border-cyan-200/30 bg-slate-950/92 p-3 text-xs text-slate-100 shadow-[0_16px_30px_rgba(2,6,23,0.8)]"
                  data-no-field-zoom="true"
                >
                  <p className="mb-2 font-semibold text-cyan-100">Подзадачи</p>
                  <button
                    type="button"
                    className={`mb-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${isSubtaskFilterActive
                      ? 'border-cyan-300 bg-cyan-600/90 text-white'
                      : 'border-slate-500 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80'}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSubtaskFilter();
                    }}
                  >
                    Фильтровать
                  </button>
                  <ul className="mb-3 max-h-36 space-y-1 overflow-y-auto pr-1" data-no-field-zoom="true">
                    {hoveredSubtasks.length === 0 ? <li className="text-slate-400">Пока нет подзадач</li> : null}
                    {hoveredSubtasks.map((subtask) => (
                      <li
                        key={subtask.id}
                        className="relative flex items-center gap-2 rounded bg-slate-800/80 px-2 py-1"
                        style={subtask.status !== 'DONE' && isOverdue(subtask)
                          ? { boxShadow: '0 0 10px rgba(239,68,68,0.55), inset 0 0 8px rgba(239,68,68,0.2)', animation: SUBTASK_OVERDUE_GLOW }
                          : subtask.status !== 'DONE' && shouldTaskGlow(subtask)
                            ? { boxShadow: '0 0 10px rgba(56,189,248,0.5), inset 0 0 8px rgba(56,189,248,0.2)', animation: SUBTASK_REMINDER_GLOW }
                            : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={subtask.status === 'DONE'}
                          onChange={(event) => {
                            event.stopPropagation();
                            onToggleSubtaskDone(subtask);
                          }}
                        />
                        <div
                          className={`flex-1 truncate text-left ${subtask.status === 'DONE' ? 'line-through text-slate-400' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectSubtask(subtask);
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <LinkifiedText text={subtask.title} stopPropagationOnLinkClick />
                        </div>
                        <InlineDateTimePickerIcon
                          value={subtask.dueDate}
                          title="Изменить срок подзадачи"
                          detachedPopup
                          onOpenChange={handleNativeCalendarOpenChange}
                          onChange={(dueDate) => onUpdateSubtaskDueDate(subtask, dueDate)}
                        />
                      </li>
                    ))}
                  </ul>
                  {isAddingSubtask ? (() => {
                    const activeDraft = getDraftForTask(hoveredBubble.task.id);
                    return (
                    <div className="space-y-2">
                      <input
                        ref={subtaskTitleInputRef}
                        className="w-full rounded bg-slate-800 px-2 py-1.5 text-[11px]"
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
                          className="flex-1 rounded bg-cyan-600 px-2 py-1.5 text-[11px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onAddSubtask(hoveredBubble.task);
                          }}
                        >
                          Сохранить
                        </button>
                        <button
                          className="rounded bg-slate-700 px-2 py-1.5 text-[11px]"
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
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-900/70 px-3 py-1 text-xs text-slate-300">Zoom {zoom.toFixed(2)} • Pan drag</div>
    </div>
  );
}
