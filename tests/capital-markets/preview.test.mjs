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
h.chk(/Week in Review — Top 5 Developments/.test(build(24)), 'renders with Jacob\'s requested heading on a non-Friday');
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

h.section('partially populated daily preview leads with useful content');
const intelOnly = build(24, [{
  title: 'Industrial vacancy rate falls as net absorption improves',
  description: '', link: 'https://example.test/intel', pubDate: day(0),
}]);
h.chk(/Preview result: 1 core item/.test(intelOnly), 'always summarizes a non-empty selection');
h.chk(/Reviewed <strong>1<\/strong> candidate article/.test(intelOnly),
  'summary states how much source material was reviewed');
h.chk(/Quiet:<\/strong> Sales, Leases, Availabilities, Construction, Municipal/.test(intelOnly),
  'quiet sections are named once');
h.chk(!/Sales Transactions|Lease Transactions|<h2[^>]*>Availabilities<\/h2>|Construction Updates/.test(intelOnly),
  'empty daily sections do not consume the top of the preview');
h.chk(intelOnly.indexOf('Week in Review') < intelOnly.indexOf('Relevant Market Intelligence'),
  'independent weekly context appears before the thin daily section');

h.section('watchlist health reflects a loaded list');
const wl = [{ 'Company Name': 'Northgate Industrial Partners', 'Website Domain': 'northgate.example' },
            { 'Company Name': 'ACME Logistics Properties', 'Website Domain': '' }];
const withWl = build(24, [{ title: 'Industry conference announced', description: '', link: '', pubDate: day(0) }], wl);
h.chk(/2 companies loaded/.test(withWl), 'reports companies loaded');
h.chk(/1 with website domains/.test(withWl), 'reports how many carry domains');
h.chk(/Official company sites are not yet monitored/.test(withWl),
  'states plainly that official company sites are not yet monitored');
const withRepoWl = CM.buildCapitalMarketsNewsletterHTML([
  { title: 'Industry conference announced', description: '', link: '', pubDate: day(0) }
], { asOfDate: AS_OF, lookbackHours: 24, watchlist: wl, watchlistSource: 'repo' });
h.chk(/Approved public repo watchlist/.test(withRepoWl),
  'identifies the automatically loaded repo-backed list');

h.section('end-to-end build over the live feed');
const live = loadFeed();
const html = build(720, live);
h.chk(html.length > 1000, `30-day preview builds (${html.length} chars over ${live.length} feed articles)`);
h.chk(/PREVIEW ONLY/.test(html), 'carries the PREVIEW ONLY banner');
h.chk(/Week in Review/.test(html), 'includes Week in Review');
h.chk(!/undefined|NaN|\[object Object\]/.test(html), 'no undefined / NaN / [object Object] in the output');

h.section('same-edition dedup is conservative');
const duplicateSale = [
  { title: 'ACME buys Edison, New Jersey warehouse for $195 million', description: '', link: 'https://example.test/d1', pubDate: day(1) },
  { title: 'ACME expands portfolio with $195 million Edison, New Jersey warehouse acquisition', description: '', link: 'https://example.test/d2', pubDate: day(2) },
  { title: 'ACME buys another Edison, New Jersey warehouse for $196 million', description: '', link: 'https://example.test/d3', pubDate: day(2) },
];
const deduped = CM.cmBuildSections(duplicateSale, AS_OF, 168);
h.chk(deduped.buckets.sales.length === 2, 'same amount/company/geography collapses, a different amount stays');
h.chk(deduped.deduped.sales === 1, 'dedup diagnostics record the removed copy');

const syndicatedMiami = [
  { title: 'ACME buys Miami-Dade County warehouse portfolio for $195M', description: '', link: 'https://example.test/lp1', pubDate: day(1) },
  { title: 'ACME expands Miami-Dade industrial portfolio with $195M acquisition', description: '', link: 'https://example.test/lp2', pubDate: day(2) },
  { title: 'SampleCo buys two fully leased Miami warehouses for $109M', description: '', link: 'https://example.test/ar1', pubDate: day(1) },
  { title: 'Two distribution warehouses in Miami-Dade sold for $109M', description: '', link: 'https://example.test/ar2', pubDate: day(1) },
  { title: 'Zeta Example Holdings buys a Miami-Dade warehouse for $109M', description: '', link: 'https://example.test/vx1', pubDate: day(1) },
];
const syndicatedDeduped = CM.cmBuildSections(syndicatedMiami, AS_OF, 168);
h.chk(syndicatedDeduped.buckets.sales.length === 3,
  'county aliases and an omitted buyer still collapse two proven syndicated pairs');
h.chk(syndicatedDeduped.buckets.sales.some(a => a.title.includes('Zeta Example Holdings')),
  'same amount and county alone never collapse a separate single-asset deal');

h.section('delivery renderer is capped and cannot look like the sandbox');
const manySales = Array.from({ length: 8 }, (_, i) => ({
  title: `Buyer ${i} acquires Edison, New Jersey industrial warehouse for $${30 + i} million`,
  description: `Buyer ${i} completed an industrial acquisition in Edison.`,
  link: `https://example.test/many-${i}`,
  pubDate: day(1),
}));
const delivery = CM.buildCapitalMarketsNewsletterHTML(manySales, {
  asOfDate: AS_OF, lookbackHours: 168, renderMode: 'delivery',
  maxItemsPerSection: 6, includeWeekInReview: false, testBanner: true,
});
h.chk(/^<!DOCTYPE html>/.test(delivery), 'delivery mode emits a complete email document');
h.chk(/TEST ONLY — DO NOT FORWARD/.test(delivery), 'canary banner is available');
h.chk(!/PREVIEW ONLY|Diagnostics|sandbox/.test(delivery), 'delivery mode removes preview diagnostics and sandbox labels');
h.chk(!/Week in Review/.test(delivery), 'delivery caller controls Friday-only visibility');
h.chk(/Showing 6 of 8 qualifying items/.test(delivery), 'delivery sections are capped at six items');
h.chk(new Set([...delivery.matchAll(/many-(\d+)/g)].map(m => m[1])).size === 6, 'only six sale items render');
const fridayDelivery = CM.buildCapitalMarketsNewsletterHTML(corpus, {
  asOfDate: AS_OF, lookbackHours: 168, renderMode: 'delivery', includeWeekInReview: true,
});
h.chk(/Week in Review — Top 5 Developments/.test(fridayDelivery), 'delivery uses the exact requested weekly heading');
h.chk(!/TEST ONLY/.test(fridayDelivery), 'test banner is opt-in, never implicit');

process.exit(h.done());
