/**
 * Relevant-section evidence guards.
 *
 * Relevant required only: rubric, not-political, isStrictlyIndustrial, and one
 * keyword. On 2026-10-12 that shipped a defence-robotics partnership, an
 * aggregator category page and a recruiter listing in an industrial newsletter.
 * Legitimate market reports, entitlement news and specific listings must stay.
 *
 * Company names here are synthetic. Real watchlist names must not appear in
 * fixtures — the privacy validator rejects them, and rightly.
 */
import { relevantEvidenceFailure, isRoutableRegionalDeal } from './newsletter-filters.js';
import { NormalizedItem } from '../types/index.js';

let failures = 0;
const check = (ok: unknown, label: string): void => {
    if (ok) console.log(`  OK   ${label}`);
    else { console.error(`  FAIL ${label}`); failures++; }
};
const fail = (title: string, body = '') => relevantEvidenceFailure(title, `${title} ${body}`);

console.log('=== the three classes that shipped on 2026-10-12 ===');
check(fail('Northwind Robotics partners with a defence firm to aid submarine manufacturing')
    === 'NO_PROPERTY_OR_MARKET_CONTEXT', 'a defence-robotics partnership has neither property nor market context');
check(fail('Doral, FL Commercial Real Estate for Lease and Sale - ExampleListings')
    === 'AGGREGATOR_CATEGORY_PAGE', 'an aggregator category page is not a story');
check(fail('Example CRE Search Partners') === 'JOB_POSTING_NOT_NEWS', 'a recruiter listing is not news');

console.log('=== other non-developments ===');
check(fail('South Florida Industrial Real Estate Summit - ExampleWire') === 'EVENT_OR_INDEX_PAGE', 'an event listing');
check(fail('Industrial Commercial Real Estate News - ExampleWire') === 'EVENT_OR_INDEX_PAGE', 'a publisher index page');
check(fail('Deputy General Manager / General Manager – Industrial & Logistics Transactions')
    === 'JOB_POSTING_NOT_NEWS', 'a job posting');
check(fail('US Manufacturing Employment Share Falls as Automation Rises')
    === 'NO_PROPERTY_OR_MARKET_CONTEXT', 'a macro employment story is not industrial real estate');

console.log('=== false rejections found in review ===');
// "Summit" is a New Jersey municipality as well as an event word.
check(fail('Developer breaks ground on a warehouse in Summit, NJ') === null,
    'a groundbreaking in Summit, NJ is not an event listing');
check(fail('Developer breaks ground on a warehouse in Summit, New Jersey') === null,
    'the spelled-out state works too');
check(fail('South Florida Industrial Real Estate Summit') === 'EVENT_OR_INDEX_PAGE',
    'but a genuine summit is still an event');
// A single-digit street number is as specific as a three-digit one.
check(fail('3 Oak Ct, Edison, NJ 08817 - Industrial Properties for Lease') === null,
    'a single-digit street address is a specific listing');
check(fail('449 Blair Rd, Avenel, NJ 07001 - Industrial Properties for Lease') === null,
    'a three-digit street address is a specific listing');

console.log('=== legitimate items are preserved ===');
for (const [title, why] of [
    ['Industrial Report: Industrial Market Moves Closer to Balance', 'a market report'],
    ['Loan-to-Value Ratios Climb as CRE Lender Competition Heats Up', 'CRE lending commentary'],
    ['Regional Firm Invests in Dulles Corridor Flex Space', 'a flex-space deal'],
    ['Florham Park Planning Board approves warehouse development', 'entitlement news'],
    ['Example Partners add to Philly portfolio with new 104,000 sq ft warehouse', 'a specific deal'],
    ['Industrial vacancy edges higher as absorption slows', 'vacancy and absorption commentary'],
] as Array<[string, string]>) check(fail(title) === null, `${why} is kept`);

console.log('=== the regional-deal router applies the same guard ===');
// It pushes straight into Relevant without applyStrictFilter. That was the gap:
// the isolated filter tests passed while an aggregator page still shipped.
// The fixture uses an approved publisher domain because the router also checks
// source approval — an invented host fails for that reason instead.
const deal = (title: string): NormalizedItem => ({
    id: title.slice(0, 10), title, link: 'https://re-nj.com/story', url: 'https://re-nj.com/story',
    description: title, summary: '', pubDate: new Date().toISOString(),
    category: 'transactions', source: 'Example Source',
} as unknown as NormalizedItem);
check(isRoutableRegionalDeal(deal('Doral, FL Commercial Real Estate for Lease and Sale - ExampleListings')) === false,
    'the router rejects an aggregator category page');
check(isRoutableRegionalDeal(deal('Example CRE Search Partners')) === false,
    'the router rejects a recruiter listing');
check(isRoutableRegionalDeal(deal('Buyer acquires an Edison, New Jersey warehouse for $12 million')) === true,
    'the router still admits a genuine sub-threshold regional deal');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nOK: relevant evidence guards');
process.exit(failures ? 1 : 0);
