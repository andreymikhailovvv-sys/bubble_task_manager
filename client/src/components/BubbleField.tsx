import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { buildBubbles } from '../lib/layout';
import { resolveSphereIcon } from '../lib/sphereIcons';
import type { Sphere, Task } from '../lib/types';

type Props = {
  tasks: Task[];
  subtaskMap: Record<string, Task[]>;
  spheres: Sphere[];
  mode: 'global' | 'sectors';
  selectedId?: string;
  poppingTaskId?: string | null;
  onSelect: (task: Task) => void;
  onToggleSubtaskDone: (subtask: Task) => Promise<void>;
  onAddSubtask: (parentTask: Task) => void;
  onRenameSphere?: (sphere: Sphere) => void;
  onAddTaskToSphere?: (sphere: Sphere) => void;
  className?: string;
};

const SIZE = 900;
const SUBTASK_RADIUS = 18;

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

function isDueWithinHour(dueDate?: string | null) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const diff = due.getTime() - Date.now();
  return diff > 0 && diff <= 3_600_000;
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

export function BubbleField({
  tasks,
  subtaskMap,
  spheres,
  mode,
  selectedId,
  poppingTaskId,
  onSelect,
  onAddSubtask,
  onToggleSubtaskDone,
  onRenameSphere,
  onAddTaskToSphere,
  className
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [hoveredSubtaskId, setHoveredSubtaskId] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const bubbles = useMemo(() => buildBubbles(tasks, spheres, mode, SIZE), [tasks, spheres, mode]);
  const hoveredBubble = useMemo(() => bubbles.find((bubble) => bubble.task.id === hoveredTaskId) ?? null, [bubbles, hoveredTaskId]);
  const hoveredSubtask = useMemo(() => Object.values(subtaskMap).flat().find((task) => task.id === hoveredSubtaskId) ?? null, [hoveredSubtaskId, subtaskMap]);
  const hoveredSubtasks = hoveredBubble ? subtaskMap[hoveredBubble.task.id] ?? [] : [];
  const sectorCount = mode === 'sectors' && spheres.length > 1 ? spheres.length : 1;
  const sectorLabels = useMemo(() => {
    if (sectorCount === 1) return [];
    return spheres.map((sphere, idx) => {
      const angle = (Math.PI * 2 * (idx + 0.5)) / sectorCount;
      const distance = SIZE * 0.46;
      return {
        sphere,
        x: SIZE / 2 + Math.cos(angle) * distance,
        y: SIZE / 2 + Math.sin(angle) * distance
      };
    });
  }, [sectorCount, spheres]);

  return (
    <div
      className={`relative overflow-hidden rounded-[2.2rem] border border-cyan-300/20 bg-gradient-to-br from-slate-900/95 via-slate-950/95 to-indigo-950/90 shadow-[0_28px_90px_rgba(15,23,42,0.75),inset_0_0_80px_rgba(56,189,248,0.08)] backdrop-blur-sm ${className ?? 'h-full'}`}
      onWheel={(event) => {
        event.preventDefault();
        const svgRect = event.currentTarget.getBoundingClientRect();
        const mouseX = ((event.clientX - svgRect.left) / svgRect.width) * SIZE;
        const mouseY = ((event.clientY - svgRect.top) / svgRect.height) * SIZE;
        const nextZoom = Math.min(2.2, Math.max(0.6, zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
        const worldX = (mouseX - offset.x) / zoom;
        const worldY = (mouseY - offset.y) / zoom;
        setOffset({
          x: mouseX - worldX * nextZoom,
          y: mouseY - worldY * nextZoom
        });
        setZoom(nextZoom);
      }}
      onMouseDown={(event) => {
        dragStart.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
      }}
      onMouseMove={(event) => {
        if (!dragStart.current) return;
        setOffset({ x: event.clientX - dragStart.current.x, y: event.clientY - dragStart.current.y });
      }}
      onMouseUp={() => {
        dragStart.current = null;
      }}
      onMouseLeave={() => {
        dragStart.current = null;
      }}
    >
      {hoveredBubble ? <div className="pointer-events-none absolute inset-0 z-10 bg-slate-950/45" /> : null}
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="relative z-20 h-full w-full">
        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          <defs>
            <radialGradient id="bg" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.2" />
              <stop offset="55%" stopColor="#1d4ed8" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0.78" />
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
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE * 0.47} fill="url(#bg)" />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE * 0.485} fill="url(#fieldHalo)" filter="url(#bubbleGlow)" opacity={0.7} />

          {Array.from({ length: sectorCount }).map((_, idx) => {
            if (sectorCount === 1) return null;
            const angle = (Math.PI * 2 * idx) / sectorCount;
            const x = SIZE / 2 + Math.cos(angle) * SIZE * 0.47;
            const y = SIZE / 2 + Math.sin(angle) * SIZE * 0.47;
            return <line key={idx} x1={SIZE / 2} y1={SIZE / 2} x2={x} y2={y} stroke="#334155" strokeWidth="1.5" />;
          })}

          <AnimatePresence>
            {bubbles.map((bubble) => {
              const isPopping = poppingTaskId === bubble.task.id;
              const hasUrgentSubtask = (subtaskMap[bubble.task.id] ?? []).some((task) => task.status !== 'DONE' && isDueWithinHour(task.dueDate));
              const shouldGlow = bubble.distanceRatio <= 0.22 || hasUrgentSubtask;
              const isHovered = hoveredTaskId === bubble.task.id;
              return (
                <motion.g
                  key={bubble.task.id}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={
                    isPopping
                      ? { opacity: 0, scale: 1.28 }
                      : { opacity: 1, scale: isHovered ? 1.2 : 1, x: bubble.x, y: bubble.y }
                  }
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ type: isPopping ? 'tween' : 'spring', duration: isPopping ? 0.33 : undefined, damping: 24, stiffness: 180 }}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                  onClick={() => !isPopping && onSelect(bubble.task)}
                  onMouseEnter={() => setHoveredTaskId(bubble.task.id)}
                  onMouseLeave={() => setHoveredTaskId((prev) => (prev === bubble.task.id ? null : prev))}
                  className="cursor-pointer"
                >
                  <circle
                    cx={0}
                    cy={0}
                    r={bubble.radius}
                    fill={getBubbleShade(bubble.color, bubble.distanceRatio)}
                    fillOpacity={0.48}
                    stroke={selectedId === bubble.task.id ? '#f8fafc' : '#bae6fd'}
                    strokeOpacity={selectedId === bubble.task.id ? 1 : 0.65}
                    strokeWidth={selectedId === bubble.task.id ? 3.5 : 2.4}
                    filter="url(#bubbleGlow)"
                    className={shouldGlow ? 'animate-pulse' : ''}
                  />
                  <foreignObject x={-bubble.radius * 0.8} y={-bubble.radius * 0.8} width={bubble.radius * 1.6} height={bubble.radius * 1.6} pointerEvents="none">
                    <div className="flex h-full items-center justify-center overflow-hidden break-words px-2 text-center text-slate-100" style={{ fontSize: Math.max(9, bubble.radius / 4.8), fontWeight: 600, lineHeight: '1.2', maxHeight: '100%' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bubble.task.title}</span>
                    </div>
                  </foreignObject>
                  {isHovered ? (
                    <foreignObject x={-(bubble.radius + 38)} y={-16} width={30} height={30}>
                      <button className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 text-slate-50" onClick={(e) => { e.stopPropagation(); onAddSubtask(bubble.task); }}>
                        <Plus size={14} />
                      </button>
                    </foreignObject>
                  ) : null}
                </motion.g>
              );
            })}
          </AnimatePresence>

          {hoveredBubble
            ? hoveredSubtasks.map((subtask, idx) => {
                const angle = -Math.PI + idx * 0.58;
                const dist = hoveredBubble.radius + SUBTASK_RADIUS + 12;
                const x = hoveredBubble.x + Math.cos(angle) * dist;
                const y = hoveredBubble.y + Math.sin(angle) * dist;
                const urgent = subtask.status !== 'DONE' && isDueWithinHour(subtask.dueDate);
                return (
                  <g key={subtask.id} transform={`translate(${x} ${y})`} onMouseEnter={() => setHoveredSubtaskId(subtask.id)} onMouseLeave={() => setHoveredSubtaskId((prev) => (prev === subtask.id ? null : prev))}>
                    <circle cx={0} cy={0} r={SUBTASK_RADIUS} fill={subtask.status === 'DONE' ? '#16a34a' : '#1e293b'} stroke={urgent ? '#fbbf24' : '#67e8f9'} strokeWidth={2} className={urgent ? 'animate-pulse' : ''} />
                    <text x={0} y={3} fill="#e2e8f0" textAnchor="middle" fontSize={10}>
                      {idx + 1}
                    </text>
                  </g>
                );
              })
            : null}

          {hoveredBubble ? (
            <foreignObject x={hoveredBubble.x + hoveredBubble.radius + 12} y={hoveredBubble.y - 64} width={250} height={130}>
              <div className="rounded-xl border border-slate-200/30 bg-slate-950 p-3 text-xs text-slate-100 shadow-[0_16px_30px_rgba(2,6,23,0.8)]">
                <p className="mb-1 font-semibold">{hoveredBubble.task.title}</p>
                <p className="mb-1 text-slate-200" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{hoveredBubble.task.description?.trim() || 'Без описания'}</p>
                <p className="text-slate-300">Срок: {formatDueDate(hoveredBubble.task.dueDate)}</p>
              </div>
            </foreignObject>
          ) : null}

          {hoveredSubtask && hoveredBubble ? (
            <foreignObject x={hoveredBubble.x - hoveredBubble.radius - 220} y={hoveredBubble.y - 80} width={210} height={160}>
              <div className="rounded-xl border border-cyan-300/40 bg-slate-950 p-3 text-xs text-slate-100 shadow-[0_16px_30px_rgba(2,6,23,0.8)]">
                <p className="mb-1 font-semibold">{hoveredSubtask.title}</p>
                <p className="mb-1 text-slate-300">{hoveredSubtask.description?.trim() || 'Без описания'}</p>
                <p className="mb-2 text-slate-300">Срок: {formatDueDate(hoveredSubtask.dueDate)}</p>
                <button className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs" onClick={() => onToggleSubtaskDone(hoveredSubtask)}>
                  <Check size={12} /> {hoveredSubtask.status === 'DONE' ? 'Вернуть в работу' : 'Выполнить'}
                </button>
              </div>
            </foreignObject>
          ) : null}

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
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-900/70 px-3 py-1 text-xs text-slate-300">Zoom {zoom.toFixed(2)} • Pan drag</div>
    </div>
  );
}
