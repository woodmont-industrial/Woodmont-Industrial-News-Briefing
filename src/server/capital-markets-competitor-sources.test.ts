import {
    discoverCompetitorSources,
    extractCompetitorSourceEndpoints,
    planCompetitorSites,
} from './capital-markets-competitor-sources.js';

let failures = 0;
function check(value: unknown, label: string): void {
    if (value) console.log(`  OK   ${label}`);
    else { console.error(`  FAIL ${label}`); failures++; }
}
async function rejects(fn: () => Promise<unknown>, label: string): Promise<void> {
    try { await fn(); check(false, label); } catch { check(true, label); }
}

async function main(): Promise<void> {
console.log('=== Capital Markets competitor-source discovery ===');
const watchlist = [
    { 'Company Name': 'ACME Industrial', Website: 'https://www.acme.example/about' },
    { 'Company Name': 'Vertex Property Group', 'Website Domain': 'vertex.example' },
    { 'Company Name': 'Duplicate ACME', 'Website Domain': 'acme.example' },
    { 'Company Name': 'Unsafe Local', Website: 'http://127.0.0.1/private' },
    { 'Company Name': 'Missing Site' },
];

const plan = planCompetitorSites(watchlist, 25);
check(plan.sites.length === 2, 'valid company sites are normalized and duplicate domains collapse');
check(plan.sites[0].homepage === 'https://www.acme.example/', 'homepage paths are reduced to a safe HTTPS origin');
check(plan.rejectedInputs === 2, 'missing and IP-based website inputs are rejected');

const html = `
  <link rel="alternate" type="application/rss+xml" href="/news/feed.xml">
  <link href="https://outside.example/feed" rel="alternate" type="application/atom+xml">
  <a href="/press-releases">Press releases</a>
  <a href="https://news.acme.example/insights">Insights</a>
  <a href="/newsroom">Newsroom</a>
  <a href="javascript:alert(1)">News</a>
  <a href="/careers">Careers</a>`;
const endpoints = extractCompetitorSourceEndpoints(html, 'https://www.acme.example/', 0);
check(endpoints.length === 4, 'feed, news pages, newsroom, and official subdomain are discovered');
check(endpoints.filter(endpoint => endpoint.kind === 'feed').length === 1, 'feed endpoint is labelled separately');
check(endpoints.every(endpoint => !endpoint.url.includes('outside.example') && !endpoint.url.startsWith('javascript:')),
  'external and executable URLs are excluded');

let disabledLoads = 0;
const disabled = await discoverCompetitorSources(watchlist, {
    homepageLoader: async () => { disabledLoads++; return html; },
});
check(disabled.diagnostics.enabled === false && disabledLoads === 0,
  'discovery is disabled by default and performs zero network-loader calls');
check(disabled.endpoints.length === 0, 'disabled discovery returns no private derived endpoints');

let enabledLoads = 0;
const enabled = await discoverCompetitorSources(watchlist, {
    enabled: true,
    homepageLoader: async url => { enabledLoads++; return url.includes('acme') ? html : null; },
});
check(enabledLoads === 2 && enabled.diagnostics.sitesExamined === 2,
  'an explicitly enabled, injected loader examines only planned sites');
check(enabled.diagnostics.endpointsDiscovered === 4, 'diagnostics report counts without company names or domains');
check(!JSON.stringify(enabled.diagnostics).includes('ACME') && !JSON.stringify(enabled.diagnostics).includes('.example'),
  'diagnostics contain no private identifying values');

await rejects(() => discoverCompetitorSources(watchlist, { enabled: true }),
  'enabled discovery without an explicit loader fails closed');
try {
    extractCompetitorSourceEndpoints('x'.repeat(1_000_001), 'https://acme.example/', 0);
    check(false, 'oversized homepage HTML is rejected');
} catch {
    check(true, 'oversized homepage HTML is rejected');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nOK: competitor-source discovery');
process.exit(failures ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
