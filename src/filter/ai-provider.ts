/**
 * AI Provider Abstraction
 *
 * Shared model configuration for classification, editorial checks and summaries.
 * Groq is primary; the editorial second pass prefers Cerebras.
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
    /** For reasoning models (e.g. gpt-oss): reasoning_effort sent at call sites.
     *  Leave undefined for non-reasoning models so the param isn't sent. */
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

// Current shared-inference models, checked against the provider catalogs.
// A known retired repository override is migrated with a warning; an unrelated
// custom model is preserved so dedicated deployments remain configurable.
export const DEFAULT_AI_MODELS = {
    Cerebras: 'qwen-3.8-27b',
    Groq: 'openai/gpt-oss-20b',
} as const;

type ProviderName = keyof typeof DEFAULT_AI_MODELS;
const RETIRED_MODELS: Record<ProviderName, Set<string>> = {
    Cerebras: new Set(['zai-glm-4.7', 'llama3.1-8b', 'qwen-3-235b-a22b-instruct-2507']),
    Groq: new Set(['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']),
};

export function resolveAIModel(provider: ProviderName, configured?: string): string {
    const model = configured?.trim() || DEFAULT_AI_MODELS[provider];
    if (!RETIRED_MODELS[provider].has(model)) return model;
    console.warn(`[${provider}] Retired model override ${model}; using ${DEFAULT_AI_MODELS[provider]}. Update the model variable.`);
    return DEFAULT_AI_MODELS[provider];
}

export function modelReasoningEffort(model: string): AIProvider['reasoningEffort'] {
    if (model === 'qwen-3.8-27b') return 'none';
    if (/^(?:openai\/)?gpt-oss-(?:20|120)b$/.test(model)) return 'low';
    return undefined;
}

export function completionModelOptions(provider: Pick<AIProvider, 'model' | 'reasoningEffort'>) {
    return {
        model: provider.model,
        ...(provider.reasoningEffort ? { reasoning_effort: provider.reasoningEffort } : {}),
    };
}

const CEREBRAS_CONFIG = {
    name: 'Cerebras',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    maxConcurrent: 2,
    batchDelayMs: 5000,
    maxArticles: 40,
    descBatchSize: 3,
    descBatchDelayMs: 2000,
};

const GROQ_CONFIG = {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
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
        const model = resolveAIModel('Groq', process.env.GROQ_MODEL);
        providers.push({ ...GROQ_CONFIG, model, reasoningEffort: modelReasoningEffort(model), apiKey: groqKey });
    }

    const cerebrasKey = process.env.CEREBRAS_API_KEY;
    if (cerebrasKey) {
        const model = resolveAIModel('Cerebras', process.env.CEREBRAS_MODEL);
        providers.push({ ...CEREBRAS_CONFIG, model, reasoningEffort: modelReasoningEffort(model), apiKey: cerebrasKey });
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
