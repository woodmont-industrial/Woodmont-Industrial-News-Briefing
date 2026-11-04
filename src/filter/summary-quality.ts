import type { NormalizedItem } from '../types/index.js';
import { normalizeTitle } from '../shared/url-utils.js';
import { newsletterFactFields, type NewsletterFacts } from '../shared/newsletter-facts.js';

/** A readability check, not a claim that every statement has been fact checked. */
export function unusableSummary(article: NormalizedItem): string | null {
    const text = (article.description || '').trim();
    if (text.length < 24) return 'missing-or-fragment';
    if (/\bboth and\b|click here|please provide|unable to summarize|no summary available|\[object Object\]|Verified publisher facts:/i.test(text)) return 'garbled-or-boilerplate';
    const key = (s: string) => normalizeTitle(s).replace(/[^a-z0-9]+/g, ' ').trim();
    const title = key(article.title || '').replace(/\s+(?:connect cre|loopnet|globest|commercial observer|cre daily)$/, '');
    const body = key(text);
    if (title.length >= 20 && (body === title || (body.startsWith(title) && body.length - title.length < 35))) return 'repeated-headline';
    return null;
}

/** Reuse a verified publisher lead without inventing details or fetching again. */
export function repairSummaryFromEvidence(article: NormalizedItem): boolean {
    if (!unusableSummary(article)) return true;
    const facts = newsletterFactFields(article)._newsletterFacts as NewsletterFacts | undefined;
    if (!facts?.lead) return false;
    const candidate = { ...article, description: facts.lead };
    if (unusableSummary(candidate)) return false;
    article.description = facts.lead;
    return true;
}
