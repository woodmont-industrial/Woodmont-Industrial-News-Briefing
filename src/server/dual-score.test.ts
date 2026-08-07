import assert from 'node:assert/strict';
import { computeNewsletterScore } from './newsletter-diagnostics.js';

let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

// Minimal section funnel; only the fields computeNewsletterScore reads matter.
const sec = (o: any = {}) => ({
    loaded: 0, inWindow: 0, regionPass: 0, industrialPass: 0, sectionPass: 0, dedupRemoved: 0,
    stalePruned: 0, selected: 0, supplyCandidates: 0, rejectionReasons: {}, nearMisses: [],
    tierFill: { tier1_24h: 0, tier2_48h_72h: 0, tier3_30d_deep: 0, tier4_reserve: 0, tier5_manual_include: 0 },
    underfilled: false, underfillReason: null, ...o,
});
// An in-region industrial item (regionScoreOf -> 1) so regional/relevance are healthy.
const item = (title: string) => ({ title, description: 'Newark, New Jersey industrial warehouse', region: 'NJ' } as any);
const filledSec = (n: number) => sec({ selected: n, inWindow: n, regionPass: n, sectionPass: n, supplyCandidates: n, tierFill: { tier1_24h: n, tier2_48h_72h: 0, tier3_30d_deep: 0, tier4_reserve: 0, tier5_manual_include: 0 } });

function run(sections: any, selected: any) {
    const payload: any = { runId: 'x', generatedAt: '2026-08-07', isFriday: false, sections, perFeedBySection: {}, weekInReview: {} };
    return computeNewsletterScore(payload, selected, { sigOf: () => [], recentSigs: new Set() });
}

// 1. All-filled clean send: operational == editorial, coverageSupply = 100.
{
    const S = { relevant: filledSec(4), transactions: filledSec(4), availabilities: filledSec(2), people: filledSec(2) };
    const sel = { relevant: [item('a'), item('b'), item('c'), item('d')], transactions: [item('e'), item('f'), item('g'), item('h')], availabilities: [item('i'), item('j')], people: [item('k'), item('l')] };
    const q = run(S, sel);
    ok('all-filled: operationalScore === score (unchanged)', q.operationalScore === q.score);
    ok('all-filled: coverageSupplyScore === 100', q.coverageSupplyScore === 100);
    ok('all-filled: editorial === operational (nothing forgiven, no defect)', q.editorialQualityScore === q.operationalScore);
    ok('all-filled: supplyStatus all FILLED', Object.values(q.supplyStatus).every(s => s === 'FILLED'));
}

// 2. NO_FRESH_SUPPLY (empty, inWindow 0): editorial FORGIVES (>= operational), coverageSupply drops.
{
    const S = { relevant: filledSec(4), transactions: filledSec(4), availabilities: sec({ selected: 0, inWindow: 0, supplyCandidates: 0 }), people: sec({ selected: 0, inWindow: 0, supplyCandidates: 0 }) };
    const sel = { relevant: [item('a'), item('b'), item('c'), item('d')], transactions: [item('e'), item('f'), item('g'), item('h')], availabilities: [], people: [] };
    const q = run(S, sel);
    ok('no-fresh: availabilities/people classified NO_FRESH_SUPPLY', q.supplyStatus.availabilities === 'NO_FRESH_SUPPLY' && q.supplyStatus.people === 'NO_FRESH_SUPPLY');
    ok('no-fresh: editorial >= operational (uncontrollable supply excused)', q.editorialQualityScore >= q.operationalScore);
    ok('no-fresh: coverageSupplyScore < 100 (sections empty)', q.coverageSupplyScore < 100);
    ok('no-fresh: operationalScore still === score', q.operationalScore === q.score);
}

// 3. QUALITY_REJECTED (empty, inWindow>0, sectionPass 0): conservative — NOT forgiven.
{
    const S = { relevant: filledSec(4), transactions: sec({ selected: 0, inWindow: 5, regionPass: 2, sectionPass: 0, supplyCandidates: 5 }), availabilities: filledSec(2), people: filledSec(2) };
    const sel = { relevant: [item('a'), item('b'), item('c'), item('d')], transactions: [], availabilities: [item('i'), item('j')], people: [item('k'), item('l')] };
    const q = run(S, sel);
    ok('quality-rejected: transactions classified QUALITY_REJECTED', q.supplyStatus.transactions === 'QUALITY_REJECTED');
    // conservative: editorial coverage denominator INCLUDES the QUALITY_REJECTED section, so it is penalized
    // -> editorial coverage < 30 -> editorial < a hypothetical fully-forgiven score. Compare against the
    // NO_FRESH variant to prove it is treated as controllable (lower editorial coverage credit).
    const Snf = { ...S, transactions: sec({ selected: 0, inWindow: 0, supplyCandidates: 0 }) };
    const qnf = run(Snf, sel);
    ok('quality-rejected penalized MORE than the same section as no-fresh (conservative)', q.editorialQualityScore < qnf.editorialQualityScore);
}

// 4. A defect (duplicate) must NOT let editorial reach A even on a clean-supply day.
{
    const S = { relevant: filledSec(4), transactions: filledSec(4), availabilities: filledSec(2), people: filledSec(2) };
    const dup = item('Same warehouse deal closes in Newark for $30M');
    const sel = { relevant: [dup, { ...dup }, item('c'), item('d')], transactions: [item('e'), item('f'), item('g'), item('h')], availabilities: [item('i'), item('j')], people: [item('k'), item('l')] };
    const q = run(S, sel);
    ok('defect present (duplicate_in_send penalty)', q.penalties.some(p => p.type === 'duplicate_in_send'));
    ok('defect: editorial grade is NOT A', q.editorialGrade !== 'A');
}

console.log(`\nAll dual-score tests passed (${pass} checks).`);
