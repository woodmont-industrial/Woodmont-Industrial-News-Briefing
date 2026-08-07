import assert from 'node:assert/strict';
import { dedupeByNearTitle, isNearTitleDuplicate } from './newsletter-filters.js';

// The post-backfill sweep reuses dedupeByNearTitle unchanged (same isNearTitleDuplicate, same
// survivor logic). These tests lock the specific pairs called out for the coverage fix.
let pass = 0;
const ok = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };
const item = (title: string, source = 'news.google.com', s = 0) =>
    ({ title, description: '', source, _source: { website: source, feedName: source }, url: `https://x/${Math.random()}`, link: `https://x/${Math.random()}`, __s: s } as any);
const score = (a: any) => a.__s ?? 0;

// 1. Berks Weekly vs Shenandoah Sentinel — same story, UNLISTED publishers (the 2026-08-07 case).
const berksA = () => item('A Berks County district temporarily froze a major renovation amid loss of $600K to ICE warehouse sale - Berks Weekly', 'berksweekly.com');
const berksB = () => item('A Berks County district temporarily froze a major renovation amid loss of $600K to ICE warehouse sale - The Shenandoah Sentinel', 'shenandoahsentinel.com');
ok('predicate: Berks Weekly vs Shenandoah Sentinel is a near-title duplicate', isNearTitleDuplicate(berksA(), berksB()));
ok('COLLAPSE: Berks pair -> 1 (survivor kept)', dedupeByNearTitle([berksA(), berksB()], score, 't').length === 1);
ok('COLLAPSE: 3 Berks copies (+ Spotlight PA) -> 1', dedupeByNearTitle([berksA(), berksB(), item('A Berks County district temporarily froze a major renovation amid loss of $600K to ICE warehouse sale - Spotlight PA', 'spotlightpa.org')], score, 't').length === 1);

// 2. July 28 healthy/health control — still collapses.
ok('COLLAPSE: healthy/health control', dedupeByNearTitle([
    item('Commercial industrial real estate remains healthy across the region - Central Penn Business Journal'),
    item('Commercial industrial real estate remains health across the region - Lehigh Valley Business'),
], score, 'r').length === 1);

// 3. Publisher-suffix variants — same headline, different (even unlisted) suffixes still collapse
//    (normTitle strips ANY trailing " - Publisher", not an allowlist).
ok('COLLAPSE: identical headline, different unlisted suffixes', dedupeByNearTitle([
    item('Sitex acquires 120,000 SF Edison warehouse - Obscure Local Paper'),
    item('Sitex acquires 120,000 SF Edison warehouse - Another Tiny Blog'),
], score, 't').length === 1);

// 4. Distinct same-location stories — KEEP (different deals, same city).
ok('KEEP: two different Newark deals (distinct events, same city)', dedupeByNearTitle([
    item('Prologis buys 90,000 SF Newark warehouse for $30M'),
    item('Terreno leases 40,000 SF Newark distribution center to 3PL'),
], score, 't').length === 2);

// 5. Conflicting locations — KEEP.
ok('KEEP: same template, different city (Newark vs Edison)', dedupeByNearTitle([
    item('Prologis acquires Newark warehouse for $30M'),
    item('Prologis acquires Edison warehouse for $30M'),
], score, 't').length === 2);

// 6. Conflicting metrics — KEEP.
ok('KEEP: same city, different $ (Miami $8.5M vs $40M)', dedupeByNearTitle([
    item('Miami warehouse sells for $8.5M'),
    item('Miami warehouse sells for $40M'),
], score, 't').length === 2);

// 7. Backfilled vs initially-selected is irrelevant to the sweep — it operates on the FINAL array
//    regardless of item origin; survivor is deterministic (source -> longer title -> score -> order).
{
    const preferred = item('Sagard buys 224,000 SF warehouse at Exit 8A - RE-NJ', 're-nj.com', 5);   // preferred source
    const syndicated = item('Sagard buys 224,000 SF warehouse at Exit 8A - Google News', 'news.google.com', 9);
    const out = dedupeByNearTitle([syndicated, preferred], score, 't');
    ok('SURVIVOR: preferred/direct source wins over higher-scored syndicated copy', out.length === 1 && out[0].source === 're-nj.com');
}

// 8. RENDER-CAP scenario: when both near-title copies fall INSIDE a section's render slice
//    (top-6), the late sweep must reduce them to one BEFORE rendering — otherwise both would
//    appear in the email. (On 2026-08-07 the 2nd copy was at position 7 and was capped out, so
//    the email was unaffected; this proves the sweep also protects the not-capped case.)
{
    const SLICE = 6;
    const section = [
        item('A Berks County district temporarily froze a major renovation amid loss of $600K to ICE warehouse sale - Berks Weekly', 'berksweekly.com'),
        item('A Berks County district temporarily froze a major renovation amid loss of $600K to ICE warehouse sale - The Shenandoah Sentinel', 'shenandoahsentinel.com'),
        item('White Cap opens PA distribution center'),
        item('GE Vernova expands PA manufacturing'),
    ]; // both dup copies are within the first 6 -> both WOULD render without the sweep
    const before = section.slice(0, SLICE).filter(a => /Berks County district/.test(a.title || '')).length;
    const swept = dedupeByNearTitle(section, score, 'relevant');
    const after = swept.slice(0, SLICE).filter(a => /Berks County district/.test(a.title || '')).length;
    ok('render-cap: 2 in-slice Berks copies -> 1 after sweep (before=2)', before === 2 && after === 1);
}

console.log(`\nAll post-backfill-dedup tests passed (${pass} checks).`);
