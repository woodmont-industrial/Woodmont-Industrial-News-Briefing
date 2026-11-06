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
import { getAIProviders, getRetryAfterMs, trackTokenUsage, completionModelOptions } from './ai-provider.js';
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

/**
 * Call the LLM with a single article and parse its verdict. Iterates through
 * available providers on 429 (mirrors classifyWithAI pattern).
 */
async function classifyOneArticle(article: NormalizedItem, options: EditorialReviewOptions): Promise<WoodmontVerdict | null> {
    // 2026-06-10: reversed provider order — Cerebras first, Groq fallback.
    // The upstream AI categorizer (filterArticlesWithAI in static.ts) drains
    // Groq's quota by the time we get to the Woodmont second-pass; reversing
    // the order gives us a separate budget. Cerebras 1M tokens/day free is
    // plenty for ~20-100 verdicts per build.
    const providers = [...getAIProviders()].sort((a, b) => {
        if (a.name === 'Cerebras') return -1;
        if (b.name === 'Cerebras') return 1;
        return 0;
    });
    if (providers.length === 0) return null;

    const userPrompt = buildArticleUserPrompt({
        title: article.title,
        description: (article as any).description || (article as any).content_text || (article as any).summary,
        source: article.source || (article as any)._source?.website || (article as any)._source?.name,
        url: (article as any).url || article.link,
        category: article.category,
        date_published: article.pubDate || (article as any).date_published,
    }, options.asOf);

    for (let pIdx = 0; pIdx < providers.length; pIdx++) {
        const provider = providers[pIdx];
        const isLast = pIdx === providers.length - 1;
        try {
            let response: Response | null = null;
            let retries = 0;
            const maxRetries = 2; // tighter than classifyWithAI; rubric is consistent so no point in many retries
            let exhausted429 = false;

            while (retries < maxRetries) {
                response = await fetch(provider.url, {
                    method: 'POST',
                    signal: AbortSignal.timeout(30_000),
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${provider.apiKey}`
                    },
                    body: JSON.stringify({
                        ...completionModelOptions(provider),
                        messages: [
                            { role: 'system', content: options.rubric?.systemPrompt ?? WOODMONT_SYSTEM_PROMPT },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.1,
                        max_completion_tokens: 2048,
                        response_format: { type: 'json_object' }
                    })
                });

                if (response.status === 429) {
                    retries++;
                    const retryAfterMs = getRetryAfterMs(response);
                    const waitTime = retryAfterMs ?? Math.pow(2, retries) * 1500;
                    if (retries < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                    exhausted429 = true;
                    break;
                }
                break;
            }

            if (exhausted429 && !isLast) continue;
            if (!response || !response.ok) {
                if (!isLast) continue;
                return null;
            }

            const data = await response.json();
            trackTokenUsage(data.usage);
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                if (!isLast) continue;
                return null;
            }

            // Parse JSON — be lenient about markdown code fences just in case.
            let jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                if (!isLast) continue;
                return null;
            }

            const parsed = JSON.parse(jsonMatch[0]);
            if (typeof parsed.approve !== 'boolean' || typeof parsed.reason !== 'string'
                || typeof parsed.confidence !== 'number' || !Number.isFinite(parsed.confidence)) {
                if (!isLast) continue;
                return null;
            }
            // Selection already applies the configured windows. Editorial review must
            // not impose another age cutoff on otherwise eligible backfill.
            return {
                approve: parsed.approve,
                reason: String(parsed.reason || '').slice(0, 300),
                confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
                classifier: provider.name.toLowerCase(),
                model: provider.model,
                modelApprove: parsed.approve,
                dateValidation: null,
            };
        } catch (err) {
            if (!isLast) continue;
            return null;
        }
    }
    return null;
}

/**
 * Batch-classify a set of articles, stamping each with _woodmontApprove /
 * _woodmontReason / _woodmontConfidence / _woodmontClassifier.
 *
 * Concurrency tuned for Groq free tier (30 RPM): 5 in flight × 500ms inter-batch
 * gives ~10 req/sec peak which Groq absorbs fine, with the 429-fallback in
 * classifyOneArticle catching any rate-limit spikes.
 *
 * Wall-clock budget enforced: if budgetMs elapses before the batch finishes,
 * any remaining items keep their stored verdict (or remain unclassified). The build step has a
 * 10-minute timeout; we cap the LLM at 5 to leave headroom for image
 * enrichment and feed.json writes.
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
): Promise<{ classified: number; approved: number; rejected: number; failed: number; budgetExhausted: boolean }> {
    const providers = getAIProviders();
    if (providers.length === 0 || items.length === 0) {
        return { classified: 0, approved: 0, rejected: 0, failed: 0, budgetExhausted: false };
    }

    // Show the actual provider order this run will use (Cerebras-first after the 2026-06-10
    // sort in classifyOneArticle). Helps diagnose quota issues from build logs.
    const sortedProviders = [...providers].sort((a, b) => {
        if (a.name === 'Cerebras') return -1;
        if (b.name === 'Cerebras') return 1;
        return 0;
    });
    const start = Date.now();
    const rubricVersion = options.rubric?.version ?? WOODMONT_RUBRIC_VERSION;
    console.log(`[Woodmont LLM] Classifying ${items.length} candidates with ${sortedProviders[0].name} (concurrency: ${maxConcurrent}, budget: ${Math.round(budgetMs/1000)}s, rubric: ${rubricVersion})`);

    let approved = 0;
    let rejected = 0;
    let failed = 0;
    let processed = 0;
    let budgetExhausted = false;

    for (let i = 0; i < items.length; i += maxConcurrent) {
        // Wall-clock guard — bail before kicking off the next batch
        if (Date.now() - start >= budgetMs) {
            budgetExhausted = true;
            const remaining = items.length - i;
            console.log(`[Woodmont LLM] Budget exhausted after ${Math.round((Date.now()-start)/1000)}s. ${remaining} items retain their existing verdicts.`);
            break;
        }

        const batch = items.slice(i, i + maxConcurrent);
        const results = await Promise.all(batch.map(item => classifyOneArticle(item, options)));

        results.forEach((verdict, idx) => {
            processed++;
            const item = batch[idx];
            if (verdict === null) {
                failed++;
                return;
            }
            (item as any)._woodmontApprove = verdict.approve;
            (item as any)._woodmontReason = verdict.reason;
            (item as any)._woodmontConfidence = verdict.confidence;
            (item as any)._woodmontClassifier = verdict.classifier;
            (item as any)._woodmontRubricVersion = rubricVersion;
            (item as any)._woodmontClassifiedAt = new Date().toISOString();
            (item as any)._woodmontModel = verdict.model;
            (item as any)._woodmontModelApprove = verdict.modelApprove;
            (item as any)._woodmontDateValidation = verdict.dateValidation;
            if (verdict.approve) approved++; else rejected++;
        });

        if (i + maxConcurrent < items.length) {
            await new Promise(resolve => setTimeout(resolve, batchDelayMs));
        }
    }

    const elapsedSec = Math.round((Date.now() - start) / 1000);
    console.log(`[Woodmont LLM] Done in ${elapsedSec}s: ${approved} approved, ${rejected} rejected, ${failed} failed (processed ${processed}/${items.length}${budgetExhausted ? ', BUDGET EXHAUSTED' : ''})`);
    return { classified: processed - failed, approved, rejected, failed, budgetExhausted };
}
