import { createRoot, type Root } from 'react-dom/client';
import { LiveVoiceDialog } from '../components/LiveVoiceDialog';
import type { ComponentProps } from 'react';

type LiveSessionProps = Omit<ComponentProps<typeof LiveVoiceDialog>, 'onClose'> & { onClose?: () => void };
let active: { root: Root; node: HTMLDivElement; closed: boolean } | null = null;

/**
 * A live session must outlive the composer that initiated it. Composers are
 * unmounted on chat/tab navigation; the independent React root remains in
 * document.body until the actual Hang Up action (or server timeout).
 */
export function planikLiveSessionActive(): boolean { return active !== null; }

export function expandPersistentPlanikLiveSession(): boolean {
  if (!active) return false;
  window.dispatchEvent(new Event('planik-live-expand'));
  return true;
}

export function startPersistentPlanikLiveSession(props: LiveSessionProps): boolean {
  if (active) { expandPersistentPlanikLiveSession(); return false; }
  const node = document.createElement('div');
  node.dataset.planikSessionHost = 'true';
  document.body.appendChild(node);
  const root = createRoot(node);
  const session = { node, root, closed: false };
  active = session;
  const finish = () => {
    if (session.closed) return;
    session.closed = true;
    if (active === session) active = null;
    // The dialog's Close handler can run inside React's own event dispatch.
    // Unmount after that dispatch, not synchronously during rendering.
    queueMicrotask(() => {
      root.unmount();
      node.remove();
      props.onClose?.();
    });
  };
  root.render(<LiveVoiceDialog {...props} onClose={finish} />);
  return true;
}
