import assert from 'node:assert/strict';
import { isTargetRegion, isNotExcludedRegion, hasGeographicFailure, passesRelevantEditorialVerdict, mapFeedItemsToArticles,
    applyTransactionFilter, applyAvailabilityFilter, isSizeOnlyRubricRejection, normalizeTitleKey } from './newsletter-filters.js';
import { isCompletedHeadlineDeal, newsletterCategory } from '../shared/development-signal.js';
import { extractSubjectFacilityKey, subjectFacilityKeysSameStory, subjectFacilitySignature, dealEventFromTitleKey, dealEventsSameDeal,
    dealEventClass } from '../shared/url-utils.js';

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
// The same opening named two ways by different publishers (November 2-4 chained replay)
assert.equal(sameStory('Example Micro Fulfillment Opens Sixth U.S. Facility in Pennsylvania - citybiz',
    'Example Micro Fulfillment expands network, opens new eCommerce support facility in Pennsylvania - Example Journal'), true);
assert.equal(sameStory('Example Pharmaceuticals Plans Allentown, Pennsylvania, Distribution Operations - Area Development',
    'Example Pharmaceuticals Inaugurates U.S. Distribution Center in Allentown - StreetInsider'), true);
assert.equal(sameStory('Example Pharmaceuticals opens manufacturing plant in Allentown',
    'Example Pharmaceuticals opens distribution center in Allentown'), false, 'a plant and a distribution center are two stories');
// Across days the key is carried in sent-state, so a later publisher's copy is a repeat
assert.equal(subjectFacilitySignature('Example Pharmaceuticals Inaugurates U.S. Distribution Center in Allentown - StreetInsider'),
    subjectFacilitySignature('Example Pharmaceuticals Opens Largest North American Distribution Center in PA - Connect CRE'));
assert.equal(subjectFacilitySignature('Example Developer starts work on spec warehouse'), null, 'no state, no cross-day key');
assert.equal(sameStory('Inside Industrial: Why Cold Storage Is Becoming More Specialized',
    'Inside Industrial: Why Warehouse Rents Are Rising'), false, 'a column name is not a company');

// Out of region: a Jacksonville in Arkansas is not the Florida city (shipped in Availabilities on November 12)
const arkansas = mapFeedItemsToArticles([item('Industrial For Lease — 1000 Example Rd, Jacksonville, AR 72076, USA | United States - Colliers', 'availabilities')])[0];
assert.equal(isTargetRegion(arkansas), false, 'Jacksonville, AR is not Florida');
assert.equal(isTargetRegion(mapFeedItemsToArticles([item('Industrial For Lease — 100 Example Blvd, Jacksonville, FL 32218 - Colliers', 'availabilities')])[0]), true);

// Smaller deals in our markets. The rubric's retired 100K SF / $25M floor rejected these
// October-November deals on size alone; the code's own floor (50K SF or $10M) decides instead.
const rejected = (title: string, reason: string, category = 'transactions') =>
    mapFeedItemsToArticles([{ ...item(title, category), _woodmontApprove: false, _woodmontReason: reason }])[0];
for (const [title, reason] of [
    ['Example REIT sells 86,000 sq. ft. Meadowlands warehouse in $25 million deal - Real Estate NJ',
        'Wrong region — Meadowlands is located in New Jersey (NJ), which is a target region, but the deal size is 86,000 SF which is below the 100K SF threshold'],
    ['Example REIT Signs 82,000-Square-Foot Industrial Lease in Avenel, New Jersey - citybiz',
        'Lease size 82,000 SF is below the 100,000 SF threshold for transactions (Rule: Deal threshold)'],
    ['Fragrance distributor buys 63,000 sq. ft. Edison warehouse for $18.1 million - Real Estate NJ',
        'Transaction below threshold: 63,000 sq. ft. and $18.1 million, does not meet the $25M or 100K SF minimum (Rule: APPROVE criteria not met)'],
    ['Example Logistics takes 94,000 sq. ft. at new warehouse in Carteret - Real Estate NJ',
        'Transaction size below 100,000 SF threshold and published more than 7 days ago (Rule: APPROVE criteria not met)'],
]) {
    const deal = rejected(title, reason);
    assert.equal(isSizeOnlyRubricRejection(deal), true, title);
    assert.equal(applyTransactionFilter([deal]).length, 1, title);
}
// A size complaint next to an editorial reason, no stated figures, a market outside ours,
// or a deal under the code's own floor stays out
for (const [title, reason] of [
    ['260 Example Dr, Parsippany, NJ 07054 - 48,000 SF Industrial for Lease - LoopNet',
        'Listing aggregator title ends with "- LoopNet" and does not meet the $25M or 100K SF threshold (Rule 13 & transaction threshold)'],
    ['NYC top deals: Example Developers drops $17M on Greenpoint warehouse',
        'Wrong region — Greenpoint is in Brooklyn, NYC, which is explicitly excluded under Rule 9, and the $17M price is below the $25M threshold.'],
    ['Industrial Property on Example Drive Miami - Traded',
        'No transaction amount or size provided; does not meet the $25M or 100K SF threshold for industrial deals (Rule: APPROVE criteria not met)'],
    ['Example Maker opens new 58,000-square-foot manufacturing facility in Huntsville, Alabama',
        'Facility size 58,000 SF is below the 100,000 SF threshold for transactions (Rule: Deal threshold not met)'],
]) assert.equal(isSizeOnlyRubricRejection(rejected(title, reason)), false, title);
assert.equal(applyTransactionFilter([rejected('Example Owner sells 30,000 sq. ft. Edison warehouse for $4 million',
    'Transaction below threshold: 30,000 sq. ft. and $4 million, does not meet the $25M or 100K SF minimum')]).length, 0,
    'the code floor still applies after the size-only rejection is set aside');
assert.equal(passesRelevantEditorialVerdict(rejected('Example REIT Signs 82,000-Square-Foot Industrial Lease in Avenel, New Jersey',
    'Lease size 82,000 SF is below the 100,000 SF threshold for transactions (Rule: Deal threshold)', 'relevant')), false,
    'the exception is Transactions only; Relevant still honours every rejection');

// A sale re-reported weeks later is one deal (East Rutherford $25M, sent October 19 and again
// November 2 as "Meadowlands"); the same firm's other deals in the month are not
const deal = (title: string) => dealEventFromTitleKey(normalizeTitleKey(title));
const sameDeal = (a: string, b: string) => { const x = deal(a), y = deal(b); return !!x && !!y && dealEventsSameDeal(x, y); };
const reReported = 'Colliers sells 86,000 sq. ft. Meadowlands warehouse in $25 million deal with owner-user - Real Estate NJ';
assert.equal(sameDeal('Colliers Sells New Jersey Industrial Property for $25 Million - Yahoo Finance', reReported), true);
assert.equal(sameDeal('Colliers Sells Meadowlands Industrial Property for $25 Million - citybiz', reReported), true);
for (const other of ['Colliers sells 31,000 sq. ft. Fairfield industrial building for $8.8 million',
    'Colliers signs 86,000-square-foot lease in Meadowlands for $25 million',
    'Colliers sells 120,000 sq. ft. Meadowlands warehouse', 'Colliers sells Allentown, PA warehouse for $25 million',
    'Colliers sells New Jersey industrial portfolio'])
    assert.equal(sameDeal(other, reReported), false, other);
assert.equal(sameDeal('Colliers sells Kearny warehouse for $25 million', 'Colliers Sells East Rutherford Industrial Property for $25 Million'), false,
    'two named towns are two deals');
// A financing stays a financing: it never matches a sale, and a stale-only rejection being set
// aside does not turn it into a completed purchase
assert.equal(dealEventClass('Example Bank Supplies $133M Refi for Miami-Dade Industrial Campus'), 'finance');
assert.equal(sameDeal('Colliers arranges $133M refi for Miami-Dade industrial campus', 'Colliers sells Miami-Dade industrial campus for $133M'), false);
const refi = mapFeedItemsToArticles([{ ...item('Example Bank Supplies $133M Refi for Miami-Dade Industrial Campus - Commercial Observer', 'transactions',
    'Example Bank provided a $133 million refinancing for a warehouse and distribution campus in Medley, Miami-Dade County.'),
    _woodmontApprove: false, _woodmontReason: 'Article is older than 7 days (published 2026-11-03, today 2026-11-11) – Rule 11 (STALE)' }])[0];
assert.equal(isCompletedHeadlineDeal(refi.title), false, 'a refinancing headline is not a completed sale');
assert.equal(applyTransactionFilter([refi]).length, 1);
assert.equal(refi.category, 'transactions');

console.log('PASS: November 9-12 send regressions (out-of-region, off-topic, vacant-building purchase, sizeless listings, repeats, size-only rejections, 30-day deal repeats)');
