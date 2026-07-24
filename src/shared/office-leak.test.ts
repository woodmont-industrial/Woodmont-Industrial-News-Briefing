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

console.log(`\nAll office-leak tests passed (${pass} checks).`);
