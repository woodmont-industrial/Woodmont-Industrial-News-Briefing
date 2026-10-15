const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { validateScanResult, validateScanState } = require('./capital-markets-scan-artifacts.cjs');

const rows = [{ 'Company Name': 'Example Developer', 'Website Domain': 'example.com' }];
const clean = {
    version: 1, startedAt: '2026-10-01T12:00:00Z', completedAt: '2026-10-01T12:01:00Z',
    runtimeSeconds: 60, lookbackDays: 30, requests: 3, duplicatesCollapsed: 0,
    sources: [{ name: 'Example Developer', url: 'https://example.com/', outcome: 'ok', status: '200', endpoints: 1, articles: 1 }],
    hits: [{ title: 'Example Developer completes an industrial warehouse in Edison',
        link: 'https://example.com/warehouse', publishedAt: '2026-09-30T12:00:00Z',
        source: 'Example Developer', section: 'construction', tier: 'TARGET', squareFeet: 20000, priceUsd: null,
        evidence: 'The developer completed a 20,000 square foot industrial warehouse in Edison.',
        evidenceSource: 'article page', reason: 'Target-market industrial construction completion.' }],
    newSinceLastScan: ['Example Developer completes an industrial warehouse in Edison'], counts: { construction: 1 },
};
validateScanResult(clean, rows);
let cases = 0;
for (const mutate of [
    x => { x.Phone = '555-0100'; },
    x => { x['Portfolio SF'] = 999999; },
    x => { x.sources[0].Phone = '555-0100'; },
    x => { x.hits[0]['Portfolio SF'] = 999999; },
    x => { x.hits[0].link = 'https://notexample.com/story'; },
    x => { x.hits[0].link = 'https://news.google.com/rss/articles/opaque'; },
    x => { x.sources[0].url = 'http://example.com/'; },
    x => { x.hits[0].source = 'Unknown Company'; },
    x => { x.sources[0].outcome = 'refused'; },
    x => { x.sources[0].articles = 0; },
    x => { x.hits[0].publishedAt = '2026-10-02T00:00:00Z'; },
    x => { x.hits[0].priceUsd = 25000000; },
    x => { x.counts.construction = 2; },
    x => { x.newSinceLastScan = ['A claim with no corresponding public source link']; },
]) {
    const changed = structuredClone(clean); mutate(changed);
    assert.throws(() => validateScanResult(changed, rows)); cases++;
}
const key = createHash('sha256').update('example').digest('hex');
const state = { version: 2, sources: { [key]: { outcome: 'ok' } }, lastHits: [key] };
validateScanState(state);
for (const changed of [
    { ...state, Phone: '555-0100' },
    { ...state, sources: { 'Example Developer': { outcome: 'ok' } } },
    { ...state, lastHits: ['Example Developer::An announcement'] },
    { ...state, sources: { [key]: { outcome: 'ok', 'Portfolio SF': 1000000 } } },
]) { assert.throws(() => validateScanState(changed)); cases++; }
console.log(`PASS: valid public artifacts and ${cases} rejected contract violations`);
