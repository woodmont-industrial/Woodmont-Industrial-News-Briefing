import assert from 'node:assert/strict';
import { isNotExcludedRegion, mapFeedItemsToArticles, applyStrictFilter, applyPeopleFilter } from './newsletter-filters.js';
import { RELEVANT_KEYWORDS } from '../shared/region-data.js';

// November 13: three items with no AI verdict reached the send on deterministic checks alone.
// Company names other than the ranking's subject are synthetic.
const unreviewed = (title: string, category: string) => mapFeedItemsToArticles([{
    id: title, title, description: title, category, source: 'Example Publication',
    link: 'https://news.google.com/rss/articles/example', url: 'https://news.google.com/rss/articles/example',
    pubDate: '2026-11-12T12:00:00Z', _woodmontApprove: null,
} as any])[0];
// The send applies the region gate before the Relevant filter
const relevantPasses = (title: string) =>
    applyStrictFilter([unreviewed(title, 'relevant')].filter(isNotExcludedRegion), RELEVANT_KEYWORDS, 'Relevant').length === 1;
const peoplePasses = (title: string) => applyPeopleFilter([unreviewed(title, 'people')]).length === 1;

// A Central Valley logistics hub named without its state is out of market
const tracy = unreviewed('Example Developer Adds Tracy Warehouse to West Region Industrial Portfolio - Connect CRE', 'relevant');
assert.equal(isNotExcludedRegion(tracy), false, 'Tracy, California is not national news for our markets');
assert.equal(relevantPasses(tracy.title), false);
assert.equal(relevantPasses('Example Developer adds Edison warehouse to New Jersey industrial portfolio'), true,
    'a regional portfolio addition still runs');

// CRE technology commentary is not industrial property news
assert.equal(relevantPasses('The Importance of a Unified Language for AI Development in CRE'), false);
assert.equal(relevantPasses('AI data center projects boost warehouse demand in New Jersey'), true,
    'AI driving warehouse demand is still a market story');
assert.equal(relevantPasses('Technology firm leases 120,000 SF warehouse in Edison, New Jersey'), true);

// A company award or workplace ranking is not a hire, promotion or appointment
assert.equal(peoplePasses('Logistics Plus Named to the 2026 Fortune Best Workplaces in Transportation List - Florida Today'), false);
assert.equal(peoplePasses('Example Logistics named to top workplaces list in New Jersey industrial sector'), false);
for (const title of ['Jane Doe named president of Example Logistics, a New Jersey industrial developer',
    'Award-winning broker joins Example Partners industrial team in Philadelphia',
    'Jane Doe named to Example Industrial REIT board of directors in New Jersey']) {
    assert.equal(peoplePasses(title), true, title);
}

console.log('PASS: November 13 send regressions (out-of-market city, technology commentary, recognition in People)');
