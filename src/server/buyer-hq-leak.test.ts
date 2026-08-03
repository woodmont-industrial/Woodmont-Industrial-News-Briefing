import assert from 'node:assert/strict';
import { isRegionLeak, NON_RE_JUNK_RX, type Section } from './newsletter-diagnostics.js';
import { isTargetRegion, hasGeographicFailure } from './newsletter-filters.js';

// Exact production wiring: routedClean is the routing verdict passed in from email.ts; the full
// leak decision is isRegionLeak(...) || NON_RE_JUNK_RX (NON_RE_JUNK independent, unchanged).
const routedClean = (it: any) => isTargetRegion(it) && !hasGeographicFailure(it).fails;
const isLeak = (it: any, section: Section) => {
    const text = `${it.title || ''} ${it.description || it.summary || ''} ${it.content_text || ''}`;
    return isRegionLeak(it, section, routedClean(it)) || NON_RE_JUNK_RX.test(text);
};
const item = (title: string, description = '') => ({ title, description } as any);

let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

// ---- LOCKED cases ----
// 1. Denver buyer acquiring a Philadelphia portfolio → no leak via routedClean.
ok('routedClean clears: Denver firm buys Philadelphia portfolio ($84M)',
    !isLeak(item('Denver industrial firm enters Philadelphia market with $84M portfolio acquisition',
                 'A Denver-based firm acquired a Philadelphia industrial portfolio for $84 million'), 'transactions'));
ok('  (verify it is routedClean)', routedClean(item('Denver industrial firm enters Philadelphia market with $84M portfolio acquisition', 'Philadelphia Pennsylvania')) === true);

// 2. Ohio/Pennsylvania policy comparison in Relevant → no leak via mixedComparison.
ok('mixedComparison clears: Ohio/Pennsylvania data-center policy comparison (Relevant)',
    !isLeak(item('Ohio and Pennsylvania take different approaches to data center development',
                 'Pennsylvania regulators weigh incentives as Ohio expands its program'), 'relevant'));
ok('  (verify it is NOT routedClean — cleared only by the comparison exception)',
    routedClean(item('Ohio and Pennsylvania take different approaches to data center development', 'Pennsylvania regulators')) === false);

// 3. Denver property comparing itself with Pennsylvania demand → STILL a leak (it's a transaction).
ok('LEAK: Denver property "outpaces Pennsylvania demand" (transactions, not a policy comparison)',
    isLeak(item('Denver warehouse sells for $30M, outpaces Pennsylvania demand',
                'A Denver, Colorado warehouse traded to a West Coast buyer'), 'transactions'));
// Even if such a comparison-style headline were placed in Relevant, a property SALE is not policy
// coverage — but the section gate is the guard; confirm the transaction placement leaks.

// 4. California project mentioning Florida only in the body → STILL a leak (FL not in title core).
ok('LEAK: California project, Florida demand only in body',
    isLeak(item('California logistics megaproject breaks ground',
                'Developers cite Florida demand trends in the outlook'), 'relevant'));

// 5. Target evidence only in the publisher suffix → STILL a leak.
ok('LEAK: Denver deal, NJ only from "- RE-NJ" publisher suffix',
    isLeak(item('Denver industrial park sells for $120M - RE-NJ',
                'A Denver, Colorado logistics park traded'), 'transactions'));

// 6. Pure Ohio / Denver / California property, no target-region evidence → STILL a leak.
ok('LEAK: pure Ohio industrial deal, no target token',
    isLeak(item('Ohio warehouse portfolio trades for $200M', 'A Columbus, Ohio industrial portfolio'), 'transactions'));
ok('LEAK: pure Denver deal, no target token',
    isLeak(item('Denver industrial park sells for $120M', 'A Denver, Colorado logistics park traded'), 'transactions'));
ok('LEAK: California/Temecula property, no target token',
    isLeak(item('Temecula industrial building trades for $30M', 'The Temecula, California warehouse sold'), 'transactions'));

// 7. Genuine in-region deals unchanged (no excluded token → never a region leak).
ok('NO leak: clean in-region Newark deal',
    !isLeak(item('Silverman Group acquires 72,000 sq. ft. Newark industrial facility', 'Newark, New Jersey'), 'transactions'));

// ---- NON_RE_JUNK independent & unchanged ----
ok('LEAK: sloth/animal-rescue junk (independent of region)',
    isLeak(item('Sloth sanctuary opens near NJ warehouse district', 'An animal rescue in New Jersey'), 'relevant'));
ok('LEAK: scraped pagination page (independent of region)',
    isLeak(item('Industrial Properties – Page 360'), 'relevant'));

console.log(`\nAll buyer-HQ-leak (Rule C) tests passed (${pass} checks).`);
