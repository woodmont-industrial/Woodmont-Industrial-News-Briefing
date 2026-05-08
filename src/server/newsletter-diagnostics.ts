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
