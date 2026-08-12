import assert from 'node:assert/strict';
import { isStrictlyIndustrial } from './region-data.js';

// =============================================================================
// Office-led primary-subject guard (2026-07-24).
// "Google Expands Miami Office to 45K SF" leaked into the newsletter as industrial
// because bare "office" + "to <size>" / "office footprint" is absent from
// EXCLUDE_NON_INDUSTRIAL (compound phrases only) and OFFICE_TRANSACTION_RE, so the
// generic "square feet" deal-signal path passed it. These tests lock the fix AND
// guard against over-blocking industrial properties that merely contain office area.
// =============================================================================

let pass = 0;
const rej = (name: string, text: string) => { assert.equal(isStrictlyIndustrial(text), false, name); console.log(`✓ REJECT ${name}`); pass++; };
const keep = (name: string, text: string) => { assert.equal(isStrictlyIndustrial(text), true, name); console.log(`✓ KEEP   ${name}`); pass++; };

// ---- Must be REJECTED (office-led, no industrial asset) ----
rej('Google Miami office (confirmed 2026-07-24)',
    "Google Expands Miami Office to 45K SF. Google's parent company has quadrupled its office footprint in Miami; Alphabet inked a lease for about 45,000 square feet at 1450 Brickell Avenue.");
rej('office footprint story', 'Fintech firm doubles its office footprint downtown, signs 60,000 square feet');
rej('office expands to size', 'Law firm office expands to 30,000 SF at Class B tower');
rej('office lease for size', 'Accounting firm signs office lease for 25,000 square feet');
rej('office to size (bare)', 'Startup Office to 20,000 SF in new deal');

// ---- Must be KEPT (industrial primary; office is incidental or absent) ----
keep('warehouse with office component',
    'Seagis signs tenant for 120,000 SF warehouse with 5,000 SF of office space in Kearny');
keep('LoopNet industrial listing w/ office buildout',
    '10 Culnen Dr - Industrial for Lease - 48,000 SF with 2,000 SF office footprint and loading docks');
keep('industrial building with office expansion',
    'Prologis leases 200,000 SF distribution center; tenant office expands to 8,000 SF within the facility');
keep('flex space with office', 'NAI Keystone lists 43K SF commercial flex with office to 4,000 SF');
keep('plain warehouse deal, no office', 'NorthBridge grabs 81,000 sq. ft. shallow-bay industrial complex in Rockaway');
keep('macro industrial market piece', 'Industrial vacancy tightens as warehouse demand outpaces office in Q2');

// ---- Office-as-DESTINATION-asset (2026-08-12 R2 broadening of OFFICE_LED_RE) ----
// "<verb> … at/to/into the … office <asset>" — office as the destination the tenant occupies.
rej('Greenberg Traurig at office development (confirmed 2026-08-11)',
    'Law Firm Greenberg Traurig Takes 25K SF at Related Ross Dev in West Palm. The firm signed a 10-year lease to occupy about 25,000 square feet at the 15 CityPlace office development, which remains under construction.');
rej('HQ into an office tower', 'Related Ross Lands Wells Fargo HQ; the bank will move into the new West Palm Beach office tower under a long-term lease');
rej('leases into office building', 'Accounting firm leases 40,000 square feet into the downtown office building');

// ---- Must STILL be KEPT despite office-destination phrasing (broad strong-industrial guard) ----
keep('CIP industrial-and-office park (Lyons Business Park, shipped correctly)',
    'CIP Real Estate Buys Broward Campus for $99M. CIP Real Estate has paid $99 million for an industrial and office park in Broward County, Fla. Called Lyons Business Park, the property includes about 10 buildings totaling 338,000 square feet.');
keep('warehouse located at an office park (guard protects)',
    'Denholtz leases 95,000 SF warehouse at the Meadowlands office park campus with dock-high loading');
keep('logistics HQ-operations (no office term; stays industrial)',
    'DSV Global Transport and Logistics plans Mesa, Arizona, headquarters operations at a new 300,000 SF distribution center');
keep('manufacturing HQ (no office term)',
    'CesiumAstro expands Bee Cave, Texas, headquarters-manufacturing operations');

console.log(`\nAll office-leak tests passed (${pass} checks).`);
