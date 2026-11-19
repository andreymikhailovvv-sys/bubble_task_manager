import { useLayoutEffect, useMemo, useRef } from 'react';

/**
 * Stable event callbacks for a heavy memoized view.
 *
 * UI updates must still see the latest closures (selected task, modal state,
 * permissions, etc). Only the callback identities remain stable. Updating the
 * ref after every committed render avoids callbacks from abandoned renders.
 */
export function useStableCallbackMap<T extends Record<string, (...args: any[]) => any>>(callbacks: T): T {
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  });

  return useMemo(() => Object.fromEntries(
    Object.keys(callbacks).map((name) => [
      name,
      (...args: any[]) => latest.current[name](...args)
    ])
  ) as T, []);
}
