/**
 * Week in Review and empty-state diagnostics, plus an end-to-end preview build.
 * Synthetic corpus only.
 */
import { loadCapitalMarkets, harness, loadFeed } from './load.mjs';
const { CM } = await loadCapitalMarkets();
const h = harness('preview');

const AS_OF = '2026-09-22';                 // a Tuesday, deliberately not Friday
const day = (n) => new Date(Date.UTC(2026, 8, 22 - n, 12)).toISOString();
const corpus = [
  { title: 'Investor acquires Edison, New Jersey warehouse for $195 million', description: '', link: 'https://example.test/s1', pubDate: day(1) },
  { title: 'Tenant leased 480,000 square feet in Edison, New Jersey', description: '', link: 'https://example.test/l1', pubDate: day(2) },
  { title: 'Developer breaks ground on a 600,000 square foot industrial warehouse in Vineland, New Jersey', description: '', link: 'https://example.test/c1', pubDate: day(3) },
  { title: '250,000 square feet available in Edison, New Jersey', description: '', link: 'https://example.test/a1', pubDate: day(4) },
  { title: 'Industrial vacancy rate falls again as absorption climbs', description: 'Net absorption rose across the quarter.', link: 'https://example.test/i1', pubDate: day(5) },
  { title: 'Planning board approves a site plan for an Edison, New Jersey industrial park', description: '', link: 'https://example.test/m1', pubDate: day(6) },
  { title: 'Investor acquires Edison, New Jersey warehouse for $195 million', description: '', link: 'https://syndicated.test/s1', pubDate: day(1) },
  { title: 'Buyer acquires Edison, New Jersey warehouse for $900 million', description: '', link: 'https://example.test/old', pubDate: day(20) },
];
const build = (hours, articles = corpus, watchlist) =>
  CM.buildCapitalMarketsNewsletterHTML(articles, { asOfDate: AS_OF, lookbackHours: hours, watchlist });
const wirOf = (html) => {
  const i = html.indexOf('Week in Review');
  if (i < 0) return '';
  const next = html.indexOf('<h2', i + 10);
  return html.slice(i, next > 0 ? next : html.length);
};

h.section('Week in Review runs every day from its own 7-day window');
h.chk(new Date(AS_OF + 'T12:00:00Z').getUTCDay() === 2, 'the as-of date is a Tuesday');
h.chk(/Week in Review — Top 5 Industrial Market Highlights/.test(build(24)), 'renders on a non-Friday');
const w24 = wirOf(build(24)), w168 = wirOf(build(168)), w720 = wirOf(build(720));
const shown = (w) => [...new Set(corpus.map(c => c.title))].filter(t => w.includes(t));
h.chk(shown(w24).length === shown(w168).length && shown(w168).length === shown(w720).length,
  `identical at 24h / 7d / 30d lookbacks (${shown(w24).length}/${shown(w168).length}/${shown(w720).length})`);
h.chk(!w720.includes('$900 million'), 'an item 20 days old never appears, even at a 30-day preview');
h.chk(shown(w168).length <= 5, `at most five items (${shown(w168).length})`);

h.section('ranked across sections, deduplicated, with a reason');
const order = shown(w168).sort((a, b) => w168.indexOf(a) - w168.indexOf(b));
order.forEach((t, i) => h.note(`${i + 1}. ${t.slice(0, 66)}`));
h.chk(['Sale', 'Lease', 'Construction', 'Availability'].filter(k => w168.includes(k + ' ·')).length >= 3,
  'several sections are represented, not sales-first concatenation');

h.section('municipal / entitlement items are eligible for the ranking');
// The heading promises a ranking across every section, so Municipal must be a
// candidate - it was previously excluded from the loop entirely.
const municipalOnly = [{ title: 'Planning board approves a site plan for an Edison, New Jersey industrial park',
  description: '', link: 'https://example.test/m1', pubDate: day(2) }];
const wMuni = wirOf(build(168, municipalOnly));
h.chk(wMuni.includes('Planning board approves'), 'a municipal item reaches Week in Review');
h.chk(/Why it matters: Municipal \/ entitlement/.test(wMuni),
  'it is labelled "Municipal / entitlement" in the reason');
h.chk(!/Nothing cleared the thresholds in the last seven days/.test(wMuni),
  'a week containing only municipal news is not reported as empty');
h.chk(w168.indexOf('Tenant leased 480,000') < w168.indexOf('Developer breaks ground'),
  'a large TARGET lease outranks a BROADER construction item');
h.chk((w168.match(/Investor acquires Edison, New Jersey warehouse for \$195 million/g) || []).length === 1,
  'the syndicated duplicate is collapsed');
h.chk((w168.match(/Why it matters:/g) || []).length === order.length,
  'every item carries a "Why it matters" reason');

h.section('empty state is informative, not alarming');
const empty = build(24, [{ title: 'Industry conference announced for next spring',
  description: '', link: 'https://example.test/x', pubDate: day(0) }]);
h.chk(/No items cleared the thresholds/.test(empty), 'says the preview ran correctly');
h.chk(/Reviewed <strong>\d+<\/strong> article/.test(empty), 'reports how many articles were reviewed');
h.chk(/Why candidates were rejected:/.test(empty), 'groups rejection reasons');
h.chk(/<details/.test(empty), 'rejected candidates are collapsible');
h.chk(/Try <strong>7 days<\/strong>/.test(empty) && /30 days/.test(empty), 'suggests widening the lookback');
h.chk(/No competitor watchlist loaded/.test(empty), 'reports watchlist health when none is loaded');
h.chk(!/No items cleared the thresholds/.test(build(168)), 'the panel disappears once items qualify');

h.section('watchlist health reflects a loaded list');
const wl = [{ 'Company Name': 'Northgate Industrial Partners', 'Website Domain': 'northgate.example' },
            { 'Company Name': 'ACME Logistics Properties', 'Website Domain': '' }];
const withWl = build(24, [{ title: 'Industry conference announced', description: '', link: '', pubDate: day(0) }], wl);
h.chk(/2 companies loaded/.test(withWl), 'reports companies loaded');
h.chk(/1 with website domains/.test(withWl), 'reports how many carry domains');
h.chk(/Official company sites are not yet monitored/.test(withWl),
  'states plainly that official company sites are not yet monitored');

h.section('end-to-end build over the live feed');
const live = loadFeed();
const html = build(720, live);
h.chk(html.length > 1000, `30-day preview builds (${html.length} chars over ${live.length} feed articles)`);
h.chk(/PREVIEW ONLY/.test(html), 'carries the PREVIEW ONLY banner');
h.chk(/Week in Review/.test(html), 'includes Week in Review');
h.chk(!/undefined|NaN|\[object Object\]/.test(html), 'no undefined / NaN / [object Object] in the output');

process.exit(h.done());
