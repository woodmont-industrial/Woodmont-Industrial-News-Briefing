import assert from 'node:assert/strict';
import { computeNewsletterScore } from './newsletter-diagnostics.js';

// Regression guard for the 2026-08-10 note fix: the human-readable empty-section note must derive
// from the SAME fresh-supply classification as `supplyStatus` (inWindow/sectionPass), never from the
// coverage-scoring pool bucket (`supplyCandidates`). It must NEVER contradict supplyStatus.

let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

const sec = (o: any = {}) => ({
    loaded: 0, inWindow: 0, regionPass: 0, industrialPass: 0, sectionPass: 0, dedupRemoved: 0,
    stalePruned: 0, selected: 0, supplyCandidates: 0, rejectionReasons: {}, nearMisses: [],
    tierFill: { tier1_24h: 0, tier2_48h_72h: 0, tier3_30d_deep: 0, tier4_reserve: 0, tier5_manual_include: 0 },
    underfilled: false, underfillReason: null, ...o,
});
const item = (title: string) => ({ title, description: 'Newark, New Jersey industrial warehouse', region: 'NJ' } as any);
const filledSec = (n: number) => sec({ selected: n, inWindow: n, regionPass: n, sectionPass: n, supplyCandidates: n, tierFill: { tier1_24h: n, tier2_48h_72h: 0, tier3_30d_deep: 0, tier4_reserve: 0, tier5_manual_include: 0 } });
const fourFilled = { relevant: [item('a'), item('b'), item('c'), item('d')], transactions: [item('e'), item('f'), item('g'), item('h')], availabilities: [item('i'), item('j')], people: [item('k'), item('l')] };
function run(sections: any, selected: any) {
    const payload: any = { runId: 'x', generatedAt: '2026-08-10', isFriday: false, sections, perFeedBySection: {}, weekInReview: {} };
    return computeNewsletterScore(payload, selected, { sigOf: () => [], recentSigs: new Set() });
}

// 1. The Aug-10 People case: empty, inWindow=0 but supplyCandidates=3 (stale reserve pool).
//    Legacy note said "selection gap"; fixed note must say NO_FRESH_SUPPLY and NOT "selection gap".
{
    const S = { relevant: filledSec(4), transactions: filledSec(4), availabilities: filledSec(2), people: sec({ selected: 0, inWindow: 0, sectionPass: 0, supplyCandidates: 3 }) };
    const sel = { ...fourFilled, people: [] };
    const q = run(S, sel);
    const note = (q.notes || []).find(n => n.toLowerCase().includes('people')) || '';
    ok('people classified NO_FRESH_SUPPLY despite supplyCandidates>0', q.supplyStatus.people === 'NO_FRESH_SUPPLY');
    ok('note communicates NO_FRESH_SUPPLY', /no fresh in-window supply|NO_FRESH_SUPPLY/.test(note));
    ok('note does NOT say "selection gap" for a no-fresh section', !/selection gap/i.test(note));
}

// 2. Genuine SELECTION_GAP (empty, inWindow>0, sectionPass>0) still reads "selection gap".
{
    const S = { relevant: filledSec(4), transactions: filledSec(4), availabilities: filledSec(2), people: sec({ selected: 0, inWindow: 3, regionPass: 2, sectionPass: 2, supplyCandidates: 3 }) };
    const sel = { ...fourFilled, people: [] };
    const q = run(S, sel);
    const note = (q.notes || []).find(n => n.toLowerCase().includes('people')) || '';
    ok('people classified SELECTION_GAP', q.supplyStatus.people === 'SELECTION_GAP');
    ok('note says selection gap', /selection gap/i.test(note));
}

// 3. QUALITY_REJECTED (empty, inWindow>0, sectionPass=0) reads "rejected by section gates".
{
    const S = { relevant: filledSec(4), transactions: filledSec(4), availabilities: filledSec(2), people: sec({ selected: 0, inWindow: 5, regionPass: 2, sectionPass: 0, supplyCandidates: 5 }) };
    const sel = { ...fourFilled, people: [] };
    const q = run(S, sel);
    const note = (q.notes || []).find(n => n.toLowerCase().includes('people')) || '';
    ok('people classified QUALITY_REJECTED', q.supplyStatus.people === 'QUALITY_REJECTED');
    ok('note says rejected by section gates', /rejected by section gates/i.test(note));
}

// 4. The note is DISPLAY-ONLY: operational + editorial scores identical whether people is empty here
//    or fully filled elsewhere is covered by dual-score.test; here assert operationalScore===score.
{
    const S = { relevant: filledSec(4), transactions: filledSec(4), availabilities: filledSec(2), people: sec({ selected: 0, inWindow: 0, supplyCandidates: 3 }) };
    const q = run(S, { ...fourFilled, people: [] });
    ok('note fix does not alter operationalScore (=== score)', q.operationalScore === q.score);
}

console.log(`\n${pass} checks passed`);
