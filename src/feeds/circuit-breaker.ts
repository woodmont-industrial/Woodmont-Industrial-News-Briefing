/**
 * Circuit breaker for blocked feed tracking (24-hour cooldown).
 * Extracted from fetcher.ts.
 */

export interface CircuitBreakerState {
    failureCount: number;
    blockedUntil: number;
    lastError?: string;
    last403Preview?: string;
}

export const circuitBreaker = new Map<string, CircuitBreakerState>();
export const FETCH_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
export const BLOCKED_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_FAILURES_BEFORE_BLOCK = 3;

export function markFeedBlocked(feedUrl: string, reason: string, preview?: string): void {
    const cb = circuitBreaker.get(feedUrl) || { failureCount: 0, blockedUntil: 0 };
    cb.failureCount = MAX_FAILURES_BEFORE_BLOCK;
    cb.blockedUntil = Date.now() + BLOCKED_COOLDOWN_MS;
    cb.lastError = reason;
    if (preview) {
        cb.last403Preview = preview.slice(0, 500);
    }
    circuitBreaker.set(feedUrl, cb);
    console.log(`🚫 [${feedUrl}] Blocked for 24 hours: ${reason}`);
}

export function getBlockedFeeds(): { url: string; reason: string; blockedUntil: string; preview?: string }[] {
    const blocked: { url: string; reason: string; blockedUntil: string; preview?: string }[] = [];
    const now = Date.now();

    circuitBreaker.forEach((state, url) => {
        if (state.blockedUntil > now) {
            blocked.push({
                url,
                reason: state.lastError || 'Unknown',
                blockedUntil: new Date(state.blockedUntil).toISOString(),
                preview: state.last403Preview
            });
        }
    });

    return blocked;
}
