import assert from 'node:assert';
import { isCarceralAsset, isStrictlyIndustrial } from './region-data.js';

let pass = 0;
const block = (name: string, text: string) => { assert.equal(isCarceralAsset(text), true, `carceral: ${name}`); assert.equal(isStrictlyIndustrial(text), false, `gated: ${name}`); console.log(`✓ BLOCK ${name}`); pass++; };
const keep = (name: string, text: string) => { assert.equal(isCarceralAsset(text), false, `not-carceral: ${name}`); console.log(`✓ KEEP  ${name}`); pass++; };

// --- BLOCK: the 7 corpus carceral items (all shipped or fed historically) ---
block('ICE Pivot private prison', 'ICE Pivot From Warehouse Plan Funnels Cash To Private Prison Owners. CoreCivic and Geo Group benefiting from DHS detainment policy, private detention expansions.');
block('immigrant jail conversion', 'DHS Says 470K SF Warehouse It Planned To Sell Will Become Immigrant Jail After All');
block('holding facility conversion', 'ICE Renews Bid to Convert NJ Warehouse Into Holding Facility - Bloomberg.com');
block('detention overhaul', 'ICE Looks To Offload $700M In U.S. Warehouses As Detention Overhaul Unravels');
block('warehouse detention plans', 'How US Towns Are Fighting ICE Warehouse Detention Plans - Bloomberg.com');
block('warehouse detention program', 'DHS Inspector Opens Probe Into $38B Warehouse Detention Program');
block('planned detention center', 'ICE buys vacant 470,000 sq. ft. warehouse in Roxbury, intensifying battle over planned detention center');
// explicit-term coverage
block('detention facility', 'County approves new immigrant detention facility on former warehouse site');
block('correctional facility', 'State to build correctional facility on 40-acre industrial parcel');
block('inmates', 'Facility will house up to 1,200 inmates in converted distribution center');

// --- KEEP: genuine industrial deal-flow, even with ICE/DHS involvement or lexical near-misses ---
keep('ICE buys warehouse (no carceral USE stated)', 'ICE spends $90M on warehouse in Pennsylvania backwater town');            // Rule-B territory, intentionally NOT blocked by the narrow guard
keep('DHS warehouse purchase, no use', 'DHS acquires 300,000 SF logistics warehouse in Edison NJ');
keep('CoreCivic buys warehouse, no carceral use', 'CoreCivic acquires 200,000 SF industrial warehouse in Newark');
keep('market corrections (lexical FP)', 'Industrial Real Estate Has Entered Its Fixer-Upper Phase amid market corrections');
keep('faces prison (lexical FP)', 'Fort Lauderdale Roofing Exec Pleads Guilty To $3.5M Bid-Rigging Scheme, faces prison');
keep('immigration policy (lexical FP)', "Trump's Gold Card Complicates EB-5 Renewal As Advocates Preach Coexistence on immigration");
keep('stormwater detention basin (civil-eng)', 'New 500,000 SF distribution center adds a stormwater detention basin and truck court in Bethlehem PA');
keep('on-site detention pond', 'Spec warehouse breaks ground with on-site detention pond and rail spur');
keep('plain warehouse deal', 'Cabot sells 73,000 sq. ft. shallow-bay industrial portfolio in Bergen County for $17 million');

console.log(`\n${pass} checks passed`);
