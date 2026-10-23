const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformSync } = require('esbuild');
const api = require('../../docs/js/capital-markets-scan-view.js');
const end = '2026-10-23T12:00:00Z';
const hit = (section, age, extra = {}) => ({ title: 'Example industrial development in Edison',
  link: 'https://example.com/announcement', source: 'Example Developer', section, tier: 'TARGET',
  publishedAt: new Date(Date.parse(end) - age * 86400000).toISOString(), evidence: 'The industrial facility measures 120,000 SF.',
  squareFeet: 120000, priceUsd: null, ...extra });
const scan = { version: 2, completedAt: end, lookbackDays: 60,
  hits: [hit('construction', 31), hit('leases', 2), hit('sales', 1, { squareFeet: null, priceUsd: 53000000 })],
  newSinceLastScan: [], sourceHealth: { attempted: 25, ok: 15, refused: 5, transient: 3, cooling: 2, withArticles: 6 } };
const view = filters => api.buildView(scan, filters, Date.parse(end));
assert.equal(view({}).hits.length, 3);
assert.equal(view({days: 30}).hits.length, 2, 'a historical completion must not look like a 30-day finding');
assert.equal(view({section: 'sales'}).hits.length, 1);
assert.equal(view({tier: 'NATIONAL'}).hits.length, 0);
assert.equal(view({query: 'Edison'}).hits.length, 3);
assert.equal(view({query: 'unmatched'}).total, 3, 'no filter matches is distinct from no collected activity');
assert.equal(view({}).unavailable, 10);
assert.equal(view({}).counts.availabilities, 0, 'thin sections stay visibly empty');
assert.equal(api.formatAmount(scan.hits[2]), '$53M', 'sale prices never acquire SF units');
assert.equal(api.formatAmount(scan.hits[1]), '120,000 SF');
assert.equal(api.formatDate('2026-10-23T00:00:00Z', 'UTC'), 'Oct 23, 2026', 'date-only publication metadata must not shift to the previous date');
assert.equal(api.buildView(scan, {}, Date.parse(end) + 86400001).stale, true);
assert.equal(api.buildView({...scan, hits: []}, {}, Date.parse(end)).valid, true, 'a valid empty scan is available');
assert.equal(api.buildView(null).valid, false, 'a missing scan is unavailable, not zero activity');
assert.equal(api.buildView({...scan, hits: [hit('leases', -1)]}, {}, Date.parse(end)).valid, false);
assert.equal(api.buildView({...scan, hits: [hit('leases', 1, {link: 'javascript:alert(1)'})]}, {}, Date.parse(end)).valid, false);
const html = fs.readFileSync('docs/index.html', 'utf8');
const script = /<script type="text\/babel" data-type="module">([\s\S]*?)<\/script>/.exec(html)[1];
transformSync(script, {loader: 'jsx', format: 'iife'});
assert.ok(html.includes('scannerView ? <CapitalMarketsScannerPage /> : <App />'), 'the direct route mounts the standalone view');
console.log('PASS: scanner view filters, dates, empty states, units, direct route and complete JSX compilation');
