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
}

// =============================================================================
// NEWSLETTER QUALITY SCORE
// -----------------------------------------------------------------------------
// A composite 0-100 grade for the whole send, derived from the diagnostics
// funnel (tier fill, section underfill) plus the selected items (region tags,
// titles, deal signatures). Pure function: all external data (signatures, prior
// sends) is passed in, so this module stays I/O-free and import-cycle-free.
//
// Rubric (the approved table):
//   Coverage & balance ....... 30  (sections filled, weighted)
//   Freshness ................ 25  (tier-weighted avg of selected items)
//   Regional targeting ....... 25  (share of items in NJ/PA/FL; macro = 0.4)
//   Relevance integrity ...... 20  (baseline; eroded only when a leak ships)
//   minus penalties: broken -8, dup-in-send -6, cross-day repeat -3,
//                    weak/borderline -3, off-target leak -12  (each occurrence)
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
    score: number;        // 0-100, clamped
    outOf10: number;      // score / 10
    grade: string;        // A / B / C / D / F
    itemCount: number;
    breakdown: QualityBreakdown;
    penalties: QualityPenalty[];
    notes: string[];
}

// Section fill weights — sum to 30. Transactions valued highest (real deals).
const COVERAGE_WEIGHTS: Record<Section, number> = {
    transactions: 10, relevant: 8, availabilities: 6, people: 6,
};
// Freshness weight per backfill tier.
const TIER_WEIGHTS: Record<keyof SectionFunnel['tierFill'], number> = {
    tier1_24h: 1.0, tier2_48h_72h: 0.85, tier3_30d_deep: 0.5, tier4_reserve: 0.3, tier5_manual_include: 0.7,
};
const PENALTY = { broken: 8, dupInSend: 6, repeatCrossDay: 3, weak: 3, leak: 12 };

// Target regions (NJ/PA/FL) — major cities/counties + corridors. Subset of the
// send pipeline's TARGET_REGION_PATTERN, kept compact on purpose.
const REGION_RX = /\b(nj|new jersey|newark|edison|piscataway|robbinsville|trenton|camden|woodbridge|elizabeth|paterson|lakewood|middlesex|essex|bergen|hudson county|morris county|meadowlands|turnpike|bayonne|elmwood park|garfield|north brunswick|pa|pennsylvania|philadelphia|philly|allentown|lehigh|bucks county|montgomery county|chester county|pittsburgh|lancaster|harrisburg|carlisle|bethlehem|easton|king of prussia|fl|florida|miami|orlando|doral|jacksonville|tampa|clearwater|broward|pompano|hialeah|medley|fort lauderdale|palm beach|miami-dade|fort myers|ft\.?\s*myers|naples|sarasota|lakeland|deltona|st\.?\s*petersburg|brevard|volusia|space coast)\b/i;
// National macro industrial framing (acceptable, partial credit).
const MACRO_RX = /\b(industrial market|warehouse market|warehouse demand|logistics market|reit|supply chain|freight market|e-commerce|build-to-suit|spec development|industrial outlook|market report|national industrial|us industrial|u\.s\. industrial|industrial sector|industrial fund|industrial portfolio|industrial real estate|warehouse real estate|cold storage market|vacancy rate|absorption|data center)\b/i;
// Concrete industrial-RE signal — its ABSENCE on a non-target item flags "weak".
const INDUSTRIAL_SIGNAL_RX = /\b(warehouse|industrial|logistics|distribution|fulfillment|manufactur|lease|sublease|\bsf\b|square (foot|feet)|acre|\$\s?\d|port|cold storage|spec|build-to-suit|big.?box|last.?mile|developer|portfolio|tenant)\b/i;
// Positive wrong-region / wrong-asset evidence — a genuine leak (worst penalty).
const EXCLUDED_REGION_RX = /\b(california|texas|chicago|illinois|ohio|atlanta|georgia|arizona|phoenix|nevada|seattle|denver|oahu|hawaii|tennessee|alabama|india|china|france|toulouse|australia|nsw|canada|mexico|united kingdom)\b|\b(rite aid|pharmacy|apartment complex|multifamily|retail mall|office tower)\b/i;

function round1(n: number): number { return Math.round(n * 10) / 10; }
function itemText(it: any): string {
    return `${it.title || ''} ${it.description || it.summary || ''} ${it.content_text || ''}`;
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
    return t.length < 20 || !/\s/.test(t); // empty, stub, or single-token
}
function normTitle(title: string): string {
    return (title || '').toLowerCase()
        .replace(/\s+[-–—]\s+[^-–—]*$/, '') // strip trailing " - Source" suffix
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}
function titlesSimilar(a: string, b: string): boolean {
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
    opts: { sigOf: (it: any) => string[]; recentSigs: Set<string> }
): NewsletterQuality {
    const order: Section[] = ['relevant', 'transactions', 'availabilities', 'people'];
    const allItems = order.flatMap(s => selected[s] || []);
    const itemCount = allItems.length;

    // ---- Coverage & balance (30) ----
    let coverage = 0;
    const emptySections: string[] = [];
    for (const s of order) {
        if ((selected[s] || []).length > 0) coverage += COVERAGE_WEIGHTS[s];
        else emptySections.push(s);
    }

    // ---- Freshness (25): tier-weighted average across all selected items ----
    let tierWeighted = 0, tierTotal = 0;
    for (const s of order) {
        const tf = payload.sections[s].tierFill;
        (Object.keys(TIER_WEIGHTS) as (keyof typeof TIER_WEIGHTS)[]).forEach(k => {
            tierWeighted += tf[k] * TIER_WEIGHTS[k];
            tierTotal += tf[k];
        });
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

    // Off-target leaks (-12) and weak/borderline items (-3)
    allItems.forEach(it => {
        const text = itemText(it);
        if (EXCLUDED_REGION_RX.test(text)) {
            penalties.push({ type: 'leak', points: PENALTY.leak, detail: `Off-target region/asset shipped: ${label(it)}` });
        } else if (regionScoreOf(it) < 1 && !INDUSTRIAL_SIGNAL_RX.test(text)) {
            penalties.push({ type: 'weak_item', points: PENALTY.weak, detail: `Borderline / off-topic: ${label(it)}` });
        }
    });

    const positive = coverage + freshness + regional + relevanceIntegrity;
    const penaltyTotal = penalties.reduce((a, p) => a + p.points, 0);
    const score = Math.max(0, Math.min(100, Math.round(positive - penaltyTotal)));
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

    const notes: string[] = [];
    if (emptySections.length) notes.push(`Empty sections: ${emptySections.join(', ')}`);
    if (itemCount === 0) notes.push('No items selected — empty send');

    return {
        score, outOf10: round1(score / 10), grade, itemCount,
        breakdown: {
            coverage: round1(coverage),
            freshness: round1(freshness),
            regional: round1(regional),
            relevanceIntegrity,
        },
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
            dedupRemoved: 0, stalePruned: 0, selected: 0,
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
    penalties: { type: string; points: number }[];
    backfill?: boolean;
}

// Penalty types we surface as their own CSV columns (counts per send).
const PENALTY_TYPES = ['broken_item', 'duplicate_in_send', 'repeat_cross_day', 'weak_item', 'leak'] as const;
const CSV_COLUMNS = [
    'date', 'runId', 'score', 'outOf10', 'grade', 'itemCount',
    'coverage', 'freshness', 'regional', 'relevanceIntegrity',
    'penaltyTotal', 'brokenItems', 'duplicatesInSend', 'crossDayRepeats', 'weakItems', 'leaks',
];

function entryToCsvRow(e: QualityHistoryEntry): string {
    const counts: Record<string, number> = {};
    let penaltyTotal = 0;
    for (const p of e.penalties) { counts[p.type] = (counts[p.type] || 0) + 1; penaltyTotal += p.points; }
    const vals = [
        e.date, e.runId, e.score, e.outOf10, e.grade, e.itemCount,
        e.breakdown.coverage, e.breakdown.freshness, e.breakdown.regional, e.breakdown.relevanceIntegrity,
        penaltyTotal,
        counts['broken_item'] || 0, counts['duplicate_in_send'] || 0, counts['repeat_cross_day'] || 0,
        counts['weak_item'] || 0, counts['leak'] || 0,
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
