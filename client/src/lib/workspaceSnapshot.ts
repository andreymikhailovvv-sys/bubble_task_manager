import type { Habit, Sphere, Task } from './types';

// Session-scoped by design: never mix accounts or persist private task data
// beyond the browser tab. A snapshot is strictly a first-paint optimization.
const VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_SERIALIZED_BYTES = 3_000_000;
const cacheKey = (userId: string) => `btm:workspace:v${VERSION}:${encodeURIComponent(userId)}`;

export type WorkspaceSnapshot = { spheres: Sphere[]; tasks: Task[]; habits: Habit[] };
type SnapshotRecord = WorkspaceSnapshot & { version: number; userId: string; savedAt: number };
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): StoragePort | undefined {
  try { return typeof sessionStorage === 'undefined' ? undefined : sessionStorage; }
  catch { return undefined; }
}

export function readWorkspaceSnapshot(
  userId: string, storage: StoragePort | undefined = browserStorage(), now = Date.now()
): WorkspaceSnapshot | null {
  if (!userId || !storage) return null;
  try {
    const raw = storage.getItem(cacheKey(userId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SnapshotRecord>;
    if (data.version !== VERSION || data.userId !== userId ||
        typeof data.savedAt !== 'number' || data.savedAt > now ||
        now - data.savedAt > MAX_AGE_MS ||
        !Array.isArray(data.spheres) || !Array.isArray(data.tasks) ||
        !Array.isArray(data.habits)) return null;
    return { spheres: data.spheres, tasks: data.tasks, habits: data.habits };
  } catch {
    return null;
  }
}

export function writeWorkspaceSnapshot(
  userId: string, value: WorkspaceSnapshot,
  storage: StoragePort | undefined = browserStorage(), now = Date.now()
): boolean {
  if (!userId || !storage) return false;
  try {
    const raw = JSON.stringify({ ...value, version: VERSION, userId, savedAt: now } satisfies SnapshotRecord);
    if (raw.length > MAX_SERIALIZED_BYTES) return false;
    storage.setItem(cacheKey(userId), raw);
    return true;
  } catch {
    // Quota exceeded, private mode or disabled storage must never break tasks.
    return false;
  }
}

export function clearWorkspaceSnapshot(userId: string, storage: StoragePort | undefined = browserStorage()) {
  if (!userId || !storage) return;
  try { storage.removeItem(cacheKey(userId)); } catch { /* ignore disabled storage */ }
}
