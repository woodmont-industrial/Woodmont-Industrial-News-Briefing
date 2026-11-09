import assert from 'node:assert/strict';
import { isTargetRegion, isNotExcludedRegion, hasGeographicFailure, passesRelevantEditorialVerdict, mapFeedItemsToArticles,
    applyTransactionFilter, applyAvailabilityFilter } from './newsletter-filters.js';
import { isCompletedHeadlineDeal, newsletterCategory } from '../shared/development-signal.js';

// Shapes of three items that reached the November 9 send. Company names are synthetic;
// the headline wording, places and sizes are the ones that caused the misses.
const item = (title: string, category: string, description = title) => ({
    id: title, title, description, category, source: 'Example Publication',
    link: 'https://news.google.com/rss/articles/example', url: 'https://news.google.com/rss/articles/example',
    pubDate: '2026-11-08T12:00:00Z', _woodmontApprove: true,
} as any);

// Out of region: a Florida company is searching, but the property is in South Bend, Indiana.
// The Google News link matters: it is an approved domain, so only the headline rule stops it.
const southBend = mapFeedItemsToArticles([item(
    'Florida company seeks property in South Bend for proposed data center development - WNDU', 'relevant')])[0];
assert.deepEqual(hasGeographicFailure(southBend), { fails: true, reason: 'PRIMARY_LOCATION_NON_TARGET' });
assert.equal(isTargetRegion(southBend), false, 'a Florida searcher does not make an Indiana property regional');
assert.equal(isNotExcludedRegion(southBend), false, 'and it cannot enter Relevant as national news either');
for (const title of ['Miami company seeks space in Doral for a new distribution hub',
    'New Jersey logistics firm eyes site in Edison for 200,000 SF warehouse',
    'Miami landlord seeks tenants for vacant warehouse']) {
    assert.equal(hasGeographicFailure(mapFeedItemsToArticles([item(title, 'relevant')])[0]).fails, false, title);
}

// Off topic: an executive change at an energy-technology company. The AI rubric rejected it;
// production let it back in through backfill. Relevant must honour the rejection on every path.
const energyCeo = mapFeedItemsToArticles([{ ...item(
    'Example Grid Co-Founder Returns as CEO to Power New Battery Product', 'relevant',
    'Example Grid, an energy data management platform for commercial real estate, announced Wednesday that its co-founder has returned as CEO to lead the rollout of its new storage battery business.'),
    _woodmontApprove: false, _woodmontReason: 'Software/SAAS focus, not an industrial real estate transaction or asset' }])[0];
assert.equal(isTargetRegion(energyCeo), false, 'no NJ/PA/FL property');
assert.equal(passesRelevantEditorialVerdict(energyCeo), false, 'a rubric rejection keeps it out of Relevant');

// Wrong section: a completed purchase of a vacant building is a transaction, not an availability
const purchase = item('Example Buyer grabs vacant 171,000 sq. ft. warehouse adjacent to Port Newark Container Terminal - Real Estate NJ', 'availabilities');
assert.equal(isCompletedHeadlineDeal(purchase.title), true);
assert.equal(newsletterCategory(purchase), 'transactions');
const routed = mapFeedItemsToArticles([purchase])[0];
assert.equal(routed.category, 'transactions');
assert.equal(applyTransactionFilter([routed]).length, 1, '171,000 SF clears the transaction floor');
for (const title of ['Example Investor snaps up 120,000 SF Edison NJ warehouse', 'Example Fund scoops up vacant Lehigh Valley warehouse',
    'Example Tenant takes 94,000 sq. ft. at new Carteret warehouse']) {
    assert.equal(newsletterCategory(item(title, 'availabilities')), 'transactions', title);
}

// Genuine offers stay availabilities, including "vacant" buildings that are being marketed
for (const title of ['Example Owner lists vacant 171,000 SF warehouse near Port Newark',
    'Vacant 171,000 SF Port Newark warehouse available for lease',
    '4240 Example St, Allentown, PA 18104 - Office/ Warehouse- Flex Property For Sale!!! - LoopNet',
    'Example Developer that bought Edison site now offers 200,000 SF for lease']) {
    assert.equal(isCompletedHeadlineDeal(title), false, title);
    assert.equal(newsletterCategory(item(title, 'availabilities')), 'availabilities', title);
}
assert.equal(applyAvailabilityFilter([item('Vacant 171,000 SF Port Newark warehouse available for lease', 'availabilities')]).length, 1);

console.log('PASS: November 9 send regressions (out-of-region, off-topic, vacant-building purchase)');
