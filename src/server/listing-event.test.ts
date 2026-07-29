import assert from 'node:assert/strict';
import { isMarketingListingEvent, LISTING_EVENT_RE, COMPLETED_DEAL_ACTION_RE } from '../shared/region-data.js';
import { applyTransactionFilter, applyAvailabilityFilter } from './newsletter-filters.js';

let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };
const item = (title: string, description = '') => ({ title, description, source: 're-nj.com', _source: { website: 're-nj.com' }, url: 'https://re-nj.com/x', link: 'https://re-nj.com/x' } as any);

// ---------------------------------------------------------------------------
// 1. Helper: listing events match; completed deals & noun-sense do NOT
// ---------------------------------------------------------------------------
const MERCER = 'CPN lists Mercer County development site with approvals for 108,000 sq. ft. warehouse - RE-NJ';
ok('MATCH: Mercer "lists … development site"', isMarketingListingEvent(MERCER));
ok('MATCH: "markets … logistics center for lease"', isMarketingListingEvent('Colliers markets Linden logistics center for lease'));
ok('MATCH: "offers … 12-acre … site for sale"', isMarketingListingEvent('Owner offers 12-acre Linden site for sale'));
ok('MATCH: "lists 50,000 SF … warehouse"', isMarketingListingEvent('Broker lists 50,000 SF Newark warehouse for lease'));

ok('NO-MATCH: "Data Center Markets to Watch" (markets = noun)', !isMarketingListingEvent('10 Emerging Data Center Markets to Watch'));
ok('NO-MATCH: "offers cash to win support" (no asset object)', !isMarketingListingEvent('NorthPoint Development offers cash to win support for Pennsylvania data center project'));
ok('NO-MATCH: "Offer U.S. Investors a Fresh Industrial Play"', !isMarketingListingEvent('Discounted Solar Plants Offer U.S. Investors a Fresh Industrial Play'));
ok('NO-MATCH: "Report lists top logistics markets to watch"', !isMarketingListingEvent('Report lists top logistics markets to watch in 2026'));
ok('NO-MATCH: "NAI DiLeo-Bram Markets Piscataway Industrial" (no concrete asset head-noun)', !isMarketingListingEvent('NAI DiLeo-Bram Markets Piscataway Industrial in Key Supply Chain Corridor'));

// ---------------------------------------------------------------------------
// 2. Precedence: a genuine completed-deal action WINS (stays a transaction)
// ---------------------------------------------------------------------------
ok('completed-deal wins: "sells and lists remaining building"', !isMarketingListingEvent('Company sells and lists remaining Edison building'));
ok('completed-deal wins: "acquires … then lists"', !isMarketingListingEvent('Firm acquires and lists 200,000 SF Linden warehouse'));
ok('"for lease" is NOT a completed deal', !COMPLETED_DEAL_ACTION_RE.test('Broker lists 50,000 SF Newark warehouse for lease'));
ok('COMPLETED matches a real sale', COMPLETED_DEAL_ACTION_RE.test('Stone distributor buys Carlstadt industrial building for $9.1M'));
ok('LISTING_EVENT_RE matches Mercer', LISTING_EVENT_RE.test(MERCER));

// ---------------------------------------------------------------------------
// 3. Layer 3 — applyTransactionFilter REJECTS a listing event (before approval
//    bypass + SF threshold), and PRESERVES genuine completed deals.
// ---------------------------------------------------------------------------
{
    const out = applyTransactionFilter([item(MERCER, 'Mercer County New Jersey industrial development site with approvals for a 108,000 square feet warehouse')]);
    ok('L3: Mercer rejected from Transactions (approval + 108K SF cannot re-admit)', out.length === 0);
}
{
    // Precedence guarantee: the listing rule NEVER matches a genuine completed deal, so Layer 3
    // never rejects one with LISTING_EVENT_NOT_DEAL (regardless of any unrelated threshold gate).
    const completedDeals = [
        'Stone distributor buys Carlstadt industrial building for $9.1M',
        'Sagard Real Estate acquires 224,000 SF industrial facility in Monmouth Junction',
        'Partnership Acquires 85,053-Square-Foot Industrial Building in Pennsylvania',
        'CenterPoint trades New Jersey logistics property to Sagard for $56.9 million',
        'Citizens Bank Refis N.J. Industrial Property With $47M Loan',
        'Metz Industrial Group leases industrial outdoor storage location in Elizabeth',
    ];
    ok('precedence: no completed deal is seen as a listing event', completedDeals.every(t => !isMarketingListingEvent(t)));
    // A threshold-qualifying completed deal still passes Layer 3 with the change in place.
    const out = applyTransactionFilter([item('Sagard Real Estate acquires 224,000 SF industrial facility in Monmouth Junction', 'Monmouth Junction New Jersey industrial facility acquired for a nine-figure sum')]);
    ok('L3: qualifying completed deal (224,000 SF acquisition) still passes Transactions', out.length === 1);
}

// ---------------------------------------------------------------------------
// 4. Layer 2 — applyAvailabilityFilter ACCEPTS the marketed industrial listing
//    (incl. entitled land, and independently via the SF floor).
// ---------------------------------------------------------------------------
{
    const out = applyAvailabilityFilter([item(MERCER, 'Mercer County New Jersey industrial development site with approvals for a 108,000 square feet warehouse')]);
    ok('L2: Mercer accepted into Availabilities', out.length === 1);
    // Entitled land with NO stated size still qualifies as an availability listing.
    const noSize = applyAvailabilityFilter([item('CPN lists Bergen County development site', 'Bergen County New Jersey industrial warehouse development land being brought to market')]);
    ok('L2: entitled industrial land (no size) accepted as availability', noSize.length === 1);
}

console.log(`\nAll listing-event tests passed (${pass} checks).`);
