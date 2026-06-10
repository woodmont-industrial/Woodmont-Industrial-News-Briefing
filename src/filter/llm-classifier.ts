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
 *   _woodmontClassifier: 'groq' | 'cerebras' | 'fallback' (which provider verdict came from)
 *
 * Fallback behavior: if the LLM fails entirely (no providers available,
 * malformed JSON, network error), the item keeps its existing
 * _predictedPublish flag — better to ship the rule-filter result than
 * accidentally block everything on infrastructure failure.
 */

import { NormalizedItem } from '../types/index.js';
import { getAIProviders, getRetryAfterMs, trackTokenUsage } from './ai-provider.js';
import { WOODMONT_SYSTEM_PROMPT, buildArticleUserPrompt, WOODMONT_RUBRIC_VERSION } from './woodmont-rubric.js';

interface WoodmontVerdict {
    approve: boolean;
    reason: string;
    confidence: number;
    classifier: string;
}

/**
 * Call the LLM with a single article and parse its verdict. Iterates through
 * available providers on 429 (mirrors classifyWithAI pattern).
 */
async function classifyOneArticle(article: NormalizedItem): Promise<WoodmontVerdict | null> {
    const providers = getAIProviders();
    if (providers.length === 0) return null;

    const userPrompt = buildArticleUserPrompt({
        title: article.title,
        description: (article as any).description || (article as any).content_text || (article as any).summary,
        source: article.source || (article as any)._source?.website || (article as any)._source?.name,
        url: (article as any).url || article.link,
        category: article.category,
        date_published: article.pubDate || (article as any).date_published,
    });

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
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${provider.apiKey}`
                    },
                    body: JSON.stringify({
                        model: provider.model,
                        messages: [
                            { role: 'system', content: WOODMONT_SYSTEM_PROMPT },
                            { role: 'user', content: userPrompt }
                        ],
                        temperature: 0.1,
                        max_tokens: 250,
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
            return {
                approve: parsed.approve === true,
                reason: String(parsed.reason || '').slice(0, 300),
                confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
                classifier: provider.name.toLowerCase(),
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
 * any remaining items are left unstamped (no verdict). The build step has a
 * 10-minute timeout; we cap the LLM at 5 to leave headroom for image
 * enrichment and feed.json writes.
 *
 * @param items   Items to classify. Typically the subset where
 *                _predictedPublish === true (saves LLM cost by 80%+).
 * @param maxConcurrent  How many parallel requests (default 5).
 * @param batchDelayMs   Pause between batches (default 500ms).
 * @param budgetMs       Hard wall-clock cap. Default 5 min (300_000ms).
 */
export async function classifyWoodmontBatch(
    items: NormalizedItem[],
    maxConcurrent: number = 5,
    batchDelayMs: number = 500,
    budgetMs: number = 5 * 60 * 1000
): Promise<{ classified: number; approved: number; rejected: number; failed: number; budgetExhausted: boolean }> {
    const providers = getAIProviders();
    if (providers.length === 0 || items.length === 0) {
        return { classified: 0, approved: 0, rejected: 0, failed: 0, budgetExhausted: false };
    }

    const start = Date.now();
    console.log(`[Woodmont LLM] Classifying ${items.length} candidates with ${providers[0].name} (concurrency: ${maxConcurrent}, budget: ${Math.round(budgetMs/1000)}s, rubric: ${WOODMONT_RUBRIC_VERSION})`);

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
            console.log(`[Woodmont LLM] Budget exhausted after ${Math.round((Date.now()-start)/1000)}s. ${remaining} items left unstamped (will fall back to _predictedPublish).`);
            break;
        }

        const batch = items.slice(i, i + maxConcurrent);
        const results = await Promise.all(batch.map(item => classifyOneArticle(item)));

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
