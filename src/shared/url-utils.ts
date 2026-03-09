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

/**
 * Extract a "deal signature" from article text for fuzzy same-story dedup.
 * Two articles about the same deal will share: square footage + location or dollar amount + location.
 * Returns null if no deal signature can be extracted.
 */
export function extractDealSignature(title: string, description?: string): string | null {
    const text = `${title} ${description || ''}`.toLowerCase();

    // Extract square footage (normalize "937K SF" and "937,000 Square Foot" to same value)
    let sqft: number | null = null;
    const sfMatchK = text.match(/(\d+(?:\.\d+)?)\s*k\s*(?:sf|sq\.?\s*f)/i);
    const sfMatchFull = text.match(/(\d{1,3}(?:,\d{3})+)\s*(?:sf|sq\.?\s*f|square\s*feet|square\s*foot)/i);
    const sfMatchM = text.match(/(\d+(?:\.\d+)?)\s*(?:million|m)\s*(?:sf|sq\.?\s*f|square\s*feet)/i);
    if (sfMatchK) sqft = Math.round(parseFloat(sfMatchK[1]) * 1000);
    else if (sfMatchFull) sqft = parseInt(sfMatchFull[1].replace(/,/g, ''));
    else if (sfMatchM) sqft = Math.round(parseFloat(sfMatchM[1]) * 1000000);

    // Extract dollar amount (normalize "$575M" and "$575 million" etc.)
    let dollars: number | null = null;
    const dollarMatchM = text.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:m|million)\b/i);
    const dollarMatchB = text.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:b|billion)\b/i);
    const dollarMatchFull = text.match(/\$\s*(\d{1,3}(?:,\d{3}){2,})/);
    if (dollarMatchB) dollars = Math.round(parseFloat(dollarMatchB[1]) * 1000);
    else if (dollarMatchM) dollars = Math.round(parseFloat(dollarMatchM[1]));
    else if (dollarMatchFull) dollars = Math.round(parseInt(dollarMatchFull[1].replace(/,/g, '')) / 1000000);

    // Extract location keywords and normalize to metro area
    const LOCATION_NORMALIZATIONS: Record<string, string> = {
        // NJ markets
        'bayonne': 'nj-north', 'secaucus': 'nj-north', 'kearny': 'nj-north', 'elizabeth': 'nj-north',
        'newark': 'nj-north', 'jersey city': 'nj-north', 'linden': 'nj-central',
        'edison': 'nj-central', 'woodbridge': 'nj-central', 'carteret': 'nj-central',
        'east brunswick': 'nj-central', 'south brunswick': 'nj-central', 'piscataway': 'nj-central',
        'exit 8': 'nj-central', 'exit 8a': 'nj-central',
        // PA markets
        'south penn': 'philly', 'suburban philly': 'philly', 'philadelphia': 'philly', 'philly': 'philly',
        'morrisville': 'philly', 'bucks county': 'philly', 'montgomery county': 'philly',
        'king of prussia': 'philly', 'conshohocken': 'philly', 'chester county': 'philly',
        'lehigh valley': 'lehigh', 'allentown': 'lehigh', 'bethlehem': 'lehigh',
        // FL markets
        'miami': 'miami', 'doral': 'miami', 'hialeah': 'miami', 'medley': 'miami', 'miami-dade': 'miami',
        'fort lauderdale': 'ft-laud', 'pompano': 'ft-laud', 'broward': 'ft-laud',
        'west palm': 'palm-beach', 'boca raton': 'palm-beach', 'palm beach': 'palm-beach',
        'orlando': 'orlando', 'tampa': 'tampa', 'jacksonville': 'jax', 'ocala': 'ocala',
    };
    const locationPatterns = [
        /\b(south penn|morrisville|suburban philly|philadelphia|philly|bucks county|montgomery county|king of prussia|conshohocken|chester county)\b/i,
        /\b(bayonne|edison|linden|kearny|carteret|woodbridge|secaucus|elizabeth|newark|jersey city|east brunswick|south brunswick|piscataway|exit 8a?)\b/i,
        /\b(miami|doral|fort lauderdale|pompano|hialeah|west palm|boca raton|palm beach|miami-dade|medley|broward)\b/i,
        /\b(lehigh valley|allentown|bethlehem)\b/i,
        /\b(orlando|tampa|jacksonville|ocala)\b/i,
    ];
    const locations: string[] = [];
    for (const pat of locationPatterns) {
        const match = text.match(pat);
        if (match) {
            const raw = match[1].toLowerCase();
            const normalized = LOCATION_NORMALIZATIONS[raw] || raw;
            if (!locations.includes(normalized)) locations.push(normalized);
        }
    }

    // Need at least one deal metric + one location to form a signature
    if (locations.length === 0) return null;
    if (sqft === null && dollars === null) return null;

    // Round sqft to nearest 10K to catch "937K" vs "937,000" vs "940,000"
    const sqftBucket = sqft ? Math.round(sqft / 10000) : 0;
    const dollarBucket = dollars || 0;
    const loc = locations.sort().join('|');

    return `${sqftBucket}sf_${dollarBucket}m_${loc}`;
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
