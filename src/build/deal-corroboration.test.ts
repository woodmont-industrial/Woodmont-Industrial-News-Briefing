// Deal-size corroboration for title-only Google News transactions (2026-11-25 Lakeland miss).
// Run: node --import tsx src/build/deal-corroboration.test.ts
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    corroborateDeal, cleanHeadline, dealKind, dealSubject, dealPlace, tiedFigures, defaultFetcher, type Fetcher,
} from './deal-corroboration.js';
import { enrichNewsletterFacts } from './newsletter-facts.js';
import { applyTransactionFilter } from '../server/newsletter-filters.js';

const now = new Date('2026-11-25T11:20:00Z');
const HEADLINE = 'News | World Electric Supply leases more than half of logistics center in Lakeland, Florida - CoStar';
const RB_TITLE = 'Cushman &amp; Wakefield Arranges 274,040 SF Industrial Lease in Lakeland, Florida';
const RB_LINK = 'https://rebusinessonline.com/cushman-wakefield-arranges-274040-sf-industrial-lease-in-lakeland-florida/';
// Publisher text (REBusinessOnline, 2026-11-20): one leased figure inside two container figures.
const RB_BODY = '<p>LAKELAND, FLA. &#8212;&nbsp;Cushman &amp; Wakefield has arranged a 274,040-square-foot industrial lease with World Electric Supply at a 520,042-square-foot warehouse and distribution facility in Lakeland, a city in Central Florida between Tampa and Orlando. The facility, Building 100, sits within Key Logistics Center, which spans 1.6 million square feet across three buildings and includes 36-foot clear heights.</p>';

const rss = (items: Array<{ title: string; host: string; date: string }>) => `<rss><channel>${items.map(i =>
    `<item><title>${i.title}</title><pubDate>${i.date}</pubDate><source url="https://${i.host}">x</source></item>`).join('')}</channel></rss>`;
const RSS_OK = rss([
    { title: 'News | World Electric Supply leases more than half of logistics center in Lakeland, Florida - CoStar', host: 'www.costar.com', date: 'Tue, 24 Nov 2026 20:03:26 GMT' },
    { title: 'Tampa electrical distributor leases Lakeland warehouse - The Business Journals', host: 'www.bizjournals.com', date: 'Wed, 18 Nov 2026 11:59:00 GMT' },
    { title: RB_TITLE + ' - REBusinessOnline', host: 'rebusinessonline.com', date: 'Fri, 20 Nov 2026 15:14:04 GMT' },
]);
const wp = (body: string, title = RB_TITLE, link = RB_LINK) =>
    JSON.stringify([{ date_gmt: '2026-11-20T15:14:04', link, title: { rendered: title }, content: { rendered: body } }]);

function fetcherFor(opts: { rss?: string; wp?: string; wpStatus?: number; calls?: string[] }): Fetcher {
    return async (url) => {
        opts.calls?.push(url);
        if (url.startsWith('https://news.google.com/rss/search')) return { status: 200, text: opts.rss ?? RSS_OK };
        if (url.startsWith('https://rebusinessonline.com/wp-json/')) return { status: opts.wpStatus ?? 200, text: opts.wp ?? wp(RB_BODY) };
        throw Error('unexpected url ' + url);
    };
}
const item = (extra: Record<string, unknown> = {}) => ({
    id: 'lakeland', title: HEADLINE, description: HEADLINE, category: 'transactions',
    link: 'https://news.google.com/rss/articles/CBMiLakeland', pubDate: '2026-11-24T20:02:40.000Z', ...extra,
}) as any;
const signal = AbortSignal.timeout(5000);
let pass = 0;
const ok = (name: string, cond: unknown) => { assert.ok(cond, name); console.log('✓ ' + name); pass++; };

// ---- headline parsing ----
ok('headline cleaned of "News |" prefix and publisher suffix',
    cleanHeadline(HEADLINE) === 'World Electric Supply leases more than half of logistics center in Lakeland, Florida');
ok('subject = tenant before the deal verb', dealSubject(cleanHeadline(HEADLINE)) === 'World Electric Supply');
ok('title-case subject stops at the verb', dealSubject("Brennan Investment Group's Opportunity Fund Acquires 100,790 SF Warehouse") === "Brennan Investment Group's Opportunity Fund");
ok('place = city after "in"', dealPlace(cleanHeadline(HEADLINE)) === 'Lakeland');
ok('lease vs sale kinds', dealKind('X leases a warehouse') === 'lease' && dealKind('X acquires a warehouse') === 'sale');

// ---- figure extraction: leased space, not the container ----
const figs = tiedFigures(RB_BODY.replace(/<[^>]+>/g, ' '), 'lease');
ok('lease extraction keeps only the leased 274,040 SF (not 520,042 building or 1.6M park)',
    figs.sf.size === 1 && figs.sf.has(274040));
ok('"leased N square feet" form', tiedFigures('Acme leased 120,500 square feet at the park.', 'lease').sf.has(120500));
ok('sale price tied to the sale', tiedFigures('Acme acquired a 90,000-square-foot warehouse for $21.5 million.', 'sale').usd.has(21500000));

(async () => {
    // ---- Lakeland end to end ----
    const calls: string[] = [];
    const r = await corroborateDeal(item(), { now, signal, fetcher: fetcherFor({ calls }) });
    ok('Lakeland corroborated from REBusinessOnline', r.reason === 'corroborated' && r.facts?.sourceUrl === RB_LINK);
    ok('Lakeland squareFeet = 274,040 leased', r.facts?.squareFeet === 274040 && r.facts?.priceUsd === null);
    ok('evidence is the publisher sentence naming the tenant', /World Electric Supply/.test(r.facts?.evidence[0] || ''));
    ok('property location evidence is in Florida', /Lakeland/.test(r.facts?.propertyLocationEvidence || ''));
    ok('records what it matched on', r.facts?.corroboration?.matchedOn.subject === 'World Electric Supply'
        && r.facts?.corroboration?.publishedAt === '2026-11-20T15:14:04.000Z');
    ok('only Google News search + REBusinessOnline API were requested (never CoStar)',
        calls.length === 2 && calls.every(u => !/costar\.com/.test(u)));

    // Through the build step: the item gains the figure and now clears the Transactions floor.
    const cachePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'corr-')), 'cache.json');
    const before = item();
    ok('without the figure the Transactions filter rejects it (the 11/25 behaviour)', applyTransactionFilter([before]).length === 0);
    const enriched = item();
    const stats = await enrichNewsletterFacts([enriched], { cachePath, now, corroborationFetcher: fetcherFor({}) });
    ok('build step enriches it', stats.corroborated === 1 && enriched._newsletterFacts?.squareFeet === 274040);
    ok('description carries the verified figure', /\[274,040 SF\]/.test(enriched.description));
    ok('description names the corroborating source and date',
        enriched.description.includes('Verified publisher facts: (rebusinessonline.com, 2026-11-20) '));
    ok('with the figure the Transactions filter now accepts it', applyTransactionFilter([enriched]).length === 1);
    const again = item();
    const stats2 = await enrichNewsletterFacts([again], { cachePath, now, corroborationFetcher: async () => { throw Error('should be cached'); } });
    ok('second build uses the cache (no requests)', stats2.cached === 1 && again._newsletterFacts?.squareFeet === 274040);

    // ---- refusals: leave unknown ----
    const unknown = async (name: string, f: Fetcher, expect: RegExp, it = item()) => {
        const res = await corroborateDeal(it, { now, signal, fetcher: f });
        ok(`${name} -> unknown (${res.reason})`, res.facts === null && expect.test(res.reason));
    };
    await unknown('publisher API blocked (403)', fetcherFor({ wpStatus: 403 }), /article-not-found/);
    await unknown('search blocked (429)', async () => ({ status: 429, text: '' }), /search-HTTP_429/);
    await unknown('no approved coverage (only CoStar/Bizjournals)', fetcherFor({ rss: rss([
        { title: HEADLINE, host: 'www.costar.com', date: 'Tue, 24 Nov 2026 20:03:26 GMT' }]) }), /no-approved-coverage/);
    await unknown('approved coverage too old (60 days)', fetcherFor({ rss: rss([
        { title: RB_TITLE, host: 'rebusinessonline.com', date: 'Fri, 25 Sep 2026 15:14:04 GMT' }]) }), /no-approved-coverage/);
    await unknown('article names a different tenant', fetcherFor({ wp: wp(RB_BODY.replace('World Electric Supply', 'Other Distributor Co')) }), /deal-not-verified/);
    await unknown('article is about another city', fetcherFor({ wp: wp(RB_BODY.replace(/Lakeland/gi, 'Ocala')) }), /deal-not-verified/);
    await unknown('article describes a sale, headline a lease', fetcherFor({ wp: wp('<p>Acme sold the 520,042-square-foot facility in Lakeland to World Electric Supply for $80 million.</p>') }), /deal-not-verified/);
    await unknown('only the building size is given', fetcherFor({ wp: wp('<p>World Electric Supply has signed a lease at a 520,042-square-foot warehouse in Lakeland.</p>') }), /no-tied-figure/);
    await unknown('two different leased figures', fetcherFor({ wp: wp('<p>World Electric Supply signed a 150,000-square-foot lease in Lakeland. A second tenant signed a 120,000-square-foot lease nearby.</p>') }), /ambiguous-figures/);
    await unknown('WP title does not match the search hit', fetcherFor({ wp: wp(RB_BODY, 'Some other Lakeland story') }), /article-not-found/);
    await unknown('link off the approved host', fetcherFor({ wp: wp(RB_BODY, RB_TITLE, 'https://evil.example.com/x') }), /article-not-found/);
    await unknown('headline without a place', fetcherFor({}), /no-subject-or-place/, item({ title: 'World Electric Supply leases more than half of logistics center - CoStar' }));

    // Transient failure is not cached; the next build retries.
    const cache2 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'corr-')), 'cache.json');
    const flaky = item();
    const s3 = await enrichNewsletterFacts([flaky], { cachePath: cache2, now, corroborationFetcher: async () => { const e = Error('t'); e.name = 'TimeoutError'; throw e; } });
    ok('timeout leaves item untouched', s3.corroborationUnknown.timeout === 1 && !flaky._newsletterFacts && flaky.description === HEADLINE);
    const retry = item();
    await enrichNewsletterFacts([retry], { cachePath: cache2, now, corroborationFetcher: fetcherFor({}) });
    ok('after a timeout the next build retries and succeeds', retry._newsletterFacts?.squareFeet === 274040);

    // Only transactions are looked up; relevant items are left alone.
    const rel = item({ category: 'relevant' });
    const s4 = await enrichNewsletterFacts([rel], { cachePath: cache2, now, corroborationFetcher: async () => { throw Error('must not fetch'); } });
    ok('non-transaction items are not looked up', s4.corroborationAttempted === 0 && !rel._newsletterFacts);

    // Default fetcher refuses hosts outside the allow list (no CoStar, no arbitrary redirects).
    await assert.rejects(defaultFetcher('https://www.costar.com/article/1', signal), /host not allowed/);
    ok('default fetcher refuses CoStar', true);

    console.log(`\n${pass} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
