/**
 * Production browser responsiveness probe. Server PerfDiag measures Node.js only;
 * it cannot see stalled browser paints or expensive React commits.
 * Report coarse action classes, never text, identifiers, URLs or element classes.
 */
type Action = 'task' | 'chat' | 'navigation' | 'dialog' | 'other';
type Sample = { kind: 'interaction' | 'longtask'; action: Action; ms: number };

export function startUiPerformanceDiagnostics(surface: 'desktop' | 'compact' | 'telegram' | 'android-web'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const samples: Sample[] = [];
  const record = (sample: Sample) => {
    if (document.visibilityState !== 'visible' || samples.length >= 16) return;
    samples.push({ ...sample, ms: Math.min(10_000, Math.round(sample.ms)) });
  };
  const flush = () => {
    if (!samples.length) return;
    const batch = samples.splice(0, 16);
    const json = JSON.stringify({ surface, samples: batch });
    // No blocking /api calls or state writes along the interaction path.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-performance', new Blob([json], { type: 'application/json' }));
    } else {
      void fetch('/api/client-performance', {
        method: 'POST', credentials: 'same-origin', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: json
      }).catch(() => {});
    }
  };
  window.setInterval(flush, 20_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  let pointerAt = 0;
  const describe = (target: EventTarget | null): Action => {
    if (!(target instanceof Element)) return 'other';
    // No dynamic class names or labels are transmitted, only fixed categories.
    if (target.closest('[data-ai-task-proposal], [class*="task-"], [class*="bubble-"], [class*="focused-"]')) return 'task';
    if (target.closest('[class*="chat-"], [class*="ai-chat"], [class*="ai-dialog"]')) return 'chat';
    if (target.closest('[class*="modal"], [role="dialog"]')) return 'dialog';
    if (target.closest('nav, [class*="navigation"], [class*="tab-"]')) return 'navigation';
    return 'other';
  };
  document.addEventListener('pointerdown', () => { pointerAt = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('button, a, [role="button"], [role="tab"], [data-ai-task-proposal]')) return;
    const at = performance.now();
    const began = pointerAt && at - pointerAt < 3000 ? pointerAt : at;
    const action = describe(event.target);
    // A double rAF spans the next paint; this is intentionally approximate,
    // and longtask entries below distinguish actual main-thread blocking.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const duration = performance.now() - began;
      if (duration >= 90 && duration < 10_000) record({ kind: 'interaction', action, ms: duration });
    }));
    pointerAt = 0;
  }, true);

  if (typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 80) record({ kind: 'longtask', action: 'other', ms: entry.duration });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // Unsupported browsers still report delayed interactions.
    }
  }
}
