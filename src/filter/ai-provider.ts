/**
 * AI Provider Abstraction
 *
 * Selects the best available AI provider:
 * 1. Cerebras (preferred) — Qwen 3 235B, free tier, 1M tokens/day, very fast
 * 2. Groq (fallback) — llama-3.1-8b-instant, free tier
 *
 * Both use OpenAI-compatible chat completions API format.
 */

export interface AIProvider {
    name: string;
    url: string;
    model: string;
    apiKey: string;
    /** Max concurrent requests before rate limiting becomes a concern */
    maxConcurrent: number;
    /** Delay between batches in ms */
    batchDelayMs: number;
    /** Max articles to classify per build */
    maxArticles: number;
    /** Batch size for description generation */
    descBatchSize: number;
    /** Delay between description batches in ms */
    descBatchDelayMs: number;
}

// Model override via env: CEREBRAS_MODEL=qwen-3-235b-a22b-instruct-2507
// Default: llama3.1-8b (production, guaranteed available)
// Upgrade to qwen-3-235b-a22b-instruct-2507 once preview access is confirmed
const CEREBRAS_CONFIG = {
    name: 'Cerebras',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    model: process.env.CEREBRAS_MODEL || 'llama3.1-8b',
    // 2026-05-27 v2: tighter still since Cerebras is now the fallback. When it
    // does run, it's because Groq already 429'd — we should be extra-gentle.
    // 2 concurrent x 5000ms = ~24 RPM, well under free-tier RPM cap.
    maxConcurrent: 2,
    batchDelayMs: 5000,
    maxArticles: 40,
    descBatchSize: 3,
    descBatchDelayMs: 2000,
};

const GROQ_CONFIG = {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    // 2026-05-27: promoted to primary; Cerebras now fallback. Bumped maxArticles
    // 15 -> 60 to match Cerebras throughput. Groq's free tier RPM is similar to
    // Cerebras but their TPM cap is generous; these values should stay within it.
    maxConcurrent: 3,
    batchDelayMs: 2000,
    maxArticles: 60,
    descBatchSize: 4,
    descBatchDelayMs: 1500,
};

// Cumulative token usage tracking per build
const tokenUsage = { prompt: 0, completion: 0, total: 0, requests: 0 };

/**
 * Get the best available AI provider.
 * Returns null if no API key is configured.
 */
export function getAIProvider(): AIProvider | null {
    // Kept for backward compat. Returns the first available provider.
    // For true fallback behavior, use getAIProviders() and iterate.
    return getAIProviders()[0] ?? null;
}

/**
 * Return ALL available AI providers in preference order:
 * Groq first (primary), Cerebras second (fallback).
 * Use this when you want 429-fallback: on rate-limit-exhaustion in one
 * provider, advance to the next.
 */
export function getAIProviders(): AIProvider[] {
    const providers: AIProvider[] = [];

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        providers.push({ ...GROQ_CONFIG, apiKey: groqKey });
    }

    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (cerebrasKey) {
        providers.push({ ...CEREBRAS_CONFIG, apiKey: cerebrasKey });
    }

    return providers;
}

/**
 * Parse the Retry-After header from a 429 response.
 * Returns milliseconds to wait, or null if header missing/unparseable.
 * Handles both delta-seconds (e.g., "30") and HTTP-date formats.
 */
export function getRetryAfterMs(response: Response): number | null {
    const retryAfter = response.headers.get('retry-after');
    if (!retryAfter) return null;
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
    const retryDate = new Date(retryAfter).getTime();
    if (!Number.isNaN(retryDate)) return Math.max(0, retryDate - Date.now());
    return null;
}

/**
 * Track token usage from an API response's usage object.
 * Both Cerebras and Groq return { prompt_tokens, completion_tokens, total_tokens }.
 */
export function trackTokenUsage(usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined): void {
    if (!usage) return;
    tokenUsage.prompt += usage.prompt_tokens || 0;
    tokenUsage.completion += usage.completion_tokens || 0;
    tokenUsage.total += usage.total_tokens || 0;
    tokenUsage.requests++;
}

/**
 * Log cumulative token usage summary for this build.
 */
export function logTokenUsage(): void {
    if (tokenUsage.requests === 0) return;
    const provider = getAIProvider();
    console.log(`[${provider?.name ?? 'AI'}] Token usage: ${tokenUsage.total.toLocaleString()} total (${tokenUsage.prompt.toLocaleString()} prompt + ${tokenUsage.completion.toLocaleString()} completion) across ${tokenUsage.requests} requests`);
}
