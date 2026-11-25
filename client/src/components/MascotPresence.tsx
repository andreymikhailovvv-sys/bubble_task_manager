import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';

type Identity = { variant: 'planner' | 'economic'; skinId: string };
export const MascotIdentityContext = createContext<Identity | null>(null);
export const useMascotIdentity = () => useContext(MascotIdentityContext);

// Portalled dialogs do not share the app's DOM tree. Observe structural changes
// once per frame, not pointer movement or the mascot's animation attributes.
const modalSelector = [
  '.modal-backdrop:not(.task-editor-inline-backdrop)',
  '.focused-task-modal-backdrop:not(.fullscreen-task-embedded)',
  '.standalone-notes-backdrop:not(.standalone-notes-inline)',
  '.notes-editor-backdrop:not(.notes-editor-inline)',
  '.ai-chat-expanded-backdrop:not(.ai-chat-expanded-embedded)',
  '.econ-modal-backdrop',
  '.app-shell .fixed.inset-0[class*="backdrop-blur"]',
  '[aria-modal="true"]', 'dialog[open]'
].join(',');

export function useMascotSurface(enabled: boolean) {
  const previous = useRef<Element | null>(null);
  const [surface, setSurface] = useState({ modal: false, arrivalKey: 0 });
  useLayoutEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      let top: Element | null = null;
      let highest = -1;
      for (const element of document.querySelectorAll(modalSelector)) {
        if (element.closest('.fullscreen-task-embedded,.standalone-notes-inline,.notes-editor-inline,.task-editor-inline-backdrop,.ai-chat-expanded-embedded')) continue;
        if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
        let layer = 0;
        for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
          const z = Number(getComputedStyle(node).zIndex);
          if (Number.isFinite(z)) layer = Math.max(layer, z);
        }
        if (element instanceof HTMLDialogElement && element.open) layer = Number.MAX_SAFE_INTEGER;
        if (layer >= highest) { highest = layer; top = element; }
      }
      if (top === previous.current) return;
      previous.current = top;
      setSurface(old => ({ modal: !!top, arrivalKey: old.arrivalKey + 1 }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    const containsModal = (node: Node) => node instanceof Element && (node.matches(modalSelector) || !!node.querySelector(modalSelector));
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' ||
        [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(containsModal))) schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal'] });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); previous.current = null; };
  }, [enabled]);
  return surface;
}
