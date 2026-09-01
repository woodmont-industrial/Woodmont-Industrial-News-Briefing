// Regression tests for update-pipeline-status.mjs (2026-09-01 follow-up):
// pipeline-status.articleCount must equal THAT RUN's archive articleCount —
// the sent-HTML count — in every scenario where the old sent-articles.json
// derivation diverged. Each fixture also plants a sent-articles.json whose
// today-row count DIFFERS from the archive count, proving the value is not
// derived from sent state.
//
// Run:  node .github/scripts/pipeline-status-tests.mjs
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'update-pipeline-status.mjs');
const TODAY = new Date().toISOString().split('T')[0];
let pass = 0;
const check = (name, cond) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

function runScenario({ archiveCount, sentTodayRows, docsDir }) {
    const dir = docsDir || fs.mkdtempSync(path.join(os.tmpdir(), 'ps-test-'));
    fs.mkdirSync(path.join(dir, 'newsletter-archive'), { recursive: true });
    if (archiveCount !== undefined) {
        fs.writeFileSync(path.join(dir, 'newsletter-archive', 'latest.json'), JSON.stringify({
            date: TODAY, githubRunId: 'test-run', generatedAt: new Date().toISOString(),
            sentToRelay: true, articleCount: archiveCount,
        }, null, 2));
    }
    if (sentTodayRows !== undefined) {
        const rows = Array.from({ length: sentTodayRows }, (_, i) => ({ id: `art-${i}`, sentAt: TODAY }));
        fs.writeFileSync(path.join(dir, 'sent-articles.json'),
            JSON.stringify({ sent: rows, lastSendDate: TODAY }, null, 2));
    }
    execFileSync(process.execPath, [SCRIPT], {
        env: { ...process.env, PIPELINE_STATUS_DOCS_DIR: dir, GITHUB_RUN_ID: '12345', GITHUB_REPOSITORY: 'woodmont-industrial/test' },
        stdio: 'pipe',
    });
    return { dir, status: JSON.parse(fs.readFileSync(path.join(dir, 'pipeline-status.json'), 'utf-8')) };
}

// ---- 1. Normal clean send: archive 6, sent-state 6 -------------------------
{
    const { status } = runScenario({ archiveCount: 6, sentTodayRows: 6 });
    check('clean send: articleCount equals archive count (6)', status.articleCount === 6);
}

// ---- 2. Within-send removed duplicates: archive 5, sent-state 7 ------------
// (the real 2026-09-01 case: 5 shipped + 2 persisted dupes)
{
    const { status } = runScenario({ archiveCount: 5, sentTodayRows: 7 });
    check('within-send dupes: articleCount equals archive (5), not sent-state (7)',
        status.articleCount === 5 && status.articleCount !== 7);
}

// ---- 3. Previously-seen article ids: archive 7, sent-state 6 ---------------
// (the real 2026-08-27 case: 7 shipped, one id already on file -> 6 rows)
{
    const { status } = runScenario({ archiveCount: 7, sentTodayRows: 6 });
    check('previously-seen ids: articleCount equals archive (7), not sent-state (6)',
        status.articleCount === 7 && status.articleCount !== 6);
}

// ---- 4. Multiple sends on the same day -------------------------------------
// (the real 2026-08-28 case: force re-sends; rows accumulate 8 -> 12 while
// each run's archive holds only that run's HTML count)
{
    const first = runScenario({ archiveCount: 8, sentTodayRows: 8 });
    check('same-day send #1: articleCount equals that run archive (8)', first.status.articleCount === 8);
    // Second send of the day reuses the docsDir: latest.json is overwritten
    // with the new run's meta (5 articles) while sent rows accumulated to 12.
    const second = runScenario({ archiveCount: 5, sentTodayRows: 12, docsDir: first.dir });
    check('same-day send #2: articleCount equals that run archive (5), not cumulative rows (12)',
        second.status.articleCount === 5 && second.status.articleCount !== 12);
}

// ---- Website compatibility: exact shape preserved --------------------------
{
    const { status } = runScenario({ archiveCount: 3, sentTodayRows: 3 });
    check('shape: exact keys preserved for the website',
        JSON.stringify(Object.keys(status)) === JSON.stringify(['lastSent', 'date', 'articleCount', 'status', 'runId', 'runUrl']));
    check('shape: status/runId/runUrl values well-formed',
        status.status === 'success' && status.runId === '12345'
        && status.runUrl === 'https://github.com/woodmont-industrial/test/actions/runs/12345'
        && status.date === TODAY && typeof status.lastSent === 'string');
}

// ---- Degraded: archive meta missing -> 0, valid shape, no crash ------------
{
    const { status } = runScenario({ sentTodayRows: 9 });
    check('missing archive meta: falls back to 0 (never to sent-state), shape intact',
        status.articleCount === 0 && status.status === 'success');
}

console.log(`\n${pass} checks passed`);
