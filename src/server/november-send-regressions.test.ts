import assert from 'node:assert/strict';
import { isTargetRegion, isNotExcludedRegion, hasGeographicFailure, passesRelevantEditorialVerdict, mapFeedItemsToArticles,
    applyTransactionFilter, applyAvailabilityFilter } from './newsletter-filters.js';
import { isCompletedHeadlineDeal, newsletterCategory } from '../shared/development-signal.js';
import { extractSubjectFacilityKey, subjectFacilityKeysSameStory } from '../shared/url-utils.js';

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

// November 10 and 11. A bare listing page with only an address can't be checked against the
// availability floor; the same listing with a stated size or acreage stays eligible.
for (const title of ['260 Example Dr, Parsippany, NJ 07054 - Industrial for Lease - LoopNet',
    '905 Example Ave, Tampa, FL 33612 - Industrial for Lease - LoopNet']) {
    assert.equal(applyAvailabilityFilter([item(title, 'availabilities')]).length, 0, title);
}
for (const title of ['260 Example Dr, Parsippany, NJ 07054 - 48,000 SF Industrial for Lease - LoopNet',
    '905 Example Ave, Tampa, FL 33612 - 12 Acres Industrial Land for Sale - LoopNet']) {
    assert.equal(applyAvailabilityFilter([item(title, 'availabilities')]).length, 1, title);
}
assert.equal(applyAvailabilityFilter([item('260 Example Dr, Parsippany, NJ - Industrial for Lease - LoopNet', 'availabilities',
    'A 48,000 SF warehouse with 32-foot clear height is available for lease in Parsippany.')]).length, 1,
    'a size recovered into the description counts');

// Off topic: a shipper's trade-policy operations story, and an opinion poll led by local opposition
for (const title of ['Example Apparel shipper expands US fulfillment operations to skirt de minimis’ end - Supply Chain Dive',
    'N.J. voters divided on data center development nationally, strongly opposed locally: Example poll - ROI-NJ']) {
    assert.equal(passesRelevantEditorialVerdict(item(title, 'relevant')), false, title);
}
for (const title of ['Tariffs slow industrial leasing across the New Jersey market',
    'Example Retailer opens 500,000 SF fulfillment center in Carteret ahead of de minimis change']) {
    assert.equal(passesRelevantEditorialVerdict(item(title, 'relevant')), true, title);
}

// One occupier's facility opening carried by two publishers is one story; the same company
// in a different town, or with a different stated size, is not
const sameStory = (a: string, b: string) => {
    const ka = extractSubjectFacilityKey(a), kb = extractSubjectFacilityKey(b);
    return !!ka && !!kb && subjectFacilityKeysSameStory(ka, kb);
};
assert.equal(sameStory('Example Pharmaceuticals Opens Largest North American Distribution Center in PA - Connect CRE',
    'Example Pharmaceuticals Inaugurates U.S. Distribution Center in Allentown - StreetInsider'), true);
assert.equal(sameStory('Example Foods opens distribution center in Allentown',
    'Example Foods opens distribution center in Tampa'), false);
assert.equal(sameStory('Example Foods opens 200,000 SF distribution center in Pennsylvania',
    'Example Foods opens 600,000 SF distribution center in Pennsylvania'), false);
assert.equal(sameStory('Example Developer starts work on Winter Haven spec warehouse',
    'Example Developer to invest $200M in Lakeland warehouse expansion'), false, 'unlocated projects stay apart');
assert.equal(sameStory('Inside Industrial: Why Cold Storage Is Becoming More Specialized',
    'Inside Industrial: Why Warehouse Rents Are Rising'), false, 'a column name is not a company');

console.log('PASS: November 9-11 send regressions (out-of-region, off-topic, vacant-building purchase, sizeless listings, repeats)');
