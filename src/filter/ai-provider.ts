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
    maxConcurrent: 5,
    batchDelayMs: 1000,
    maxArticles: 40,
    descBatchSize: 8,
    descBatchDelayMs: 500,
};

const GROQ_CONFIG = {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    maxConcurrent: 2,
    batchDelayMs: 5000,
    maxArticles: 15,
    descBatchSize: 3,
    descBatchDelayMs: 2000,
};

// Cumulative token usage tracking per build
const tokenUsage = { prompt: 0, completion: 0, total: 0, requests: 0 };

/**
 * Get the best available AI provider.
 * Returns null if no API key is configured.
 */
export function getAIProvider(): AIProvider | null {
    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (cerebrasKey) {
        return { ...CEREBRAS_CONFIG, apiKey: cerebrasKey };
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        return { ...GROQ_CONFIG, apiKey: groqKey };
    }

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
