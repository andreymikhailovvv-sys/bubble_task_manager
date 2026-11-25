import { useEffect, type RefObject } from 'react';

const selector = '.overflow-y-auto,.overflow-auto,.overflow-y-scroll,.overflow-scroll,.list-mode-canvas,.timeline-canvas,.ai-chat-expanded-thread,.focused-task-editor-shell,.notes-editor-content,.standalone-notes-scroll-area,.subscription-modal-scroll';

export function useScrollFade(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    let frame = 0;
    const tracked = new Set<HTMLElement>();
    const update = (node: HTMLElement) => {
      if (node.clientHeight === 0) return;
      const more = node.scrollHeight - node.clientHeight - node.scrollTop > 3;
      const above = node.scrollTop > 3;
      const value = above && more ? 'both' : more ? 'bottom' : above ? 'top' : 'none';
      if (node.dataset.scrollFade !== value) node.dataset.scrollFade = value;
    };
    const resize = new ResizeObserver(() => schedule());
    const scan = () => {
      frame = 0;
      const candidates = [...root.querySelectorAll<HTMLElement>(selector)];
      if (root.matches(selector)) candidates.push(root);
      const next = new Set(candidates.filter(node => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)));
      for (const node of tracked) if (!next.has(node)) {
        resize.unobserve(node); delete node.dataset.scrollFade; tracked.delete(node);
      }
      for (const node of next) {
        if (!tracked.has(node)) { tracked.add(node); resize.observe(node); }
        update(node);
      }
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(scan); }
    const scroll = (event: Event) => {
      if (event.target instanceof HTMLElement && tracked.has(event.target)) update(event.target);
    };
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, { childList: true, subtree: true });
    resize.observe(root);
    const input = (event: Event) => {
      const node = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(selector) : null;
      if (node && tracked.has(node)) update(node);
    };
    root.addEventListener('input', input, true);
    root.addEventListener('scroll', scroll, true);
    schedule();
    return () => {
      cancelAnimationFrame(frame); mutation.disconnect(); resize.disconnect();
      root.removeEventListener('input', input, true);
      root.removeEventListener('scroll', scroll, true);
      for (const node of tracked) delete node.dataset.scrollFade;
    };
  }, [ref, enabled]);
}
