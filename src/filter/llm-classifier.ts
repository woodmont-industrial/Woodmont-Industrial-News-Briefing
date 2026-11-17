/**
 * LLM second-pass classifier — the editorial-judgment layer.
 *
 * After all rule-based filters run (Rule 2.5, property-type gate, region
 * filter, deal threshold, Path A predicted-publish), this calls Groq with
 * the Woodmont rubric and gets a per-article approve/reject + reason +
 * confidence. Catches the leak classes that mutate faster than regex can
 * track — anti-DC framing variants, sensitive content, novel software M&A
 * phrasings, cross-source duplicates, etc.
 *
 * Uses the existing getAIProviders() infrastructure (Groq primary,
 * Cerebras fallback, 429-aware retry).
 *
 * Output: stamps each input item with:
 *   _woodmontApprove: boolean
 *   _woodmontReason: string         (citing rule from rubric)
 *   _woodmontConfidence: 0-100
 *   _woodmontClassifier: 'groq' | 'cerebras'
 *   _woodmontRubricVersion / _woodmontClassifiedAt / _woodmontModel: provenance
 *
 * Fallback behavior: if the LLM fails entirely (no providers available,
 * malformed JSON, network error), the item keeps its existing verdict and
 * provenance. Previously unclassified items still use deterministic gates.
 */

import { NormalizedItem } from '../types/index.js';
import { getAIProviders, getRetryAfterMs, trackTokenUsage, completionModelOptions, type AIProvider } from './ai-provider.js';
import { WOODMONT_SYSTEM_PROMPT, buildArticleUserPrompt, WOODMONT_RUBRIC_VERSION } from './woodmont-rubric.js';

interface WoodmontVerdict {
    approve: boolean;
    reason: string;
    confidence: number;
    classifier: string;
    model: string;
    modelApprove: boolean;
    dateValidation: null;
}

/** A prompt and its version travel together, including in paired replay tests. */
export interface EditorialReviewOptions {
    rubric?: { version: string; systemPrompt: string };
    asOf?: Date;
}


/** Counts contain provider/status labels only, never response bodies or credentials. */
export interface EditorialReviewResult {
    classified: number;
    approved: number;
    rejected: number;
    failed: number;
    processed: number;
    deferred: number;
    budgetExhausted: boolean;
    failureReasons: Record<string, number>;
    providers: Array<{ name: string; model: string }>;
}

interface ReviewRun {
    providers: AIProvider[];
    deadline: number;
    failureReasons: Record<string, number>;
    unavailableUntil: Map<string, number>;
}

function recordFailure(run: ReviewRun, provider: AIProvider, reason: string): void {
    const key = provider.name + ':' + reason;
    run.failureReasons[key] = (run.failureReasons[key] || 0) + 1;
}

/** One bounded attempt per available provider; a failing provider must not monopolize the batch. */
async function classifyOneArticle(
    article: NormalizedItem, options: EditorialReviewOptions, run: ReviewRun,
): Promise<WoodmontVerdict | null> {
    const userPrompt = buildArticleUserPrompt({
        title: article.title,
        description: article.description || (article as any).content_text || (article as any).summary,
        source: article.source || (article as any)._source?.website || (article as any)._source?.name,
        url: (article as any).url || article.link,
        category: article.category,
        date_published: article.pubDate || (article as any).date_published,
    }, options.asOf);

    for (const provider of run.providers) {
        if (Date.now() >= run.deadline) break;
        if ((run.unavailableUntil.get(provider.name) || 0) > Date.now()) continue;
        try {
            const response = await fetch(provider.url, {
                method: 'POST',
                signal: AbortSignal.timeout(Math.max(1, Math.min(15_000, run.deadline - Date.now()))),
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + provider.apiKey },
                body: JSON.stringify({
                    ...completionModelOptions(provider),
                    messages: [
                        { role: 'system', content: options.rubric?.systemPrompt ?? WOODMONT_SYSTEM_PROMPT },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.1,
                    max_completion_tokens: 2048,
                    response_format: { type: 'json_object' },
                }),
            });
            if (!response.ok) {
                recordFailure(run, provider, 'http-' + response.status);
                if ([401, 403, 404, 410].includes(response.status)) {
                    // Configuration/access failures cannot recover by retrying every article.
                    run.unavailableUntil.set(provider.name, Infinity);
                } else if (response.status === 429) {
                    const wait = Math.max(1000, getRetryAfterMs(response) ?? 5000);
                    run.unavailableUntil.set(provider.name, Date.now() + wait);
                } else if (response.status >= 500) {
                    run.unavailableUntil.set(provider.name, Date.now() + 1000);
                }
                await response.body?.cancel();
                continue;
            }
            const data = await response.json();
            trackTokenUsage(data.usage);
            const content = data.choices?.[0]?.message?.content;
            if (typeof content !== 'string' || !content.trim()) {
                recordFailure(run, provider, 'empty-content:' +
                    (data.choices?.[0]?.finish_reason === 'length' ? 'length' : 'other'));
                continue;
            }
            const jsonMatch = content.replace(/\x60\x60\x60(?:json)?/g, '').trim().match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                recordFailure(run, provider, 'no-json');
                continue;
            }
            let parsed: { approve?: unknown; reason?: unknown; confidence?: unknown };
            try { parsed = JSON.parse(jsonMatch[0]); }
            catch { recordFailure(run, provider, 'invalid-json'); continue; }
            if (typeof parsed?.approve !== 'boolean' || typeof parsed.reason !== 'string'
                || !parsed.reason.trim() || typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence)) {
                recordFailure(run, provider, 'bad-verdict-shape');
                continue;
            }
            return {
                approve: parsed.approve,
                reason: parsed.reason.slice(0, 300),
                confidence: Math.max(0, Math.min(100, parsed.confidence)),
                classifier: provider.name.toLowerCase(),
                model: provider.model,
                modelApprove: parsed.approve,
                dateValidation: null,
            };
        } catch (error) {
            // Do not print exception messages: an upstream library can include request credentials.
            const name = (error as Error)?.name;
            recordFailure(run, provider, name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network-or-response');
            run.unavailableUntil.set(provider.name, Date.now() + 30_000);
        }
    }
    return null;
}

/**
 * Batch-classify a set of articles, stamping each with _woodmontApprove /
 * _woodmontReason / _woodmontConfidence / _woodmontClassifier.
 *
 * Provider concurrency limits are respected. Failed providers fall back immediately;
 * rate-limit pauses and every request share the caller's wall-clock deadline.
 * Unreviewed/deferred items keep their existing verdict and deterministic checks.
 *
 * @param items   Deterministically eligible articles, including rejected/capped
 *                items that may be reconsidered or selected by fallback paths.
 * @param maxConcurrent  How many parallel requests (default 5).
 * @param batchDelayMs   Pause between batches (default 500ms).
 * @param budgetMs       Hard wall-clock cap. Default 5 min (300_000ms).
 */
export async function classifyWoodmontBatch(
    items: NormalizedItem[],
    maxConcurrent: number = 5,
    batchDelayMs: number = 500,
    budgetMs: number = 5 * 60 * 1000,
    options: EditorialReviewOptions = {}
): Promise<EditorialReviewResult> {
    const providers = [...getAIProviders()].sort((a, b) =>
        Number(b.name === 'Cerebras') - Number(a.name === 'Cerebras'));
    const result: EditorialReviewResult = {
        classified: 0, approved: 0, rejected: 0, failed: 0, processed: 0,
        deferred: items.length, budgetExhausted: false, failureReasons: {},
        providers: providers.map(({ name, model }) => ({ name, model })),
    };
    if (providers.length === 0 || items.length === 0) return result;
    const start = Date.now();
    const run: ReviewRun = { providers, deadline: start + Math.max(0, budgetMs),
        failureReasons: result.failureReasons, unavailableUntil: new Map() };
    const concurrency = Math.max(1, Math.min(maxConcurrent, ...providers.map(p => p.maxConcurrent)));
    const rubricVersion = options.rubric?.version ?? WOODMONT_RUBRIC_VERSION;
    console.log('[Woodmont LLM] Classifying ' + items.length + ' candidates; providers: ' +
        JSON.stringify(result.providers) + '; concurrency: ' + concurrency + '; rubric: ' + rubricVersion);

    for (let i = 0; i < items.length; i += concurrency) {
        if (Date.now() >= run.deadline) break;
        const nextAvailable = Math.min(...providers.map(p => run.unavailableUntil.get(p.name) || 0));
        if (!Number.isFinite(nextAvailable)) break;
        const pause = Math.max(0, nextAvailable - Date.now());
        // Do not sleep through the rest of the build budget.
        if (pause >= run.deadline - Date.now()) break;
        if (pause) await new Promise(resolve => setTimeout(resolve, pause));

        const batch = items.slice(i, i + concurrency);
        const verdicts = await Promise.all(batch.map(item => classifyOneArticle(item, options, run)));
        verdicts.forEach((verdict, index) => {
            result.processed++;
            if (!verdict) { result.failed++; return; }
            const item = batch[index] as NormalizedItem & Record<string, unknown>;
            item._woodmontApprove = verdict.approve;
            item._woodmontReason = verdict.reason;
            item._woodmontConfidence = verdict.confidence;
            item._woodmontClassifier = verdict.classifier;
            item._woodmontRubricVersion = rubricVersion;
            item._woodmontClassifiedAt = new Date().toISOString();
            item._woodmontModel = verdict.model;
            item._woodmontModelApprove = verdict.modelApprove;
            item._woodmontDateValidation = verdict.dateValidation;
            result.classified++;
            if (verdict.approve) result.approved++; else result.rejected++;
        });
        // The caller's ordinary one-second delay must not override a provider's
        // slower pacing. An explicit zero is retained for offline/mock replays.
        const activeProviders = providers.filter(p => (run.unavailableUntil.get(p.name) || 0) <= Date.now());
        const pacing = batchDelayMs === 0 ? 0 : Math.max(batchDelayMs, ...activeProviders.map(p => p.batchDelayMs));
        const delay = Math.min(Math.max(0, pacing), Math.max(0, run.deadline - Date.now()));
        if (i + concurrency < items.length && delay) await new Promise(resolve => setTimeout(resolve, delay));
    }
    result.deferred = items.length - result.processed;
    result.budgetExhausted = result.deferred > 0 && Date.now() >= run.deadline;
    console.log('[Woodmont LLM] Review coverage: ' + JSON.stringify(result));
    if (result.failed || result.deferred) console.warn('[Woodmont LLM] Incomplete editorial review; existing verdicts preserved.');
    return result;
}
