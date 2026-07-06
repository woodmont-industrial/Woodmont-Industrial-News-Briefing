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
    const sfMatchFull = text.match(/(\d{1,3}(?:,\d{3})+)[\s-]*(?:sf|sq\.?\s*f|square[\s-]*feet|square[\s-]*foot)/i);
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
        'hamilton': 'nj-central', 'hamilton township': 'nj-central', 'robbinsville': 'nj-central',
        'south plainfield': 'nj-central', 'dayton': 'nj-central', 'swedesboro': 'nj-south',
        'carlstadt': 'nj-north', 'moonachie': 'nj-north', 'teterboro': 'nj-north',
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
    const sfMatchFull = text.match(/(\d{1,3}(?:,\d{3})+)[\s-]*(?:sf|sq\.?\s*f|square[\s-]*feet|square[\s-]*foot)/i);
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

    // Acres — covers "39-ha", "97 acres", "19-acre", etc. 1 hectare = 2.471 acres.
    // Bucket to nearest 5 acres so "39 ha (≈ 96.4 ac)" and "97 acres" collapse to the
    // same bucket. Catches today's Mapletree cross-source duplicate + every
    // Constellation East Tampa 19-acre repeat that has plagued us.
    let acres: number | null = null;
    const acreMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-)?acres?\b/i);
    const hectareMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-)?(?:ha|hectares?)\b/i);
    if (acreMatch) acres = parseFloat(acreMatch[1]);
    else if (hectareMatch) acres = parseFloat(hectareMatch[1]) * 2.471;

    if (sqft === null && dollars === null && acres === null) return sigs;

    const sqftBucket = sqft ? Math.round(sqft / 10000) : 0;
    const dollarBucket = dollars || 0;
    // Acres bucket: round to nearest 5 acres so 39-ha (≈96 ac) and 97-acres collapse,
    // and so 19-acre / 19 acres / 18.5 acres all share a signature.
    const acresBucket = acres ? Math.round(acres / 5) * 5 : 0;

    // Emit one COMBINED signature with all metrics + state, AND one signature per
    // metric that's present + state. This way cross-source articles where one says
    // "953K SF (97 acres)" and the other says only "39-ha" still share the
    // acres-only sig (95ac_state-nj). Risk of false-collapse is bounded because:
    //   - Single-metric sigs only emit when that metric is present
    //   - State qualifier keeps it scoped to NJ/PA/FL
    //   - Two distinct same-acreage same-state deals in a 14-day window is rare
    const stateSigs = (state: string): string[] => {
        const out: string[] = [];
        out.push(`${sqftBucket}sf_${dollarBucket}m_${acresBucket}ac_state-${state}`); // combined
        if (sqft !== null) out.push(`${sqftBucket}sf_state-${state}`);
        if (dollars !== null) out.push(`${dollarBucket}m_state-${state}`);
        if (acres !== null) out.push(`${acresBucket}ac_state-${state}`);
        return out;
    };

    // Detect each state independently (an article can mention multiple states)
    const njCities = /\b(metuchen|edison|piscataway|woodbridge|carteret|elizabeth|newark|bayonne|secaucus|kearny|jersey city|hackensack|paterson|clifton|passaic|hoboken|union city|fort lee|east brunswick|south brunswick|new brunswick|perth amboy|sayreville|plainfield|trenton|princeton|cranbury|monroe township|monroe twp|manalapan|lakewood|toms river|red bank|asbury park|long branch|freehold|camden|cherry hill|mount laurel|vineland|atlantic city|pennsauken|linden|logan township|garwood|wall township)\b/i;
    const njCounties = /\b(bergen county|hudson county|essex county|union county|morris county|passaic county|middlesex county|mercer county|somerset county|monmouth county|ocean county|burlington county|camden county|gloucester county|atlantic county|cumberland county)\b/i;
    const njState = /\b(n\.?j\.?|new jersey|nj area|nj market|garden state|central jersey|central new jersey|north jersey|south jersey|meadowlands)\b/i;
    if (njCities.test(text) || njCounties.test(text) || njState.test(text)) {
        sigs.push(...stateSigs('nj'));
    }

    const paCities = /\b(philadelphia|philly|allentown|bethlehem|easton|harrisburg|lancaster|reading|york|pittsburgh|scranton|wilkes-barre|king of prussia|conshohocken|plymouth meeting|malvern|morrisville)\b/i;
    const paCounties = /\b(bucks county|montgomery county|chester county|delaware county|lehigh county|northampton county|lancaster county|york county|dauphin county|berks county)\b/i;
    const paState = /\b(p\.?a\.?|pennsylvania|pa area|pa market|keystone state|lehigh valley|delaware valley|greater philadelphia|south penn|huntingdon valley)\b/i;
    if (paCities.test(text) || paCounties.test(text) || paState.test(text)) {
        sigs.push(...stateSigs('pa'));
    }

    const flCities = /\b(miami|doral|hialeah|medley|fort lauderdale|pompano|west palm|boca raton|orlando|tampa|jacksonville|ocala|groveland|winter park|fort myers|ft\.?\s*myers|naples|sarasota|lakeland|st\.?\s*petersburg|cape coral|estero|clearwater|deltona)\b/i;
    const flCounties = /\b(miami-dade|broward|palm beach|hillsborough|orange county|duval|pinellas|lee county|polk county|brevard|osceola county|collier county|sarasota county)\b/i;
    const flState = /\b(fla?\.?|florida|fl area|fl market|sunshine state|south florida|central florida)\b/i;
    if (flCities.test(text) || flCounties.test(text) || flState.test(text)) {
        sigs.push(...stateSigs('fl'));
    }

    // Company-pair signature for national M&A — kills the recurring same-deal
    // triplets/quartets (Modiv x3 on 5/5, Americold/EQT x4 across 5/8 and 5/11).
    // These deals never have NJ/PA/FL location, so the state sigs above don't fire.
    // Instead we form a signature from the two corporate parties + the rounded
    // dollar amount. Same deal in 3 articles → same sig → only first ships.
    const COMPANY_PAIRS = [
        // [companyA-regex, companyB-regex, label]
        ['global net lease', 'modiv', 'gnl-modiv'],
        ['americold', 'eqt', 'americold-eqt'],
        ['blackstone', 'industrial', 'blackstone-industrial'],
        ['prologis', 'duke', 'prologis-duke'],
        ['kkr', 'industrial', 'kkr-industrial'],
        ['cabot', 'industrial', 'cabot-industrial'],
        ['link logistics', '', 'link-logistics'],
        ['bridge industrial', '', 'bridge-industrial'],
        ['rexford', '', 'rexford'],
        ['stag industrial', '', 'stag-industrial'],
        ['first industrial', '', 'first-industrial'],
        ['eastgroup', '', 'eastgroup'],
        ['terreno', '', 'terreno'],
    ] as const;
    if (dollars !== null && dollars >= 50) {
        // M&A dollar bucket: round to nearest $250M so cross-source variants where
        // one outlet rounds "$1.1B" and another says "$1.3B" still collapse to the
        // same M&A signature. Two distinct deals at $1B+ with the SAME company-pair
        // in the same week is essentially impossible.
        const mnaDollarBucket = Math.round(dollars / 250) * 250;
        for (const [a, b, label] of COMPANY_PAIRS) {
            if (text.includes(a) && (b === '' || text.includes(b))) {
                sigs.push(`mna_${label}_${mnaDollarBucket}m`);
                // Also emit company-only sig (no dollars) so a deal that's $500M in
                // one outlet and $750M in another (different rounding) still collapses
                sigs.push(`mna_${label}_company-only`);
                break;
            }
        }
    }

    return [...new Set(sigs)]; // dedup the sig array itself
}

/**
 * Cross-day dedup signatures. Narrower than extractDealSignatures (plural):
 * emits only high-confidence sigs that won't false-collapse different deals
 * across days. State-only single-metric sigs are intentionally omitted.
 *
 * Within-newsletter dedup uses the plural extractDealSignatures (catches more
 * cross-source variants in a single send, where false-collapse risk is bounded
 * to one day's pool). Cross-day uses this — same-day risk is fine, but two
 * weeks of cumulative state-level sigs over-block legit different deals.
 *
 * Today's failure: yesterday's CenterPoint Avenel (4.3 acres) saved
 * `5ac_state-nj`. Today any new 1-7 acre NJ deal would collide on that bucket
 * and silently disappear from the candidate pool.
 *
 * Emits:
 *   - Granular city/county + full-metric combo (e.g., `0sf_360m_0ac_nj-north`)
 *   - M&A company-pair sigs (corporate identity is specific enough)
 *
 * Skips:
 *   - State-only fallback (no granular city/county match)
 *   - State-level single-metric sigs (`5ac_state-nj`, `95sf_state-nj`)
 *   - Granular per-metric sigs (`5ac_nj-north`)
 */
export function extractCrossDayDedupSignatures(title: string, description?: string): string[] {
    // Google News RSS appends " - Publisher Name" to titles. Strip it so the same
    // article from re-nj.com and news.google.com produces the same signature.
    // Conservative: only strip a trailing " - X" where X is a short capitalized
    // publisher-like phrase (no further hyphens, ≤40 chars).
    const titleClean = title.replace(/\s+[-–—]\s+[^-–—]{1,40}$/, '').trim();
    const text = `${titleClean} ${description || ''}`.toLowerCase();
    const sigs: string[] = [];

    // Metric extraction (mirrors extractDealSignatures)
    let sqft: number | null = null;
    const sfMatchK = text.match(/(\d+(?:\.\d+)?)\s*k\s*(?:sf|sq\.?\s*f)/i);
    const sfMatchFull = text.match(/(\d{1,3}(?:,\d{3})+)[\s-]*(?:sf|sq\.?\s*f|square[\s-]*feet|square[\s-]*foot)/i);
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

    let acres: number | null = null;
    const acreMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-)?acres?\b/i);
    const hectareMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:-)?(?:ha|hectares?)\b/i);
    if (acreMatch) acres = parseFloat(acreMatch[1]);
    else if (hectareMatch) acres = parseFloat(hectareMatch[1]) * 2.471;

    // Granular city/county match (same pattern list as extractDealSignature primary)
    const LOCATION_NORMALIZATIONS: Record<string, string> = {
        'bayonne': 'nj-north', 'secaucus': 'nj-north', 'kearny': 'nj-north', 'elizabeth': 'nj-north',
        'newark': 'nj-north', 'jersey city': 'nj-north', 'hackensack': 'nj-north',
        'paterson': 'nj-north', 'clifton': 'nj-north', 'passaic': 'nj-north', 'hoboken': 'nj-north',
        'union city': 'nj-north', 'fort lee': 'nj-north', 'meadowlands': 'nj-north',
        'bergen county': 'nj-north', 'hudson county': 'nj-north', 'essex county': 'nj-north',
        'union county': 'nj-north', 'morris county': 'nj-north', 'passaic county': 'nj-north',
        'linden': 'nj-central', 'edison': 'nj-central', 'woodbridge': 'nj-central',
        'carteret': 'nj-central', 'east brunswick': 'nj-central', 'south brunswick': 'nj-central',
        'piscataway': 'nj-central', 'metuchen': 'nj-central', 'new brunswick': 'nj-central',
        'perth amboy': 'nj-central', 'sayreville': 'nj-central', 'plainfield': 'nj-central',
        'trenton': 'nj-central', 'princeton': 'nj-central', 'cranbury': 'nj-central',
        'monroe township': 'nj-central', 'monroe twp': 'nj-central',
        'hamilton': 'nj-central', 'hamilton township': 'nj-central', 'robbinsville': 'nj-central',
        'south plainfield': 'nj-central', 'dayton': 'nj-central', 'swedesboro': 'nj-south',
        'carlstadt': 'nj-north', 'moonachie': 'nj-north', 'teterboro': 'nj-north',
        'middlesex county': 'nj-central', 'mercer county': 'nj-central', 'somerset county': 'nj-central',
        'middlesex': 'nj-central', 'bergen': 'nj-north', 'hudson': 'nj-north',
        'lakewood': 'nj-coast', 'toms river': 'nj-coast', 'red bank': 'nj-coast',
        'asbury park': 'nj-coast', 'long branch': 'nj-coast', 'freehold': 'nj-coast',
        'manalapan': 'nj-coast',
        'monmouth county': 'nj-coast', 'ocean county': 'nj-coast',
        'camden': 'nj-south', 'cherry hill': 'nj-south', 'mount laurel': 'nj-south',
        'vineland': 'nj-south', 'atlantic city': 'nj-south', 'pennsauken': 'nj-south',
        'burlington county': 'nj-south', 'camden county': 'nj-south',
        'gloucester county': 'nj-south', 'atlantic county': 'nj-south', 'cumberland county': 'nj-south',
        'philadelphia': 'philly', 'philly': 'philly', 'morrisville': 'philly',
        'bucks county': 'philly', 'montgomery county': 'philly', 'king of prussia': 'philly',
        'conshohocken': 'philly', 'chester county': 'philly', 'delaware county': 'philly',
        'plymouth meeting': 'philly', 'malvern': 'philly', 'huntingdon valley': 'philly',
        'lehigh valley': 'lehigh', 'allentown': 'lehigh', 'bethlehem': 'lehigh',
        'easton': 'lehigh', 'lehigh county': 'lehigh', 'northampton county': 'lehigh',
        'harrisburg': 'pa-central', 'lancaster': 'pa-central', 'reading': 'pa-central',
        'york': 'pa-central', 'lancaster county': 'pa-central', 'york county': 'pa-central',
        'pittsburgh': 'pa-west', 'scranton': 'pa-northeast', 'wilkes-barre': 'pa-northeast',
        'miami': 'miami', 'doral': 'miami', 'hialeah': 'miami', 'medley': 'miami', 'miami-dade': 'miami',
        'fort lauderdale': 'ft-laud', 'pompano': 'ft-laud', 'broward': 'ft-laud',
        'west palm': 'palm-beach', 'boca raton': 'palm-beach', 'palm beach': 'palm-beach',
        'orlando': 'orlando', 'tampa': 'tampa', 'jacksonville': 'jax', 'ocala': 'ocala',
    };
    const locationPatterns = [
        /\b(bayonne|secaucus|kearny|elizabeth|newark|jersey city|hackensack|paterson|clifton|passaic|hoboken|union city|fort lee|meadowlands|carlstadt|moonachie|teterboro)\b/i,
        /\b(bergen county|hudson county|essex county|union county|morris county|passaic county|middlesex county|mercer county|somerset county|monmouth county|ocean county|burlington county|camden county|gloucester county|atlantic county|cumberland county)\b/i,
        /\b(linden|edison|woodbridge|carteret|east brunswick|south brunswick|piscataway|metuchen|new brunswick|perth amboy|sayreville|plainfield|trenton|princeton|cranbury|monroe township|monroe twp|hamilton township|hamilton|robbinsville|south plainfield|dayton|swedesboro)\b/i,
        /\b(lakewood|toms river|red bank|asbury park|long branch|freehold|manalapan)\b/i,
        /\b(camden|cherry hill|mount laurel|vineland|atlantic city|pennsauken)\b/i,
        /\b(philadelphia|philly|morrisville|bucks county|montgomery county|king of prussia|conshohocken|chester county|delaware county|plymouth meeting|malvern|huntingdon valley)\b/i,
        /\b(lehigh valley|allentown|bethlehem|easton|lehigh county|northampton county)\b/i,
        /\b(harrisburg|lancaster|reading|york|lancaster county|york county|pittsburgh|scranton|wilkes-barre)\b/i,
        /\b(miami|doral|hialeah|medley|miami-dade|fort lauderdale|pompano|broward|west palm|boca raton|palm beach)\b/i,
        /\b(orlando|tampa|jacksonville|ocala)\b/i,
        // Bare NJ county names with adjacent industrial context — Google News drops "County" suffix.
        /\b(middlesex|bergen|hudson)\b(?=[^.]{0,60}?(?:industrial|warehouse|logistics|distribution|fulfillment|cold storage|building|facility|park))/i,
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

    // Granular sig: city/county + ALL metric buckets together. Requires both
    // a granular location AND at least one metric. Two distinct deals in the
    // same metro area with identical SF + dollar + acre buckets is rare enough
    // that we accept the collapse.
    if (locations.length > 0 && (sqft !== null || dollars !== null || acres !== null)) {
        const sqftBucket = sqft ? Math.round(sqft / 10000) : 0;
        const dollarBucket = dollars || 0;
        const acresBucket = acres ? Math.round(acres / 5) * 5 : 0;
        sigs.push(`${sqftBucket}sf_${dollarBucket}m_${acresBucket}ac_${locations.sort().join('|')}`);
    }

    // M&A company-pair sigs — corporate identity is specific enough to be safe
    // for cross-day matching. Catches Modiv/GNL, Americold/EQT recurring triplets.
    const COMPANY_PAIRS: Array<readonly [string, string, string]> = [
        ['global net lease', 'modiv', 'gnl-modiv'],
        ['americold', 'eqt', 'americold-eqt'],
        ['blackstone', 'industrial', 'blackstone-industrial'],
        ['prologis', 'duke', 'prologis-duke'],
        ['kkr', 'industrial', 'kkr-industrial'],
        ['cabot', 'industrial', 'cabot-industrial'],
    ];
    if (dollars !== null && dollars >= 50) {
        const mnaDollarBucket = Math.round(dollars / 250) * 250;
        for (const [a, b, label] of COMPANY_PAIRS) {
            if (text.includes(a) && text.includes(b)) {
                sigs.push(`mna_${label}_${mnaDollarBucket}m`);
                sigs.push(`mna_${label}_company-only`);
                break;
            }
        }
    }

    // === Conservative cross-day NEWS signals (2026-06-23) =========================
    // For recurring stories that emit NO deal signature above — policy news with no
    // $/SF/acre, corporate expansions phrased differently across outlets, and named
    // industrial-REIT deals reported without a granular city. Each is deliberately
    // narrow so two genuinely different stories won't collide. All logged + validated
    // against the trailing 14-day window before shipping.
    let xstate: string | null = null;
    if (/\b(n\.?j\.?|new jersey|newark|edison|piscataway|woodbridge|elizabeth|trenton|camden|middlesex|bergen|hudson county|essex county|meadowlands|cranbury)\b/i.test(text)) xstate = 'nj';
    else if (/\b(p\.?a\.?|pennsylvania|philadelphia|philly|allentown|bethlehem|lehigh valley|lehigh|bucks county|montgomery county|chester county|pittsburgh|harrisburg|lancaster|new castle)\b/i.test(text)) xstate = 'pa';
    else if (/\b(fla?\.?|florida|miami|doral|hialeah|fort lauderdale|pompano|west palm|palm beach|orlando|tampa|clearwater|jacksonville|broward|miami-dade|brevard)\b/i.test(text)) xstate = 'fl';

    // (A) Named industrial REIT + $ bucket (nearest $25M) — same REIT deal repeated
    //     across outlets/days. Catches Terreno Hialeah $56M (shipped 6/22 AND 6/23).
    //     Finer $25M bucket (vs the $250M M&A bucket) keeps distinct REIT deals apart.
    const REITS = ['terreno', 'rexford', 'stag industrial', 'first industrial', 'eastgroup', 'link logistics', 'bridge industrial', 'dalfen', 'faropoint'];
    if (dollars !== null) {
        const db = Math.round(dollars / 25) * 25;
        for (const r of REITS) {
            if (text.includes(r)) { sigs.push(`reit_${r.replace(/\s+/g, '-')}_${db}m`); break; }
        }
    }

    // (B) Data-center POLICY + state — repeated legislation/zoning/board coverage of
    //     the same state's data-center policy. Gated on a policy verb so it does NOT
    //     collapse distinct data-center DEALS (those carry their own deal sig).
    //     Catches the PA "pause-button bill" (6/19) vs "push for regulations" (6/22).
    // Policy terms are matched as word-START stems (no trailing \b) so "regulations",
    // "lawmakers", "legislation", "approval" etc. all hit. Leading \b avoids substrings.
    if (xstate && /\bdata\s?cent(er|re)s?\b/i.test(text) &&
        /\b(bill|ban|moratori|regulat|ordinance|zoning|lawmaker|legislat|pause|approv|den(?:y|ies|ied)|reject|board|committee|vote)/i.test(text)) {
        sigs.push(`dcpolicy_${xstate}`);
    }

    // (C) Corporate expansion/investment + lead entity + $ + state — same company's
    //     expansion announcement re-reported. Gated on an expansion verb AND a lead
    //     proper-noun AND a $ amount AND a state, so it's specific to one announcement.
    //     Catches Nokia "$30M expansion in Pennsylvania" (6/19) vs "Investing $30M …
    //     Lehigh Valley" (6/22).
    if (xstate && dollars !== null &&
        /\b(expand|expansion|investing|invests|to build|opens|new (facility|plant|factory|campus)|manufacturing operation|scale[^.]*manufacturing)\b/i.test(text)) {
        const m = titleClean.match(/^([A-Z][A-Za-z0-9&.]{2,})/);
        const lead = m ? m[1].toLowerCase().replace(/[.]+$/, '') : null;
        const STOP = new Set(['the', 'top', 'new', 'how', 'why', 'this', 'best', 'why', 'these']);
        if (lead && lead.length >= 3 && !STOP.has(lead)) sigs.push(`expansion_${lead}_${dollars}m_${xstate}`);
    }

    // (D) Developer + specific project-CITY — the SAME named developer's SAME project
    //     re-reported across outlets/days with different headlines and NO shared
    //     metric/verb. Gated on a known developer AND a specific city (a raw town, not
    //     a region bucket), so two DIFFERENT projects by the same developer in different
    //     towns stay separate (e.g. a Woodmont Edison deal won't collapse a Woodmont
    //     Rahway deal). Catches the Woodmont/Sagard Rahway redevelopment, which shipped
    //     three days running (6/29, 6/30, 7/02) as three reworded headlines because it
    //     emitted zero signatures above. Deliberately NO city-less "developer+action"
    //     fallback — that would suppress a developer's genuinely different next project.
    const DEV_ENTITIES_XD = ['woodmont', 'sagard', 'prologis', 'bridge industrial', 'link logistics', 'rockefeller group', 'dermody', 'matrix development', 'crow holdings', 'butters', 'terreno', 'rexford', 'dalfen', 'faropoint'];
    const DEV_PROJECT_CITIES = ['rahway', 'avenel', 'linden', 'carteret', 'edison', 'piscataway', 'woodbridge', 'cranbury', 'south brunswick', 'perth amboy', 'elizabeth', 'newark', 'kearny', 'secaucus', 'bayonne', 'logan township', 'bethlehem', 'allentown', 'easton', 'hamilton', 'robbinsville', 'mount laurel', 'doral', 'medley', 'hialeah', 'pompano', 'ocala', 'fort myers'];
    const devsFound = DEV_ENTITIES_XD.filter(e => text.includes(e));
    if (devsFound.length > 0) {
        const escXd = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const citiesFound = DEV_PROJECT_CITIES.filter(c => new RegExp(`\\b${escXd(c)}\\b`).test(text));
        for (const dev of devsFound) {
            const d = dev.replace(/\s+/g, '-');
            for (const c of citiesFound) sigs.push(`devdeal_${d}_${c.replace(/\s+/g, '-')}`);
        }
    }

    return [...new Set(sigs)];
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
