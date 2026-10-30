import assert from 'node:assert/strict';
import { computeNewsletterScore, DiagnosticContext } from './newsletter-diagnostics.js';
import { hasNewsletterTargetRegion } from '../shared/newsletter-geography.js';

const regional = (title: string, extra = {}) => {
    const diag = new DiagnosticContext({ isFriday: false });
    diag.recordTier('transactions', 'tier1_24h', 1);
    diag.finalizeSection('transactions', 1, 1);
    return computeNewsletterScore(diag.toJSON(), {
        relevant: [], transactions: [{ title, description: '', ...extra }], availabilities: [], people: [],
    }, { sigOf: () => [], recentSigs: new Set() }).breakdown.regional;
};
for (const place of ['Winter Haven', 'South Brunswick', 'Carlstadt', 'Lakeland', 'Allentown', 'Edison, NJ']) {
    const title = `Example Buyer acquires a 120,000 SF industrial warehouse in ${place}`;
    assert.ok(hasNewsletterTargetRegion(title));
    assert.equal(regional(title), 25, `${place}: scoring must use the same region resolver as selection`);
}
for (const place of ['Lakewood, CO', 'Morrisville, NC', 'Naples, Italy', "Colorado's Lakewood"])
    assert.equal(regional(`Example Buyer acquires an industrial warehouse in ${place}`), 0, place);
assert.equal(regional('Example Buyer acquires an industrial warehouse in Lakewood, CO', { tags: ['NJ'] }), 0,
    'a stale tag cannot override an explicit non-target city');
assert.equal(regional('National industrial market outlook'), 10, 'national macro retains its partial credit');
assert.equal(regional('Example Buyer acquires a warehouse portfolio', { region: 'FL' }), 25, 'explicit regional metadata survives');
const evidence = 'The industrial portfolio is located in Carlstadt, New Jersey.';
assert.equal(regional('Example Buyer acquires a warehouse portfolio', { _newsletterFacts: {
    version: 1, sourceUrl: 'https://businesswire.com/example-release', checkedAt: '2026-10-29T10:00:00Z',
    evidence: [evidence], squareFeet: 120000, priceUsd: 30000000, propertyLocationEvidence: evidence,
} }), 25, 'a validated property-location citation counts just as it does in selection');
console.log('PASS: regional scoring shares city/qualifier resolution, preserves macro credit and checks fact provenance');
