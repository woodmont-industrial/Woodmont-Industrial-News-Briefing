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
        // Strip source suffixes: "- CoStar", "- GlobeSt", "| WSJ", etc.
        .replace(/\s*[-–—|]\s*(costar|globest|msn|yahoo|bisnow|commercialsearch|rebusinessonline|connect cre|the business journals|commercial observer|ad hoc news|law360|investing\.com|finimize|nareit|loopnet|tapinto|freightwaves|wplg|cbs news|news channel|production engineering|thestar|daily record|njbiz|roi-nj|re-nj|commercial property executive|cpexecutive|lvb\.com|aol|miami herald|yahoo finance|tradingview|techbullion|pelican post|pennlive|yourvalley|capitol press|savannah now|wlaf|moit).*$/i, '')
        // Strip "News | " prefix from CoStar articles
        .replace(/^news\s*\|\s*/i, '')
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
        // NJ markets — north (Bergen / Hudson / Essex / Union / Morris)
        'bayonne': 'nj-north', 'secaucus': 'nj-north', 'kearny': 'nj-north', 'elizabeth': 'nj-north',
        'newark': 'nj-north', 'jersey city': 'nj-north', 'hackensack': 'nj-north',
        'paterson': 'nj-north', 'clifton': 'nj-north', 'passaic': 'nj-north', 'hoboken': 'nj-north',
        'union city': 'nj-north', 'fort lee': 'nj-north', 'meadowlands': 'nj-north',
        'bergen county': 'nj-north', 'hudson county': 'nj-north', 'essex county': 'nj-north',
        'union county': 'nj-north', 'morris county': 'nj-north', 'passaic county': 'nj-north',
        // NJ — central (Middlesex / Mercer / Somerset)
        'linden': 'nj-central', 'edison': 'nj-central', 'woodbridge': 'nj-central',
        'carteret': 'nj-central', 'east brunswick': 'nj-central', 'south brunswick': 'nj-central',
        'piscataway': 'nj-central', 'metuchen': 'nj-central', 'new brunswick': 'nj-central',
        'perth amboy': 'nj-central', 'sayreville': 'nj-central', 'plainfield': 'nj-central',
        'trenton': 'nj-central', 'princeton': 'nj-central', 'cranbury': 'nj-central',
        'monroe township': 'nj-central', 'monroe twp': 'nj-central',
        'middlesex county': 'nj-central', 'mercer county': 'nj-central', 'somerset county': 'nj-central',
        'central jersey': 'nj-central', 'central new jersey': 'nj-central',
        'exit 8': 'nj-central', 'exit 8a': 'nj-central',
        // NJ — coast (Monmouth / Ocean)
        'lakewood': 'nj-coast', 'toms river': 'nj-coast', 'red bank': 'nj-coast',
        'asbury park': 'nj-coast', 'long branch': 'nj-coast', 'freehold': 'nj-coast',
        'monmouth county': 'nj-coast', 'ocean county': 'nj-coast',
        // NJ — south (Burlington / Camden / Gloucester / Atlantic / Cumberland)
        'camden': 'nj-south', 'cherry hill': 'nj-south', 'mount laurel': 'nj-south',
        'vineland': 'nj-south', 'atlantic city': 'nj-south', 'pennsauken': 'nj-south',
        'burlington county': 'nj-south', 'camden county': 'nj-south',
        'gloucester county': 'nj-south', 'atlantic county': 'nj-south', 'cumberland county': 'nj-south',
        // PA markets
        'south penn': 'philly', 'suburban philly': 'philly', 'philadelphia': 'philly', 'philly': 'philly',
        'morrisville': 'philly', 'bucks county': 'philly', 'montgomery county': 'philly',
        'king of prussia': 'philly', 'conshohocken': 'philly', 'chester county': 'philly',
        'delaware county': 'philly', 'plymouth meeting': 'philly', 'malvern': 'philly',
        'lehigh valley': 'lehigh', 'allentown': 'lehigh', 'bethlehem': 'lehigh',
        'easton': 'lehigh', 'lehigh county': 'lehigh', 'northampton county': 'lehigh',
        'harrisburg': 'pa-central', 'lancaster': 'pa-central', 'reading': 'pa-central',
        'york': 'pa-central', 'lancaster county': 'pa-central', 'york county': 'pa-central',
        'dauphin county': 'pa-central', 'berks county': 'pa-central',
        'pittsburgh': 'pa-west', 'scranton': 'pa-northeast', 'wilkes-barre': 'pa-northeast',
        // FL markets
        'miami': 'miami', 'doral': 'miami', 'hialeah': 'miami', 'medley': 'miami', 'miami-dade': 'miami',
        'fort lauderdale': 'ft-laud', 'pompano': 'ft-laud', 'broward': 'ft-laud',
        'west palm': 'palm-beach', 'boca raton': 'palm-beach', 'palm beach': 'palm-beach',
        'orlando': 'orlando', 'tampa': 'tampa', 'jacksonville': 'jax', 'ocala': 'ocala',
        'south florida': 'fl-broad',
    };
    const locationPatterns = [
        /\b(south penn|morrisville|suburban philly|philadelphia|philly|bucks county|montgomery county|king of prussia|conshohocken|chester county|delaware county|plymouth meeting|malvern)\b/i,
        /\b(bayonne|edison|linden|kearny|carteret|woodbridge|secaucus|elizabeth|newark|jersey city|hackensack|paterson|clifton|passaic|hoboken|union city|fort lee|east brunswick|south brunswick|piscataway|metuchen|new brunswick|perth amboy|sayreville|plainfield|trenton|princeton|cranbury|monroe township|monroe twp|exit 8a?|meadowlands)\b/i,
        /\b(bergen county|hudson county|essex county|union county|morris county|passaic county|middlesex county|mercer county|somerset county|monmouth county|ocean county|burlington county|camden county|gloucester county|atlantic county|cumberland county)\b/i,
        /\b(central jersey|central new jersey|north jersey|south jersey)\b/i,
        /\b(lakewood|toms river|red bank|asbury park|long branch|freehold)\b/i,
        /\b(camden|cherry hill|mount laurel|vineland|atlantic city|pennsauken)\b/i,
        /\b(miami|doral|fort lauderdale|pompano|hialeah|west palm|boca raton|palm beach|miami-dade|medley|broward|south florida)\b/i,
        /\b(lehigh valley|allentown|bethlehem|easton|lehigh county|northampton county)\b/i,
        /\b(harrisburg|lancaster|reading|york|lancaster county|york county|dauphin county|berks county|pittsburgh|scranton|wilkes-barre)\b/i,
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

    // STATE-LEVEL signature — always emit if state can be inferred, even when a
    // city/county already matched. This way a granular signature AND a state-level
    // signature both register, and cross-source articles ("Middlesex County" vs "Metuchen"
    // vs "N.J. area") for the same deal can collapse on the shared state-level token.
    // Risk of over-collapse is bounded because the dollar/SF bucket still has to match.
    const stateLocs: string[] = [];
    const njRegex = /\b(n\.?j\.?|new jersey|nj area|nj market|garden state)\b/i;
    const paRegex = /\b(p\.?a\.?|pennsylvania|pa area|pa market|keystone state)\b/i;
    const flRegex = /\b(fla?\.?|florida|fl area|fl market|sunshine state)\b/i;
    // Infer state from already-matched city/county codes too
    const hasNJSpecific = locations.some(l => l.startsWith('nj-'));
    const hasPASpecific = locations.some(l => ['philly','lehigh','pa-central','pa-west','pa-northeast'].includes(l));
    const hasFLSpecific = locations.some(l => ['miami','ft-laud','palm-beach','orlando','tampa','jax','ocala','fl-broad'].includes(l));
    if (hasNJSpecific || njRegex.test(text)) stateLocs.push('state-nj');
    if (hasPASpecific || paRegex.test(text)) stateLocs.push('state-pa');
    if (hasFLSpecific || flRegex.test(text)) stateLocs.push('state-fl');

    // Need at least one deal metric + one location (granular OR state) to form a signature
    if (locations.length === 0 && stateLocs.length === 0) return null;
    if (sqft === null && dollars === null) return null;

    // Round sqft to nearest 10K to catch "937K" vs "937,000" vs "940,000"
    const sqftBucket = sqft ? Math.round(sqft / 10000) : 0;
    const dollarBucket = dollars || 0;

    // Emit primary signature (most precise — granular if available, else state)
    const primaryLocs = locations.length > 0 ? locations.sort() : stateLocs.sort();
    return `${sqftBucket}sf_${dollarBucket}m_${primaryLocs.join('|')}`;
}

/**
 * Extract ALL deal signatures (granular + state-level) for fuzzy dedup.
 * Returns array of signatures. Two articles dedup if they share ANY signature.
 * State-level signatures collapse cross-source variants ("Middlesex County" / "Metuchen"
 * / "N.J. area") that wouldn't share a granular code but describe the same deal.
 */
export function extractDealSignatures(title: string, description?: string): string[] {
    const text = `${title} ${description || ''}`.toLowerCase();
    const sigs: string[] = [];

    // Reuse the primary signature (granular) from extractDealSignature
    const primary = extractDealSignature(title, description);
    if (primary) sigs.push(primary);

    // Always also emit a STATE-LEVEL signature (one per state) when state can be inferred
    let sqft: number | null = null;
    const sfMatchK = text.match(/(\d+(?:\.\d+)?)\s*k\s*(?:sf|sq\.?\s*f)/i);
    const sfMatchFull = text.match(/(\d{1,3}(?:,\d{3})+)\s*(?:sf|sq\.?\s*f|square\s*feet|square\s*foot)/i);
    const sfMatchM = text.match(/(\d+(?:\.\d+)?)\s*(?:million|m)\s*(?:sf|sq\.?\s*f|square\s*feet)/i);
    if (sfMatchK) sqft = Math.round(parseFloat(sfMatchK[1]) * 1000);
    else if (sfMatchFull) sqft = parseInt(sfMatchFull[1].replace(/,/g, ''));
    else if (sfMatchM) sqft = Math.round(parseFloat(sfMatchM[1]) * 1000000);

    let dollars: number | null = null;
    const dollarMatchM = text.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:m|million)\b/i);
    const dollarMatchB = text.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:b|billion)\b/i);
    const dollarMatchFull = text.match(/\$\s*(\d{1,3}(?:,\d{3}){2,})/);
    if (dollarMatchB) dollars = Math.round(parseFloat(dollarMatchB[1]) * 1000);
    else if (dollarMatchM) dollars = Math.round(parseFloat(dollarMatchM[1]));
    else if (dollarMatchFull) dollars = Math.round(parseInt(dollarMatchFull[1].replace(/,/g, '')) / 1000000);

    if (sqft === null && dollars === null) return sigs;

    const sqftBucket = sqft ? Math.round(sqft / 10000) : 0;
    const dollarBucket = dollars || 0;

    // Detect each state independently (an article can mention multiple states)
    const njCities = /\b(metuchen|edison|piscataway|woodbridge|carteret|elizabeth|newark|bayonne|secaucus|kearny|jersey city|hackensack|paterson|clifton|passaic|hoboken|union city|fort lee|east brunswick|south brunswick|new brunswick|perth amboy|sayreville|plainfield|trenton|princeton|cranbury|monroe township|monroe twp|lakewood|toms river|red bank|asbury park|long branch|freehold|camden|cherry hill|mount laurel|vineland|atlantic city|pennsauken|linden)\b/i;
    const njCounties = /\b(bergen county|hudson county|essex county|union county|morris county|passaic county|middlesex county|mercer county|somerset county|monmouth county|ocean county|burlington county|camden county|gloucester county|atlantic county|cumberland county)\b/i;
    const njState = /\b(n\.?j\.?|new jersey|nj area|nj market|garden state|central jersey|central new jersey|north jersey|south jersey|meadowlands)\b/i;
    if (njCities.test(text) || njCounties.test(text) || njState.test(text)) {
        sigs.push(`${sqftBucket}sf_${dollarBucket}m_state-nj`);
    }

    const paCities = /\b(philadelphia|philly|allentown|bethlehem|easton|harrisburg|lancaster|reading|york|pittsburgh|scranton|wilkes-barre|king of prussia|conshohocken|plymouth meeting|malvern|morrisville)\b/i;
    const paCounties = /\b(bucks county|montgomery county|chester county|delaware county|lehigh county|northampton county|lancaster county|york county|dauphin county|berks county)\b/i;
    const paState = /\b(p\.?a\.?|pennsylvania|pa area|pa market|keystone state|lehigh valley|delaware valley|greater philadelphia|south penn)\b/i;
    if (paCities.test(text) || paCounties.test(text) || paState.test(text)) {
        sigs.push(`${sqftBucket}sf_${dollarBucket}m_state-pa`);
    }

    const flCities = /\b(miami|doral|hialeah|medley|fort lauderdale|pompano|west palm|boca raton|orlando|tampa|jacksonville|ocala)\b/i;
    const flCounties = /\b(miami-dade|broward|palm beach|hillsborough|orange county|duval|pinellas|lee county|polk county|brevard)\b/i;
    const flState = /\b(fla?\.?|florida|fl area|fl market|sunshine state|south florida|central florida)\b/i;
    if (flCities.test(text) || flCounties.test(text) || flState.test(text)) {
        sigs.push(`${sqftBucket}sf_${dollarBucket}m_state-fl`);
    }

    return [...new Set(sigs)]; // dedup the sig array itself
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
