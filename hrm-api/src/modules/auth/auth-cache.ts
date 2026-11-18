import type { AuthChange } from '../../db/auth-changes';

/**
 * Short-lived in-process cache of resolved auth contexts (who the caller is, roles, permissions, account-setup
 * flags), so an authenticated request runs only its own tenant transaction instead of a second one in the
 * authenticate hook.
 *
 * Freshness: every write that can change a resolved context is announced after commit (db/auth-changes):
 * in this process directly, in other API processes through PostgreSQL LISTEN/NOTIFY. Invalidation is ordered
 * with loads by a sequence number — an entry is served only if it was loaded after the last invalidation that
 * concerns it, so a load racing with a commit can never re-insert the old state. `ttlMs` bounds staleness if a
 * notification were ever missed; while the LISTEN connection is down the cache is bypassed entirely.
 */
export interface AuthCacheOptions {
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
}

/**
 * How long a per-user invalidation is remembered: longer than any load (a tenant transaction times out after
 * 10 s), so a load that started before the change can never store its result afterwards.
 */
const MARK_RETENTION_MS = 60_000;

interface Entry<T> {
  value: T;
  /** Sequence number taken before the load started. */
  loadedSeq: number;
  expiresAt: number;
}

export class AuthCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  /** Last invalidation per user: sequence number and when it happened (kept for MARK_RETENTION_MS). */
  private readonly userInvalidated = new Map<string, { seq: number; at: number }>();
  private seq = 0;
  private allInvalidatedSeq = 0;
  private ready: boolean;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(private readonly opts: AuthCacheOptions) {
    this.maxEntries = opts.maxEntries ?? 20_000;
    this.now = opts.now ?? Date.now;
    // Without cross-process notifications the cache starts not-ready; the listener flips it on.
    this.ready = false;
  }

  get enabled() {
    return this.opts.ttlMs > 0 && this.ready;
  }

  /** The listener is (dis)connected. Reconnecting may have missed notifications, so everything is dropped. */
  setReady(ready: boolean) {
    this.invalidate({ all: true });
    this.ready = ready;
  }

  /** Return a fresh cached value, or load it (loads are not shared: a miss simply goes to the database). */
  async get(workspaceId: string, userId: string, load: () => Promise<T | null>): Promise<T | null> {
    if (!this.enabled) return load();
    const key = `${workspaceId}:${userId}`;
    const hit = this.entries.get(key);
    if (hit && this.isFresh(hit, userId)) return hit.value;
    if (hit) this.entries.delete(key);

    const loadedSeq = this.seq;
    const value = await load();
    // Only successful resolutions are cached (disabled / unknown users are checked every time), and never one
    // whose load overlapped an invalidation of that user: it may have read the state from before the change.
    if (value !== null && this.enabled && !this.invalidatedSince(loadedSeq, userId)) {
      if (this.entries.size >= this.maxEntries) this.evict();
      this.entries.set(key, { value, loadedSeq, expiresAt: this.now() + this.opts.ttlMs });
    }
    return value;
  }

  invalidate(change: AuthChange) {
    const seq = ++this.seq;
    if (change.all) {
      this.allInvalidatedSeq = seq;
      this.entries.clear();
      this.userInvalidated.clear();
      return;
    }
    const at = this.now();
    for (const [userId, mark] of this.userInvalidated) if (mark.at + MARK_RETENTION_MS < at) this.userInvalidated.delete(userId);
    for (const userId of change.userIds) {
      this.userInvalidated.set(userId, { seq, at });
      for (const key of this.entries.keys()) if (key.endsWith(`:${userId}`)) this.entries.delete(key);
    }
  }

  get size() {
    return this.entries.size;
  }

  private invalidatedSince(seq: number, userId: string) {
    return seq < this.allInvalidatedSeq || seq < (this.userInvalidated.get(userId)?.seq ?? 0);
  }

  private isFresh(entry: Entry<T>, userId: string) {
    return entry.expiresAt > this.now() && !this.invalidatedSince(entry.loadedSeq, userId);
  }

  /** Drop expired entries; if still full, the oldest entry goes. */
  private evict() {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}
