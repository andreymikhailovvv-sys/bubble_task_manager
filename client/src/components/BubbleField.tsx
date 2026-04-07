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
};

const SIZE = 900;

function getTruncatedTitle(title: string, radius: number) {
  const maxChars = Math.max(6, Math.floor(radius / 2.9));
  if (title.length <= maxChars) return title;
  return `${title.slice(0, Math.max(3, maxChars - 1))}…`;
}

export function BubbleField({ tasks, spheres, mode, selectedId, onSelect, onRenameSphere, onAddTaskToSphere }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const bubbles = useMemo(() => buildBubbles(tasks, spheres, mode, SIZE), [tasks, spheres, mode]);
  const sectorCount = mode === 'sectors' && spheres.length > 1 ? spheres.length : 1;
  const sectorLabels = useMemo(() => {
    if (sectorCount === 1) return [];
    return spheres.map((sphere, idx) => {
      const angle = (Math.PI * 2 * (idx + 0.5)) / sectorCount;
      const distance = SIZE * 0.43;
      return {
        sphere,
        x: SIZE / 2 + Math.cos(angle) * distance,
        y: SIZE / 2 + Math.sin(angle) * distance
      };
    });
  }, [sectorCount, spheres]);

  return (
    <div
      className="relative h-[72vh] overflow-hidden rounded-3xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950"
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
                <foreignObject x={-bubble.radius * 0.78} y={-10} width={bubble.radius * 1.56} height={20} pointerEvents="none">
                  <div
                    className="overflow-hidden text-ellipsis whitespace-nowrap text-center text-slate-100"
                    style={{ fontSize: Math.max(8, bubble.radius / 3.8), fontWeight: 600, lineHeight: '20px' }}
                  >
                    {getTruncatedTitle(bubble.task.title, bubble.radius)}
                  </div>
                </foreignObject>
              </motion.g>
            ))}
          </AnimatePresence>
        </g>
      </svg>
      {sectorLabels.map((item) => (
        <div
          key={item.sphere.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(item.x / SIZE) * 100}%`, top: `${(item.y / SIZE) * 100}%` }}
        >
          <button className="rounded bg-slate-900/85 px-2 py-1 text-xs text-slate-100" onClick={() => onRenameSphere?.(item.sphere)}>
            {item.sphere.name}
          </button>
          <button className="mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white" onClick={() => onAddTaskToSphere?.(item.sphere)}>
            <Plus size={14} />
          </button>
        </div>
      ))}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-slate-900/70 px-3 py-1 text-xs text-slate-300">Zoom {zoom.toFixed(2)} • Pan drag</div>
    </div>
  );
}
