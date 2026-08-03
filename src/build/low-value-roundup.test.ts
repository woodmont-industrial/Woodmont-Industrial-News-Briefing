import assert from 'node:assert/strict';

// Mirror of the ingest rule in static.ts (title-only). Kept in lockstep with the branch that sets
// _classificationReason = 'LOW_VALUE_ROUNDUP'.
const ROUNDUP_RE = /top\s+industrial\s+leases\s+recognized\s+for\b/i;

let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

// ---- REJECT: the exact CoStar recognition-roundup franchise (the 3 that shipped 2026-08-03) ----
[
    'News | Top industrial leases recognized for Pittsburgh - CoStar',
    'News | Top industrial leases recognized for Tampa/St Petersburg - CoStar',
    'News | Top industrial leases recognized for Orlando - CoStar',
    'Top industrial leases recognized for Miami',              // no "News |" prefix / no source suffix
    'TOP INDUSTRIAL LEASES RECOGNIZED FOR Newark - CoStar',    // case-insensitive
].forEach(t => ok(`REJECT: "${t.slice(0, 52)}"`, ROUNDUP_RE.test(t)));

// ---- KEEP: legitimate headlines (the negatives the boss named) ----
[
    'Prologis leases 100,000 SF in Orlando',
    'Top industrial lease deals total 500,000 SF in Pittsburgh',   // "lease deals total", not "leases recognized for"
    'CoStar reports major Tampa industrial lease',
    'CoStar: MDH Partners Pays $68M for Tampa-Area Industrial Portfolio',   // ordinary CoStar deal report
    'Top Industrial Leases Signal Tenants Are Locking In for the Long Haul', // "leases signal", not "recognized for"
    'CoStar Q2 industrial market report: Tampa absorption leads Florida',    // ordinary CoStar market report
    'ShipBob Signs 301,826 SF Industrial Lease in Bethlehem, Pennsylvania',  // ordinary lease deal
    'Industrial leases recognized as a hedge against inflation',  // "recognized as", not "recognized for [metro]"
].forEach(t => ok(`KEEP:   "${t.slice(0, 52)}"`, !ROUNDUP_RE.test(t)));

console.log(`\nAll low-value-roundup tests passed (${pass} checks).`);
