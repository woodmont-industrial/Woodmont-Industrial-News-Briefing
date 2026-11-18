import assert from 'node:assert/strict';
import { applyTransactionFilter, isRoutableRegionalDeal, mapFeedItemsToArticles } from './newsletter-filters.js';
import { corporateDealKind, isCorporateAcquisition, summaryChangesDealScopeOrStatus } from '../shared/corporate-deal.js';

// Company names are synthetic; the headline shapes are the ones seen in the feed (2026-09 to 11).
const item = (title: string, category = 'transactions', description = title) => ({
    id: title, title, description, category, source: 'Example Publication',
    link: 'https://news.google.com/rss/articles/example', url: 'https://news.google.com/rss/articles/example',
    pubDate: '2026-11-17T18:32:00Z', _woodmontApprove: true,
} as any);

// --- Company-level M&A ---------------------------------------------------------------------
const corporate = [
    // 2026-11-18 send: shipped as a Transaction and summarized as a $100M facility purchase.
    "Canned water maker's $100 million acquisition includes Florida manufacturing facility - The Business Journals",
    'Example Pharma to Acquire Sample Bio’s CDMO Business and Springfield, New Jersey Manufacturing Facility - Wire',
    'Example Energy to buy out Sample Logistics partners, expand biofuels logistics presence - Wire',
    'Exclusive | Example Logistics in Talks to Buy Stake in Sample Co at $3 Billion Valuation - Paper',
    'Example Retail, Partners To Buy Sample Grocery REIT For $2.3B - Site',
    'Example Capital to test buyout interest for last-mile logistics provider Sample Pack, sources say',
    'Example Foods acquires Sample Snacks Inc. for $250 million',
    'Example Bottling agrees to acquire Sample Beverage Co.',
];
for (const title of corporate) assert.ok(isCorporateAcquisition(title), `corporate: ${title}`);

// --- Property deals keep flowing -------------------------------------------------------------
const property = [
    'Example Capital buys 3rd Broward warehouse this year for $33M - The Business Journals',
    'Biotech firm buys $27.5M warehouse near West Palm Beach, plans 100 jobs - The Business Journals',
    'Fragrance distributor buys 63,000 sq. ft. Edison warehouse for $18.1 million - Real Estate NJ',
    'Example Group Acquires 343 KSF NJ Logistics Facility - CommercialSearch',
    'Example Realty acquires 12-property industrial portfolio in New Jersey',
    'Example Partners Acquire $1B+ Portfolio From Sample Fund',
    'Example Industrial Expands Florida Footprint with Acquisition of Miami Industrial Property',
    'Example Logistics Acquires Truck Terminal in Off-Market Deal',
    'Example Owner acquires 3.5-acre low-coverage industrial site in Aberdeen',
    '$103M acquisition sets stage for overhaul of 4 industrial parks',
    'Example Bio Acquires 85,000-Square-Foot Pennsylvania Cell Therapy Manufacturing Facility',
    // Review 2026-11-18: "includes a warehouse" does not prove a company deal.
    'A $60M industrial property acquisition includes two warehouses in Edison',
    "Example Realty's $60M acquisition includes two warehouses in Edison",
    "Fragrance distributor's $18M purchase of an Edison warehouse",
    'JLL Arranges Acquisition Financing for Industrial Outdoor Storage Facility in Union, New Jersey',
    'Example Builder nears completion of 216,000 SF cold storage project in Bethlehem, Pennsylvania',
];
for (const title of property) assert.equal(corporateDealKind(title), null, `property deal: ${title}`);

// REIT take-privates: the named portfolio makes it Relevant; the buyout price is a company price.
const reitBuyout = 'Example Fund and Sample Pension Close $5.2B Example Industrial Trust Buyout, Take 52M SF Logistics Portfolio Private';
assert.equal(corporateDealKind(reitBuyout), 'reit-take-private');
assert.equal(corporateDealKind('Example Fund to take Sample Logistics REIT private in $4B deal'), 'reit-take-private');
const reit = mapFeedItemsToArticles([item(reitBuyout)]);
assert.equal(applyTransactionFilter(reit).length, 0, 'a REIT buyout is not a Transactions sale');
assert.equal(isRoutableRegionalDeal(reit[0]), false, 'a national-only buyout is not rerouted from the 30-day deal pool');
const njReit = mapFeedItemsToArticles([item('Example Fund to take Sample Industrial REIT private, adding 40 New Jersey warehouses in $2B deal')]);
assert.equal(corporateDealKind(njReit[0].title), 'reit-take-private');
assert.equal(applyTransactionFilter(njReit).length, 0, 'not a Transactions sale even with a NJ portfolio');
assert.equal(isRoutableRegionalDeal(njReit[0]), true, 'but a buyout with NJ/PA/FL evidence is Relevant news');

// --- Section routing -----------------------------------------------------------------------------
const water = mapFeedItemsToArticles([item(corporate[0])]);
assert.equal(applyTransactionFilter(water).length, 0, 'company M&A never fills Transactions');
assert.equal(isRoutableRegionalDeal(water[0]), false, 'nor is it rerouted into Relevant as regional deal flow');
const warehouse = mapFeedItemsToArticles([item('Fragrance distributor buys 63,000 sq. ft. Edison warehouse for $18.1 million')]);
assert.equal(applyTransactionFilter(warehouse).length, 1, 'an operating company buying a warehouse is still a property deal');

// --- Summary scope and status ------------------------------------------------------------------
const waterTitle = corporate[0];
assert.ok(summaryChangesDealScopeOrStatus('Florida — A canned water maker acquired a manufacturing facility for $100 million.',
    waterTitle, waterTitle), 'a facility included in a company deal is not a $100M facility purchase');
// Review 2026-11-18: the same false claim in the passive voice, or priced onto the facility.
assert.ok(summaryChangesDealScopeOrStatus('A Florida manufacturing facility was acquired for $100 million.', waterTitle, waterTitle),
    'passive voice');
assert.ok(summaryChangesDealScopeOrStatus('Florida — The manufacturing facility, for $100 million, joins the buyer.', waterTitle, waterTitle),
    'price attached to the facility');
assert.equal(summaryChangesDealScopeOrStatus("A canned water maker's $100 million acquisition includes a Florida manufacturing facility.",
    waterTitle, waterTitle), null, 'a faithful restatement passes');

const pending = 'Example Bottling agrees to acquire Sample Beverage Co. for $90M';
assert.ok(summaryChangesDealScopeOrStatus('Example Bottling acquired Sample Beverage Co. for $90M.', pending, pending),
    'an agreement is not a closed acquisition');
assert.equal(summaryChangesDealScopeOrStatus('Example Bottling agreed to acquire Sample Beverage Co. for $90M.', pending, pending), null);

const plannedSale = 'Example Owner plans to sell 200,000 SF Edison warehouse';
assert.ok(summaryChangesDealScopeOrStatus('Edison — Example Owner sold a 200,000 SF warehouse.', plannedSale, plannedSale),
    'a planned sale is not a completed one');

// Review 2026-11-18: an unrelated past purchase in the source is not proof THIS sale closed.
const planned2019 = 'Example Owner plans to sell Edison warehouse';
const planned2019Source = 'Example Owner, which bought the 120,000 SF warehouse in 2019, has hired a broker to market it.';
assert.ok(summaryChangesDealScopeOrStatus('Edison — Example Owner sold the warehouse.', planned2019, planned2019Source),
    'the owner sold the warehouse is unsupported');
assert.equal(summaryChangesDealScopeOrStatus('Edison — Example Owner plans to sell the warehouse it bought in 2019.', planned2019, planned2019Source), null);
assert.equal(summaryChangesDealScopeOrStatus('Example Owner sold the warehouse to Sample Logistics.', 'Example Owner sells Edison warehouse to Sample Logistics',
    'Example Owner sells Edison warehouse to Sample Logistics'), null, 'a completed sale "to" a buyer is not pending');
const closedLater = 'Example Bottling agrees to acquire Sample Beverage Co.';
assert.equal(summaryChangesDealScopeOrStatus('Example Bottling acquired Sample Beverage Co.', closedLater,
    'The acquisition closed on Nov. 17, the companies said.'), null, 'explicit closing evidence in the source allows past tense');

const closed = 'Example Capital buys 63,000 sq. ft. Edison warehouse for $18.1 million';
assert.equal(summaryChangesDealScopeOrStatus('Edison — Example Capital purchased a 63,000 SF warehouse for $18.1M.', closed, closed), null,
    'completed property purchases summarize normally');

console.log('corporate-deal tests passed');
