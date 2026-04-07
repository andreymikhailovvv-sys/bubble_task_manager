import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { buildBubbles } from '../lib/layout';
import type { Sphere, Task } from '../lib/types';

type Props = {
  tasks: Task[];
  spheres: Sphere[];
  mode: 'global' | 'sectors';
  selectedId?: string;
  onSelect: (task: Task) => void;
  onRenameSphere?: (sphere: Sphere) => void;
  onAddTaskToSphere?: (sphere: Sphere) => void;
  className?: string;
};

const SIZE = 900;

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

export function BubbleField({ tasks, spheres, mode, selectedId, onSelect, onRenameSphere, onAddTaskToSphere, className }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const bubbles = useMemo(() => buildBubbles(tasks, spheres, mode, SIZE), [tasks, spheres, mode]);
  const hoveredBubble = useMemo(() => bubbles.find((bubble) => bubble.task.id === hoveredTaskId) ?? null, [bubbles, hoveredTaskId]);
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
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full">
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
            <radialGradient id="bubbleMembrane" cx="35%" cy="28%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.36" />
              <stop offset="45%" stopColor="#93c5fd" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.08" />
            </radialGradient>
            <filter id="bubbleGlow" x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#7dd3fc" floodOpacity="0.42" />
              <feDropShadow dx="0" dy="0" stdDeviation="16" floodColor="#818cf8" floodOpacity="0.22" />
            </filter>
          </defs>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE * 0.47} fill="url(#bg)" />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE * 0.485} fill="url(#fieldHalo)" filter="url(#bubbleGlow)" opacity={0.7} />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE * 0.49} fill="none" stroke="#67e8f9" strokeOpacity="0.12" strokeWidth={10} filter="url(#bubbleGlow)" />

          {Array.from({ length: sectorCount }).map((_, idx) => {
            if (sectorCount === 1) return null;
            const angle = (Math.PI * 2 * idx) / sectorCount;
            const x = SIZE / 2 + Math.cos(angle) * SIZE * 0.47;
            const y = SIZE / 2 + Math.sin(angle) * SIZE * 0.47;
            return <line key={idx} x1={SIZE / 2} y1={SIZE / 2} x2={x} y2={y} stroke="#334155" strokeWidth="1.5" />;
          })}

          <AnimatePresence>
            {bubbles.map((bubble) => (
              <motion.g
                key={bubble.task.id}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1, x: bubble.x, y: bubble.y }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', damping: 24, stiffness: 180 }}
                whileHover={{ scale: 1.06 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                onClick={() => onSelect(bubble.task)}
                onMouseEnter={() => setHoveredTaskId(bubble.task.id)}
                onMouseLeave={() => setHoveredTaskId((prev) => (prev === bubble.task.id ? null : prev))}
                className="cursor-pointer"
              >
                <circle
                  cx={0}
                  cy={0}
                  r={bubble.radius}
                  fill={bubble.color}
                  fillOpacity={0.24}
                  stroke={selectedId === bubble.task.id ? '#f8fafc' : '#bae6fd'}
                  strokeOpacity={selectedId === bubble.task.id ? 1 : 0.65}
                  strokeWidth={selectedId === bubble.task.id ? 3.5 : 2.4}
                  filter="url(#bubbleGlow)"
                />
                <circle cx={-bubble.radius * 0.2} cy={-bubble.radius * 0.32} r={bubble.radius * 0.3} fill="#ffffff" fillOpacity={0.18} pointerEvents="none" />
                <circle cx={0} cy={0} r={bubble.radius * 0.94} fill="url(#bubbleMembrane)" fillOpacity={0.6} pointerEvents="none" />
                <motion.circle
                  cx={0}
                  cy={0}
                  r={bubble.radius * 1.02}
                  fill="none"
                  stroke="#a5f3fc"
                  strokeWidth={1.2}
                  strokeOpacity={0.26}
                  animate={{ strokeOpacity: [0.14, 0.32, 0.14] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: bubble.radius * 0.01 }}
                  pointerEvents="none"
                />
                <foreignObject x={-bubble.radius * 0.8} y={-bubble.radius * 0.8} width={bubble.radius * 1.6} height={bubble.radius * 1.6} pointerEvents="none">
                  <div
                    className="flex h-full items-center justify-center overflow-hidden break-words px-2 text-center text-slate-100"
                    style={{
                      fontSize: Math.max(9, bubble.radius / 4.8),
                      fontWeight: 600,
                      lineHeight: '1.15',
                      display: '-webkit-box',
                      WebkitLineClamp: Math.max(2, Math.min(4, Math.floor(bubble.radius / 18))),
                      WebkitBoxOrient: 'vertical'
                    }}
                  >
                    {bubble.task.title}
                  </div>
                </foreignObject>
              </motion.g>
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {hoveredBubble ? (
              <motion.g
                key={hoveredBubble.task.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.2 }}
                style={{ pointerEvents: 'none' }}
              >
                <foreignObject x={hoveredBubble.x + hoveredBubble.radius + 12} y={hoveredBubble.y - 62} width={250} height={125}>
                  <div className="rounded-xl border border-slate-200/30 bg-slate-950 p-3 text-xs text-slate-100 shadow-[0_16px_30px_rgba(2,6,23,0.8)]">
                    <p className="mb-1 font-semibold">{hoveredBubble.task.title}</p>
                    <p
                      className="mb-1 text-slate-200"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {hoveredBubble.task.description?.trim() || 'Без описания'}
                    </p>
                    <p className="text-slate-300">Срок: {formatDueDate(hoveredBubble.task.dueDate)}</p>
                  </div>
                </foreignObject>
              </motion.g>
            ) : null}
          </AnimatePresence>
          {sectorLabels.map((item) => (
            <g key={item.sphere.id} transform={`translate(${item.x} ${item.y})`}>
              <foreignObject x={-74} y={-18} width={148} height={40}>
                <button className="w-full rounded bg-slate-900/90 px-2 py-1 text-xs text-slate-100" onClick={() => onRenameSphere?.(item.sphere)}>
                  {item.sphere.name}
                </button>
              </foreignObject>
              <foreignObject x={-12} y={20} width={24} height={24}>
                <button className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white" onClick={() => onAddTaskToSphere?.(item.sphere)}>
                  <Plus size={14} />
                </button>
              </foreignObject>
            </g>
          ))}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-900/70 px-3 py-1 text-xs text-slate-300">Zoom {zoom.toFixed(2)} • Pan drag</div>
    </div>
  );
}
