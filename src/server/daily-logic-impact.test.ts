import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeDailyLogicImpact, buildDailyLogicImpactRow, DAILY_LOGIC_IMPACT_COLUMNS } from './newsletter-diagnostics.js';

let pass = 0;
const check = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

// A synthetic finalized-diagnostics object shaped like diag.toJSON().
const diag = (runId: string, over: any = {}) => ({
    runId,
    generatedAt: `${runId.slice(0, 10)}T11:00:00.000Z`,
    quality: {
        score: 81, grade: 'B', itemCount: 6, supply: 'Rich',
        operationalScore: 81, operationalGrade: 'B',
        editorialQualityScore: 80, editorialGrade: 'B', coverageSupplyScore: 100,
        breakdown: { coverage: 30, freshness: 18.6, regional: 18.3, relevanceIntegrity: 20 },
        supplyStatus: { relevant: 'FILLED', transactions: 'FILLED', availabilities: 'FILLED', people: 'UNDERFILLED' },
        penalties: [{ type: 'weak_item', points: 3 }, { type: 'weak_item', points: 3 }],
        ...(over.quality || {}),
    },
    logicImpact: {
        nearDuplicatesSuppressed: 1, peopleRescued: 2, crossDayPoolRepeatsSuppressed: 138,
        falseLeaksPrevented: { total: 4, routedClean: 4, mixedComparison: 0 },
        ...(over.logicImpact || {}),
    },
    dcPolicy: { rejectedOutOfRegion: [{ id: 'x' }, { id: 'y' }], nationalScaleAllowed: [], unknownLocationAllowed: [], ...(over.dcPolicy || {}) },
    sections: {
        relevant: { loaded: 261, selected: 3 }, transactions: { loaded: 261, selected: 1 },
        availabilities: { loaded: 261, selected: 1 }, people: { loaded: 261, selected: 1 },
        ...(over.sections || {}),
    },
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dli-'));
const csvPath = path.join(tmp, 'daily-logic-impact.csv');
const readRows = () => fs.readFileSync(csvPath, 'utf-8').split(/\r?\n/).filter(l => l.length > 0);
const col = (line: string, name: string) => line.split(',')[DAILY_LOGIC_IMPACT_COLUMNS.indexOf(name as any)];

// ---- 1. Header / schema stability ----
{
    writeDailyLogicImpact(tmp, diag('2026-08-26-1059'));
    const rows = readRows();
    check('header equals the 38-column schema', rows[0] === DAILY_LOGIC_IMPACT_COLUMNS.join(','));
    check('schema is exactly 38 columns', DAILY_LOGIC_IMPACT_COLUMNS.length === 38);
    check('one data row after first write', rows.length === 2);
}

// ---- 2. Derivation from diagnostics (no independent recompute) ----
{
    const r = readRows()[1];
    check('date derived from runId', col(r, 'date') === '2026-08-26');
    check('run_id preserved', col(r, 'run_id') === '2026-08-26-1059');
    check('articles_ingested = sections.loaded', col(r, 'articles_ingested') === '261');
    check('articles_shipped = quality.itemCount', col(r, 'articles_shipped') === '6');
    check('score/grade from quality', col(r, 'score') === '81' && col(r, 'grade') === 'B');
    check('penalty_total summed from penalties', col(r, 'penalty_total') === '6');
    check('cross_day from logicImpact', col(r, 'cross_day_pool_repeats_suppressed') === '138');
    check('false_leak from falseLeaksPrevented.total', col(r, 'false_leak_penalties_prevented') === '4');
    check('dc_policy_rejected = rejectedOutOfRegion length', col(r, 'dc_policy_rejected') === '2');
    check('section counts mapped', col(r, 'relevant_count') === '3' && col(r, 'people_count') === '1');
    check('coverage/freshness from breakdown', col(r, 'coverage_score') === '30' && col(r, 'freshness_score') === '18.6');
    check('people_supply_status mapped', col(r, 'people_supply_status') === 'UNDERFILLED');
}

// ---- 3. Blank handling: build-stage columns are genuinely blank ----
{
    const r = readRows()[1];
    for (const c of ['logic_version_sha', 'production_commit_sha', 'total_excluded', 'tag_artifacts_blocked',
        'roundups_blocked', 'category_stubs_blocked', 'office_items_blocked', 'out_of_region_rejected',
        'listing_events_rerouted', 'notes']) {
        check(`blank: ${c}`, col(r, c) === '');
    }
}

// ---- 4. Append behavior: a new runId adds a row (does not overwrite prior) ----
{
    writeDailyLogicImpact(tmp, diag('2026-08-27-1100', { quality: { score: 90, grade: 'A' } }));
    const rows = readRows();
    check('append adds a second data row', rows.length === 3);
    check('prior row still present', rows.some(r => col(r, 'run_id') === '2026-08-26-1059'));
    check('new row present with its own score', rows.some(r => col(r, 'run_id') === '2026-08-27-1100' && col(r, 'score') === '90'));
    check('rows sorted by date ascending', col(rows[1], 'date') <= col(rows[2], 'date'));
}

// ---- 5. Duplicate-run protection: same runId replaces, never duplicates ----
{
    const before = readRows().length;
    writeDailyLogicImpact(tmp, diag('2026-08-26-1059', { quality: { score: 55, grade: 'F' } })); // retry, changed score
    const rows = readRows();
    check('row count unchanged on same-runId retry (no duplicate)', rows.length === before);
    const matches = rows.filter(r => col(r, 'run_id') === '2026-08-26-1059');
    check('exactly one row for the retried runId', matches.length === 1);
    check('retry replaced the value (score now 55)', col(matches[0], 'score') === '55');
}

// ---- 6. Existing/manual rows preserved verbatim (incl. quoted notes with commas) ----
{
    // Seed a fresh file with a hand-authored row whose notes contains a comma (must survive).
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dli2-'));
    const seedPath = path.join(seedDir, 'daily-logic-impact.csv');
    const manual = DAILY_LOGIC_IMPACT_COLUMNS.map(c => c === 'date' ? '2026-08-05' : c === 'run_id' ? '2026-08-05-1222'
        : c === 'tag_artifacts_blocked' ? '1' : c === 'notes' ? '"filters live: 1 tag, 3 roundups"' : '').join(',');
    fs.writeFileSync(seedPath, [DAILY_LOGIC_IMPACT_COLUMNS.join(','), manual].join('\n') + '\n', 'utf-8');
    writeDailyLogicImpact(seedDir, diag('2026-08-26-1059'));
    const rows = fs.readFileSync(seedPath, 'utf-8').split(/\r?\n/).filter(l => l.length > 0);
    const seededLine = rows.find(r => r.startsWith('2026-08-05,'))!;
    check('manual row preserved verbatim (byte-identical)', seededLine === manual);
    check('manual build-stage value (tag_artifacts_blocked=1) intact', col(seededLine, 'tag_artifacts_blocked') === '1');
    check('appended after manual row, sorted', rows.length === 3 && rows[1].startsWith('2026-08-05,'));
    fs.rmSync(seedDir, { recursive: true, force: true });
}

// ---- 7. No-op guard when runId is missing ----
{
    const guardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dli3-'));
    writeDailyLogicImpact(guardDir, { quality: {} } as any);
    check('missing runId is a no-op (no file written)', !fs.existsSync(path.join(guardDir, 'daily-logic-impact.csv')));
    fs.rmSync(guardDir, { recursive: true, force: true });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} checks passed`);
