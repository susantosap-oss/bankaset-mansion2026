interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

const CLEANUP_INTERVAL = 5 * 60 * 1000; // clean stale entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [key, win] of store) {
    if (now > win.resetAt) store.delete(key);
  }
}, CLEANUP_INTERVAL).unref?.();

/**
 * Simple in-memory rate limiter (per-key, sliding fixed window).
 * Not suitable for multi-process deploys — use Redis there.
 *
 * @param key   Unique identifier, e.g. IP + route
 * @param limit Max requests per window
 * @param windowMs Window duration in ms (default: 60s)
 * @returns { ok: true } if allowed, { ok: false, retryAfterMs } if blocked
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const now = Date.now();
  let win = store.get(key);

  if (!win || now > win.resetAt) {
    win = { count: 0, resetAt: now + windowMs };
    store.set(key, win);
  }

  win.count++;

  if (win.count > limit) {
    return { ok: false, retryAfterMs: win.resetAt - now };
  }
  return { ok: true };
}
