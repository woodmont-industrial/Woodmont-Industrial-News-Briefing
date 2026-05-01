/**
 * Reserve Pool Builder
 *
 * Runs nightly (11 PM ET via .github/workflows/build-reserve-pool.yml).
 * Pre-computes top-N candidates per section that pass all existing filters and
 * dedup checks, so when the morning send runs, every section has guaranteed
 * fallback content even if the day's fresh inflow is thin.
 *
 * SAFETY: This script ONLY writes to docs/preferences/reserve-pool.json.
 * It must NEVER write to feed.json, sent-articles.json, or anything else
 * that would influence what gets sent. It must NEVER call repository_dispatch.
 *
 * Output: docs/preferences/reserve-pool.json — see schema in writeReservePool().
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NormalizedItem } from '../types/index.js';
import {
    isTargetRegion, isNotExcludedRegion, hasPositiveTargetRegionEvidence, hasStrongIndustrialAssetEvidence,
    RESERVE_DISCOVERY_MAX_DAYS,
    applyStrictFilter, applyTransactionFilter, applyAvailabilityFilter, applyPeopleFilter,
    loadSentArticles, loadSentSignatures,
} from '../server/newsletter-filters.js';
import { RELEVANT_KEYWORDS } from '../shared/region-data.js';
import { extractDealSignature, extractDealSignatures } from '../shared/url-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.resolve(__dirname, '..', '..', 'docs');
const RESERVE_PATH = path.join(DOCS_DIR, 'preferences', 'reserve-pool.json');
const FEED_PATH = path.join(DOCS_DIR, 'feed.json');

const WINDOW_DAYS = RESERVE_DISCOVERY_MAX_DAYS;
const TOP_N_PER_SECTION = 25;

interface ReserveItem {
    id: string;
    title: string;
    url: string;
    category: string;
    source: string;
    date_published: string;
    score: number;
    sigs: string[];
}

interface ReservePool {
    generatedAt: string;
    windowDays: number;
    topNPerSection: number;
    sections: {
        relevant: ReserveItem[];
        transactions: ReserveItem[];
        availabilities: ReserveItem[];
        people: ReserveItem[];
    };
    stats: {
        totalCandidates: number;
        sentExcluded: number;
        sigExcluded: number;
        perSection: Record<string, number>;
    };
}

function loadScoringWeights() {
    const weightsPath = path.join(DOCS_DIR, 'scoring-weights.json');
    try {
        return JSON.parse(fs.readFileSync(weightsPath, 'utf-8'));
    } catch {
        return {
            regionWeights: { NJ: 30, PA: 25, FL: 20, National: 5 },
            sourceWeights: { 'news.google.com': 0 },
            dealSizeThresholds: { highValue_SF: 100000, highValue_dollars: 50000000 },
            companyBonus: {},
            topicPreferences: {},
            learnedExclusions: [],
        };
    }
}

// Mirrors scoreArticle() in src/server/email.ts. Kept inline so this script
// runs standalone without coupling to email.ts (which imports email transports).
function scoreArticle(a: NormalizedItem, weights: any): number {
    let score = 0;
    const text = `${a.title || ''} ${(a as any).description || (a as any).summary || ''}`.toLowerCase();
    const url = ((a as any).url || a.link || '').toLowerCase();

    const njW = weights.regionWeights?.NJ ?? 30;
    const paW = weights.regionWeights?.PA ?? 25;
    const flW = weights.regionWeights?.FL ?? 20;
    if (/new jersey|nj |newark|edison|rahway|carlstadt|piscataway|meadowlands|exit \d/i.test(text)) score += njW;
    if (/pennsylvania|philadelphia|philly|allentown|lehigh/i.test(text)) score += paW;
    if (/florida|miami|orlando|doral|jacksonville|tampa|broward/i.test(text)) score += flW;

    const highSF = weights.dealSizeThresholds?.highValue_SF ?? 100000;
    const sfMatch = text.match(/([\d,.]+)\s*(?:million\s*)?(?:sf|sq\.?\s*f|square\s*f)/i);
    if (sfMatch) {
        const sf = parseFloat(sfMatch[1].replace(/,/g, ''));
        if (sf >= highSF * 5) score += 25;
        else if (sf >= highSF) score += 15;
        else if (sf >= highSF * 0.5) score += 5;
    }
    const highDollars = weights.dealSizeThresholds?.highValue_dollars ?? 50000000;
    const dollarMatch = text.match(/\$([\d,.]+)\s*(million|m(?:il|ln)?|billion|b(?:il|ln)?)\b/i);
    if (dollarMatch) {
        const amt = parseFloat(dollarMatch[1].replace(/,/g, ''));
        const mult = /billion|b(?:il|ln)?\b/i.test(dollarMatch[2]) ? 1000 : 1;
        const millions = amt * mult;
        const highM = highDollars / 1000000;
        if (millions >= highM * 2) score += 25;
        else if (millions >= highM * 0.5) score += 15;
        else if (millions >= highM * 0.2) score += 5;
    }

    const companies = weights.companyBonus ?? {};
    for (const [c, b] of Object.entries(companies)) {
        if (text.includes(c.toLowerCase())) { score += b as number; break; }
    }

    const sourceWeights = weights.sourceWeights ?? {};
    let sourceMatched = false;
    for (const [d, b] of Object.entries(sourceWeights)) {
        if (url.includes(d)) { score += b as number; sourceMatched = true; break; }
    }
    if (!sourceMatched && !url.includes('news.google.com')) score += 10;

    if (((a as any).description || '').length > 50) score += 5;

    const pub = (a as any).pubDate || (a as any).date_published || '';
    if (pub) {
        const hoursAgo = (Date.now() - new Date(pub).getTime()) / 3_600_000;
        if (hoursAgo < 12) score += 10;
        else if (hoursAgo < 24) score += 5;
        else if (hoursAgo < 168) score += 2; // recency-light bonus for week-old items
    }

    const exclusions = weights.learnedExclusions ?? [];
    for (const e of exclusions) {
        if (text.includes(e.toLowerCase())) { score -= 20; break; }
    }
    return score;
}

function loadCurrentReserve(): ReservePool | null {
    try {
        if (!fs.existsSync(RESERVE_PATH)) return null;
        return JSON.parse(fs.readFileSync(RESERVE_PATH, 'utf-8'));
    } catch {
        return null;
    }
}

function toReserveItem(a: NormalizedItem, score: number): ReserveItem {
    const title = a.title || '';
    const desc = (a as any).description || (a as any).summary || '';
    return {
        id: a.id || a.link || '',
        title,
        url: (a as any).url || a.link || '',
        category: (a as any).category || 'relevant',
        source: ((a as any)._source?.name || (a as any).source || ''),
        date_published: (a as any).date_published || (a as any).pubDate || '',
        score,
        sigs: extractDealSignatures(title, desc),
    };
}

async function main() {
    console.log('🏗️  Building reserve pool...');
    const startedAt = new Date();

    if (!fs.existsSync(FEED_PATH)) {
        console.error('❌ feed.json not found at', FEED_PATH);
        process.exit(1);
    }
    const feed = JSON.parse(fs.readFileSync(FEED_PATH, 'utf-8'));
    const items: NormalizedItem[] = (feed.items || []).map((it: any) => ({
        ...it,
        link: it.url || it.link,
        description: it.summary || it.description || '',
        pubDate: it.date_published || it.pubDate,
    }));
    console.log(`📰 Loaded ${items.length} items from feed.json`);

    // Window
    const cutoff = Date.now() - WINDOW_DAYS * 24 * 3_600_000;
    const inWindow = items.filter(a => {
        const d = new Date((a as any).date_published || a.pubDate || 0).getTime();
        return d >= cutoff;
    });
    console.log(`📅 ${WINDOW_DAYS}-day window: ${inWindow.length} items`);

    // Exclude already-sent
    const sentIds = loadSentArticles(DOCS_DIR);
    const sentSigs = loadSentSignatures(DOCS_DIR);
    let sigExcluded = 0;
    const candidates = inWindow.filter(a => {
        const id = a.id || a.link || '';
        if (sentIds.has(id)) return false;
        if (sentSigs.size > 0) {
            const sigs = extractDealSignatures(a.title || '', (a as any).description || '');
            if (sigs.some(s => sentSigs.has(s))) { sigExcluded++; return false; }
        }
        if ((a as any).category === 'exclude') return false;
        return true;
    });
    console.log(`🔁 After dedup: ${candidates.length} (excluded ${inWindow.length - candidates.length} already-sent or sig-matched, ${sigExcluded} via sig)`);

    const weights = loadScoringWeights();

    // Per-section filter + score
    const buildSection = (
        category: 'relevant' | 'transactions' | 'availabilities' | 'people',
        regionFilter: (a: NormalizedItem) => boolean,
        sectionFilter: (items: NormalizedItem[]) => NormalizedItem[],
    ): ReserveItem[] => {
        const inCategory = candidates.filter(a => (a as any).category === category);
        const regional = inCategory.filter(regionFilter).filter(a => hasPositiveTargetRegionEvidence(a).pass);
        const sectionFiltered = sectionFilter(regional).filter(a => hasStrongIndustrialAssetEvidence(a).pass);
        // Dedup within the section by primary signature (don't include duplicate deals)
        const seen = new Set<string>();
        const unique: NormalizedItem[] = [];
        for (const a of sectionFiltered) {
            const sig = extractDealSignature(a.title || '', (a as any).description || '');
            if (sig && seen.has(sig)) continue;
            if (sig) seen.add(sig);
            unique.push(a);
        }
        const scored = unique
            .map(a => ({ a, score: scoreArticle(a, weights) }))
            .sort((x, y) => y.score - x.score)
            .slice(0, TOP_N_PER_SECTION)
            .map(({ a, score }) => toReserveItem(a, score));
        console.log(`  ${category}: ${inCategory.length} in-cat → ${regional.length} regional → ${sectionFiltered.length} filtered → ${unique.length} unique → top ${scored.length} kept`);
        return scored;
    };

    const reservePool: ReservePool = {
        generatedAt: startedAt.toISOString(),
        windowDays: WINDOW_DAYS,
        topNPerSection: TOP_N_PER_SECTION,
        sections: {
            relevant: buildSection('relevant', isNotExcludedRegion,
                (its) => applyStrictFilter(its, RELEVANT_KEYWORDS, 'Reserve Relevant')),
            transactions: buildSection('transactions', isTargetRegion, applyTransactionFilter),
            availabilities: buildSection('availabilities', isTargetRegion, applyAvailabilityFilter),
            people: buildSection('people', isTargetRegion, applyPeopleFilter),
        },
        stats: {
            totalCandidates: candidates.length,
            sentExcluded: inWindow.length - candidates.length - sigExcluded,
            sigExcluded,
            perSection: { relevant: 0, transactions: 0, availabilities: 0, people: 0 },
        },
    };
    reservePool.stats.perSection = {
        relevant: reservePool.sections.relevant.length,
        transactions: reservePool.sections.transactions.length,
        availabilities: reservePool.sections.availabilities.length,
        people: reservePool.sections.people.length,
    };

    // Idempotency: skip write if content is materially unchanged
    const current = loadCurrentReserve();
    const sectionsChanged = !current || (
        JSON.stringify(reservePool.sections) !== JSON.stringify(current.sections)
    );
    if (!sectionsChanged) {
        console.log('✅ Reserve pool unchanged — skipping write (idempotent).');
        return;
    }

    // Ensure directory exists
    fs.mkdirSync(path.dirname(RESERVE_PATH), { recursive: true });
    fs.writeFileSync(RESERVE_PATH, JSON.stringify(reservePool, null, 2) + '\n', 'utf-8');
    console.log(`💾 Wrote reserve pool: ${RESERVE_PATH}`);
    console.log(`   Sections: relevant=${reservePool.sections.relevant.length}, transactions=${reservePool.sections.transactions.length}, availabilities=${reservePool.sections.availabilities.length}, people=${reservePool.sections.people.length}`);
}

main().catch(err => {
    console.error('❌ Reserve pool build failed:', err);
    process.exit(1);
});
