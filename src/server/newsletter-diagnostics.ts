/**
 * Newsletter Diagnostics — observability layer for the send pipeline.
 *
 * Goal: every send writes a JSON file at docs/diagnostics/newsletter-run-<ts>.json
 * (plus a docs/diagnostics/latest.json mirror) that lets you answer:
 *   - Why was article X rejected?
 *   - Which section is starving and why? (no supply / filtered / deduped)
 *   - Which feeds produce the most usable candidates?
 *   - Which articles ALMOST passed (near-misses)?
 *   - Which backfill tier filled each section's quota?
 *
 * Architecture: DiagnosticContext is instantiated once per send. Filters and
 * pipeline stages call recordReject/recordPass/recordNearMiss/recordFeedCandidate/recordTier
 * as articles flow through. At the end the email pipeline calls toJSON() and
 * writeNewsletterDiagnostics() persists it.
 *
 * SAFETY: this module is OBSERVABILITY ONLY. Filters retain their existing
 * behavior. The diag-context parameter is optional everywhere — passing
 * undefined keeps the legacy behavior 1-for-1, which makes the change low-risk.
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// REASON CODES
// =============================================================================

export const REASON_CODES = [
    // Region/source
    'NO_TARGET_REGION_EVIDENCE',
    'EXCLUDED_NON_TARGET_REGION',
    'REGION_CONFLICT_WEAK_TARGET',
    'SOURCE_NOT_APPROVED',
    'GOV_AGENCY_NO_TARGET_PROPERTY',
    'PRIMARY_LOCATION_NON_TARGET',
    // Industrial/asset class
    'NOT_INDUSTRIAL',
    'WRONG_ASSET_CLASS_OFFICE',
    'WRONG_ASSET_CLASS_MULTIFAMILY',
    'WRONG_ASSET_CLASS_RETAIL',
    // Section rules
    'SECTION_RULE_FAILED',
    'BELOW_DEAL_THRESHOLD',
    'POLITICAL_CONTENT',
    'NO_RELEVANT_KEYWORDS',
    'NO_PEOPLE_ACTION',
    // Dedup
    'DUPLICATE_ID',
    'DUPLICATE_SIGNATURE',
    'DUPLICATE_URL',
    // Freshness
    'STALE_RESERVE_ITEM',
    'STALE_OUTSIDE_WINDOW',
    // Other
    'EXCLUDED_BY_LIST',
    'CATEGORY_MISMATCH',
] as const;
export type ReasonCode = typeof REASON_CODES[number];

// =============================================================================
// PAYLOAD SHAPE
// =============================================================================

export type Section = 'relevant' | 'transactions' | 'availabilities' | 'people';

export interface NearMiss {
    id: string;
    title: string;
    source: string;
    publisher: string;
    url: string;
    score: number;
    reasons: string[];
    date: string;
}

export interface SectionFunnel {
    loaded: number;
    inWindow: number;
    regionPass: number;
    industrialPass: number;
    sectionPass: number;
    dedupRemoved: number;
    stalePruned: number;
    selected: number;
    // Full-lookback supply evidence: qualifying candidates for this section across the
    // 30-day deep pool + reserve pool (independent of what was selected). This is what
    // makes supply-aware coverage honest — a section is only "excused" for shipping
    // empty if this is 0 (the market gave us nothing); if it's >0 but selected is 0,
    // that's a selection/rules failure and coverage is charged in full.
    supplyCandidates: number;
    rejectionReasons: Record<string, number>;
    nearMisses: NearMiss[];
    tierFill: {
        tier1_24h: number;
        tier2_48h_72h: number;
        tier3_30d_deep: number;
        tier4_reserve: number;
        tier5_manual_include: number;
    };
    underfilled: boolean;
    underfillReason: string | null;
}

export interface FeedFunnel {
    fetched: number;
    candidates: number;
    passedFinalGate: number;
    selected: number;
    duplicates: number;
    rejections: Record<string, number>;
    bySection: Record<Section, number>;
}

export interface DiagnosticPayload {
    runId: string;
    generatedAt: string;
    isFriday: boolean;
    sections: Record<Section, SectionFunnel>;
    perFeedBySection: Record<string, FeedFunnel>;
    weekInReview: {
        totalCandidates: number;
        afterAgeFilter: number;
        afterDedup: number;
        selected: number;
        windowDays: number;
    };
    quality?: NewsletterQuality;
    logicImpact?: LogicImpact;
    dcPolicy?: {
        nationalScaleAllowed: Array<{ id: string; title: string; dollarsB: number | null; mw: number | null }>;
        unknownLocationAllowed: Array<{ id: string; title: string; unresolvedLocationTokens: string[] }>;
        rejectedOutOfRegion: Array<{ id: string; title: string; nonTargetTokens: string[] }>;
    };
}

// =============================================================================
// NEWSLETTER QUALITY SCORE
// -----------------------------------------------------------------------------
// Computes THREE reported dimensions for a send (all in NewsletterQuality). Pure
// function: all external data (signatures, prior sends, per-section supply) is passed
// in, so this module stays I/O-free and import-cycle-free.
//
//   1. CONTENT QUALITY — the headline 0-100 score/grade. This is the rubric below.
//   2. DELIVERY RELIABILITY — reported SEPARATELY (delivery.score/grade). late_delivery
//      and manual_send reduce deliveryScore, NOT the headline Content Quality. A late or
//      manually-rescued send can still be content-excellent; timing is an ops metric.
//   3. SUPPLY CONDITIONS — Rich/Normal/Thin, from full-lookback candidate volume.
//
// Content Quality rubric (the approved table):
//   Coverage & balance ....... 30  (sections filled, weighted; SUPPLY-AWARE — an empty
//                                   section with zero market supply is half-excused,
//                                   one with supply>0 but shipped 0 is charged in full)
//   Freshness ................ 25  (tier-weighted avg of selected items)
//   Regional targeting ....... 25  (share of items in NJ/PA/FL; macro = 0.4)
//   Relevance integrity ...... 20  (baseline; eroded only when a leak ships)
//   minus CONTENT penalties: broken -8, dup-in-send -6, cross-day repeat -3,
//                            weak/borderline -3, off-target leak -12  (each occurrence)
//   (Timing penalties are NOT subtracted here — see Delivery Reliability above.)
//
// NOTE: the region/leak regexes here are a SCORING HEURISTIC for observability.
// The send pipeline's FINAL GATE remains the authoritative content filter.
// =============================================================================

export interface QualityBreakdown {
    coverage: number;
    freshness: number;
    regional: number;
    relevanceIntegrity: number;
}
export interface QualityPenalty { type: string; points: number; detail: string; }
export interface NewsletterQuality {
    score: number;        // Content Quality (headline), 0-100, clamped
    outOf10: number;      // score / 10
    grade: string;        // Content Quality grade A / B / C / D / F
    itemCount: number;
    breakdown: QualityBreakdown;
    age: { fresh: number; deep: number; reserve: number }; // ≤72h / 3-30d / reserve backfill
    delivery: { score: number; grade: string };            // Delivery Reliability (shown beside)
    supply: 'Rich' | 'Normal' | 'Thin';                    // Supply Conditions this run
    penalties: QualityPenalty[];
    notes: string[];
    // DUAL-SCORE (2026-08-07) — ADDITIVE observability. `score`/`grade` above are the UNCHANGED
    // operational Content Quality (mirrored here as operationalScore/Grade for the dashboard).
    // editorialQualityScore excludes uncontrollable supply shortages; coverageSupplyScore is a
    // separate section-fill gauge. See computeNewsletterScore for the exact formula.
    operationalScore: number;
    operationalGrade: string;
    editorialQualityScore: number;
    editorialGrade: string;
    coverageSupplyScore: number;                 // 0-100, % of section coverage-weight filled
    supplyStatus: Record<Section, SupplyStatus>; // per-section: why it was/wasn't filled
    // TELEMETRY-ONLY (2026-09-02): section-fill gauge derived purely from the
    // finalized supplyStatus above. Complements `supply`, which measures
    // 30d+reserve market presence and reads Rich even on one-section days
    // (e.g. 2026-09-02: Rich with only Relevant filled). Feeds NOTHING —
    // no scoring, no excusal logic, no CSV schema; JSON consumers only.
    sectionsFilled: number;                                  // 0-4 sections FILLED
    sectionSupplyCondition: 'FULL' | 'PARTIAL' | 'SPARSE';   // 4/4 · 2-3/4 · 0-1/4
}

// Per-section supply classification from the diagnostic funnel (selected/inWindow/sectionPass).
export type SupplyStatus = 'FILLED' | 'NO_FRESH_SUPPLY' | 'QUALITY_REJECTED' | 'SELECTION_GAP';

// =============================================================================
// LOGIC-IMPACT COUNTERS (2026-08-05) — DIAGNOSTICS-ONLY OBSERVABILITY.
// Per-send counts of how often each hardening rule ACTED. Nothing here influences
// routing, selection, scoring, dedup, or email output — the record* functions only
// increment counters and append an audit note. A module singleton accumulates across
// the send (reset at send start via resetLogicImpact); toJSON() snapshots it. The CSV
// consumes the numeric counts only; the JSON keeps a short audit list for traceability.
//   • nearDuplicatesSuppressed        — losers removed by same-send near-title dedup
//   • falseLeaksPrevented             — items with excluded-region evidence whose leak was
//                                       suppressed by an explicit exception (routedClean = a
//                                       correctly-routed in-region deal; mixedComparison = a
//                                       genuine mixed-region macro/policy comparison)
//   • peopleRescued                   — Relevant items moved into People by the rescue pass
//   • crossDayPoolRepeatsSuppressed    — previously-sent records removed from the FULL loaded
//                                       candidate pool by cross-day dedup, BEFORE any region,
//                                       property-type, section, or selection filtering. This is a
//                                       dedup-WORKLOAD metric (load-stage volume), NOT a count of
//                                       duplicate articles that would otherwise have shipped.
// =============================================================================
export interface LogicImpactAudit { id: string; title: string; kind: string; reason?: string; }
export interface LogicImpact {
    nearDuplicatesSuppressed: number;
    falseLeaksPrevented: { total: number; routedClean: number; mixedComparison: number };
    peopleRescued: number;
    crossDayPoolRepeatsSuppressed: number;
    audit: LogicImpactAudit[];
}
function freshLogicImpact(): LogicImpact {
    return {
        nearDuplicatesSuppressed: 0,
        falseLeaksPrevented: { total: 0, routedClean: 0, mixedComparison: 0 },
        peopleRescued: 0,
        crossDayPoolRepeatsSuppressed: 0,
        audit: [],
    };
}
let _logicImpact: LogicImpact = freshLogicImpact();
const LOGIC_AUDIT_CAP = 100;
function pushLogicAudit(e: LogicImpactAudit): void { if (_logicImpact.audit.length < LOGIC_AUDIT_CAP) _logicImpact.audit.push(e); }
const auditId = (it: any) => it?.id || it?.link || it?.url || '';
const auditTitle = (it: any) => (it?.title || '').slice(0, 120);
/** Reset the per-send accumulator. Called once at the start of each send. */
export function resetLogicImpact(): void { _logicImpact = freshLogicImpact(); }
/** Snapshot of the accumulator (referenced by DiagnosticContext.toJSON). */
export function getLogicImpact(): LogicImpact { return _logicImpact; }
export function recordNearDuplicateSuppressed(loser: any): void {
    _logicImpact.nearDuplicatesSuppressed++;
    pushLogicAudit({ id: auditId(loser), title: auditTitle(loser), kind: 'near_duplicate_suppressed' });
}
export function recordFalseLeakPrevented(item: any, reason: 'routedClean' | 'mixedComparison'): void {
    _logicImpact.falseLeaksPrevented.total++;
    _logicImpact.falseLeaksPrevented[reason]++;
    pushLogicAudit({ id: auditId(item), title: auditTitle(item), kind: 'false_leak_prevented', reason });
}
export function recordPeopleRescued(item: any): void {
    _logicImpact.peopleRescued++;
    pushLogicAudit({ id: auditId(item), title: auditTitle(item), kind: 'people_rescued' });
}
export function recordCrossDayPoolRepeatSuppressed(item: any, reason: string): void {
    _logicImpact.crossDayPoolRepeatsSuppressed++;
    pushLogicAudit({ id: auditId(item), title: auditTitle(item), kind: 'cross_day_pool_repeat_suppressed', reason });
}

// Section fill weights — sum to 30. Transactions valued highest (real deals).
const COVERAGE_WEIGHTS: Record<Section, number> = {
    transactions: 10, relevant: 8, availabilities: 6, people: 6,
};
// Freshness weight per backfill tier.
const TIER_WEIGHTS: Record<keyof SectionFunnel['tierFill'], number> = {
    tier1_24h: 1.0, tier2_48h_72h: 0.85, tier3_30d_deep: 0.5, tier4_reserve: 0.3, tier5_manual_include: 0.7,
};
const PENALTY = { broken: 8, dupInSend: 6, repeatCrossDay: 3, weak: 3, leak: 12, manualSend: 5 };
// Delivery-timing config. Target is 7:30 AM ET (2026-08-31, was 8:30); a 30-min grace absorbs GitHub's
// normal cron lag, then -1 per 15 min late, capped so timing can't tank a
// content-perfect send on its own.
const TIMING = { graceMinutes: 30, minutesPerPoint: 15, lateCap: 10 };

// Target regions (NJ/PA/FL) — major cities/counties + corridors. Subset of the
// send pipeline's TARGET_REGION_PATTERN, kept compact on purpose.
const REGION_RX = /\b(nj|new jersey|newark|edison|piscataway|robbinsville|trenton|camden|woodbridge|elizabeth|paterson|lakewood|middlesex|essex|bergen|hudson county|morris county|meadowlands|turnpike|bayonne|elmwood park|garfield|north brunswick|pa|pennsylvania|philadelphia|philly|allentown|lehigh|bucks county|montgomery county|chester county|pittsburgh|lancaster|harrisburg|carlisle|bethlehem|easton|king of prussia|fl|florida|miami|orlando|doral|jacksonville|tampa|clearwater|broward|pompano|hialeah|medley|fort lauderdale|palm beach|miami-dade|fort myers|ft\.?\s*myers|naples|sarasota|lakeland|deltona|st\.?\s*petersburg|brevard|volusia|space coast)\b/i;
// National macro industrial framing (acceptable, partial credit).
const MACRO_RX = /\b(industrial market|warehouse market|warehouse demand|logistics market|reit|supply chain|freight market|e-commerce|build-to-suit|spec development|industrial outlook|market report|national industrial|us industrial|u\.s\. industrial|industrial sector|industrial fund|industrial portfolio|industrial real estate|warehouse real estate|cold storage market|vacancy rate|absorption|data center)\b/i;
// Concrete industrial-RE signal — its ABSENCE on a non-target item flags "weak".
const INDUSTRIAL_SIGNAL_RX = /\b(warehouse|industrial|logistics|distribution|fulfillment|manufactur|lease|sublease|\bsf\b|square (foot|feet)|acre|\$\s?\d|port|cold storage|spec|build-to-suit|big.?box|last.?mile|developer|portfolio|tenant)\b/i;
// Positive wrong-region / wrong-asset evidence — a genuine leak (worst penalty).
// Exported so the region-leak test can lock the exact vocabulary.
export const EXCLUDED_REGION_RX = /\b(california|texas|chicago|illinois|ohio|atlanta|georgia|arizona|phoenix|nevada|seattle|denver|oahu|hawaii|tennessee|alabama|india|china|france|toulouse|australia|nsw|canada|mexico|united kingdom)\b|\b(rite aid|pharmacy|apartment complex|multifamily|retail mall|office tower)\b/i;
// Non-real-estate junk that keyword-matches industrial terms but must never ship:
// animal-welfare/wildlife (e.g. "sloth … warehouse rescue", 2026-06-25 leak) and
// scraped pagination/index pages ("Industrial – Page 360"). Penalized as a leak.
export const NON_RE_JUNK_RX = /\b(sloths?|animal (?:rescue|welfare|cruelty|shelter|sanctuary|abuse)|wildlife|\bzoo\b|menagerie|rescued animals?)\b|[-–—]\s*page\s+\d+\b/i;

function round1(n: number): number { return Math.round(n * 10) / 10; }
function itemText(it: any): string {
    return `${it.title || ''} ${it.description || it.summary || ''} ${it.content_text || ''}`;
}

// Comparative / policy framing cue — used ONLY for the mixed-region leak exception (Rule C).
const COMPARE_CUE = /\b(and|vs\.?|versus|compared|comparison|approaches|both|either|between|outpaces?|leads?|trails?)\b/i;
// Strip a trailing " - Publisher" suffix so publisher names ("… - RE-NJ") never count as in-title
// region evidence for the mixed-comparison exception.
function stripPublisherSuffix(title: string): string {
    return (title || '').replace(/\s+[-–—]\s+[^-–—]*$/, '');
}

/**
 * Region-leak verdict (Rule C, 2026-08-03). An excluded-region token is a leak UNLESS the item is
 * either (a) a correctly-routed target-market item (`routedClean` — the buyer-HQ case, e.g. a Denver
 * firm buying a Philadelphia portfolio), or (b) a genuine mixed-region MACRO/POLICY comparison:
 * BOTH a target and an excluded token in the TITLE CORE (publisher suffix stripped, so body-only or
 * publisher-suffix evidence never qualifies), a comparative/macro cue, AND the item is in the
 * RELEVANT section (send-time placement — a property TRANSACTION that merely names a comparison still
 * leaks). `section` MUST be the scorer's send-time section, not a stale feed.json category.
 * NON_RE_JUNK_RX is independent of this and handled by the caller.
 */
export function isRegionLeak(it: any, section: Section, routedClean: boolean): boolean {
    const text = itemText(it);
    if (!EXCLUDED_REGION_RX.test(text)) return false;
    if (routedClean) return false;
    const titleCore = stripPublisherSuffix(it.title || '');
    const mixedComparison =
        EXCLUDED_REGION_RX.test(titleCore) && REGION_RX.test(titleCore) &&
        (COMPARE_CUE.test(titleCore) || MACRO_RX.test(text)) &&
        section === 'relevant';
    return !mixedComparison;
}
function regionScoreOf(it: any): number {
    const tagged = [it.region, ...(it.regions || []), ...(it.tags || [])]
        .filter(Boolean).map(String).join(' ');
    if (/\b(NJ|PA|FL)\b/.test(tagged)) return 1;
    const text = itemText(it);
    if (REGION_RX.test(text)) return 1;
    if (MACRO_RX.test(text)) return 0.4;
    return 0;
}
function isBrokenTitle(it: any): boolean {
    const t = (it.title || '').trim();
    // empty, stub, single-token, or a scraped pagination/index page ("… – Page 360")
    return t.length < 20 || !/\s/.test(t) || /[-–—]\s*page\s+\d+\b/i.test(t);
}
// Exported so candidate-stage within-send dedup reuses ONE definition of near-title
// similarity (rather than maintaining a second fuzzy-title implementation). See
// dedupeByNearTitle in newsletter-filters.ts.
export function normTitle(title: string): string {
    return (title || '').toLowerCase()
        .replace(/\s+[-–—]\s+[^-–—]*$/, '') // strip trailing " - Source" suffix
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}
export function titlesSimilar(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    const sa = new Set(a.split(' ').filter(w => w.length > 3));
    const sb = new Set(b.split(' ').filter(w => w.length > 3));
    if (sa.size === 0 || sb.size === 0) return false;
    let inter = 0;
    for (const w of sa) if (sb.has(w)) inter++;
    const jaccard = inter / (sa.size + sb.size - inter);
    return jaccard >= 0.6;
}

export function computeNewsletterScore(
    payload: DiagnosticPayload,
    selected: Record<Section, any[]>,
    opts: { sigOf: (it: any) => string[]; recentSigs: Set<string>; timing?: { lateMinutes: number; manual: boolean };
        // Routing region verdict (2026-08-03): true when the item is a correctly-routed target-market
        // item (isTargetRegion && !hasGeographicFailure). Reused by the region-leak so a buyer-HQ token
        // in an in-region deal isn't flagged. When absent, routedClean is false (old strictness).
        regionOk?: (it: any) => boolean }
): NewsletterQuality {
    const order: Section[] = ['relevant', 'transactions', 'availabilities', 'people'];
    const allItems = order.flatMap(s => selected[s] || []);
    const itemCount = allItems.length;

    // ---- Coverage & balance (30), SUPPLY-AWARE ----
    // A filled section earns its full weight. An EMPTY section is judged by its
    // full-lookback supply (30-day + reserve, recorded on the funnel):
    //   • supply > 0 but shipped 0  → selection FAILURE → 0 credit (full penalty).
    //   • supply == 0 (market gave nothing) → EXCUSED, but only PARTIAL credit
    //     (EXCUSE_FRACTION). A thin-market day is genuinely a thinner briefing for the
    //     reader, so it should land ~C, not be handed an A — supply-aware must not
    //     become a licence to score weak sends as excellent. The Supply label carries
    //     the "not our fault" context; coverage stays honest about completeness.
    const EXCUSE_FRACTION = 0.5;
    let coverage = 0;
    const emptySections: string[] = [];    // empty AND had supply → charged
    const excusedSections: string[] = [];  // empty AND no supply → partial credit
    for (const s of order) {
        const w = COVERAGE_WEIGHTS[s];
        const filled = (selected[s] || []).length > 0;
        const supplyN = payload.sections[s]?.supplyCandidates ?? 0;
        if (filled) coverage += w;
        else if (supplyN > 0) emptySections.push(s);            // charged: +0
        else { excusedSections.push(s); coverage += EXCUSE_FRACTION * w; }
    }

    // ---- Freshness (25): tier-weighted average across all selected items ----
    // Also break out the article-age mix so we can TRACK that new articles are
    // prioritized over old ones. Tiers already encode age (the pipeline fills
    // 24h → 48-72h → 30-day → reserve, in that order, and excludes already-sent
    // items). fresh = ≤72h (genuinely new); deep = 3-30d backfill; reserve = pool
    // backfill (present only because no edition should ship < 5 articles).
    let tierWeighted = 0, tierTotal = 0;
    let freshItems = 0, deepItems = 0, reserveItems = 0;
    for (const s of order) {
        const tf = payload.sections[s].tierFill;
        (Object.keys(TIER_WEIGHTS) as (keyof typeof TIER_WEIGHTS)[]).forEach(k => {
            tierWeighted += tf[k] * TIER_WEIGHTS[k];
            tierTotal += tf[k];
        });
        freshItems += tf.tier1_24h + tf.tier2_48h_72h;
        deepItems += tf.tier3_30d_deep;
        reserveItems += tf.tier4_reserve + tf.tier5_manual_include;
    }
    const freshness = tierTotal > 0 ? 25 * (tierWeighted / tierTotal) : 0;

    // ---- Regional targeting (25) ----
    const regionSum = allItems.reduce((a, it) => a + regionScoreOf(it), 0);
    const regional = itemCount > 0 ? 25 * (regionSum / itemCount) : 0;

    // ---- Relevance integrity (20): baseline, leaks deducted via penalties ----
    const relevanceIntegrity = 20;

    // ---- Penalties ----
    const penalties: QualityPenalty[] = [];
    const label = (it: any) => `"${(it.title || '').slice(0, 48)}"`;

    // Broken / malformed items
    allItems.forEach(it => {
        if (isBrokenTitle(it)) penalties.push({ type: 'broken_item', points: PENALTY.broken, detail: `Empty/malformed title: ${label(it)}` });
    });

    // Within-send duplicates: signature collision OR near-identical title
    const sigFirst = new Map<string, number>();
    const norms = allItems.map(it => normTitle(it.title || ''));
    const dupFlagged = new Set<number>();
    for (let i = 0; i < allItems.length; i++) {
        const sigs = (opts.sigOf(allItems[i]) || []).filter(Boolean);
        let isDup = false;
        for (const sig of sigs) {
            if (sigFirst.has(sig)) isDup = true; else sigFirst.set(sig, i);
        }
        if (!isDup) {
            for (let j = 0; j < i; j++) { if (titlesSimilar(norms[i], norms[j])) { isDup = true; break; } }
        }
        if (isDup && !dupFlagged.has(i)) {
            dupFlagged.add(i);
            penalties.push({ type: 'duplicate_in_send', points: PENALTY.dupInSend, detail: `Repeats another item in this send: ${label(allItems[i])}` });
        }
    }

    // Cross-day repeats (deal signature seen in the rolling sent window)
    allItems.forEach(it => {
        const sigs = (opts.sigOf(it) || []).filter(Boolean);
        if (sigs.some(s => opts.recentSigs.has(s))) {
            penalties.push({ type: 'repeat_cross_day', points: PENALTY.repeatCrossDay, detail: `Deal already sent in the last 14 days: ${label(it)}` });
        }
    });

    // Off-target leaks (-12) and weak/borderline items (-3). Iterated per-section so the region-leak
    // (Rule C) can use the item's SEND-TIME placement, not a stale feed.json category.
    for (const section of order) {
        for (const it of (selected[section] || [])) {
            const text = itemText(it);
            const routedClean = opts.regionOk ? opts.regionOk(it) : false;
            const leaked = isRegionLeak(it, section, routedClean);
            // OBSERVABILITY (no behavior change): an item carrying excluded-region evidence whose
            // leak was suppressed by an explicit exception (routing verdict or mixed-region rule).
            if (!leaked && EXCLUDED_REGION_RX.test(text)) {
                recordFalseLeakPrevented(it, routedClean ? 'routedClean' : 'mixedComparison');
            }
            if (leaked || NON_RE_JUNK_RX.test(text)) {
                penalties.push({ type: 'leak', points: PENALTY.leak, detail: `Off-target / non-RE content shipped: ${label(it)}` });
            } else if (regionScoreOf(it) < 1 && !INDUSTRIAL_SIGNAL_RX.test(text)) {
                penalties.push({ type: 'weak_item', points: PENALTY.weak, detail: `Borderline / off-topic: ${label(it)}` });
            }
        }
    }

    // ---- Delivery timing: lateness + manual-intervention penalties ----
    // Recorded in penalties[] (so the CSV lateDelivery/manualSend columns populate), but
    // these feed DELIVERY RELIABILITY only — they are filtered OUT of the content penalty
    // total below and drive deliveryScore instead. Lateness/manual-rescue is an ops
    // signal, not a comment on how good the content is.
    if (opts.timing) {
        const overGrace = Math.max(0, opts.timing.lateMinutes - TIMING.graceMinutes);
        if (overGrace > 0) {
            const pts = Math.min(TIMING.lateCap, Math.ceil(overGrace / TIMING.minutesPerPoint));
            penalties.push({ type: 'late_delivery', points: pts, detail: `Delivered ~${opts.timing.lateMinutes} min past the 7:30 AM ET target` });
        }
        if (opts.timing.manual) {
            penalties.push({ type: 'manual_send', points: PENALTY.manualSend, detail: 'Sent by manual dispatch — the scheduled automation did not self-deliver' });
        }
    }

    const gradeOf = (n: number) => n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 70 ? 'C' : n >= 60 ? 'D' : 'F';

    // Split the penalties: CONTENT quality vs DELIVERY reliability. Timing/manual
    // penalties describe HOW it was delivered, not how good the content is, so they
    // form a separate Delivery score and do NOT drag the headline Content grade.
    const DELIVERY_PENALTY_TYPES = new Set(['late_delivery', 'manual_send']);
    const contentPenaltyTotal = penalties.filter(p => !DELIVERY_PENALTY_TYPES.has(p.type)).reduce((a, p) => a + p.points, 0);
    const deliveryPenaltyTotal = penalties.filter(p => DELIVERY_PENALTY_TYPES.has(p.type)).reduce((a, p) => a + p.points, 0);

    // Headline = Content Quality.
    const positive = coverage + freshness + regional + relevanceIntegrity;
    const score = Math.max(0, Math.min(100, Math.round(positive - contentPenaltyTotal)));
    const grade = gradeOf(score);

    // Delivery Reliability — 100 minus timing penalties (shown beside, NOT blended in).
    const deliveryScore = Math.max(0, Math.min(100, 100 - deliveryPenaltyTotal));

    // Supply Conditions — what the market gave us this run (full-lookback candidates).
    const totalSupply = order.reduce((a, s) => a + (payload.sections[s]?.supplyCandidates ?? 0), 0);
    const sectionsWithSupply = order.filter(s => (payload.sections[s]?.supplyCandidates ?? 0) > 0).length;
    const supply: 'Rich' | 'Normal' | 'Thin' =
        (sectionsWithSupply >= 3 && totalSupply >= 25) ? 'Rich'
        : (sectionsWithSupply <= 1 || totalSupply < 8) ? 'Thin'
        : 'Normal';

    const notes: string[] = [];
    if (itemCount === 0) notes.push('No items selected — empty send');
    // NOTE: the human-readable empty-section notes are emitted BELOW, after `supplyStatus` is
    // computed, so they derive from the SAME fresh-supply classification and can never contradict it
    // (see the note-generation block after supplyStatus). The `emptySections`/`excusedSections`
    // buckets above feed COVERAGE SCORING ONLY and are intentionally left untouched.

    // ---- DUAL-SCORE (2026-08-07) — ADDITIVE ONLY. The operational `score`/`grade` above are NOT
    // touched. Editorial Quality re-weights coverage over CONTROLLABLE sections and keeps every
    // content penalty; Coverage/Supply is a separate section-fill gauge. CONSERVATIVE calibration:
    // only NO_FRESH_SUPPLY (zero fresh candidates in-window) is excused from the editorial coverage
    // denominator. QUALITY_REJECTED and SELECTION_GAP BOTH stay in the denominator and penalize —
    // because the funnel (sectionPass==0) cannot distinguish "correctly rejected, no viable eligible
    // candidate" from an over-strict gate that dropped a viable one, so we do not forgive it in v1.
    const supplyStatusOf = (s: Section): SupplyStatus => {
        const sec = payload.sections[s];
        if ((sec?.selected ?? 0) > 0) return 'FILLED';
        if ((sec?.inWindow ?? 0) === 0) return 'NO_FRESH_SUPPLY';
        if ((sec?.sectionPass ?? 0) === 0) return 'QUALITY_REJECTED';
        return 'SELECTION_GAP';
    };
    const supplyStatus = {
        relevant: supplyStatusOf('relevant'), transactions: supplyStatusOf('transactions'),
        availabilities: supplyStatusOf('availabilities'), people: supplyStatusOf('people'),
    } as Record<Section, SupplyStatus>;
    let filledWeight = 0, ctrlWeight = 0;
    for (const s of order) {
        const st = supplyStatus[s];
        if (st === 'FILLED') { filledWeight += COVERAGE_WEIGHTS[s]; ctrlWeight += COVERAGE_WEIGHTS[s]; }
        else if (st === 'SELECTION_GAP' || st === 'QUALITY_REJECTED') { ctrlWeight += COVERAGE_WEIGHTS[s]; }
        // NO_FRESH_SUPPLY: excluded from both numerator and denominator (uncontrollable).
    }
    const editorialCoverage = ctrlWeight > 0 ? 30 * (filledWeight / ctrlWeight) : 30;
    const editorialQualityScore = Math.max(0, Math.min(100, Math.round(editorialCoverage + freshness + regional + relevanceIntegrity - contentPenaltyTotal)));
    const coverageSupplyScore = Math.max(0, Math.min(100, Math.round(100 * filledWeight / 30)));

    // Human-readable empty-section notes (2026-08-10) — derived from the SAME `supplyStatus`
    // classification (keyed on inWindow/sectionPass), so a note can never contradict supplyStatus.
    // This is a DIFFERENT pool concept from the coverage-scoring excusal above
    // (`emptySections`/`excusedSections`, keyed on `supplyCandidates` = the full 90-day/reserve pool).
    // The two intentionally answer different questions and are BOTH correct:
    //   • coverage scoring asks "was ANY candidate available to have filled this section?" (pool)
    //   • this note asks "was there FRESH in-window supply this cycle?" (freshness)
    // e.g. a weekend People section with stale reserve candidates but zero fresh items is
    // NO_FRESH_SUPPLY here (accurate) yet still CHARGED by coverage (supplyCandidates > 0) — not a
    // contradiction once the note says "no fresh in-window supply" instead of "selection gap".
    const emptyBySupply: Record<Exclude<SupplyStatus, 'FILLED'>, Section[]> = { NO_FRESH_SUPPLY: [], QUALITY_REJECTED: [], SELECTION_GAP: [] };
    for (const s of order) { const st = supplyStatus[s]; if (st !== 'FILLED') emptyBySupply[st].push(s); }
    if (emptyBySupply.SELECTION_GAP.length) notes.push(`Empty — fresh supply present but not selected (selection gap): ${emptyBySupply.SELECTION_GAP.join(', ')}`);
    if (emptyBySupply.QUALITY_REJECTED.length) notes.push(`Empty — fresh supply rejected by section gates (quality): ${emptyBySupply.QUALITY_REJECTED.join(', ')}`);
    if (emptyBySupply.NO_FRESH_SUPPLY.length) notes.push(`Empty — no fresh in-window supply (NO_FRESH_SUPPLY): ${emptyBySupply.NO_FRESH_SUPPLY.join(', ')}`);

    // Telemetry-only section-fill gauge (see NewsletterQuality) — derived from
    // the finalized supplyStatus, used by nothing downstream.
    const sectionsFilled = order.filter(s => supplyStatus[s] === 'FILLED').length;
    const sectionSupplyCondition: 'FULL' | 'PARTIAL' | 'SPARSE' =
        sectionsFilled === 4 ? 'FULL' : sectionsFilled >= 2 ? 'PARTIAL' : 'SPARSE';

    return {
        score, outOf10: round1(score / 10), grade, itemCount,
        operationalScore: score, operationalGrade: grade,
        editorialQualityScore, editorialGrade: gradeOf(editorialQualityScore),
        coverageSupplyScore, supplyStatus, sectionsFilled, sectionSupplyCondition,
        breakdown: {
            coverage: round1(coverage),
            freshness: round1(freshness),
            regional: round1(regional),
            relevanceIntegrity,
        },
        age: { fresh: freshItems, deep: deepItems, reserve: reserveItems },
        delivery: { score: deliveryScore, grade: gradeOf(deliveryScore) },
        supply,
        penalties, notes,
    };
}

// =============================================================================
// DIAGNOSTIC CONTEXT — instantiated per send, mutates as pipeline runs
// =============================================================================

const NEAR_MISS_CAP = 50;        // max near-miss items per section
const NEAR_MISS_FLOOR_DELTA = 20; // only track if score >= section_floor - 20

export class DiagnosticContext {
    private runId: string;
    private generatedAt: string;
    private isFriday: boolean;
    private sections: Record<Section, SectionFunnel>;
    private perFeed: Map<string, FeedFunnel> = new Map();
    private weekInReview: DiagnosticPayload['weekInReview'];
    private quality?: NewsletterQuality;
    private dcPolicy?: DiagnosticPayload['dcPolicy'];

    constructor(opts: { isFriday?: boolean } = {}) {
        const now = new Date();
        this.runId = now.toISOString().slice(0, 16).replace('T', '-').replace(':', '');
        this.generatedAt = now.toISOString();
        this.isFriday = opts.isFriday ?? (now.getDay() === 5);
        this.sections = {
            relevant: this.emptySection(),
            transactions: this.emptySection(),
            availabilities: this.emptySection(),
            people: this.emptySection(),
        };
        this.weekInReview = {
            totalCandidates: 0, afterAgeFilter: 0, afterDedup: 0, selected: 0, windowDays: 7,
        };
    }

    private emptySection(): SectionFunnel {
        return {
            loaded: 0, inWindow: 0, regionPass: 0, industrialPass: 0, sectionPass: 0,
            dedupRemoved: 0, stalePruned: 0, selected: 0, supplyCandidates: 0,
            rejectionReasons: Object.fromEntries(REASON_CODES.map(r => [r, 0])),
            nearMisses: [],
            tierFill: { tier1_24h: 0, tier2_48h_72h: 0, tier3_30d_deep: 0, tier4_reserve: 0, tier5_manual_include: 0 },
            underfilled: false,
            underfillReason: null,
        };
    }

    // ---------- Section-level recording ----------

    /** Increment a stage counter for a section (loaded/inWindow/regionPass/etc.) */
    recordStage(section: Section, stage: keyof SectionFunnel, delta: number = 1) {
        const sec = this.sections[section];
        if (typeof sec[stage] === 'number') (sec[stage] as any) += delta;
    }

    /** Record an article rejection — increments the reason count. */
    recordReject(section: Section, reason: string) {
        const sec = this.sections[section];
        sec.rejectionReasons[reason] = (sec.rejectionReasons[reason] || 0) + 1;
    }

    /** Capture a near-miss article — bounded list, only items scoring within
     *  NEAR_MISS_FLOOR_DELTA of the section's score floor are kept, capped at NEAR_MISS_CAP. */
    recordNearMiss(section: Section, item: {
        id?: string; title?: string; source?: string; publisher?: string; url?: string;
        link?: string; date?: string; score: number; floor: number; reasons: string[];
    }) {
        const sec = this.sections[section];
        if (item.score < item.floor - NEAR_MISS_FLOOR_DELTA) return; // too far below
        sec.nearMisses.push({
            id: item.id || '',
            title: (item.title || '').substring(0, 200),
            source: item.source || '',
            publisher: item.publisher || '',
            url: item.url || item.link || '',
            score: item.score,
            reasons: item.reasons,
            date: item.date || '',
        });
        // Keep top NEAR_MISS_CAP by score (descending)
        if (sec.nearMisses.length > NEAR_MISS_CAP * 2) {
            sec.nearMisses.sort((a, b) => b.score - a.score);
            sec.nearMisses.length = NEAR_MISS_CAP;
        }
    }

    /** Mark a backfill tier fill — used by the email.ts backfill cascade. */
    recordTier(section: Section, tier: keyof SectionFunnel['tierFill'], delta: number = 1) {
        this.sections[section].tierFill[tier] += delta;
    }

    /** Set final selected count + underfill flag. */
    finalizeSection(section: Section, selectedCount: number, minRequired: number) {
        const sec = this.sections[section];
        sec.selected = selectedCount;
        if (selectedCount < minRequired) {
            sec.underfilled = true;
            sec.underfillReason = 'SECTION_UNDERFILLED_QUALITY_PROTECTED';
        }
    }

    // ---------- Per-feed recording ----------

    private getFeed(name: string): FeedFunnel {
        if (!this.perFeed.has(name)) {
            this.perFeed.set(name, {
                fetched: 0, candidates: 0, passedFinalGate: 0, selected: 0, duplicates: 0,
                rejections: {}, bySection: { relevant: 0, transactions: 0, availabilities: 0, people: 0 },
            });
        }
        return this.perFeed.get(name)!;
    }

    recordFeedCandidate(feedName: string, decision: 'candidate' | 'gate-pass' | 'selected' | 'duplicate' | 'rejected', reason?: string, section?: Section) {
        if (!feedName) return;
        const feed = this.getFeed(feedName);
        if (decision === 'candidate') feed.candidates++;
        else if (decision === 'gate-pass') feed.passedFinalGate++;
        else if (decision === 'selected') {
            feed.selected++;
            if (section) feed.bySection[section]++;
        } else if (decision === 'duplicate') feed.duplicates++;
        else if (decision === 'rejected' && reason) {
            feed.rejections[reason] = (feed.rejections[reason] || 0) + 1;
        }
    }

    /** Bulk-set the fetched count from feed-health.json data. */
    setFeedFetched(feedName: string, fetched: number) {
        if (!feedName) return;
        const feed = this.getFeed(feedName);
        feed.fetched = fetched;
    }

    // ---------- Week-in-Review recording ----------

    recordWeekInReview(stats: Partial<DiagnosticPayload['weekInReview']>) {
        Object.assign(this.weekInReview, stats);
    }

    /** Attach the computed quality score so it lands in the run JSON. */
    recordQuality(quality: NewsletterQuality) {
        this.quality = quality;
    }

    /** Attach the DC-policy routing decisions (national-scale/unknown allowed, out-of-region rejected). */
    recordDcPolicy(dc: DiagnosticPayload['dcPolicy']) {
        this.dcPolicy = dc;
    }

    // ---------- Output ----------

    toJSON(): DiagnosticPayload {
        // Final sort + cap on near-misses for each section
        for (const sec of Object.values(this.sections)) {
            sec.nearMisses.sort((a, b) => b.score - a.score);
            if (sec.nearMisses.length > NEAR_MISS_CAP) sec.nearMisses.length = NEAR_MISS_CAP;
        }
        return {
            runId: this.runId,
            generatedAt: this.generatedAt,
            isFriday: this.isFriday,
            sections: this.sections,
            perFeedBySection: Object.fromEntries(this.perFeed),
            weekInReview: this.weekInReview,
            ...(this.quality ? { quality: this.quality } : {}),
            logicImpact: getLogicImpact(),
            ...(this.dcPolicy ? { dcPolicy: this.dcPolicy } : {}),
        };
    }
}

// =============================================================================
// FILE I/O
// =============================================================================

const RETAIN_RUNS = 30;

export function writeNewsletterDiagnostics(docsDir: string, payload: DiagnosticPayload): void {
    if (!payload?.runId || !payload?.generatedAt || !payload?.sections) {
        throw new Error('Invalid diagnostics payload — missing required fields');
    }
    const ddir = path.join(docsDir, 'diagnostics');
    fs.mkdirSync(ddir, { recursive: true });
    const file = path.join(ddir, `newsletter-run-${payload.runId}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
    fs.writeFileSync(path.join(ddir, 'latest.json'), JSON.stringify(payload, null, 2) + '\n', 'utf-8');
    // Prune older runs beyond RETAIN_RUNS
    try {
        const runs = fs.readdirSync(ddir)
            .filter(f => /^newsletter-run-.+\.json$/.test(f))
            .sort()
            .reverse();
        for (const old of runs.slice(RETAIN_RUNS)) {
            fs.unlinkSync(path.join(ddir, old));
        }
    } catch (e) {
        console.warn('⚠️ Diagnostic prune failed:', (e as Error).message);
    }
}

// =============================================================================
// QUALITY HISTORY — rolling per-send log that powers the trendline (quality.html)
// =============================================================================

const QUALITY_HISTORY_RETAIN = 90;

export interface QualityHistoryEntry {
    date: string;       // YYYY-MM-DD
    runId: string;
    score: number;
    outOf10: number;
    grade: string;
    itemCount: number;
    breakdown: QualityBreakdown;
    age?: { fresh: number; deep: number; reserve: number };
    delivery?: { score: number; grade: string };  // Delivery Reliability (Phase 1+)
    supply?: 'Rich' | 'Normal' | 'Thin';           // Supply Conditions (Phase 1+)
    penalties: { type: string; points: number }[];
    backfill?: boolean;
}

// Penalty types we surface as their own CSV columns (counts per send).
const PENALTY_TYPES = ['broken_item', 'duplicate_in_send', 'repeat_cross_day', 'weak_item', 'leak', 'late_delivery', 'manual_send'] as const;
const CSV_COLUMNS = [
    'date', 'runId', 'score', 'outOf10', 'grade', 'itemCount',
    'coverage', 'freshness', 'regional', 'relevanceIntegrity',
    'freshItems', 'deepItems', 'reserveItems',
    'penaltyTotal', 'brokenItems', 'duplicatesInSend', 'crossDayRepeats', 'weakItems', 'leaks',
    'lateDelivery', 'manualSend',
    // Phase 1: content score is the `score` column above (headline); these are the two
    // dimensions shown beside it — Delivery Reliability (0-100) and Supply Conditions.
    'deliveryScore', 'supplyCondition',
];

function entryToCsvRow(e: QualityHistoryEntry): string {
    const counts: Record<string, number> = {};
    let penaltyTotal = 0;
    for (const p of e.penalties) { counts[p.type] = (counts[p.type] || 0) + 1; penaltyTotal += p.points; }
    const age = e.age || { fresh: 0, deep: 0, reserve: 0 };
    const vals = [
        e.date, e.runId, e.score, e.outOf10, e.grade, e.itemCount,
        e.breakdown.coverage, e.breakdown.freshness, e.breakdown.regional, e.breakdown.relevanceIntegrity,
        age.fresh, age.deep, age.reserve,
        penaltyTotal,
        counts['broken_item'] || 0, counts['duplicate_in_send'] || 0, counts['repeat_cross_day'] || 0,
        counts['weak_item'] || 0, counts['leak'] || 0,
        counts['late_delivery'] || 0, counts['manual_send'] || 0,
        e.delivery?.score ?? '', e.supply ?? '',
    ];
    return vals.join(',');
}

/**
 * Append (or replace same-date) the day's quality score. Writes BOTH:
 *   - docs/quality-scores.json — rich record (breakdown + per-penalty detail)
 *   - docs/quality-scores.csv  — flat, one row per send, Power BI / Excel ready
 * The CSV is the recommended source for Power BI (Get Data → Web → the raw URL);
 * it auto-refreshes as new sends append rows, no nested-record expansion needed.
 */
export function writeQualityHistory(docsDir: string, date: string, runId: string, q: NewsletterQuality): void {
    const file = path.join(docsDir, 'quality-scores.json');
    let hist: { updatedAt: string; history: QualityHistoryEntry[] } = { updatedAt: '', history: [] };
    try {
        if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (Array.isArray(parsed.history)) hist = parsed;
        }
    } catch { /* start fresh on corrupt file */ }

    const entry: QualityHistoryEntry = {
        date, runId,
        score: q.score, outOf10: q.outOf10, grade: q.grade, itemCount: q.itemCount,
        breakdown: q.breakdown,
        age: q.age,
        delivery: q.delivery,
        supply: q.supply,
        penalties: q.penalties.map(p => ({ type: p.type, points: p.points })),
    };
    // One entry per day — a re-send replaces the day's prior entry.
    hist.history = hist.history.filter(e => e.date !== date);
    hist.history.push(entry);
    hist.history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (hist.history.length > QUALITY_HISTORY_RETAIN) {
        hist.history = hist.history.slice(-QUALITY_HISTORY_RETAIN);
    }
    hist.updatedAt = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(hist, null, 2) + '\n', 'utf-8');

    // Flat CSV mirror for Power BI / Excel.
    const csv = [CSV_COLUMNS.join(','), ...hist.history.map(entryToCsvRow)].join('\n') + '\n';
    fs.writeFileSync(path.join(docsDir, 'quality-scores.csv'), csv, 'utf-8');
}

/**
 * Rebuild quality-scores.csv from the existing quality-scores.json without needing a
 * new send. Use after a CSV_COLUMNS change so the committed header/rows reflect the new
 * schema immediately (the next send would do this anyway — this just avoids the wait).
 */
export function regenerateQualityCsv(docsDir: string): void {
    const jsonFile = path.join(docsDir, 'quality-scores.json');
    if (!fs.existsSync(jsonFile)) return;
    const parsed = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    const history: QualityHistoryEntry[] = Array.isArray(parsed.history) ? parsed.history : [];
    const csv = [CSV_COLUMNS.join(','), ...history.map(entryToCsvRow)].join('\n') + '\n';
    fs.writeFileSync(path.join(docsDir, 'quality-scores.csv'), csv, 'utf-8');
}

// =============================================================================
// DAILY LOGIC-IMPACT CSV (additive observability, mirrors quality-scores.csv)
// =============================================================================
// One row per production send, derived ENTIRELY from the finalized diagnostics
// object (no independent recomputation). Append-only with runId dedup so a retry
// of the same send replaces its row instead of duplicating it. Build-stage columns
// (tag/roundup/category-stub/office/out-of-region/listing counts, ingest totals,
// commit SHAs, notes) are NOT captured in send diagnostics and are left BLANK —
// same as the hand-authored historical rows. Has NO effect on selection, routing,
// scoring, dedup, delivery, or email HTML — it only writes a CSV after the send.

export const DAILY_LOGIC_IMPACT_COLUMNS = [
    'date', 'run_id', 'logic_version_sha', 'production_commit_sha',
    'articles_ingested', 'articles_shipped', 'total_excluded',
    'tag_artifacts_blocked', 'roundups_blocked', 'category_stubs_blocked',
    'office_items_blocked', 'out_of_region_rejected', 'dc_policy_rejected',
    'listing_events_rerouted', 'people_items_rescued', 'near_duplicates_suppressed',
    'cross_day_pool_repeats_suppressed', 'false_leak_penalties_prevented', 'penalty_total',
    'score', 'grade', 'coverage_score', 'freshness_score', 'supply_condition',
    'relevant_count', 'transactions_count', 'availabilities_count', 'people_count',
    'operational_score', 'operational_grade', 'editorial_quality_score', 'editorial_grade',
    'coverage_supply_score', 'relevant_supply_status', 'transactions_supply_status',
    'availabilities_supply_status', 'people_supply_status', 'notes',
] as const;

function dliEscape(v: string): string {
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** Build the 38-field row for a send from its finalized diagnostics object. */
export function buildDailyLogicImpactRow(diag: any): Record<string, string> {
    const q = diag.quality || {};
    const li = diag.logicImpact || {};
    const dc = diag.dcPolicy || {};
    const s = diag.sections || {};
    const ss = q.supplyStatus || {};
    const bd = q.breakdown || {};
    const runId: string = diag.runId || '';
    const date = runId.slice(0, 10);
    const flpRaw = li.falseLeaksPrevented;
    const falseLeak = (flpRaw && typeof flpRaw === 'object') ? flpRaw.total : flpRaw;
    const penaltyTotal = (q.penalties || []).reduce((a: number, p: any) => a + (p.points || 0), 0);
    const sel = (k: string) => (s[k] && s[k].selected != null) ? s[k].selected : '';
    const blank = ''; // genuinely not captured in send diagnostics (build-stage / manual)
    const v: Record<string, any> = {
        date, run_id: runId, logic_version_sha: blank, production_commit_sha: blank,
        articles_ingested: (s.relevant && s.relevant.loaded != null) ? s.relevant.loaded : blank,
        articles_shipped: q.itemCount ?? blank,
        total_excluded: blank, tag_artifacts_blocked: blank, roundups_blocked: blank,
        category_stubs_blocked: blank, office_items_blocked: blank, out_of_region_rejected: blank,
        dc_policy_rejected: Array.isArray(dc.rejectedOutOfRegion) ? dc.rejectedOutOfRegion.length : blank,
        listing_events_rerouted: blank,
        people_items_rescued: li.peopleRescued ?? blank,
        near_duplicates_suppressed: li.nearDuplicatesSuppressed ?? blank,
        cross_day_pool_repeats_suppressed: li.crossDayPoolRepeatsSuppressed ?? blank,
        false_leak_penalties_prevented: falseLeak ?? blank,
        penalty_total: penaltyTotal,
        score: q.score ?? blank, grade: q.grade ?? blank,
        coverage_score: bd.coverage ?? blank, freshness_score: bd.freshness ?? blank,
        supply_condition: q.supply ?? blank,
        relevant_count: sel('relevant'), transactions_count: sel('transactions'),
        availabilities_count: sel('availabilities'), people_count: sel('people'),
        operational_score: q.operationalScore ?? blank, operational_grade: q.operationalGrade ?? blank,
        editorial_quality_score: q.editorialQualityScore ?? blank, editorial_grade: q.editorialGrade ?? blank,
        coverage_supply_score: q.coverageSupplyScore ?? blank,
        relevant_supply_status: ss.relevant ?? blank, transactions_supply_status: ss.transactions ?? blank,
        availabilities_supply_status: ss.availabilities ?? blank, people_supply_status: ss.people ?? blank,
        notes: blank,
    };
    const out: Record<string, string> = {};
    for (const c of DAILY_LOGIC_IMPACT_COLUMNS) out[c] = String(v[c] ?? '');
    return out;
}

/**
 * Append this send's logic-impact row to docs/daily-logic-impact.csv. Preserves all
 * existing rows verbatim; replaces (does not duplicate) any row with the same runId so
 * retries are idempotent. Header/schema held stable. No-op if runId is missing.
 */
export function writeDailyLogicImpact(docsDir: string, diag: any): void {
    const runId: string = diag && diag.runId ? diag.runId : '';
    if (!runId) return;
    const file = path.join(docsDir, 'daily-logic-impact.csv');
    const header = DAILY_LOGIC_IMPACT_COLUMNS.join(',');
    const row = buildDailyLogicImpactRow(diag);
    const newLine = DAILY_LOGIC_IMPACT_COLUMNS.map(c => dliEscape(row[c])).join(',');

    // Preserve existing data rows byte-for-byte (they include hand-authored + build-stage
    // values the pipeline cannot reproduce). date & run_id are cols 1-2 and never contain
    // commas/quotes, so a plain split is a safe key extractor for dedup + sort.
    let rows: string[] = [];
    try {
        if (fs.existsSync(file)) {
            const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/).filter(l => l.length > 0);
            if (lines.length > 1) rows = lines.slice(1);
        }
    } catch { /* start fresh on unreadable file */ }
    rows = rows.filter(l => l.split(',')[1] !== runId);   // runId dedup (retry-safe)
    rows.push(newLine);
    rows.sort((a, b) => { const da = a.split(',')[0], db = b.split(',')[0]; return da < db ? -1 : da > db ? 1 : 0; });
    fs.writeFileSync(file, [header, ...rows].join('\n') + '\n', 'utf-8');
}

// =============================================================================
// LEGACY HELPERS (kept for compatibility with existing call sites)
// =============================================================================

/** Empty SectionFunnel skeleton — kept for backward compat with PR #3 scaffold. */
export function emptySectionDiag(): SectionFunnel {
    return {
        loaded: 0, inWindow: 0, regionPass: 0, industrialPass: 0, sectionPass: 0,
        dedupRemoved: 0, stalePruned: 0, selected: 0,
        rejectionReasons: Object.fromEntries(REASON_CODES.map(r => [r, 0])),
        nearMisses: [],
        tierFill: { tier1_24h: 0, tier2_48h_72h: 0, tier3_30d_deep: 0, tier4_reserve: 0, tier5_manual_include: 0 },
        underfilled: false,
        underfillReason: null,
    };
}

export function makeNearMiss(article: any, score: number, reasons: string[], regions: string[] = [], industrialEvidence: string[] = []): NearMiss {
    return {
        id: article.id || '',
        title: (article.title || '').substring(0, 200),
        source: article.source || (article._source && article._source.name) || '',
        publisher: '',
        url: article.url || article.link || '',
        score,
        reasons,
        date: article.date_published || article.pubDate || '',
    };
}
