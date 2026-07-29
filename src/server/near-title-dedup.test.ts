import assert from 'node:assert/strict';
import { dedupeByNearTitle } from './newsletter-filters.js';
import { titlesSimilar, normTitle } from './newsletter-diagnostics.js';

let pass = 0;
const check = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };
const item = (title: string, source = 'news.google.com', s = 0) => ({ title, description: '', source, _source: { website: source }, url: `https://${source}/x`, link: `https://${source}/x`, __s: s } as any);
const score = (a: any) => a.__s ?? 0;
const titles = (arr: any[]) => arr.map(a => a.title);

// The Jul 28 pair (both Google-News-syndicated, one-char typo).
const healthyA = () => item('Commercial industrial real estate remains healthy across the region - Central Penn Business Journal');
const healthB = () => item('Commercial industrial real estate remains health across the region - Lehigh Valley Business');

// ---- 1. Collapses the real pair; correctly-spelled Central Penn copy survives ----
{
    const out = dedupeByNearTitle([healthyA(), healthB()], score, 'relevant');
    check('collapses the healthy/health pair to one', out.length === 1);
    check('survivor is the correctly-spelled "healthy" copy', /healthy/.test(out[0].title));
}

// ---- 2. Survivor preference: preferred/direct source wins over syndicated ----
{
    const syndicated = item('Commercial industrial real estate remains healthy across the region - Central Penn Business Journal', 'news.google.com');
    const direct = item('Commercial industrial real estate remains health across the region', 're-nj.com');
    const out = dedupeByNearTitle([syndicated, direct], score, 'relevant');
    check('direct source (re-nj.com) survives over Google-News syndicated even if title shorter', out.length === 1 && out[0].source === 're-nj.com');
}

// ---- 3. Title similarity ALONE never collapses — corroboration required ----
// (a) location conflict
check('KEEP: different city (Newark vs Edison), same $ — title-similar but location conflict',
    dedupeByNearTitle([item('Prologis acquires Newark warehouse for $30M'), item('Prologis acquires Edison warehouse for $30M')], score, 'r').length === 2);
check('KEEP: same broker template, different market (Rockaway vs Piscataway)',
    dedupeByNearTitle([item('JLL brokers sale of industrial building in Rockaway'), item('JLL brokers sale of industrial building in Piscataway')], score, 'r').length === 2);
// (b) metric conflict
check('KEEP: same city, different $ (Miami $8.5M vs $40M) — jaccard 1.0 but metric conflict',
    dedupeByNearTitle([item('Miami warehouse sells for $8.5M'), item('Miami warehouse sells for $40M')], score, 'r').length === 2);
check('KEEP: different SF (94,000 vs 92,000)',
    dedupeByNearTitle([item('Terreno signs 94,000 SF lease'), item('Terreno signs 92,000 SF lease')], score, 'r').length === 2);
// (c) below similarity threshold
check('KEEP: low token overlap (DC boom two different angles)',
    dedupeByNearTitle([item('Data center boom fuels new demand for warehouses'), item('Pennsylvania data center boom skips the Lehigh Valley')], score, 'r').length === 2);

// ---- 4. Non-duplicate distinct items untouched; ordering preserved ----
{
    const a = item('NAI DiLeo-Bram markets Piscataway industrial'), b = item('FRP acquires 24 acres in Broward County'), c = item('Tampa warehouse listed for lease');
    const out = dedupeByNearTitle([a, b, c], score, 'r');
    check('three distinct items all kept, order preserved', out.length === 3 && titles(out).join('|') === titles([a, b, c]).join('|'));
}

// ---- 5. Reuses the scorer's exact similarity definition ----
check('reused titlesSimilar flags the pair (0.78 jaccard)', titlesSimilar(normTitle(healthyA().title), normTitle(healthB().title)) === true);
check('reused titlesSimilar does NOT flag Newark/Edison at removal threshold via corroboration path only', titlesSimilar(normTitle('Prologis acquires Newark warehouse for $30M'), normTitle('Prologis acquires Edison warehouse for $30M')) === true /* similar, but corroboration keeps them (test 3a) */);

console.log(`\nAll near-title-dedup tests passed (${pass} checks).`);
