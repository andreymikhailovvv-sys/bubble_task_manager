/**
 * Best-effort, process-local protection for password endpoints.
 * No infrastructure dependency, no database schema changes.
 * Limits reset on server restart and are not shared between replicas.
 */
export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number };

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly maxEntries = 10_000,
    private readonly now: () => number = Date.now
  ) {
    if (maxAttempts < 1 || windowMs < 1 || maxEntries < 1) throw new Error('Invalid rate limit configuration');
  }

  inspect(key: string): RateLimitDecision {
    const timestamp = this.now();
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= timestamp) {
      if (entry) this.entries.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    return {
      allowed: entry.count < this.maxAttempts,
      retryAfterSeconds: entry.count < this.maxAttempts ? 0 : Math.max(1, Math.ceil((entry.expiresAt - timestamp) / 1000))
    };
  }

  consume(key: string): RateLimitDecision {
    const decision = this.inspect(key);
    if (!decision.allowed) return decision;
    this.record(key);
    return decision;
  }

  record(key: string): void {
    const timestamp = this.now();
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > timestamp) {
      entry.count += 1;
      return;
    }
    if (entry) this.entries.delete(key);

    if (this.entries.size >= this.maxEntries) {
      // Prune stale entries first. Never retain unbounded attacker-controlled keys.
      for (const [id, stored] of this.entries) {
        if (stored.expiresAt <= timestamp) this.entries.delete(id);
      }
      if (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value;
        if (oldest !== undefined) this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { count: 1, expiresAt: timestamp + this.windowMs });
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}
