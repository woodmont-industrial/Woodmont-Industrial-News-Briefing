/**
 * Shared newsletter filtering logic — used by all newsletter variants.
 * Consolidates duplicated filter functions from email.ts into one place.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NormalizedItem } from '../types/index.js';
import { meetsDealThreshold, getDealScore } from '../shared/deal-threshold.js';
import type { DiagnosticContext, Section } from './newsletter-diagnostics.js';
import { getPublisherName } from '../shared/publisher-name.js';
import {
    TARGET_REGIONS, CRE_COMPANY_NAMES, MAJOR_EXCLUDE_REGIONS, INTERNATIONAL_EXCLUDE,
    EXCLUDE_POLITICAL, EXCLUDE_NON_INDUSTRIAL, INDUSTRIAL_PROPERTY_KEYWORDS,
    RELEVANT_KEYWORDS, PEOPLE_ACTION_KEYWORDS, INDUSTRIAL_CONTEXT_KEYWORDS,
    TRANSACTION_ACTION_WORDS, APPROVAL_KEYWORDS, EXCLUDE_FROM_PEOPLE,
    APPROVED_DOMAINS, REGIONAL_SOURCES, BROKERAGE_SOURCES,
    isStrictlyIndustrial,
    hasWrongPropertyType, hasStrongIndustrialOverride
} from '../shared/region-data.js';

// Geographic-only target regions (no CRE company names)
const TARGET_REGIONS_GEO = TARGET_REGIONS.filter(r => !CRE_COMPANY_NAMES.includes(r));

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

// Non-target US state full names + comma-prefixed codes. These are explicitly
// non-target and should win over any target term if mentioned earlier in the title.
const NON_TARGET_US_STATE_RE = /\b(?:Alabama|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|"New Hampshire"|"New Mexico"|"New York"|"North Carolina"|"North Dakota"|Ohio|Oklahoma|Oregon|"Rhode Island"|"South Carolina"|"South Dakota"|Tennessee|Texas|Utah|Vermont|Virginia|"West Virginia"|Wisconsin|Wyoming)\b/i;

// Non-US country names. Anything matching these in the title means the article
// is about a foreign deal and should fail Rule (c) regardless of mentions of NJ/PA/FL.
const NON_TARGET_COUNTRY_RE = /\b(?:Norway|Sweden|Finland|Denmark|Iceland|Germany|France|Spain|Italy|U\.K\.|"United Kingdom"|Britain|England|Scotland|Wales|Ireland|Netherlands|Belgium|Switzerland|Austria|Poland|Greece|Portugal|Russia|Ukraine|Turkey|Israel|UAE|"Saudi Arabia"|Qatar|Egypt|"South Africa"|Nigeria|Kenya|Madagascar|Morocco|Australia|"New Zealand"|China|Japan|Korea|India|Pakistan|Bangladesh|Vietnam|Thailand|Malaysia|Singapore|Indonesia|Philippines|Mexico|Brazil|Argentina|Chile|Colombia|Canada)\b/i;

// Earliest target-region phrase finder. Used to compare positional dominance
// against non-target mentions (Rule c).
const TARGET_REGION_PHRASE_RE = /\b(?:"New Jersey"|N\.J\.|NJ|Pennsylvania|PA|Florida|Fla\.|FL|Newark|"Jersey City"|Edison|Elizabeth|Carteret|Trenton|Bayonne|Linden|Secaucus|Piscataway|Woodbridge|Metuchen|"Lehigh Valley"|Allentown|Bethlehem|Easton|Philadelphia|Pittsburgh|Miami|Tampa|Orlando|Jacksonville|Hialeah|Doral|Pompano|"Fort Lauderdale"|"West Palm"|"Boca Raton"|Meadowlands|"Greater Philadelphia"|"Delaware Valley"|"South Florida"|"Central Florida"|"North Jersey"|"South Jersey"|"Central Jersey"|"Bergen County"|"Hudson County"|"Middlesex County"|"Monmouth County"|"Ocean County"|"Burlington County"|"Camden County"|"Somerset County"|"Mercer County"|"Union County"|"Essex County"|"Morris County"|"Bucks County"|"Chester County"|"Montgomery County"|"Delaware County"|"Lehigh County"|"Northampton County"|"Miami-Dade"|"Broward"|"Palm Beach"|"Hillsborough"|"Duval")\b/i;

// Government-body pattern. "Industrial Development Agency / Authority / Commission /
// Board / Corporation / District" — these are public-sector bodies that legitimately
// have "industrial" in their name but rarely concern actual NJ/PA/FL property deals.
const GOV_INDUSTRIAL_BODY_RE = /\b(?:industrial|economic)\s+development\s+(?:agency|authority|commission|council|board|corporation|district)\b/i;

// Listing-aggregator title patterns. CommercialSearch, LoopNet, PropertyShark titles
// are property listings sourced from a national catalog — most are NOT NJ/PA/FL. The
// articles slip through generic Google News queries despite the dedicated feeds being
// deactivated. Title patterns are distinctive:
//   - "Title - CommercialSearch" / "Title - LoopNet" / "Title - PropertyShark"
//   - "FOR LEASE | X SF | ..." (generic CommercialSearch format)
//   - "City Industrial Center: X SF Industrial For Lease - CommercialSearch"
// If the title matches a listing-aggregator pattern AND no target NJ/PA/FL token is
// present, reject as SOURCE_LISTING_AGGREGATOR_NO_TARGET. Preserves the rare case
// where a listing IS in target region (Huntingdon Valley PA, etc.).
const LISTING_AGGREGATOR_SUFFIX_RE = /\s+[-–—|]\s+(?:CommercialSearch|LoopNet|PropertyShark|Traded\.co|Crexi)\s*$/i;
const GENERIC_LISTING_TITLE_RE = /^(?:For\s+Lease|For\s+Sale|FOR\s+LEASE|FOR\s+SALE)\s*\|/i;

// Active ACQUISITION verbs whose grammatical subject is the buyer and whose object is the
// asset. Used by Rule (a): if a target token is the buyer (before the verb) but the asset
// (after the verb) carries no target token, the property is out-of-region. Disposition verbs
// (sells/sold) are deliberately EXCLUDED — "Industrial property in Miami-Dade sold for $51M"
// is passive, with the target token naming the ASSET, not a seller.
const ACQUISITION_VERB_RE = /\b(?:buys|bought|buying|acquires?|acquired|acquiring|purchas(?:es|ed|ing)|snaps?\s+up|snapped\s+up|picks?\s+up|picked\s+up|scoops?\s+up|scooped\s+up|nabs?|nabbed|grabs?|grabbed)\b/i;

// Target-region presence test for a raw text SEGMENT (used positionally in Rule a).
// Mirrors isTargetRegion's substring approach against the geographic-only token set.
function segmentHasTarget(segment: string): boolean {
    const up = segment.toUpperCase();
    return TARGET_REGIONS_GEO.some(r => up.includes(r));
}

/**
 * AUTOMATIC GEOGRAPHY FAILURES — three structural rules that reject articles
 * before the positive-evidence check runs. Implements the rules from the
 * Woodmont News Briefing spec (May 2026):
 *
 *   (a) NJ/PA/FL company doing a deal in another state or country.
 *       Detected indirectly: when a non-target country/state appears in the title
 *       AND no target token appears earlier, the article is about a non-target
 *       deal even if a target term also appears (Rule c handles this).
 *
 *   (b) Government agency with "industrial" in its name unless tied to a specific
 *       NJ/PA/FL property. Pattern: "X Industrial Development Agency/Authority/etc"
 *       without an explicit NJ/PA/FL city/county nearby.
 *
 *   (c) Primary location is outside NJ/PA/FL even if NJ/PA/FL is mentioned in
 *       passing. Detected by FIRST geographic phrase position in the title.
 *
 * Returns { fails: boolean, reason: string } so callers can log the specific rule.
 */
export function hasGeographicFailure(article: NormalizedItem): { fails: boolean; reason: string } {
    const title = (article.title || '').trim();
    const description = (article as any).description || (article as any).summary || '';
    const fullText = `${title} ${description}`;

    // Rule (b): government industrial-development body without target-region property
    if (GOV_INDUSTRIAL_BODY_RE.test(fullText)) {
        if (!TARGET_REGION_PHRASE_RE.test(fullText)) {
            return { fails: true, reason: 'GOV_AGENCY_NO_TARGET_PROPERTY' };
        }
    }

    // Rule (d): listing-aggregator titles (CommercialSearch / LoopNet / PropertyShark
    // / Traded.co / Crexi) — reject if no target NJ/PA/FL token in title or summary.
    // Preserves Huntingdon Valley PA, Jersey City NJ, Doral FL, etc.; kills Valencia
    // CA, Torrance CA, Santa Clarita CA, Morisset NSW, Numancia Spain, etc.
    if (LISTING_AGGREGATOR_SUFFIX_RE.test(title) || GENERIC_LISTING_TITLE_RE.test(title)) {
        if (!TARGET_REGION_PHRASE_RE.test(fullText)) {
            return { fails: true, reason: 'SOURCE_LISTING_AGGREGATOR_NO_TARGET' };
        }
    }

    // Rule (c): primary location is non-target. Find earliest non-target country
    // or non-target US state and earliest target phrase. If non-target appears
    // before target (or no target at all), reject.
    const targetMatch = title.match(TARGET_REGION_PHRASE_RE);
    const excludeStateMatch = title.match(NON_TARGET_US_STATE_RE);
    const excludeCountryMatch = title.match(NON_TARGET_COUNTRY_RE);

    const targetIdx = targetMatch ? title.indexOf(targetMatch[0]) : Infinity;
    const excludeStateIdx = excludeStateMatch ? title.indexOf(excludeStateMatch[0]) : Infinity;
    const excludeCountryIdx = excludeCountryMatch ? title.indexOf(excludeCountryMatch[0]) : Infinity;
    const earliestExclude = Math.min(excludeStateIdx, excludeCountryIdx);

    if (earliestExclude !== Infinity && earliestExclude < targetIdx) {
        return { fails: true, reason: 'PRIMARY_LOCATION_NON_TARGET' };
    }

    // Rule (a): buyer's home market is in-region but the asset is NOT. Pattern:
    //   "<Target> [company noun] buys/acquires/grabs <place> …"
    // The target token is the ACQUIRER (subject, before the deal verb). If NO target token
    // appears in the asset position (after the verb), the property is out-of-region even
    // though a target term is present — the term just names the buyer's home. Catches
    // "Miami investment group buys Temecula industrial park" and "New Jersey-based firm
    // acquires Dallas portfolio". Requiring a target token BEFORE the verb keeps headlines
    // whose subject isn't a target market untouched ("Legacy, Commerce Park grab two
    // Moonachie industrial buildings" has no target token before "grab", so it never fires).
    const verbMatch = title.match(ACQUISITION_VERB_RE);
    if (verbMatch) {
        const verbIdx = title.indexOf(verbMatch[0]);
        const buyerSeg = title.slice(0, verbIdx);
        const assetSeg = title.slice(verbIdx + verbMatch[0].length);
        if (segmentHasTarget(buyerSeg) && !segmentHasTarget(assetSeg)) {
            return { fails: true, reason: 'PRIMARY_LOCATION_NON_TARGET' };
        }
    }

    return { fails: false, reason: '' };
}

export function isTargetRegion(article: NormalizedItem): boolean {
    const text = `${article.title || ''} ${article.description || ''} ${(article as any).summary || ''}`.toUpperCase();
    const url = ((article as any).url || article.link || '').toLowerCase();

    // GUARD: AUTOMATIC GEOGRAPHY FAILURES (Woodmont News Briefing spec rules b + c)
    if (hasGeographicFailure(article).fails) return false;

    // BLOCK: international content — always reject
    if (INTERNATIONAL_EXCLUDE.some(term => text.includes(term))) return false;

    // BLOCK: unapproved source domains
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        if (!APPROVED_DOMAINS.some(d => hostname.includes(d))) return false;
    } catch { /* keep going if URL parse fails */ }

    // INCLUDE if from a NJ/PA/FL regional source
    const isFromRegionalSource = REGIONAL_SOURCES.some(s => url.includes(s));

    // Use geographic-only terms (not CRE company names) for region matching.
    // "CBRE arranges financing in Arizona" should NOT pass because of "CBRE".
    const [geoTargetCount, excludeCount] = countRegionMatches(text);

    if (isFromRegionalSource) {
        if (excludeCount > geoTargetCount && excludeCount >= 1) return false;
        return true;
    }

    if (article.regions && article.regions.length > 0) {
        const hasTarget = article.regions.some(r => TARGET_REGIONS_GEO.some(tr => r.toUpperCase().includes(tr)));
        if (hasTarget) return true;
    }

    const hasGeoTarget = TARGET_REGIONS_GEO.some(r => text.includes(r));
    if (hasGeoTarget && geoTargetCount >= excludeCount) return true;

    return hasGeoTarget && excludeCount === 0;
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
    // East Bay / Tri-Valley (CA) — quarterly broker "market report" titles that carry no
    // NJ/PA/FL token slipped through the relevant-section macro allowance (2026-07-15).
    'PLEASANTON', 'TRI-VALLEY',
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

/**
 * Hard reject if the Woodmont LLM rubric rejected the article at build time.
 * Used at the top of every per-section filter so Tier 3/Tier 4 backfill
 * can't sneak rejected items past the editorial gate.
 *
 * If the article wasn't classified (LLM failed or item is from before the
 * classifier was wired in), pass through — better to ship a rule-filter-OK
 * item than block everything on infrastructure failure.
 */
// The LLM rubric (_woodmontApprove) approves ~0% of availabilities and people — it wasn't
// calibrated for structured LoopNet listings or people-move blurbs, so for THOSE TWO
// sections a `false` verdict isn't a quality signal, it just zeroes the section (verified
// on run 28940971659: 0/34 availabilities and 0/4 people approved). There the rubric is
// ADVISORY: the deterministic gates (target region, industrial/property type, availability/
// people language, finalGate, pre-send scrub, dedup) remain the real quality bar. It stays
// HARD-BLOCKING for transactions and relevant, which the LLM does discriminate.
const RUBRIC_ADVISORY_SECTIONS = new Set<Section>(['availabilities', 'people']);
function passesWoodmontRubric(article: NormalizedItem, diag: DiagnosticContext | undefined, section: Section): boolean {
    const verdict = (article as any)._woodmontApprove;
    if (verdict === false) {
        if (RUBRIC_ADVISORY_SECTIONS.has(section)) {
            // Only OVERRIDE the LLM's 'no' when the item is CLEANLY target-region. A bypass
            // must never ship an item that also carries a non-target major market — e.g. the
            // CoStar people roundup "CBRE promotes Pittsburgh (PA ✓); JLL adds five to Chicago
            // (✗)" passes isTargetRegion on "Pittsburgh" but is off-target mixed content, which
            // is exactly what the LLM was right to reject. If any excluded-market token is
            // present, respect the rejection.
            const [, excludeCount] = countRegionMatches(getText(article).toUpperCase());
            if (excludeCount === 0) {
                // Audit trail: count how often the deterministic gates override the LLM.
                if (diag) diag.recordReject(section, 'RUBRIC_ADVISORY_BYPASS');
                return true;
            }
        }
        if (diag) diag.recordReject(section, 'WOODMONT_RUBRIC_REJECT');
        return false;
    }
    return true;
}

export function applyStrictFilter(items: NormalizedItem[], keywords: string[], sectionName: string, diag?: DiagnosticContext, diagSection?: Section): NormalizedItem[] {
    const filtered = items.filter(article => {
        if (diagSection && !passesWoodmontRubric(article, diag, diagSection)) return false;
        const text = getText(article);
        if (isPolitical(text)) {
            if (diag && diagSection) diag.recordReject(diagSection, 'POLITICAL_CONTENT');
            return false;
        }
        // Industrial gate — reject apartments, retail, office, etc.
        if (!isStrictlyIndustrial(text)) {
            if (diag && diagSection) diag.recordReject(diagSection, 'NOT_INDUSTRIAL');
            return false;
        }
        if (!containsAny(text, keywords)) {
            if (diag && diagSection) diag.recordReject(diagSection, 'NO_RELEVANT_KEYWORDS');
            return false;
        }
        return true;
    });
    console.log(`🔍 ${sectionName}: ${items.length} → ${filtered.length} (strict filter)`);
    return filtered;
}

export function applyTransactionFilter(items: NormalizedItem[], diag?: DiagnosticContext): NormalizedItem[] {
    const filtered = items.filter(article => {
        if (!passesWoodmontRubric(article, diag, 'transactions')) return false;
        const text = getText(article);
        if (isPolitical(text)) { if (diag) diag.recordReject('transactions', 'POLITICAL_CONTENT'); return false; }
        // Hard property-type guard. Office/residential/retail/hospitality/self-storage
        // articles get rejected here even if description is empty (paywalled/title-only
        // items where isIndustrialProperty's EXCLUDE_NON_INDUSTRIAL check would miss them).
        if (hasWrongPropertyType(text) && !hasStrongIndustrialOverride(text)) {
            if (diag) diag.recordReject('transactions', 'WRONG_PROPERTY_TYPE');
            return false;
        }
        if (!isIndustrialProperty(text)) { if (diag) diag.recordReject('transactions', 'NOT_INDUSTRIAL'); return false; }
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
        if (diag) diag.recordReject('transactions', 'BELOW_DEAL_THRESHOLD');
        return false;
    });
    console.log(`🔍 Transactions: ${items.length} → ${filtered.length} (threshold filter)`);
    return filtered;
}

/**
 * A genuine NJ/PA/FL industrial deal that did NOT make the marquee transactions cut —
 * too small, or its size/price isn't stated in the headline (a "full occupancy" or a
 * broker-named lease), or a rubric/domain gate rejected it. Rather than DROP these (they
 * ARE real local deal-flow), the caller routes them into the 'relevant' section so the
 * newsletter carries actual regional deals instead of macro/reserve filler.
 *
 * Deliberately LIGHTER than applyTransactionFilter: no deal-size floor, no Woodmont-rubric
 * or approved-domain gate. Still requires target region + industrial + not-political +
 * not-wrong-asset-class, and a concrete DEAL signal (an action word, an approval, a stated
 * size, or a dollar figure) so vague market commentary doesn't leak in.
 */
export function isRoutableRegionalDeal(article: NormalizedItem): boolean {
    if (!isTargetRegion(article)) return false;
    const text = getText(article);
    if (isPolitical(text)) return false;
    if (hasWrongPropertyType(text) && !hasStrongIndustrialOverride(text)) return false;
    if (!isIndustrialProperty(text)) return false;
    return containsAny(text, TRANSACTION_ACTION_WORDS)
        || containsAny(text, APPROVAL_KEYWORDS)
        || meetsDealThreshold(text).sizeSF !== null
        || /\$\s*\d/.test(text);
}

export function applyAvailabilityFilter(items: NormalizedItem[], diag?: DiagnosticContext): NormalizedItem[] {
    const filtered = items.filter(article => {
        if (!passesWoodmontRubric(article, diag, 'availabilities')) return false;
        const text = getText(article);
        if (isPolitical(text)) { if (diag) diag.recordReject('availabilities', 'POLITICAL_CONTENT'); return false; }
        // Accept availability-specific language
        const availabilityWords = [
            'available', 'for sale', 'for lease', 'listing', 'on the market',
            'seeking buyer', 'buyer wanted', 'now leasing', 'now available',
            'seeking tenants', 'for sublease', 'sublease', 'space available',
            'build-to-suit', 'vacant', 'vacancy', 'delivered', 'spec',
            'under construction', 'breaks ground', 'groundbreaking', 'coming to market',
        ];
        if (containsAny(text, availabilityWords)) return true;
        if (!isIndustrialProperty(text)) { if (diag) diag.recordReject('availabilities', 'NOT_INDUSTRIAL'); return false; }
        const threshold = meetsDealThreshold(text);
        if (threshold.meetsSF || (threshold.sizeSF !== null && threshold.sizeSF > 0)) return true;
        if (diag) diag.recordReject('availabilities', 'SECTION_RULE_FAILED');
        return false;
    });
    console.log(`🔍 Availabilities: ${items.length} → ${filtered.length} (threshold filter)`);
    return filtered;
}

export function applyPeopleFilter(items: NormalizedItem[], diag?: DiagnosticContext): NormalizedItem[] {
    const filtered = items.filter(article => {
        if (!passesWoodmontRubric(article, diag, 'people')) return false;
        const text = getText(article);
        const url = ((article as any).url || article.link || '').toLowerCase();
        if (isPolitical(text)) { if (diag) diag.recordReject('people', 'POLITICAL_CONTENT'); return false; }
        if (containsAny(text, EXCLUDE_FROM_PEOPLE)) { if (diag) diag.recordReject('people', 'EXCLUDED_BY_LIST'); return false; }
        const hasAction = containsAny(text, PEOPLE_ACTION_KEYWORDS);
        const hasIndustrial = containsAny(text, INDUSTRIAL_CONTEXT_KEYWORDS);
        // If title OR body has strong people signal, allow even if body mentions transactions
        const titleUpper = (article.title || '').toUpperCase();
        const titleHasPeopleSignal = /\b(HIRED|APPOINTED|PROMOTED|NAMED|JOINS|JOINED|TAPS|WELCOMES|HIRES|APPOINTS|PROMOTES|NAMES)\b/.test(titleUpper)
            || titleUpper.startsWith('PEOPLE:') || titleUpper.startsWith('PEOPLE |');
        const bodyHasPeopleAction = containsAny(text, ['hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped']);
        // If it's primarily a transaction (and neither title nor body indicate people), skip
        if (!titleHasPeopleSignal && !bodyHasPeopleAction && containsAny(text, TRANSACTION_ACTION_WORDS)) {
            if (diag) diag.recordReject('people', 'CATEGORY_MISMATCH');
            return false;
        }
        if (!hasAction) { if (diag) diag.recordReject('people', 'NO_PEOPLE_ACTION'); return false; }
        if (!hasIndustrial) { if (diag) diag.recordReject('people', 'NOT_INDUSTRIAL'); return false; }
        return true;
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
// SECOND PEOPLE RESCUE (post-backfill) — strict predicate
// =====================================================================

/**
 * Explicit personnel-action verbs allowed to promote a Relevant item into People in the
 * post-backfill second rescue. Kept deliberately TIGHT.
 *
 * 'elevat*' is intentionally NOT here: it matched the marketing verb in "HPS Floors Elevates
 * New Jersey Industrial Facilities … Epoxy" and — with a send-time AI description that passed
 * applyPeopleFilter — relocated a vendor-PR item into People (2026-07-21). "Elevates <product/
 * facility>" marketing is more common than "elevated <to role>" personnel usage, so it's out.
 */
export const PEOPLE_TITLE_ACTION = /\b(hires?|hired|appoints?|appointed|promotes?|promoted|names?|named|joins?|joined|taps?|tapped|welcomes?|recruits?)\b/i;

/**
 * Does a Relevant item qualify to be relocated into People by the post-backfill second rescue?
 * ALL THREE must hold, so a false personnel signal in any one gate can't carry an item in:
 *   (1) the TITLE carries an explicit personnel-action verb (PEOPLE_TITLE_ACTION),
 *   (2) it is target-region, and
 *   (3) it passes the existing People filter.
 * Gate (1) is title-only and description-independent, so an AI-enriched description that adds
 * industrial/facility/company/action language cannot make a non-personnel TITLE qualify.
 */
export function qualifiesForPeopleRescue(article: NormalizedItem): boolean {
    if (!PEOPLE_TITLE_ACTION.test(article.title || '')) return false;
    if (!isTargetRegion(article)) return false;
    return applyPeopleFilter([article]).length > 0;
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
    // WOODMONT_DOCS_DIR override lets the dry-run replay harness point the whole pipeline
    // at a temp dir of FROZEN run-time inputs. Unset in production → real docs/.
    const docsDir = process.env.WOODMONT_DOCS_DIR || path.join(__dirname, '../../docs');
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

interface SentEntry { id: string; sentAt: string; sigs?: string[]; titleKey?: string }
interface SentArticlesData { sent: SentEntry[] }

/**
 * Normalize a headline for cross-day title dedup: strip the trailing " - Publisher"
 * suffix Google News/aggregators append, lowercase, drop punctuation. Two copies of
 * the same syndicated story (e.g. "Florida's … data center development - KPVI" vs
 * "… - AOL.com") collapse to the same key. 2026-06-26.
 */
export function normalizeTitleKey(title: string): string {
    return (title || '')
        .replace(/\s+[-–—|]\s+[^-–—|]*$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Load normalized title keys from articles sent in the last 14 days. Used for
 * cross-day title dedup — catches syndicated same-headline repeats that carry no
 * deal signature (the recurring "Florida data center development" story).
 */
export function loadSentTitleKeys(docsDir: string): Set<string> {
    const sentPath = path.join(docsDir, 'sent-articles.json');
    try {
        if (!fs.existsSync(sentPath)) return new Set();
        const data: SentArticlesData = JSON.parse(fs.readFileSync(sentPath, 'utf-8'));
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const keys = new Set<string>();
        for (const e of data.sent || []) {
            if (new Date(e.sentAt) < fourteenDaysAgo) continue;
            if (e.titleKey && e.titleKey.length >= 25) keys.add(e.titleKey);
        }
        console.log(`📋 Loaded ${keys.size} sent title-keys (last 14 days)`);
        return keys;
    } catch (e) {
        console.warn('Could not load sent title keys:', e);
        return new Set();
    }
}

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
export function saveSentArticles(docsDir: string, sentItems: Array<{ id: string; sigs?: string[]; titleKey?: string }>): void {
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
            ...(item.titleKey ? { titleKey: item.titleKey } : {}),
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
