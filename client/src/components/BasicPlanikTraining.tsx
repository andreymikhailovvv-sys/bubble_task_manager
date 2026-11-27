import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlanikMascot, type PlanikMode } from './PlanikMascot';
import { TrainingPractice } from './TrainingPractice';
import { guidedSteps, type AdvancedLesson } from '../lib/guidedTraining';
import { BASIC_TRAINING_STEPS, type BasicTrainingStep } from '../lib/basicTraining';
import './BasicPlanikTraining.css';

type Rect = { left: number; top: number; right: number; bottom: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const rectsEqual = (a: Rect | null, b: Rect | null) => a === b || !!a && !!b && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
const scrollContainer = (node: Element) => node.closest('.telegram-ai-settings-scroll,.integration-menu__popup');
const revealTarget = (node: Element) => {
  const scroller = scrollContainer(node);
  if (scroller instanceof HTMLElement && scroller !== node) {
    const rect = node.getBoundingClientRect();
    const bounds = scroller.getBoundingClientRect();
    const height = scroller.clientHeight;
    const margin = 12;
    // Show the entire section if it fits; for a tall section, start at its heading.
    const delta = rect.height > height - margin * 2
      ? rect.top - bounds.top - margin
      : rect.bottom > bounds.bottom - margin
        ? rect.bottom - bounds.bottom + margin
        : rect.top < bounds.top + margin ? rect.top - bounds.top - margin : 0;
    if (Math.abs(delta) > 1) scroller.scrollTop += delta;
  } else {
    node.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }
};
const visibleTargetRect = (node: Element) => {
  const rect = node.getBoundingClientRect();
  const scroller = scrollContainer(node);
  const clip = scroller && scroller !== node ? scroller.getBoundingClientRect() : null;
  const left = Math.max(rect.left, clip?.left ?? 0);
  const top = Math.max(rect.top, clip?.top ?? 0);
  const right = Math.min(rect.right, clip?.right ?? innerWidth);
  const bottom = Math.min(rect.bottom, clip?.bottom ?? innerHeight);
  return {left, top, right, bottom, width: right - left, height: bottom - top};
};
const readTarget = (selector?: string): Rect | null => {
  if (!selector) return null;
  const nodes = Array.from(document.querySelectorAll(selector));
  const rects = nodes.map(visibleTargetRect)
    .filter(r => r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight);
  if (!rects.length) return null;
  const scroller = nodes.length === 1 ? scrollContainer(nodes[0]) : null;
  const clip = scroller && scroller !== nodes[0] ? scroller.getBoundingClientRect() : null;
  return { left: Math.max(0, Math.ceil(clip?.left ?? 0), Math.floor(Math.min(...rects.map(r => r.left)) - 5)),
    top: Math.max(0, Math.ceil(clip?.top ?? 0), Math.floor(Math.min(...rects.map(r => r.top)) - 5)),
    right: Math.min(innerWidth, Math.floor(clip?.right ?? innerWidth), Math.ceil(Math.max(...rects.map(r => r.right)) + 5)),
    bottom: Math.min(innerHeight, Math.floor(clip?.bottom ?? innerHeight), Math.ceil(Math.max(...rects.map(r => r.bottom)) + 5)) };
};

export function BasicPlanikTraining({ step, lesson, theme, notice, actionReady, onNext, onFinish, onGrab }: {
  step: BasicTrainingStep | string; lesson?: AdvancedLesson; actionReady?: boolean; theme: 'light' | 'dark'; notice: string | null; onNext: () => void; onFinish: () => void; onGrab: () => void;
}) {
  const steps = lesson ? guidedSteps(lesson) : BASIC_TRAINING_STEPS;
  const config = steps.find(item => item.id === step)!;
  const practice = 'practice' in config ? config.practice : undefined;
  const scriptedSkin = 'skin' in config ? config.skin : undefined;
  const last = step === 'goodbye' || ('done' in config && config.done);
  const [skin, setSkin] = useState('classic');
  const [animation, setAnimation] = useState<Exclude<PlanikMode, 'showcase'>>('idle');
  const [replay, setReplay] = useState(0);
  useEffect(() => { setSkin(scriptedSkin || 'classic'); setAnimation(scriptedSkin ? 'hover' : 'idle'); setReplay(n => n + 1); }, [step, scriptedSkin]);
  const [target, setTarget] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(() => ({ width: innerWidth, height: innerHeight }));
  const [typed, setTyped] = useState(0);
  const [cardHeight, setCardHeight] = useState(260);
  const cardRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onFinish, onGrab });
  handlers.current = { onFinish, onGrab };

  useLayoutEffect(() => {
    let scrolled = false;
    let previousNode: Element | null = null;
    let previousHeight = -1;
    const update = () => {
      if (step === 'notes' || step === 'habits' || step === 'integrations' || step === 'android' || Boolean(lesson)) {
        const node = config.target && document.querySelector(config.target);
        if (node && node.getBoundingClientRect().width > 0) {
          const height = node.getBoundingClientRect().height;
          // The assistant's accordion and integration cards may expand after
          // the first measurement. Re-align after their actual height changes.
          if (!scrolled || node !== previousNode || (scrollContainer(node) && Math.abs(height - previousHeight) > 2)) {
            revealTarget(node);
            scrolled = true;
            previousNode = node;
            previousHeight = height;
          }
        }
      }
      // Point at one visible training bubble, not the whole cluster. As
      // the real context menu and placement rails open, follow those targets.
      let rect = readTarget(config.target);
      if (!lesson && step === 'task-window') {
        const placements = readTarget('.workspace-placement-rail .workspace-block-target');
        const menu = readTarget('[data-training-task-window-action]');
        const bubble = Array.from(document.querySelectorAll('[data-tour="bubbles-workspace"] [data-bubble-task-id]'))
          .map(visibleTargetRect).find(r => r.width > 1 && r.height > 1 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight);
        rect = placements ?? menu ?? (bubble ? {left: Math.floor(bubble.left)-5, top: Math.floor(bubble.top)-5, right: Math.ceil(bubble.right)+5, bottom: Math.ceil(bubble.bottom)+5} : rect);
      }
      if (!lesson && step === 'two-modes') rect = readTarget('.workspace-placement-rail .workspace-block-target') ?? readTarget('.fullscreen-mode-picker');
      setTarget(previous => rectsEqual(previous, rect) ? previous : rect);
      setViewport(previous => previous.width === innerWidth && previous.height === innerHeight ? previous : { width: innerWidth, height: innerHeight });
    };
    update();
    const interval = window.setInterval(update, 100);
    window.addEventListener('resize', update);
    return () => { clearInterval(interval); window.removeEventListener('resize', update); };
  }, [step, config.target, lesson]);

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

  useLayoutEffect(() => {
    if (step !== 'feature-skins-practice') return;
    const dialog = document.querySelector<HTMLElement>('.mascot-wardrobe-dialog[data-guided-wardrobe]');
    if (!dialog) return;
    dialog.style.setProperty('--guided-wardrobe-reserve', Math.max(180, cardHeight + 36) + 'px');
    return () => { dialog.style.removeProperty('--guided-wardrobe-reserve'); };
  }, [step, cardHeight]);
  const centered = config.center;
  const width = Math.min(centered ? 480 : practice ? 390 : 350, viewport.width - 24);
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
  if (step === 'feature-skins-practice' && viewport.width <= 1050) {
    left = (viewport.width - width) / 2;
    top = viewport.height - cardHeight - 12;
  }
  left = clamp(left, 12, Math.max(12, viewport.width - width - 12));
  top = clamp(top, 12, Math.max(12, viewport.height - cardHeight - 12));
  const visibleText = config.text.slice(0, typed);
  const pointingDirection = (step === 'sector' || step === 'task-window') && target ? ((target.left + target.right) / 2 < left + 60 ? 'left' : 'right') : undefined;
  const fullyTyped = typed >= config.text.length;
  const isMouseOnly = ['grab', 'move', 'link', 'nest', 'complete', 'two-modes', 'task-window'].includes(step);
  return createPortal(
    <div data-basic-training-overlay data-training-step={step} data-theme={theme} className={`basic-planik-overlay ${centered ? 'is-centered' : ''}`}>
      {centered || !target ? <div className="basic-planik-dim" /> : <div className="basic-planik-spotlight" style={{ left: target.left, top: target.top, width: target.right - target.left, height: target.bottom - target.top }} />}
      <div ref={cardRef} className={`basic-planik-card ${centered ? 'basic-planik-card--intro' : ''}`} style={{ width, left, top }}>
        <div className="basic-planik-character"><PlanikMascot key={lesson ? replay : undefined} variant="planner" skinId={lesson ? skin : "classic"} size="sidekick" trainingPoint={pointingDirection} previewMode={step === 'linked' || step === 'nested' || last ? 'celebrating' : lesson ? animation : 'idle'} /></div>
        <section className="basic-planik-speech" role="dialog" aria-label="Обучение от Планика">
          <div className="basic-planik-meta"><span>Планик</span><span>{steps.findIndex(item => item.id === step) + 1} / {steps.length}</span></div>
          <div className="basic-planik-text">
            <span className="basic-planik-text-measure" aria-hidden="true">{config.text}</span>
            <span className="basic-planik-text-live" aria-hidden="true">{visibleText}{!fullyTyped && <i className="basic-planik-caret" />}</span>
            <span className="sr-only" role="status">{config.text}</span>
          </div>
          {practice && <TrainingPractice key={step} kind={practice} skin={skin} onSkin={value => { setSkin(value); setAnimation('idle'); setReplay(n => n + 1); }} onAnimation={value => { setAnimation(value); setReplay(n => n + 1); }} onReady={() => {}} onNext={onNext} />}
          {notice && <p className="basic-planik-notice" role="status">{notice}</p>}
          {config.action && !actionReady && !notice && !practice && <p className="basic-planik-hint">Ожидаю твоего действия…</p>}
          {isMouseOnly && <p className="basic-planik-touch-hint">Для этого упражнения нужна мышь. На сенсорном устройстве обучение можно завершить и пройти позже.</p>}
          <div className="basic-planik-actions">
            <button type="button" className="basic-planik-exit" onClick={onFinish}>{centered && !last ? 'Пройти обучение позже' : 'Закончить обучение'}</button>
            {(!config.action || actionReady) && <button type="button" className="basic-planik-next" onClick={onNext}>{step === 'intro-next' ? 'Следовать за Плаником' : last ? 'Готово' : 'Далее'}</button>}
          </div>
        </section>
      </div>
    </div>, document.body
  );
}
