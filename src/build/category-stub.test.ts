import assert from 'node:assert/strict';

// Mirror of the ingest rule in static.ts. Kept in lockstep with the branch that sets
// _classificationReason = 'SCRAPE_ARTIFACT_CATEGORY_STUB'.
const CATEGORY_STUB_ALLOWLIST = new Set(['industrial']);
const isCategoryStub = (title: string) => {
    const parts = (title || '').split(/\s+[-–—]\s+/);
    const stripped = (parts.length > 1 ? parts.slice(0, -1).join(' - ') : (title || '')).trim().toLowerCase();
    return CATEGORY_STUB_ALLOWLIST.has(stripped);
};

let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

// ---- REJECT: the observed category-index stub ----
ok('REJECT: "Industrial - Real Estate NJ"', isCategoryStub('Industrial - Real Estate NJ'));
ok('REJECT: "Industrial – RE-NJ" (en-dash suffix)', isCategoryStub('Industrial – RE-NJ'));
ok('REJECT: bare "Industrial" (no suffix)', isCategoryStub('Industrial'));
ok('REJECT: case-insensitive "INDUSTRIAL - Real Estate NJ"', isCategoryStub('INDUSTRIAL - Real Estate NJ'));

// ---- KEEP: legitimate short headlines and anything with more than the bare category word ----
[
    'Industrial market cools in Q2',                         // "industrial" + more words
    'Industrial Report: EV sales slow',
    'Sagard buys 224,000 SF warehouse at Exit 8A',
    'Terreno inks 92,000 SF lease in Kearny',
    'Newark industrial owner inks $797,000 refi with Valley Bank',
    'Neptune flex property trades in $1.3M deal',
    'Prologis promotes Harvey to key role',
    'Logistics - Real Estate NJ',                            // NOT in allowlist (speculative term withheld)
    'Warehouse - Real Estate NJ',                            // NOT in allowlist
    'Property - Real Estate NJ',                             // NOT in allowlist
    'Industrial deal in Newark closes',                      // "industrial" leads but more follows
].forEach(t => ok(`KEEP:   "${t.slice(0, 48)}"`, !isCategoryStub(t)));

console.log(`\nAll category-stub tests passed (${pass} checks).`);
