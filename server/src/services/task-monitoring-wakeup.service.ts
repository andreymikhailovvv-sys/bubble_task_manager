/**
 * The queue stores absolute times in PostgreSQL. This callback only wakes the
 * current Node process; correctness never depends on an in-memory timer.
 */
let wake: (() => void) | null = null;
export function registerTaskMonitoringWakeup(handler: () => void) { wake = handler; }
export function signalTaskMonitoringWakeup() { wake?.(); }
