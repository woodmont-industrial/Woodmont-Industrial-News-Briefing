import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { applyTransactionFilter, applyAvailabilityFilter, applyStrictFilter,
    isRoutableRegionalDeal, mapFeedItemsToArticles } from './newsletter-filters.js';
import { RELEVANT_KEYWORDS } from '../shared/region-data.js';
import { generateJSONFeed } from '../build/feed-generators.js';
import type { NormalizedItem } from '../types/index.js';

const item = (id: string, title: string, extra = {}): NormalizedItem => ({
    id, title, description: title, category: 'transactions',
    link: `https://news.google.com/synthetic-${id}`, source: 'Example Publication',
    pubDate: '2026-10-29T10:00:00Z', _woodmontApprove: true, ...extra,
} as NormalizedItem);
const listing = (id: string, extra = {}) => item(id,
    '42 Example Rd, Port Reading, NJ — 90,956 SF Warehouse / Office for Lease - LoopNet', extra);
const artifacts = [
    item('index', 'Orlando Industrial Real Estate - Orlando Commercial Listings & Brokers - LoopNet'),
    item('directory', 'Doral, FL Commercial Real Estate for Lease and Sale - PropertyShark'),
    item('stocks', 'Example Pharma stock: US distribution hub expands supply chain', { category: 'relevant' }),
    item('opposition', 'Pennsylvania residents win fight against data center planned on 37 acres', { category: 'relevant' }),
];

for (const extra of [{}, { description: 'A former owner sold a different warehouse last year.' }]) {
    const a = listing('listing', extra);
    assert.equal(mapFeedItemsToArticles([a])[0].category, 'availabilities');
    assert.equal(applyTransactionFilter([a]).length, 0, 'a headline offer is never a completed deal');
    assert.equal(applyAvailabilityFilter([a]).length, 1, 'a specific 90K listing remains eligible');
    assert.equal(isRoutableRegionalDeal(a), false, 'a rejected listing cannot escape into Relevant');
}
for (const title of [
    'Example Buyer acquires a 120,000 SF warehouse in Edison NJ; other space is for lease',
    'Example Tenant leased a 120,000 SF warehouse in Edison NJ',
    'Example Owner sells a warehouse in Edison NJ for $30M',
]) {
    const a = item('completed', title);
    assert.equal(mapFeedItemsToArticles([a])[0].category, 'transactions');
    assert.equal(applyTransactionFilter([a]).length, 1);
}
assert.equal(applyTransactionFilter([item('financing-control', 'Example Owner secures $30M financing for an Edison NJ warehouse', {
    description: 'Another industrial building in the park is for lease.',
})]).length, 1, 'a body-only availability mention must not relocate a financing story');
for (const original of artifacts) for (const verdict of [true, false, null]) {
    const a = { ...original, _woodmontApprove: verdict };
    assert.equal(applyStrictFilter([{ ...a, category: 'relevant' }], RELEVANT_KEYWORDS, 'Relevant').length, 0,
        `${a.id}: an affirmative or missing AI verdict cannot admit this artifact`);
    assert.equal(isRoutableRegionalDeal(a), false);
    if (['index', 'directory'].includes(a.id)) {
        assert.equal(applyAvailabilityFilter([a]).length, 0);
        assert.equal(applyTransactionFilter([a]).length, 0);
    }
}
for (const title of [
    'Industrial Boomtowns: warehouse demand accelerates nationwide - CommercialSearch',
    'Which trade disruptions are reshaping industrial demand? - CommercialSearch',
    'Orlando industrial real estate outlook: warehouse vacancy eases - CommercialSearch',
    'Example REIT stock: company buys a 120,000 SF warehouse in Edison NJ for $30M',
    'County data center ban overturned as construction begins in Pennsylvania',
]) {
    const a = item('editorial', title, { category: 'relevant' });
    assert.equal(applyStrictFilter([a], RELEVANT_KEYWORDS, 'Relevant').length, 1, title);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'newsletter-content-'));
try {
    fs.mkdirSync(path.join(scratch, 'preferences'));
    const replay = (feed: NormalizedItem[], manual: NormalizedItem[] = [], reserve: NormalizedItem[] = []) => {
        fs.writeFileSync(path.join(scratch, 'feed.json'), JSON.stringify(generateJSONFeed(feed)));
        fs.writeFileSync(path.join(scratch, 'included-articles.json'), JSON.stringify({ articles: manual.map(a =>
            ({ ...a, url: a.link, date_published: a.pubDate })) }));
        const sections: Record<string, unknown[]> = {};
        for (const a of reserve) (sections[a.category || 'relevant'] ||= []).push({ ...a, url: a.link, date_published: a.pubDate });
        fs.writeFileSync(path.join(scratch, 'preferences/reserve-pool.json'), JSON.stringify({ sections }));
        fs.writeFileSync(path.join(scratch, 'weekly-top-articles.json'), JSON.stringify({ week: { '2026-10-29':
            artifacts.map(a => ({ ...a, category: a.id === 'index' ? 'availabilities' : 'relevant' })) } }));
        const output = path.join(scratch, 'result.json');
        execFileSync(process.execPath, ['--import', 'tsx', 'scripts/replay-editorial-email.ts', scratch, output, '2026-10-30T12:00:20Z'],
            { cwd: process.cwd(), env: { PATH: process.env.PATH, TZ: 'America/New_York' }, stdio: 'pipe' });
        return JSON.parse(fs.readFileSync(output, 'utf8'));
    };
    const control = item('good-market', 'Industrial warehouse demand strengthens in New Jersey', { category: 'relevant' });
    for (const route of ['feed', 'reserve', 'manual']) {
        const a = listing(route + '-listing');
        const bad = artifacts.map(x => ({ ...x, id: `${route}-${x.id}` }));
        const result = route === 'feed' ? replay([control, a, ...bad])
            : route === 'manual' ? replay([control], [a, ...bad]) : replay([control], [], [a, ...bad]);
        assert.ok(result.sections.availabilities.includes(a.id), `${route}: listing reaches final Availability HTML`);
        assert.ok(!result.sections.transactions.includes(a.id));
        const selected = [...Object.values(result.sections).flat(), ...result.weekInReviewIds];
        for (const b of [...bad, ...artifacts]) assert.ok(!selected.includes(b.id), `${route}: ${b.id} cannot re-enter`);
        assert.ok(result.sections.relevant.includes(control.id));
        assert.equal(result.networkRequests, 0);
    }
    console.log('PASS: listing routing, catalog/stock/opposition guards, editorial controls and three non-sending rendered paths');
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}
