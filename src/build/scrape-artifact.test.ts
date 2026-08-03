import assert from 'node:assert/strict';

// Mirror of the ingest rule in static.ts (title-prefix only). Kept in lockstep with the branch
// that sets _classificationReason = 'SCRAPE_ARTIFACT_INDEX_PAGE'.
const ARTIFACT_PREFIX_RE = /^\s*(tag|category|archive|topic|author)\s*:/i;

let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

// ---- REJECT: index/archive page titles ----
[
    'Tag: Logistics Real Estate - ROI-NJ',
    'tag: industrial',
    'Category: Warehouse Deals - RE-NJ',
    'Archive: 2026 Industrial Transactions',
    'Topic: Data Centers',
    'Author: Jane Smith - Real Estate NJ',
    '  Tag: Logistics',            // leading whitespace tolerated
    'TAG:Logistics',               // no space after colon
].forEach(t => ok(`REJECT: "${t.slice(0, 40)}"`, ARTIFACT_PREFIX_RE.test(t)));

// ---- KEEP: legitimate articles that merely CONTAIN those words (not as a prefix) ----
[
    'ShipBob Signs 301,826 SF Industrial Lease in Bethlehem, PA',
    'Prologis to tag Newark warehouse for redevelopment',            // "tag" mid-title
    'New category of industrial demand emerges in the Lehigh Valley', // "category" mid-title
    'Author of NJ warehouse boom report speaks at CREW event',        // "Author" but not "Author:"
    'Denver industrial firm enters Philadelphia market with $84M portfolio acquisition',
    'Tag Heuer opens distribution center in Edison',                  // "Tag" as a brand, no colon
    'Archive Storage REIT acquires Carlstadt warehouse',             // "Archive" as a company name, no colon
].forEach(t => ok(`KEEP:   "${t.slice(0, 45)}"`, !ARTIFACT_PREFIX_RE.test(t)));

console.log(`\nAll scrape-artifact tests passed (${pass} checks).`);
