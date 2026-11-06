import * as fs from 'node:fs';
import type { NormalizedItem } from '../types/index.js';
import { RELEVANT_KEYWORDS } from '../shared/region-data.js';
import { applyStrictFilter, applyTransactionFilter, applyAvailabilityFilter, applyPeopleFilter, isRoutableRegionalDeal } from '../server/newsletter-filters.js';
import { classifyWoodmontBatch, type EditorialReviewOptions } from '../filter/llm-classifier.js';
import { WOODMONT_RUBRIC_VERSION } from '../filter/woodmont-rubric.js';
import { newsletterCategory } from '../shared/development-signal.js';
import { generateJSONFeed } from './feed-generators.js';

/**
 * Enrollment is a deterministic check, not permission to publish. A rejected
 * article must be eligible for a corrected rubric to reconsider it. Neutral
 * copies never replace the originals; a failed call keeps the stored verdict.
 * Include uncapped candidates because backfill and the local-deal router use them.
 */
export function getEditorialReviewCandidates(items: NormalizedItem[]): NormalizedItem[] {
    const neutral = items.map(item => ({ ...item, category: newsletterCategory(item), _woodmontApprove: undefined }));
    const byCategory = (category: string) => neutral.filter(item => item.category === category);
    const eligible = new Set([
        ...applyStrictFilter(byCategory('relevant'), RELEVANT_KEYWORDS, 'Editorial enrollment'),
        ...applyTransactionFilter(byCategory('transactions')),
        ...byCategory('transactions').filter(isRoutableRegionalDeal),
        ...applyAvailabilityFilter(byCategory('availabilities')),
        ...applyPeopleFilter(byCategory('people')),
    ]);
    return items.filter((_, index) => eligible.has(neutral[index])).sort((a, b) => {
        // Review old/missing versions first, then freshest first within that group.
        const aCurrent = (a as any)._woodmontRubricVersion === WOODMONT_RUBRIC_VERSION ? 1 : 0;
        const bCurrent = (b as any)._woodmontRubricVersion === WOODMONT_RUBRIC_VERSION ? 1 : 0;
        const date = (item: NormalizedItem) => Date.parse(item.pubDate || (item as any).date_published || '') || 0;
        // Correct legacy rejections before spending the budget on approvals.
        const rejected = (item: NormalizedItem) => (item as any)._woodmontApprove === false ? 0 : 1;
        return aCurrent - bCurrent || rejected(a) - rejected(b) || date(b) - date(a);
    });
}

/** Predictions use the stored verdict, unlike enrollment. Recompute after review. */
export function stampPredictedPublish(items: NormalizedItem[]): number {
    for (const item of items) item.category = newsletterCategory(item);
    const byCategory = (category: string) => items.filter(item => item.category === category);
    const sections = {
        relevant: applyStrictFilter(byCategory('relevant'), RELEVANT_KEYWORDS, 'Predicted Relevant'),
        transactions: applyTransactionFilter(byCategory('transactions')),
        availabilities: applyAvailabilityFilter(byCategory('availabilities')),
        people: applyPeopleFilter(byCategory('people')),
    };
    const passed = new Set<NormalizedItem>();
    const published = new Set<NormalizedItem>();
    for (const [category, articles] of Object.entries(sections)) {
        articles.forEach(article => passed.add(article));
        [...articles].sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0))
            .slice(0, category === 'availabilities' ? 5 : 10).forEach(article => published.add(article));
    }
    for (const item of items) {
        const reason = (item as any)._classificationReason;
        (item as any)._predictedPublish = published.has(item);
        (item as any)._predictedReason = published.has(item) ? 'WOULD_PUBLISH'
            : passed.has(item) ? 'CAP_OVERFLOW'
            : reason?.startsWith('REJECT') ? reason
            : item.category === 'exclude' ? 'EXCLUDED' : 'FAILED_PUBLISH_FILTER';
    }
    return published.size;
}

/** The same review step is used by the real build and stored-corpus comparisons. */
export async function reviewEditorialCandidates(items: NormalizedItem[], options: EditorialReviewOptions & {
    maxConcurrent?: number; batchDelayMs?: number; budgetMs?: number;
} = {}) {
    for (const item of items) item.category = newsletterCategory(item);
    const candidates = getEditorialReviewCandidates(items);
    const result = await classifyWoodmontBatch(candidates, options.maxConcurrent ?? 3,
        options.batchDelayMs ?? 1000, options.budgetMs ?? 4 * 60 * 1000, options);
    return { ...result, candidates: candidates.length,
        rubricVersion: options.rubric?.version ?? WOODMONT_RUBRIC_VERSION,
        remaining: candidates.length - result.classified };
}

/** The production feed writer, also exercised with a scratch path in CI. */
export function writeEditorialFeed(items: NormalizedItem[], destination: string): void {
    stampPredictedPublish(items);
    fs.writeFileSync(destination, JSON.stringify(generateJSONFeed(items), null, 2), 'utf8');
}
