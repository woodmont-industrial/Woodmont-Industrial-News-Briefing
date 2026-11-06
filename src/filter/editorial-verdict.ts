import type { NormalizedItem } from '../types/index.js';

/** Keep the verdict and the evidence identifying its producer together. */
const VERDICT_FIELDS = [
    '_woodmontApprove', '_woodmontReason', '_woodmontConfidence', '_woodmontClassifier',
    '_woodmontRubricVersion', '_woodmontClassifiedAt', '_woodmontModel',
    '_woodmontModelApprove', '_woodmontDateValidation',
] as const;

export function editorialVerdictFields(article: NormalizedItem): Record<string, unknown> {
    return Object.fromEntries(VERDICT_FIELDS.map(key => [key, (article as any)[key]]));
}

/** A reserve copy cannot hide a newer feed verdict by dropping its metadata. */
export function indexEditorialVerdicts(articles: NormalizedItem[]): Map<string, NormalizedItem> {
    const index = new Map<string, NormalizedItem>();
    for (const article of articles) {
        for (const key of [article.id, article.link, (article as any).url]) {
            if (key) index.set(key, article);
        }
    }
    return index;
}

export function withCurrentEditorialVerdict(article: NormalizedItem, current: Map<string, NormalizedItem>): NormalizedItem {
    const latest = [article.id, article.link, (article as any).url].map(key => current.get(key)).find(Boolean);
    if (!latest || typeof (latest as any)._woodmontApprove !== 'boolean') return article;
    return { ...article, ...editorialVerdictFields(latest) };
}
