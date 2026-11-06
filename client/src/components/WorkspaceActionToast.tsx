import { createPortal } from 'react-dom';

/** Same compact, frosted success notice used for bubble drag actions. */
export function WorkspaceActionToast({ count, light }: { count: number | null; light: boolean }) {
  if (count === null || count < 1) return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 z-[2147483647] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border px-4 py-2.5 text-center text-sm font-medium leading-snug shadow-lg backdrop-blur-md sm:text-base ${
        light
          ? 'border-sky-300/80 bg-white/95 text-slate-800 shadow-slate-300/30'
          : 'border-cyan-400/35 bg-slate-900/95 text-slate-100 shadow-slate-950/45'
      }`}
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
    >
      <span className="shrink-0 text-lg" aria-hidden="true">✅</span>
      <span>Отложено {count} просроченных задач</span>
    </div>,
    document.body
  );
}
