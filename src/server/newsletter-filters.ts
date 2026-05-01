/**
 * Shared newsletter filtering logic — used by all newsletter variants.
 * Consolidates duplicated filter functions from email.ts into one place.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NormalizedItem } from '../types/index.js';
import { meetsDealThreshold, getDealScore } from '../shared/deal-threshold.js';
import {
    TARGET_REGIONS, CRE_COMPANY_NAMES, MAJOR_EXCLUDE_REGIONS, INTERNATIONAL_EXCLUDE,
    EXCLUDE_POLITICAL, EXCLUDE_NON_INDUSTRIAL, INDUSTRIAL_PROPERTY_KEYWORDS,
    RELEVANT_KEYWORDS, PEOPLE_ACTION_KEYWORDS, INDUSTRIAL_CONTEXT_KEYWORDS,
    TRANSACTION_ACTION_WORDS, APPROVAL_KEYWORDS, EXCLUDE_FROM_PEOPLE,
    APPROVED_DOMAINS, REGIONAL_SOURCES, BROKERAGE_SOURCES,
    isStrictlyIndustrial
} from '../shared/region-data.js';

// Geographic-only target regions (no CRE company names)
const TARGET_REGIONS_GEO = TARGET_REGIONS.filter(r => !CRE_COMPANY_NAMES.includes(r));
export const FLORIDA_SCOPE: 'ALL_FLORIDA' | 'SOUTH_FLORIDA_ONLY' = 'ALL_FLORIDA';
export const RESERVE_DISCOVERY_MAX_DAYS = 30;
export const RESERVE_NEWSLETTER_MAX_AGE_DAYS = 14;
export const WEEK_IN_REVIEW_MAX_AGE_DAYS = 7;
export const TARGET_REGION_TERM_MAP: Record<'NJ'|'PA'|'FL', string[]> = {
    NJ: ['NEW JERSEY',' NJ ',' N.J.','NEWARK','JERSEY CITY','ELIZABETH','EDISON','CARTERET','TRENTON','BAYONNE','LINDEN','SECAUCUS','PISCATAWAY','WOODBRIDGE','MIDDLESEX COUNTY','BERGEN COUNTY','UNION COUNTY','SOMERSET COUNTY','MONMOUTH COUNTY','BURLINGTON COUNTY','CAMDEN COUNTY','GLOUCESTER COUNTY','MORRIS COUNTY','MERCER COUNTY','SOUTH JERSEY','CENTRAL JERSEY','NORTH JERSEY','MEADOWLANDS','EXIT 8A','PORT NEWARK','PORT ELIZABETH'],
    PA: ['PENNSYLVANIA',' PA ',' PA.','PHILADELPHIA','LEHIGH VALLEY','ALLENTOWN','BETHLEHEM','EASTON','BUCKS COUNTY','CHESTER COUNTY','MONTGOMERY COUNTY','DELAWARE COUNTY','PITTSBURGH','GREATER PHILADELPHIA','DELAWARE VALLEY','I-78 CORRIDOR','I-81 CORRIDOR'],
    FL: ['FLORIDA',' FL ',' FLA.','MIAMI','MIAMI-DADE','BROWARD','PALM BEACH','FORT LAUDERDALE','HIALEAH','MEDLEY','DORAL','POMPANO','SOUTH FLORIDA','TAMPA','ORLANDO','JACKSONVILLE','CENTRAL FLORIDA']
};
export const TRUSTED_REGIONAL_SOURCE_REGION_MAP: Record<string, Array<'NJ'|'PA'|'FL'>> = {
    're-nj.com': ['NJ'], 'roi-nj.com': ['NJ'], 'njbiz.com': ['NJ'],
    'bisnow.com/rss-feed/new-jersey': ['NJ'], 'bisnow.com/rss-feed/philadelphia': ['PA'],
    'bizjournals.com/philadelphia': ['PA'], 'bizjournals.com/southflorida': ['FL']
};

const STRONG_INDUSTRIAL_TERMS = [
    'warehouse', 'industrial', 'logistics', 'distribution center', 'fulfillment',
    'manufacturing facility', 'cold storage', 'flex industrial', 'industrial outdoor storage',
    ' ios ', 'truck terminal', 'port logistics', 'last-mile facility', 'light industrial', 'supply chain facility'
];
const WRONG_ASSET_CLASS_TERMS: Record<string, string[]> = {
    OFFICE: ['office', 'headquarters', ' hq ', 'lab office', 'life sciences office', 'coworking'],
    MULTIFAMILY: ['multifamily', 'apartment', 'residential'],
    RETAIL: ['retail', 'shopping center', 'hotel', 'mixed-use', 'mixed use', 'hospital', 'school'],
};

// Substring collisions: target terms that are substrings of exclude terms.
// E.g., target "CHESTER" matches inside exclude "WESTCHESTER", inflating target count.
// We pre-compute these pairs so countRegionMatches can correct for them.
const SUBSTRING_COLLISIONS: Array<{ target: string; exclude: string }> = [];
for (const t of TARGET_REGIONS_GEO) {
    for (const e of MAJOR_EXCLUDE_REGIONS) {
        if (e.includes(t) && e !== t) {
            SUBSTRING_COLLISIONS.push({ target: t, exclude: e });
        }
    }
}

/**
 * Count region matches in text, correcting for substring collisions.
 * Returns [targetCount, excludeCount] with false positives subtracted.
 */
function countRegionMatches(text: string): [number, number] {
    let geoTargetCount = TARGET_REGIONS_GEO.reduce((count, r) => count + (text.split(r).length - 1), 0);
    const excludeCount = MAJOR_EXCLUDE_REGIONS.reduce((count, r) => count + (text.split(r).length - 1), 0);

    // Subtract false target hits caused by substring collisions
    for (const { target, exclude } of SUBSTRING_COLLISIONS) {
        const excludeHits = text.split(exclude).length - 1;
        if (excludeHits > 0) {
            // Each occurrence of the exclude term produces a false target hit
            geoTargetCount -= excludeHits;
        }
    }

    return [Math.max(0, geoTargetCount), excludeCount];
}

// =====================================================================
// TEXT HELPERS
// =====================================================================

export function getText(article: NormalizedItem): string {
    return `${article.title || ''} ${article.description || ''} ${(article as any).summary || ''}`.toLowerCase();
}

export function containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(kw => text.includes(kw));
}

export function isPolitical(text: string): boolean {
    return containsAny(text, EXCLUDE_POLITICAL);
}

export function isIndustrialProperty(text: string): boolean {
    return isStrictlyIndustrial(text);
}

// =====================================================================
// DATE HELPERS
// =====================================================================

export function getValidDate(article: NormalizedItem): Date | null {
    const dateStr = (article as any).date_published || article.pubDate || (article as any).date_modified || article.fetchedAt;
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    if (date > new Date()) return null;
    if (date < new Date('2020-01-01')) return null;
    return date;
}

// =====================================================================
// REGION FILTER
// =====================================================================

export function isTargetRegion(article: NormalizedItem): boolean {
    return hasPositiveTargetRegionEvidence(article).pass;
}

export function hasPositiveTargetRegionEvidence(article: NormalizedItem): { pass: boolean; regions: Array<'NJ'|'PA'|'FL'>; reason: string } {
    const text = `${article.title || ''} ${article.description || ''} ${(article as any).summary || ''}`.toUpperCase();
    const sourceText = `${(article as any).source || ''} ${(article as any)._source?.name || ''}`.toUpperCase();
    const url = ((article as any).url || article.link || '').toLowerCase();

    // BLOCK: international content — always reject
    if (INTERNATIONAL_EXCLUDE.some(term => text.includes(term))) return { pass: false, regions: [], reason: 'EXCLUDED_NON_TARGET_REGION' };

    // BLOCK: unapproved source domains
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        if (!APPROVED_DOMAINS.some(d => hostname.includes(d))) return { pass: false, regions: [], reason: 'SOURCE_NOT_APPROVED' };
    } catch { /* keep going if URL parse fails */ }

    // INCLUDE if from a NJ/PA/FL regional source
    const isFromRegionalSource = REGIONAL_SOURCES.some(s => url.includes(s) || sourceText.includes(s.toUpperCase()));

    // Use geographic-only terms (not CRE company names) for region matching.
    // "CBRE arranges financing in Arizona" should NOT pass because of "CBRE".
    const [geoTargetCount, excludeCount] = countRegionMatches(text);

    const regions: Array<'NJ'|'PA'|'FL'> = [];
    const full = ` ${text} ${url.toUpperCase()} ${(article as any).source?.toUpperCase() || ''} ${(article as any)._source?.website?.toUpperCase() || ''} `;
    for (const region of ['NJ', 'PA', 'FL'] as const) {
        const terms = TARGET_REGION_TERM_MAP[region].filter(t => FLORIDA_SCOPE === 'ALL_FLORIDA' || !['TAMPA','ORLANDO','JACKSONVILLE','CENTRAL FLORIDA'].includes(t));
        if (terms.some(t => full.includes(t))) regions.push(region);
    }
    const sourceMapped = Object.entries(TRUSTED_REGIONAL_SOURCE_REGION_MAP)
        .filter(([k]) => full.toLowerCase().includes(k))
        .flatMap(([, v]) => v);
    sourceMapped.forEach(r => { if (!regions.includes(r)) regions.push(r); });
    if (sourceMapped.length > 0 && regions.length === 0) return { pass: false, regions: [], reason: 'SOURCE_REGION_ONLY_NOT_ENOUGH' };

    if (article.regions && article.regions.length > 0) {
        const hasTarget = article.regions.some(r => TARGET_REGIONS_GEO.some(tr => r.toUpperCase().includes(tr)));
        if (hasTarget) return { pass: true, regions: [...new Set(regions)], reason: 'TARGET_REGION_EVIDENCE' };
    }

    const hasGeoTarget = TARGET_REGIONS_GEO.some(r => text.includes(r));
    if (!hasGeoTarget || regions.length === 0) return { pass: false, regions: [], reason: 'NO_TARGET_REGION_EVIDENCE' };
    if (excludeCount > geoTargetCount) return { pass: false, regions: [...new Set(regions)], reason: 'REGION_CONFLICT_WEAK_TARGET' };
    return { pass: true, regions: [...new Set(regions)], reason: 'TARGET_REGION_EVIDENCE' };
}

export function finalNewsletterGate(article: NormalizedItem, section: 'relevant'|'transactions'|'availabilities'|'people', options?: { sourceType?: string; forceInclude?: boolean; minScoreOverride?: number }) {
    const reasons: string[] = [];
    const region = hasPositiveTargetRegionEvidence(article);
    if (!region.pass) reasons.push(region.reason);
    const industrial = hasStrongIndustrialAssetEvidence(article);
    if (!industrial.pass) reasons.push(industrial.reason);
    const text = getText(article);
    const sectionEvidence: string[] = [];
    if (section === 'availabilities' && !containsAny(text, ['available','for lease','for sale','vacant','sublease','delivered','build-to-suit','spec industrial','warehouse listing','seeking tenant'])) reasons.push('SECTION_RULE_FAILED');
    if (section === 'people') {
        const hasPeopleAction = containsAny(text, PEOPLE_ACTION_KEYWORDS);
        const hasCreContext = containsAny(text, INDUSTRIAL_CONTEXT_KEYWORDS) || /\b(cbre|jll|cushman|colliers|newmark|nai|lee & associates|broker)\b/i.test(text);
        if (!hasPeopleAction || !hasCreContext) reasons.push('SECTION_RULE_FAILED');
    }
    if (containsAny(text, ['office','headquarters','multifamily','apartment','retail','shopping center','hotel']) && industrial.evidence.length === 0) reasons.push('SECTION_RULE_FAILED');
    let score = 0;
    if (region.pass) score += 40;
    if (industrial.pass) score += 35;
    if (section === 'transactions' && meetsDealThreshold(text).meetsSF) score += 10;
    const floors = { relevant: 55, transactions: 60, availabilities: 65, people: 55 };
    const min = options?.minScoreOverride ?? floors[section];
    if (score < min) reasons.push('BELOW_SECTION_SCORE_FLOOR');
    return { pass: reasons.length === 0 || options?.forceInclude === true, score, regions: region.regions, reasons, evidence: { regionEvidence: region.regions, industrialEvidence: industrial.evidence, sectionEvidence, sourceEvidence: [] } };
}

export function hasStrongIndustrialAssetEvidence(article: NormalizedItem): { pass: boolean; evidence: string[]; rejectedAssetClass?: string; reason: string } {
    const text = ` ${(getText(article) || '').toLowerCase()} `;
    const evidence = STRONG_INDUSTRIAL_TERMS.filter(t => text.includes(t));
    for (const [cls, terms] of Object.entries(WRONG_ASSET_CLASS_TERMS)) {
        if (terms.some(t => text.includes(t)) && evidence.length === 0) {
            return { pass: false, evidence, rejectedAssetClass: cls, reason: `WRONG_ASSET_CLASS_${cls}` };
        }
    }
    if (evidence.length === 0) return { pass: false, evidence, reason: 'NO_STRONG_INDUSTRIAL_EVIDENCE' };
    return { pass: true, evidence, reason: 'STRONG_INDUSTRIAL_EVIDENCE' };
}

/**
 * Exclude-region gate for the "relevant" section.
 * Relevant articles don't need to mention NJ/PA/FL (macro/national is OK),
 * but they MUST NOT be about a specific non-target city/region.
 * - "10-Year Yield Rises" → no region → allowed (national news)
 * - "Alabama Manufacturing Plant" → excluded region, no target → blocked
 * - "NJ Industrial Market" → target region → allowed
 * - "Varda Space Expands in El Segundo" → specific non-target city → blocked
 */
// Non-target cities/areas that MAJOR_EXCLUDE_REGIONS might miss (abbreviations, neighborhoods)
const EXCLUDE_CITIES_EXTRA = [
    'EL SEGUNDO', 'DFW', 'DALLAS-FORT WORTH', 'INLAND EMPIRE', 'SOCAL',
    'NORCAL', 'BAY AREA', 'SILICON VALLEY', 'RESEARCH TRIANGLE',
    'RANCHO DOMINGUEZ', 'RANCHO CUCAMONGA', 'PERRIS', 'HESPERIA',
    'CORONA', 'FONTANA', 'REDLANDS', 'RIALTO', 'MORENO VALLEY',
    'CADDO PARISH', 'SHREVEPORT', 'NILES', 'WALKER, LOUISIANA', 'LOUISIANA',
    'TEMPLE, TX', 'COSTA MESA', 'OTAY MESA', 'CHINO', 'ONTARIO, CA',
    'NORTH CAROLINA', 'SOUTH CAROLINA',
    'NEW YORK', 'BROOKLYN', 'MANHATTAN', 'LONG ISLAND', 'QUEENS', 'BRONX', 'STATEN ISLAND',
    'WEST VILLAGE', 'EAST VILLAGE', 'GREENWICH VILLAGE', 'DUMBO', 'WILLIAMSBURG',
    'HARLEM', 'NOHO', 'NOLITA', 'RED HOOK', 'LOWER EAST SIDE',
    'CONNECTICUT', 'MASSACHUSETTS', 'BOSTON',
    'ROCKAWAY BOULEVARD', 'ROCKAWAY BLVD', 'JAMAICA, NY', 'JAMAICA, NEW YORK',
    'OZONE PARK', 'FAR ROCKAWAY', 'HOWARD BEACH',
    'GLENDALE, AZ', 'GRANTVILLE, GA', 'GRANTVILLE', 'MIDWEST',
    'CEDAR PARK', 'LA PORTE', 'CONCORD, NC', 'CONCORD, CA',
    'PLATTE CITY', 'ROCK ISLAND', 'KOKOMO', 'HILLSBORO, OR',
    'CENLA', 'CENTRAL LOUISIANA', 'BEEVILLE',
    'GRAND RAPIDS', 'KALAMAZOO', 'STOCKTON, CA', 'BOHEMIA, NY',
    'WATERVILLE', 'MAINE', 'BANGOR',
    'BUCKEYE', 'GAINESVILLE TIMES', 'GAINESVILLE, GA', 'ORANGE COUNTY', 'SCBIZ', 'FLORENCE, SC',
    'POOLER', 'TOPEKA', 'BENTON COUNTY', 'PARISHWIDE',
    'LONG ISLAND CITY', 'LIC ', ', LIC',
];

export function isNotExcludedRegion(article: NormalizedItem): boolean {
    const text = `${article.title || ''} ${article.description || ''} ${(article as any).summary || ''}`.toUpperCase();

    // Block international
    if (INTERNATIONAL_EXCLUDE.some(term => text.includes(term))) return false;

    const [geoTargetCount, excludeCount] = countRegionMatches(text);
    const extraExcludeCount = EXCLUDE_CITIES_EXTRA.reduce((count, r) => count + (text.split(r).length - 1), 0);
    const totalExclude = excludeCount + extraExcludeCount;

    // If mentions excluded region(s) but no target region → block
    if (totalExclude > 0 && geoTargetCount === 0) return false;
    // If more excluded than target → block
    if (totalExclude > geoTargetCount) return false;

    return true;
}

// =====================================================================
// SECTION FILTERS
// =====================================================================

export function applyStrictFilter(items: NormalizedItem[], keywords: string[], sectionName: string): NormalizedItem[] {
    const filtered = items.filter(article => {
        const text = getText(article);
        if (isPolitical(text)) return false;
        if (!hasStrongIndustrialAssetEvidence(article).pass) return false;
        return containsAny(text, keywords);
    });
    console.log(`🔍 ${sectionName}: ${items.length} → ${filtered.length} (strict filter)`);
    return filtered;
}

export function applyTransactionFilter(items: NormalizedItem[]): NormalizedItem[] {
    const filtered = items.filter(article => {
        const text = getText(article);
        if (isPolitical(text)) return false;
        if (!hasStrongIndustrialAssetEvidence(article).pass) return false;
        // Project approvals/zoning are ALWAYS relevant (no threshold needed)
        if (containsAny(text, APPROVAL_KEYWORDS)) return true;
        // Transaction must clear the deal-size floor stated in the newsletter footer
        // (≥100K SF or ≥$25M). Previously a TRANSACTION_ACTION_WORDS match alone bypassed
        // this — that's how a $3.5M Metuchen sale slipped through on 2026-04-30.
        const hasAction = containsAny(text, TRANSACTION_ACTION_WORDS);
        const threshold = meetsDealThreshold(text);
        const meetsThreshold = threshold.meetsSF || threshold.meetsDollar;
        if (meetsThreshold) return true;
        // Below threshold but action-worded: only allow if SF is at least half the floor
        // (so a clearly real but smaller deal can still come through, not random mentions)
        if (hasAction && threshold.sizeSF !== null && threshold.sizeSF >= 50000) return true;
        return false;
    });
    console.log(`🔍 Transactions: ${items.length} → ${filtered.length} (threshold filter)`);
    return filtered;
}

export function applyAvailabilityFilter(items: NormalizedItem[]): NormalizedItem[] {
    const filtered = items.filter(article => {
        const text = getText(article);
        if (isPolitical(text)) return false;
        // Accept availability-specific language
        const availabilityWords = [
            'available', 'for sale', 'for lease', 'listing', 'on the market',
            'seeking buyer', 'buyer wanted', 'now leasing', 'now available',
            'seeking tenants', 'for sublease', 'sublease', 'space available',
            'build-to-suit', 'vacant', 'vacancy', 'delivered', 'spec',
            'under construction', 'breaks ground', 'groundbreaking', 'coming to market',
        ];
        if (!hasStrongIndustrialAssetEvidence(article).pass) return false;
        if (containsAny(text, availabilityWords)) return true;
        const threshold = meetsDealThreshold(text);
        return threshold.meetsSF || (threshold.sizeSF !== null && threshold.sizeSF > 0);
    });
    console.log(`🔍 Availabilities: ${items.length} → ${filtered.length} (threshold filter)`);
    return filtered;
}

export function applyPeopleFilter(items: NormalizedItem[]): NormalizedItem[] {
    const filtered = items.filter(article => {
        const text = getText(article);
        const url = ((article as any).url || article.link || '').toLowerCase();
        if (isPolitical(text)) return false;
        if (containsAny(text, EXCLUDE_FROM_PEOPLE)) return false;
        const hasAction = containsAny(text, PEOPLE_ACTION_KEYWORDS);
        const hasIndustrial = containsAny(text, INDUSTRIAL_CONTEXT_KEYWORDS) || hasStrongIndustrialAssetEvidence(article).pass;
        // If title OR body has strong people signal, allow even if body mentions transactions
        const titleUpper = (article.title || '').toUpperCase();
        const titleHasPeopleSignal = /\b(HIRED|APPOINTED|PROMOTED|NAMED|JOINS|JOINED|TAPS|WELCOMES|HIRES|APPOINTS|PROMOTES|NAMES)\b/.test(titleUpper)
            || titleUpper.startsWith('PEOPLE:') || titleUpper.startsWith('PEOPLE |');
        const bodyHasPeopleAction = containsAny(text, ['hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped']);
        // If it's primarily a transaction (and neither title nor body indicate people), skip
        if (!titleHasPeopleSignal && !bodyHasPeopleAction && containsAny(text, TRANSACTION_ACTION_WORDS)) return false;
        if (!isTargetRegion(article)) return false;
        const gate = finalNewsletterGate(article, 'people');
        return gate.pass && hasAction && hasIndustrial;
    });
    console.log(`🔍 People News: ${items.length} → ${filtered.length} (people filter)`);
    return filtered;
}

// =====================================================================
// PEOPLE RE-CATEGORIZATION PASS
// =====================================================================

/**
 * Second pass: move articles from "relevant" to "people" if they're primarily
 * about a person (contain people action keywords + industrial context).
 * Returns { relevant, people } with articles moved as needed.
 */
// Strong people action words — these unambiguously indicate personnel news
// (excludes generic words like "nabs", "leads", "heads" that trigger false positives)
const STRONG_PEOPLE_ACTIONS = [
    'hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped',
    'hires', 'appoints', 'promotes', 'names',
    'movers', 'shakers', 'power broker', 'rising star', 'top producer',
    'recognized', 'award', 'honored', 'featured', 'profile', 'spotlight',
    'milestone', 'anniversary', 'marks milestone', 'retirement', 'retiring',
];

// Title/role keywords — presence of these strongly signals a people article
const PERSON_ROLE_KEYWORDS = [
    'ceo', 'cfo', 'coo', 'cio', 'cto', 'president', 'chairman', 'chairwoman',
    'vice president', 'vp ', 'svp ', 'evp ', 'managing director',
    'director', 'principal', 'partner', 'executive', 'officer',
    'broker', 'head of', 'chief', 'senior advisor',
    'board of directors', 'board member', 'to board', 'advisory board',
];

export function reCategorizeRelevantAsPeople(
    relevant: NormalizedItem[],
    people: NormalizedItem[],
    transactions?: NormalizedItem[]
): { relevant: NormalizedItem[]; people: NormalizedItem[]; transactions: NormalizedItem[] } {
    const movedToPeople: NormalizedItem[] = [];
    const keptRelevant: NormalizedItem[] = [];
    const keptTransactions: NormalizedItem[] = [];

    const rescueArticle = (article: NormalizedItem): boolean => {
        const text = getText(article);
        if (containsAny(text, EXCLUDE_FROM_PEOPLE)) return false;
        const hasStrongAction = containsAny(text, STRONG_PEOPLE_ACTIONS);
        const hasRole = containsAny(text, PERSON_ROLE_KEYWORDS);
        const hasIndustrial = containsAny(text, INDUSTRIAL_CONTEXT_KEYWORDS);
        const isPeoplePuff = containsAny(text, ['milestone', 'anniversary', 'retirement', 'retiring', 'marks milestone']);
        // Title-level people signal — very strong indicator
        const titleUpper = (article.title || '').toUpperCase();
        const titleHasPeopleSignal = /\b(HIRED|APPOINTED|PROMOTED|NAMED|JOINS|JOINED|TAPS|WELCOMES|HIRES|APPOINTS|PROMOTES|NAMES)\b/.test(titleUpper);
        // Require 2 of 3 conditions (action + role + industrial) instead of all 3
        const conditionsMet = [hasStrongAction || titleHasPeopleSignal, hasRole, hasIndustrial].filter(Boolean).length;
        if (conditionsMet >= 2 || (isPeoplePuff && hasRole)) {
            console.log(`👤 Re-categorized to People: "${article.title?.substring(0, 60)}"`);
            return true;
        }
        return false;
    };

    for (const article of relevant) {
        const text = getText(article);
        // If it's a transaction AND doesn't have title-level people signal, keep in relevant
        const titleUpper = (article.title || '').toUpperCase();
        const titleHasPeopleSignal = /\b(HIRED|APPOINTED|PROMOTED|NAMED|JOINS|JOINED|TAPS|WELCOMES|HIRES|APPOINTS|PROMOTES|NAMES)\b/.test(titleUpper);
        if (!titleHasPeopleSignal && containsAny(text, TRANSACTION_ACTION_WORDS)) {
            keptRelevant.push(article);
            continue;
        }
        if (rescueArticle(article)) {
            movedToPeople.push(article);
        } else {
            keptRelevant.push(article);
        }
    }

    // Also rescue misclassified people articles from transactions
    if (transactions) {
        for (const article of transactions) {
            const titleUpper = (article.title || '').toUpperCase();
            const titleHasPeopleSignal = /\b(HIRED|APPOINTED|PROMOTED|NAMED|JOINS|JOINED|TAPS|WELCOMES|HIRES|APPOINTS|PROMOTES|NAMES)\b/.test(titleUpper);
            if (titleHasPeopleSignal && rescueArticle(article)) {
                movedToPeople.push(article);
            } else {
                keptTransactions.push(article);
            }
        }
    }

    return {
        relevant: keptRelevant,
        transactions: transactions ? keptTransactions : [],
        people: [...people, ...movedToPeople]
    };
}

// =====================================================================
// POST-DESCRIPTION REGIONAL RE-CHECK
// =====================================================================

export function postDescriptionRegionCheck(article: NormalizedItem): boolean {
    const desc = (article.description || '').toUpperCase();
    if (!desc) return true;

    // Never filter out Woodmont's own articles
    const text = `${article.title || ''} ${article.source || ''}`.toLowerCase();
    if (text.includes('woodmont')) return true;

    // "Relevant" category allows macro/national news, but still block if description
    // reveals a specific excluded region (e.g., AI description says "in Houston, Texas")
    if (article.category === 'relevant') {
        if (INTERNATIONAL_EXCLUDE.some(t => desc.includes(t))) {
            console.log(`🚫 Post-desc filter removed relevant: "${article.title?.substring(0, 50)}" (international in description)`);
            return false;
        }
        const fullText = `${article.title || ''} ${desc}`.toUpperCase();
        const [geoTargetCount, excludeCount] = countRegionMatches(fullText);
        // Only block relevant articles if they clearly reference excluded regions with no target
        if (excludeCount > 0 && geoTargetCount === 0) {
            console.log(`🚫 Post-desc filter removed relevant: "${article.title?.substring(0, 50)}" (excluded region in description, no target)`);
            return false;
        }
        return true;
    }

    // International content — always reject
    if (INTERNATIONAL_EXCLUDE.some(t => desc.includes(t))) {
        console.log(`🚫 Post-desc filter removed: "${article.title?.substring(0, 50)}" (international in description)`);
        return false;
    }

    // Compare target vs exclude mentions in full text (title + description).
    // An article about "Wynwood, Miami" from a "NY brokerage" should pass because
    // FL target mentions outweigh the NY exclude mention.
    const fullText = `${article.title || ''} ${desc}`.toUpperCase();
    const [geoTargetCount, excludeCount] = countRegionMatches(fullText);

    if (excludeCount > 0 && excludeCount > geoTargetCount) {
        console.log(`🚫 Post-desc filter removed: "${article.title?.substring(0, 50)}" (exclude=${excludeCount} > target=${geoTargetCount})`);
        return false;
    }
    return true;
}

// =====================================================================
// ARTICLE LOADING & TIME RANGE
// =====================================================================

/**
 * Map feed.json items to NormalizedItem with proper description field
 */
export function mapFeedItemsToArticles(feedItems: any[]): NormalizedItem[] {
    return feedItems.map((a: any) => ({
        ...a,
        link: a.url || a.link,
        pubDate: a.date_published || a.pubDate,
        fetchedAt: a.date_modified || a.fetchedAt,
        description: a.content_text || a.content_html || a.description || a.summary || '',
        source: a._source?.name || a.source || '',
        publisher: a._source?.website || a.publisher || '',
    }));
}

/**
 * Load user-excluded article IDs/URLs from docs/excluded-articles.json
 */
function loadExcludedArticles(docsDir: string): { ids: Set<string>; urls: Set<string> } {
    const excludePath = path.join(docsDir, 'excluded-articles.json');
    try {
        if (fs.existsSync(excludePath)) {
            const data = JSON.parse(fs.readFileSync(excludePath, 'utf-8'));
            return {
                ids: new Set(data.excludedIds || []),
                urls: new Set((data.excludedUrls || []).map((u: string) => u.toLowerCase()))
            };
        }
    } catch (e) { console.warn('Could not load excluded-articles.json:', e); }
    return { ids: new Set(), urls: new Set() };
}

export function loadArticlesFromFeed(): { articles: NormalizedItem[]; feedPath: string; docsDir: string } {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const docsDir = path.join(__dirname, '../../docs');
    const feedPath = path.join(docsDir, 'feed.json');

    if (!fs.existsSync(feedPath)) {
        throw new Error(`Feed file not found: ${feedPath}`);
    }

    const feedData = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
    let articles = mapFeedItemsToArticles(feedData.items || []);

    // Filter out user-excluded articles
    const excluded = loadExcludedArticles(docsDir);
    if (excluded.ids.size > 0 || excluded.urls.size > 0) {
        const before = articles.length;
        articles = articles.filter(a => {
            if (a.id && excluded.ids.has(a.id)) return false;
            const url = ((a as any).url || a.link || '').toLowerCase();
            if (url && excluded.urls.has(url)) return false;
            return true;
        });
        const removed = before - articles.length;
        if (removed > 0) console.log(`🚫 Excluded ${removed} article(s) from user exclude list`);
    }

    return { articles, feedPath, docsDir };
}

export function filterArticlesByTimeRange(articles: NormalizedItem[], hours: number): NormalizedItem[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return articles.filter(a => {
        const pubDate = getValidDate(a);
        if (!pubDate) return false;
        return pubDate >= cutoff;
    });
}

// =====================================================================
// INCLUDED ARTICLES (manually picked from raw feed)
// =====================================================================

export function loadIncludedArticles(docsDir: string): NormalizedItem[] {
    const includePath = path.join(docsDir, 'included-articles.json');
    try {
        if (!fs.existsSync(includePath)) return [];
        const data = JSON.parse(fs.readFileSync(includePath, 'utf-8'));
        const articles = data.articles || [];
        if (articles.length === 0) return [];
        console.log(`📌 Loaded ${articles.length} manually included article(s)`);
        return articles.map((a: any) => ({
            id: a.id || a.url || '',
            title: a.title || '',
            link: a.url || '',
            pubDate: a.date_published || '',
            description: a.description || '',
            source: a.source || '',
            category: a.category || 'relevant',
            regions: a.region ? [a.region] : [],
            keywords: a.keywords || [],
        } as NormalizedItem));
    } catch (e) {
        console.warn('Could not load included-articles.json:', e);
        return [];
    }
}

export function clearIncludedArticles(docsDir: string): void {
    const includePath = path.join(docsDir, 'included-articles.json');
    try {
        const content = {
            _comment: 'Articles manually picked from raw feed for newsletter inclusion.',
            articles: []
        };
        fs.writeFileSync(includePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
        console.log('🧹 Cleared included-articles.json');
    } catch (e) {
        console.warn('Could not clear included-articles.json:', e);
    }
}

// =====================================================================
// SENT-ARTICLE DEDUP TRACKING
// =====================================================================

interface SentEntry { id: string; sentAt: string; sigs?: string[] }
interface SentArticlesData { sent: SentEntry[] }

/**
 * Load previously sent article IDs from docs/sent-articles.json.
 * Returns a Set of article IDs that were sent in the last 30 days.
 */
export function loadSentArticles(docsDir: string): Set<string> {
    const sentPath = path.join(docsDir, 'sent-articles.json');
    try {
        if (!fs.existsSync(sentPath)) return new Set();
        const data: SentArticlesData = JSON.parse(fs.readFileSync(sentPath, 'utf-8'));
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentIds = (data.sent || [])
            .filter(e => new Date(e.sentAt) >= thirtyDaysAgo)
            .map(e => e.id);
        console.log(`📋 Loaded ${recentIds.length} previously sent article IDs (last 30 days)`);
        return new Set(recentIds);
    } catch (e) {
        console.warn('Could not load sent-articles.json:', e);
        return new Set();
    }
}

/**
 * Load deal signatures from previously sent articles (last 14 days only — older deals
 * may legitimately resurface). Used for cross-day dedup so the same deal reported by a
 * different source on a later day doesn't ship a second time.
 */
export function loadSentSignatures(docsDir: string): Set<string> {
    const sentPath = path.join(docsDir, 'sent-articles.json');
    try {
        if (!fs.existsSync(sentPath)) return new Set();
        const data: SentArticlesData = JSON.parse(fs.readFileSync(sentPath, 'utf-8'));
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const sigs = new Set<string>();
        for (const e of data.sent || []) {
            if (new Date(e.sentAt) < fourteenDaysAgo) continue;
            for (const s of e.sigs || []) sigs.add(s);
        }
        console.log(`📋 Loaded ${sigs.size} sent deal-signatures (last 14 days)`);
        return sigs;
    } catch (e) {
        console.warn('Could not load sent signatures:', e);
        return new Set();
    }
}

/**
 * Save current article IDs (and their deal signatures) to docs/sent-articles.json.
 * Storing signatures alongside IDs enables cross-day fuzzy dedup so the same deal
 * reported by a different source on a later day won't ship twice.
 */
export function saveSentArticles(docsDir: string, sentItems: Array<{ id: string; sigs?: string[] }>): void {
    const sentPath = path.join(docsDir, 'sent-articles.json');
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let existing: SentEntry[] = [];
    try {
        if (fs.existsSync(sentPath)) {
            const data: SentArticlesData = JSON.parse(fs.readFileSync(sentPath, 'utf-8'));
            existing = data.sent || [];
        }
    } catch { /* start fresh */ }

    // Prune old entries
    const pruned = existing.filter(e => new Date(e.sentAt) >= thirtyDaysAgo);
    const prunedCount = existing.length - pruned.length;
    if (prunedCount > 0) console.log(`🧹 Pruned ${prunedCount} sent-article entries older than 30 days`);

    // Append new IDs
    const existingIds = new Set(pruned.map(e => e.id));
    const newEntries: SentEntry[] = sentItems
        .filter(item => !existingIds.has(item.id))
        .map(item => ({
            id: item.id,
            sentAt: today,
            ...(item.sigs && item.sigs.length > 0 ? { sigs: item.sigs } : {}),
        }));

    const updated: SentArticlesData = { sent: [...pruned, ...newEntries] };
    fs.writeFileSync(sentPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
    console.log(`💾 Saved ${newEntries.length} new sent-article entries (total: ${updated.sent.length})`);
}

export function sortByDealThenDate(a: NormalizedItem, b: NormalizedItem): number {
    const scoreA = getDealScore(a);
    const scoreB = getDealScore(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime();
}
