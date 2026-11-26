import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlanikMascot } from './PlanikMascot';
import { BASIC_TRAINING_STEPS, type BasicTrainingStep } from '../lib/basicTraining';
import './BasicPlanikTraining.css';

type Rect = { left: number; top: number; right: number; bottom: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const rectsEqual = (a: Rect | null, b: Rect | null) => a === b || !!a && !!b && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
const readTarget = (selector?: string): Rect | null => {
  if (!selector) return null;
  const rects = Array.from(document.querySelectorAll(selector)).map(node => node.getBoundingClientRect())
    .filter(r => r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight);
  if (!rects.length) return null;
  return { left: Math.max(0, Math.floor(Math.min(...rects.map(r => r.left)) - 5)),
    top: Math.max(0, Math.floor(Math.min(...rects.map(r => r.top)) - 5)),
    right: Math.min(innerWidth, Math.ceil(Math.max(...rects.map(r => r.right)) + 5)),
    bottom: Math.min(innerHeight, Math.ceil(Math.max(...rects.map(r => r.bottom)) + 5)) };
};

export function BasicPlanikTraining({ step, theme, notice, onNext, onFinish, onGrab }: {
  step: BasicTrainingStep; theme: 'light' | 'dark'; notice: string | null; onNext: () => void; onFinish: () => void; onGrab: () => void;
}) {
  const config = BASIC_TRAINING_STEPS.find(item => item.id === step)!;
  const [target, setTarget] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(() => ({ width: innerWidth, height: innerHeight }));
  const [typed, setTyped] = useState(0);
  const [cardHeight, setCardHeight] = useState(260);
  const cardRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onFinish, onGrab });
  handlers.current = { onFinish, onGrab };

  useLayoutEffect(() => {
    let scrolled = false;
    const update = () => {
      if (!scrolled && (step === 'notes' || step === 'habits' || step === 'integrations' || step === 'android')) {
        const node = config.target && document.querySelector(config.target);
        if (node && node.getBoundingClientRect().width > 0) {
          node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
          scrolled = true;
        }
      }
      const rect = readTarget(config.target);
      setTarget(previous => rectsEqual(previous, rect) ? previous : rect);
      setViewport(previous => previous.width === innerWidth && previous.height === innerHeight ? previous : { width: innerWidth, height: innerHeight });
    };
    update();
    const interval = window.setInterval(update, 100);
    window.addEventListener('resize', update);
    return () => { clearInterval(interval); window.removeEventListener('resize', update); };
  }, [step, config.target]);

  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const measure = () => setCardHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setTyped(0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setTyped(config.text.length); return; }
    let length = 0;
    const timer = window.setInterval(() => {
      length = Math.min(config.text.length, length + 2);
      setTyped(length);
      if (length === config.text.length) clearInterval(timer);
    }, 22);
    return () => clearInterval(timer);
  }, [step, config.text]);

  // Capture prevents actions outside the current exercise, even on portaled menus.
  // Pointer move/up and native drag events remain untouched for real drag/drop.
  useEffect(() => {
    const allowed = (node: EventTarget | null) => node instanceof Element &&
      (node.closest('[data-basic-training-overlay]') || (config.allow && node.closest(config.allow)));
    const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const guard = (event: Event) => {
      if (!allowed(event.target)) { block(event); return; }
      if (step === 'grab' && event.type === 'pointerdown' && event instanceof PointerEvent && event.button === 0 && event.pointerType === 'mouse' &&
          event.target instanceof Element && event.target.closest('[data-bubble-task-id]')) handlers.current.onGrab();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { block(event); handlers.current.onFinish(); return; }
      if (event.key === 'Tab') return;
      if (!allowed(event.target)) block(event);
    };
    const events = ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'touchstart', 'submit'];
    events.forEach(name => window.addEventListener(name, guard, { capture: true, passive: false }));
    window.addEventListener('keydown', key, true);
    return () => {
      events.forEach(name => window.removeEventListener(name, guard, true));
      window.removeEventListener('keydown', key, true);
    };
  }, [step, config.allow]);

  const centered = config.center;
  const width = Math.min(centered ? 480 : 350, viewport.width - 24);
  let left = (viewport.width - width) / 2;
  let top = (viewport.height - cardHeight) / 2;
  if (!centered) {
    const gap = 18;
    if (target && target.right + width + gap <= viewport.width - 12) {
      left = target.right + gap;
      top = (target.top + target.bottom - cardHeight) / 2;
    } else if (target && target.left >= width + gap + 12) {
      left = target.left - width - gap;
      top = (target.top + target.bottom - cardHeight) / 2;
    } else if (target && target.bottom + cardHeight + gap <= viewport.height - 12) {
      left = (target.left + target.right - width) / 2;
      top = target.bottom + gap;
    } else if (target && target.top >= cardHeight + gap + 12) {
      left = (target.left + target.right - width) / 2;
      top = target.top - cardHeight - gap;
    } else {
      left = viewport.width - width - 16;
      top = step === 'block' || step === 'complete' ? viewport.height - cardHeight - 16 : 16;
    }
  }
  left = clamp(left, 12, Math.max(12, viewport.width - width - 12));
  top = clamp(top, 12, Math.max(12, viewport.height - cardHeight - 12));
  const visibleText = config.text.slice(0, typed);
  const fullyTyped = typed >= config.text.length;
  const isMouseOnly = ['grab', 'move', 'link', 'nest', 'complete'].includes(step);
  return createPortal(
    <div data-basic-training-overlay data-theme={theme} className={`basic-planik-overlay ${centered ? 'is-centered' : ''}`}>
      {centered || !target ? <div className="basic-planik-dim" /> : <div className="basic-planik-spotlight" style={{ left: target.left, top: target.top, width: target.right - target.left, height: target.bottom - target.top }} />}
      <div ref={cardRef} className={`basic-planik-card ${centered ? 'basic-planik-card--intro' : ''}`} style={{ width, left, top }}>
        <div className="basic-planik-character"><PlanikMascot variant="planner" size="sidekick" previewMode={step === 'linked' || step === 'nested' || step === 'goodbye' ? 'celebrating' : 'idle'} /></div>
        <section className="basic-planik-speech" role="dialog" aria-label="Обучение от Планика">
          <div className="basic-planik-meta"><span>Планик</span><span>{BASIC_TRAINING_STEPS.indexOf(config) + 1} / {BASIC_TRAINING_STEPS.length}</span></div>
          <div className="basic-planik-text">
            <span className="basic-planik-text-measure" aria-hidden="true">{config.text}</span>
            <span className="basic-planik-text-live" aria-hidden="true">{visibleText}{!fullyTyped && <i className="basic-planik-caret" />}</span>
            <span className="sr-only" role="status">{config.text}</span>
          </div>
          {notice && <p className="basic-planik-notice" role="status">{notice}</p>}
          {config.action && !notice && <p className="basic-planik-hint">Ожидаю твоего действия…</p>}
          {isMouseOnly && <p className="basic-planik-touch-hint">Для этого упражнения нужна мышь. На сенсорном устройстве обучение можно завершить и пройти позже.</p>}
          <div className="basic-planik-actions">
            <button type="button" className="basic-planik-exit" onClick={onFinish}>{centered && step !== 'goodbye' ? 'Пройти обучение позже' : 'Закончить обучение'}</button>
            {!config.action && <button type="button" className="basic-planik-next" onClick={onNext}>{step === 'intro-next' ? 'Следовать за Плаником' : step === 'goodbye' ? 'Готово' : 'Далее'}</button>}
          </div>
        </section>
      </div>
    </div>, document.body
  );
}
