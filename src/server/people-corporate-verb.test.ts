import assert from 'node:assert/strict';
import { applyPeopleFilter, reCategorizeRelevantAsPeople } from './newsletter-filters.js';

// =============================================================================
// Upstream People corporate-verb gating (2026-07-24).
// Corporate-story items kept entering People via the loose action lists:
//   - "Greek Real Estate Partners Expands Bucks County …" — verb "expands" (removed) +
//     "Partners" (company name) matched PERSON_ROLE_KEYWORDS, so role+industrial rescued it.
//   - "Oncology Therapies Manufacturer Approved for NJEDA … Award" — verb "award" (now gated
//     behind a person/role signal) + "eda" substring of NJEDA faked industrial context.
// A People item must be relocated ONLY for a real personnel move.
// =============================================================================

let pass = 0;
const inPeople = (title: string, desc: string) => {
    const a: any = { title, description: desc, category: 'relevant', url: 'https://news.google.com/x', link: 'https://news.google.com/x' };
    return applyPeopleFilter([a]).length > 0 || reCategorizeRelevantAsPeople([a], [], []).people.length > 0;
};
const block = (name: string, title: string, desc = '') => { assert.equal(inPeople(title, desc), false, name); console.log(`✓ BLOCK ${name}`); pass++; };
const keep = (name: string, title: string, desc = '') => { assert.equal(inPeople(title, desc), true, name); console.log(`✓ KEEP  ${name}`); pass++; };

// ---- Corporate stories that must NOT enter People ----
block('Greek REP Expands (corporate verb + company "Partners")',
    'Greek Real Estate Partners Expands Bucks County Footprint With Bristol Warehouse Project - BucksCoHerald',
    'Greek Real Estate Partners expanded its footprint with a new warehouse project in Bristol.');
block('NJEDA manufacturing award (ambiguous verb + NJEDA substring)',
    'Oncology Therapies Manufacturer Approved for NJEDA Next New Jersey Manufacturing Award - EIN News',
    'Oncology Therapies Manufacturer Approved for NJEDA Next New Jersey Manufacturing Award');
block('company grows portfolio', 'Prologis grows its New Jersey industrial portfolio to 40M SF');
block('company strengthens presence', 'Terreno strengthens South Florida warehouse presence');
block('company bolsters logistics', 'Bridge Industrial bolsters its Lehigh Valley logistics footprint');
block('firm recognized, no role signal', 'Colliers recognized for record industrial leasing volume in New Jersey');
block('firm selected for project, no role signal', 'Matrix selected to build 500,000 SF warehouse in Edison');

// ---- Genuine personnel moves that must STILL enter People ----
keep('Names … Chief of Staff (PA)',
    'Pennsylvania Data Center Partners Names Grant Denham as Chief of Staff - GlobeNewswire',
    'Pennsylvania Data Center Partners named Grant Denham as chief of staff.');
keep('names … as president',
    'East Coast Warehouse & Distribution names Mitchell as president - ROI-NJ',
    'East Coast Warehouse & Distribution named Mitchell as president.');
keep('promotes … to key roles',
    'Prologis promotes Harvey, Sutton to key roles on global development teams',
    'Prologis promoted Travis Harvey as global head of development.');
keep('gated verb WITH a role signal (award to a named exec)',
    'JLL broker honored as industrial power broker of the year',
    'The managing director was honored for record leasing volume.');

console.log(`\nAll people-corporate-verb tests passed (${pass} checks).`);
