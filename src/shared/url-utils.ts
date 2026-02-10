/**
 * URL and title normalization utilities — shared across static build and newsletters.
 */

import { NormalizedItem } from '../types/index.js';

const TRACKING_PARAMS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source'
];

export function normalizeTitle(title: string): string {
    if (!title) return '';
    return title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normalizeUrlForDedupe(url: string): string {
    if (!url) return '';
    try {
        const u = new URL(url);
        TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
        u.hash = '';
        return u.toString().toLowerCase();
    } catch {
        return url.toLowerCase();
    }
}

export function cleanArticleUrl(article: NormalizedItem): void {
    const url = (article as any).url || article.link || '';
    if (!url) return;
    try {
        const u = new URL(url);
        TRACKING_PARAMS.forEach(p => u.searchParams.delete(p));
        const badPatterns = ['redirect', 'cache', 'tracking', 'proxy'];
        if (badPatterns.some(p => u.pathname.includes(p) || u.hostname.includes(p))) {
            return; // Leave URL as-is rather than break it
        }
        const clean = u.toString();
        article.link = clean;
        (article as any).url = clean;
    } catch { /* leave URL as-is */ }
}
