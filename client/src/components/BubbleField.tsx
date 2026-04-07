import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { buildBubbles } from '../lib/layout';
import type { Sphere, Task } from '../lib/types';

type Props = {
  tasks: Task[];
  spheres: Sphere[];
  mode: 'global' | 'sectors';
  selectedId?: string;
  onSelect: (task: Task) => void;
};

const SIZE = 900;

function getTruncatedTitle(title: string, radius: number) {
  const maxChars = Math.max(7, Math.floor(radius / 3.1));
  if (title.length <= maxChars) return title;
  return `${title.slice(0, Math.max(4, maxChars - 3))}...`;
}

export function BubbleField({ tasks, spheres, mode, selectedId, onSelect }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const bubbles = useMemo(() => buildBubbles(tasks, spheres, mode, SIZE), [tasks, spheres, mode]);
  const sectorCount = mode === 'sectors' && spheres.length > 1 ? spheres.length : 1;

  return (
    <div
      className="relative h-[72vh] overflow-hidden rounded-3xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950"
      onWheel={(event) => {
        event.preventDefault();
        const next = zoom + (event.deltaY > 0 ? -0.08 : 0.08);
        setZoom(Math.min(2.2, Math.max(0.6, next)));
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
              <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.13" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0.92" />
            </radialGradient>
          </defs>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE * 0.45} fill="url(#bg)" />

          {Array.from({ length: sectorCount }).map((_, idx) => {
            if (sectorCount === 1) return null;
            const angle = (Math.PI * 2 * idx) / sectorCount;
            const x = SIZE / 2 + Math.cos(angle) * SIZE * 0.45;
            const y = SIZE / 2 + Math.sin(angle) * SIZE * 0.45;
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
                whileHover={{ scale: 1.08 }}
                onClick={() => onSelect(bubble.task)}
                className="cursor-pointer"
              >
                <circle
                  cx={0}
                  cy={0}
                  r={bubble.radius}
                  fill={bubble.color}
                  fillOpacity={0.46}
                  stroke={selectedId === bubble.task.id ? '#f8fafc' : bubble.color}
                  strokeWidth={selectedId === bubble.task.id ? 3 : 2}
                  filter="url(#shadow)"
                />
                <text
                  x={0}
                  y={2}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  className="select-none"
                  style={{ fontSize: Math.max(9, bubble.radius / 3.5), fontWeight: 600 }}
                >
                  {getTruncatedTitle(bubble.task.title, bubble.radius)}
                </text>
              </motion.g>
            ))}
          </AnimatePresence>
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-900/70 px-3 py-1 text-xs text-slate-300">Zoom {zoom.toFixed(2)} • Pan drag</div>
    </div>
  );
}
