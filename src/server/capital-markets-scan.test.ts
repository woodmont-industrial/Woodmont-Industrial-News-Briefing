/**
 * On-demand Capital Markets scanner.
 *
 * Deterministic: every fetch is stubbed, so no network and no publisher is
 * contacted. Live behaviour is exercised separately by running the scan.
 */
import {
    hostDeclared, classifyFailure, parseFeedArticles, parseNewsroomLinks, magnitudeUnit, evidenceSentence,
    articleText, articleDate, loadScanConfig, runCapitalMarketsScan, Fetcher,
} from './capital-markets-scan.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let failures = 0;
const check = (ok: unknown, label: string): void => {
    if (ok) console.log(`  OK   ${label}`);
    else { console.error(`  FAIL ${label}`); failures++; }
};

async function main(): Promise<void> {
console.log('=== trust: only a host the source declared ===');
check(hostDeclared('https://example-developer.test/x', ['example-developer.test']), 'the declared host is allowed');
check(hostDeclared('https://news.example-developer.test/x', ['example-developer.test']), 'a subdomain is allowed');
check(!hostDeclared('https://notexample-developer.test/x', ['example-developer.test']), 'a lookalike is refused');
check(!hostDeclared('https://news.google.com/rss/articles/CB', ['example-developer.test']),
    'a Google News proxy can never be fetched');

console.log('=== a refusal is not permanent ===');
check(classifyFailure('403') === 'refused', '403 is an access refusal');
check(classifyFailure('404') === 'refused', '404 is an access refusal');
check(classifyFailure('timeout') === 'transient', 'a timeout is transient');
check(classifyFailure('503') === 'transient', 'a 5xx is transient');

console.log('=== parsing ===');
const feed = `<rss><channel>
  <item><title>Builder Completes 358,000 square foot Industrial Project in Edison, New Jersey</title>
    <link>https://example.test/a</link><pubDate>Tue, 22 Sep 2026 16:22:24 +0000</pubDate>
    <description>The warehouse is complete.</description></item>
</channel></rss>`;
const parsed = parseFeedArticles(feed, 10);
check(parsed.length === 1 && parsed[0].title.startsWith('Builder Completes'), 'an RSS item is parsed');
check(parsed[0].link === 'https://example.test/a', 'its link is parsed');

const newsroom = `<html><body>
  <a href="/news/completes-a-358000-sf-industrial-building">Company Completes 358,000 SF Industrial Building in Edison</a>
  <a href="/news/short">Read more</a>
  <a href="https://elsewhere.test/story">An Offsite Story With A Long Enough Headline To Pass</a>
</body></html>`;
const links = parseNewsroomLinks(newsroom, 'https://example.test/news', ['example.test']);
check(links.length === 1, `only on-domain headline links are followed (${links.length})`);
check(links[0].link.endsWith('/news/completes-a-358000-sf-industrial-building'), 'the article link is resolved');

check(articleText('<script>x()</script><p>Hello <b>world</b></p>') === 'Hello world', 'scripts and tags are stripped');
check(articleDate('<meta property="article:published_time" content="2026-09-22T10:00:00Z">').startsWith('2026-09-22'),
    'a published date is read from meta');

console.log('=== config ===');
const cfg = loadScanConfig();
check(cfg.selection.states.length > 0, `selection states are configured (${cfg.selection.states.join('/')})`);
check(cfg.defaults.lookbackDays === 30, 'the default lookback is 30 days');
// The config must carry NO company names or domains: the watchlist is the one
// file authorised to hold them, and a second copy is what the privacy guard
// exists to prevent.
const configText = fs.readFileSync('config/capital-markets-scan-sources.json', 'utf8');
check(!/"domains"\s*:/.test(configText) && !/"homepage"\s*:/.test(configText),
    'the config holds selection criteria only, never names or domains');


console.log('=== evidence is the sentence carrying the figure ===');
check(
    evidenceSentence('Home About Contact News. The developer completed a 53,315 square foot facility on the site.', 53315)
        === 'The developer completed a 53,315 square foot facility on the site.',
    'navigation is skipped and the stating sentence is quoted');
check(evidenceSentence('Nothing numeric here at all, just prose about the company and its history.', null) === null,
    'no figure yields no evidence sentence');

console.log('=== magnitude carries a unit ===');
// cmClassify returns ONE magnitude: dollars for a sale, square feet for a
// lease, availability or completion. Storing both in squareFeet rendered a
// $53M sale as 53,000,000 SF on the website.
check(magnitudeUnit('sales') === 'usd', 'a sale magnitude is dollars');
check(magnitudeUnit('leases') === 'sf', 'a lease magnitude is square feet');
check(magnitudeUnit('availabilities') === 'sf', 'an availability magnitude is square feet');
check(magnitudeUnit('construction') === 'sf', 'a construction magnitude is square feet');
check(magnitudeUnit('intel') === null, 'intelligence carries no magnitude unit');
console.log('=== a scan run, fully stubbed ===');
const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-scan-'));
fs.mkdirSync(path.join(docsDir, 'data'), { recursive: true });
fs.mkdirSync(path.join(docsDir, 'js'), { recursive: true });
for (const f of ['index.html', 'capital-markets-geography.json', 'capital-markets-places.json',
                 'js/capital-markets.js', 'data/capital-markets-watchlist.json']) {
    const from = path.join(process.cwd(), 'docs', f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(docsDir, f));
}
// The resolver reads the watchlist, so the temp docs dir gets a synthetic one.
fs.writeFileSync(path.join(docsDir, 'data', 'capital-markets-watchlist.json'), JSON.stringify({
    version: 1, rowCount: 2, companies: [{
        'Company Name': 'Example Developer', 'Secondary Type': 'Developer - Regional',
        'City': 'Newark', 'State / Country': 'NJ',
        'Website': 'https://example-developer.test/', 'Website Domain': 'example-developer.test',
    }, {
        // The stub refuses this one, so the refusal path stays exercised.
        'Company Name': 'Example Refuser', 'Secondary Type': 'Developer - Regional',
        'City': 'Trenton', 'State / Country': 'NJ',
        'Website': 'https://example-refuser.test/', 'Website Domain': 'example-refuser.test',
    }],
}, null, 2));
const recent = new Date(Date.now() - 2 * 86400000).toUTCString();
const stub: Fetcher = async (url) => {
    if (/example-developer\.test\/?$/.test(url)) {
        return { ok: true, status: '200', body: '<a href="https://www.example-developer.test/feed/">News</a>' };
    }
    if (/example-developer\.test\/feed/.test(url)) {
        return { ok: true, status: '200', body: `<rss><channel><item>
            <title>Example Developer Completes Class A Industrial Facility in Edison, New Jersey</title>
            <link>https://www.example-developer.test/story</link><pubDate>${recent}</pubDate>
            <description>The industrial warehouse facility is complete.</description></item></channel></rss>` };
    }
    return { ok: false, status: '403', body: '' };
};
const result = await runCapitalMarketsScan({ docsDir, fetcher: stub, write: false, lookbackDays: 30 });
check(result.hits.length === 1, `a qualifying construction item is found (${result.hits.length})`);
check(result.hits[0]?.section === 'construction', `routed to construction (${result.hits[0]?.section})`);
check(result.hits[0]?.tier === 'TARGET', `in a target market (${result.hits[0]?.tier})`);
check(Boolean(result.hits[0]?.evidence), 'the evidence it judged is recorded');
check(Boolean(result.hits[0]?.link), 'a direct link is recorded');
check(result.newSinceLastScan.length === 1, 'with no prior scan, everything is new');
const refused = result.sources.filter(s => s.outcome === 'refused');
check(refused.length > 0, `refused sources are recorded rather than dropped (${refused.length})`);
check(refused.every(s => Boolean(s.retryAfter)), 'each refusal carries a retry time');
check(result.runtimeSeconds >= 0 && result.requests > 0, 'runtime and request count are reported');
console.log('=== a future date is not a publication date ===');
{
    const future = new Date(Date.now() + 20 * 86400000).toUTCString();
    const futureStub: Fetcher = async (url) => {
        if (/example-developer\.test\/?$/.test(url)) {
            return { ok: true, status: '200', body: '<a href="https://example-developer.test/feed/">News</a>' };
        }
        if (/example-developer\.test\/feed/.test(url)) {
            return { ok: true, status: '200', body: `<rss><channel><item>
                <title>Example Developer Completes Class A Industrial Facility in Edison, New Jersey</title>
                <link>https://example-developer.test/story</link><pubDate>${future}</pubDate>
                <description>The industrial warehouse facility is complete.</description></item></channel></rss>` };
        }
        return { ok: false, status: '403', body: '' };
    };
    const r = await runCapitalMarketsScan({ docsDir, fetcher: futureStub, write: false, lookbackDays: 30 });
    check(r.hits.length === 0, `a story dated 20 days ahead is not reported (${r.hits.length} hits)`);
}

fs.rmSync(docsDir, { recursive: true, force: true });

console.log(failures ? `\n${failures} FAILURE(S)` : '\nOK: Capital Markets scan');
process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
