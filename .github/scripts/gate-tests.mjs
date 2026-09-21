// Tests for the inline actions/github-script gate logic in send-only.yml and
// newsletter-watchdog.yml. Rather than duplicating the logic here (which would
// drift), this harness EXTRACTS the real `script: |` blocks from the YAML and
// executes them against mocks with a frozen clock — the code under test is the
// exact text GitHub will run.
//
// Run:  node .github/scripts/gate-tests.mjs
//
// Covers (2026-08-31 production-safety patch):
//   - delivery floor (7:15 AM America/New_York) on schedule + workflow_run
//   - weekend gate on automated triggers
//   - deliberate triggers (repository_dispatch / workflow_dispatch) bypass floor
//   - force_send bypasses everything
//   - dedup via lastSendDate (all-backfill sends) and legacy per-entry sentAt
//   - DST correctness: same gates hold in EDT (UTC-4) and EST (UTC-5)
//   - watchdog: auto-dispatch fires only when unsent AND >=7:30 ET AND weekday
import * as fs from 'node:fs';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0;
const check = (name, cond) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

// ---- extract a `script: |` block from a workflow file ------------------------------
function extractScript(file, occurrence = 0) {
    const lines = fs.readFileSync(path.join(repoRoot, file), 'utf-8').split(/\r?\n/);
    let found = -1;
    for (let i = 0, seen = 0; i < lines.length; i++) {
        if (/^\s*script: \|\s*$/.test(lines[i])) {
            if (seen === occurrence) { found = i; break; }
            seen++;
        }
    }
    assert.notEqual(found, -1, `script block #${occurrence} in ${file}`);
    const bodyIndent = lines[found + 1].match(/^\s*/)[0].length;
    const body = [];
    for (let i = found + 1; i < lines.length; i++) {
        if (lines[i].trim() === '') { body.push(''); continue; }
        const indent = lines[i].match(/^\s*/)[0].length;
        if (indent < bodyIndent) break;
        body.push(lines[i].slice(bodyIndent));
    }
    return body.join('\n');
}

// ---- mock harness ------------------------------------------------------------------
function frozenDateClass(iso) {
    const FROZEN = new Date(iso).getTime();
    return class FrozenDate extends Date {
        constructor(...args) { args.length === 0 ? super(FROZEN) : super(...args); }
        static now() { return FROZEN; }
    };
}

async function runScript(script, { nowUtc, eventName, forceSend = 'false', sentFile, inProgress = false }) {
    const rendered = script.replaceAll('${{ inputs.force_send }}', forceSend);
    const dispatches = [];
    const core = {
        outputs: {}, notices: [], warnings: [],
        setOutput(k, v) { this.outputs[k] = v; },
        notice(m) { this.notices.push(m); },
        warning(m) { this.warnings.push(m); },
    };
    const github = {
        rest: {
            repos: {
                async getContent() {
                    if (sentFile === undefined) { const e = new Error('Not Found'); e.status = 404; throw e; }
                    return { data: { content: Buffer.from(JSON.stringify(sentFile)).toString('base64') } };
                },
            },
            actions: {
                async listWorkflowRuns() {
                    return { data: { workflow_runs: inProgress ? [{ status: 'in_progress' }] : [] } };
                },
                async createWorkflowDispatch(args) { dispatches.push(args); },
            },
        },
    };
    const context = { eventName, repo: { owner: 'woodmont-industrial', repo: 'test' } };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const fn = new AsyncFunction('context', 'core', 'github', 'Date', 'console', rendered);
    const quietConsole = { log: () => {} };
    await fn(context, core, github, frozenDateClass(nowUtc), quietConsole);
    return { skip: core.outputs.skip, dispatches, notices: core.notices, warnings: core.warnings };
}

const sendGate = extractScript('.github/workflows/send-only.yml', 0);
const watchdog = extractScript('.github/workflows/newsletter-watchdog.yml', 0);

// Clock fixtures. EDT = UTC-4 (Aug), EST = UTC-5 (Dec). All Mondays unless noted.
const MON_9AM_EDT   = '2026-08-31T13:00:00Z'; // 9:00 AM ET — inside window
const MON_6AM_EDT   = '2026-08-31T10:00:00Z'; // 6:00 AM ET — before floor
const MON_650AM_EDT = '2026-08-31T10:50:00Z'; // 6:50 AM ET — the OLD 10:30 UTC gate PASSED here (early send); floor must block
const SAT_9AM_EDT   = '2026-09-05T13:00:00Z'; // Saturday
const MON_710AM_EST = '2026-12-07T12:10:00Z'; // 7:10 AM EST (winter) — before floor
const MON_720AM_EST = '2026-12-07T12:20:00Z'; // 7:20 AM EST — past 7:15 floor
const MON_635AM_EST = '2026-12-07T11:35:00Z'; // 6:35 AM EST — winter drift of the 11:30 UTC watchdog cron
const MON_9AM_EST   = '2026-12-07T14:00:00Z'; // 9:00 AM EST

const EMPTY = { sent: [] };
const todayOf = (iso) => iso.split('T')[0];

// ================= send-only.yml gate =================
{
    // Happy path
    let r = await runScript(sendGate, { nowUtc: MON_9AM_EDT, eventName: 'schedule', sentFile: EMPTY });
    check('schedule Mon 9:00 EDT, unsent -> proceeds', r.skip === 'false');

    // Delivery floor — negative tests
    r = await runScript(sendGate, { nowUtc: MON_6AM_EDT, eventName: 'schedule', sentFile: EMPTY });
    check('schedule Mon 6:00 EDT -> floor skips (old code had NO gate on this path)', r.skip === 'true');
    r = await runScript(sendGate, { nowUtc: MON_650AM_EDT, eventName: 'workflow_run', sentFile: EMPTY });
    check('workflow_run Mon 6:50 EDT -> floor skips (old 10:30 UTC gate sent 40 min early here)', r.skip === 'true');
    r = await runScript(sendGate, { nowUtc: MON_9AM_EDT, eventName: 'workflow_run', sentFile: EMPTY });
    check('workflow_run Mon 9:00 EDT, unsent -> recovery proceeds', r.skip === 'false');

    // Weekend gate
    r = await runScript(sendGate, { nowUtc: SAT_9AM_EDT, eventName: 'schedule', sentFile: EMPTY });
    check('schedule Saturday -> weekend skips', r.skip === 'true');
    r = await runScript(sendGate, { nowUtc: SAT_9AM_EDT, eventName: 'workflow_run', sentFile: EMPTY });
    check('workflow_run Saturday (stray manual build) -> weekend skips', r.skip === 'true');

    // Deliberate triggers bypass the floor but not dedup
    r = await runScript(sendGate, { nowUtc: MON_6AM_EDT, eventName: 'repository_dispatch', sentFile: EMPTY });
    check('repository_dispatch Mon 6:00 EDT (external scheduler) -> floor NOT applied', r.skip === 'false');
    r = await runScript(sendGate, { nowUtc: MON_6AM_EDT, eventName: 'workflow_dispatch', sentFile: EMPTY });
    check('workflow_dispatch Mon 6:00 EDT (human) -> floor NOT applied', r.skip === 'false');
    r = await runScript(sendGate, {
        nowUtc: MON_9AM_EDT, eventName: 'repository_dispatch',
        sentFile: { sent: [], lastSendDate: todayOf(MON_9AM_EDT) },
    });
    check('repository_dispatch when already sent -> dedup still skips', r.skip === 'true');

    // Dedup: duplicate-send regression (audit finding 3)
    r = await runScript(sendGate, {
        nowUtc: MON_9AM_EDT, eventName: 'schedule',
        sentFile: { sent: [{ id: 'old', sentAt: '2026-08-14' }], lastSendDate: todayOf(MON_9AM_EDT) },
    });
    check('all-backfill send recorded only via lastSendDate -> skips (old guard was blind, re-sent)', r.skip === 'true');
    r = await runScript(sendGate, {
        nowUtc: MON_9AM_EDT, eventName: 'schedule',
        sentFile: { sent: [{ id: 'a', sentAt: todayOf(MON_9AM_EDT) }] },
    });
    check('legacy file: per-entry sentAt === today still skips (backward compatible)', r.skip === 'true');

    // force_send bypasses everything
    r = await runScript(sendGate, {
        nowUtc: SAT_9AM_EDT, eventName: 'workflow_dispatch', forceSend: 'true',
        sentFile: { sent: [], lastSendDate: todayOf(SAT_9AM_EDT) },
    });
    check('force_send bypasses dedup (and floor/weekend do not apply to dispatch)', r.skip === 'false');

    // Missing state file -> proceed (same as old behavior)
    r = await runScript(sendGate, { nowUtc: MON_9AM_EDT, eventName: 'schedule', sentFile: undefined });
    check('sent-articles.json unreadable -> proceeds (fail-open, unchanged semantics)', r.skip === 'false');

    // DST: identical ET semantics in winter
    r = await runScript(sendGate, { nowUtc: MON_710AM_EST, eventName: 'schedule', sentFile: EMPTY });
    check('EST winter: schedule Mon 7:10 AM ET -> floor skips', r.skip === 'true');
    r = await runScript(sendGate, { nowUtc: MON_720AM_EST, eventName: 'schedule', sentFile: EMPTY });
    check('EST winter: schedule Mon 7:20 AM ET -> proceeds (floor is wall-clock, not UTC)', r.skip === 'false');
}

// ================= newsletter-watchdog.yml =================
{
    // No-send recovery: unsent past 7:30 ET -> dispatches send-only.yml
    let r = await runScript(watchdog, { nowUtc: MON_9AM_EDT, eventName: 'schedule', sentFile: EMPTY });
    check('watchdog: unsent Mon 9:00 EDT -> auto-dispatches send-only.yml',
        r.dispatches.length === 1 && r.dispatches[0].workflow_id === 'send-only.yml');

    // Duplicate protection: any evidence of a send -> no dispatch
    r = await runScript(watchdog, {
        nowUtc: MON_9AM_EDT, eventName: 'schedule',
        sentFile: { sent: [], lastSendDate: todayOf(MON_9AM_EDT) },
    });
    check('watchdog: lastSendDate=today -> no dispatch', r.dispatches.length === 0);
    r = await runScript(watchdog, {
        nowUtc: MON_9AM_EDT, eventName: 'schedule',
        sentFile: { sent: [{ id: 'a', sentAt: todayOf(MON_9AM_EDT) }] },
    });
    check('watchdog: legacy sentAt=today -> no dispatch', r.dispatches.length === 0);
    r = await runScript(watchdog, { nowUtc: MON_9AM_EDT, eventName: 'schedule', sentFile: EMPTY, inProgress: true });
    check('watchdog: send already in progress -> no dispatch', r.dispatches.length === 0);

    // Too-early / weekend stand-downs
    r = await runScript(watchdog, { nowUtc: MON_6AM_EDT, eventName: 'schedule', sentFile: EMPTY });
    check('watchdog: 6:00 AM ET -> stands down (no dispatch)', r.dispatches.length === 0);
    r = await runScript(watchdog, { nowUtc: MON_635AM_EST, eventName: 'schedule', sentFile: EMPTY });
    check('watchdog: EST winter 6:35 AM ET (11:30 UTC cron drift) -> stands down, no early send', r.dispatches.length === 0);
    r = await runScript(watchdog, { nowUtc: MON_9AM_EST, eventName: 'schedule', sentFile: EMPTY });
    check('watchdog: EST winter 9:00 AM ET unsent -> dispatches', r.dispatches.length === 1);
    r = await runScript(watchdog, { nowUtc: SAT_9AM_EDT, eventName: 'workflow_dispatch', sentFile: EMPTY });
    check('watchdog: weekend (manual run) -> stands down', r.dispatches.length === 0);
}


// ================= EXTERNAL SCHEDULER CONTRACT =================
// The external clock (Power Automate / cron-job.org / any HTTPS caller) is the
// PRIMARY timing source: repository_dispatch `build-feed` at 6:15 AM ET and
// `send-newsletter` at 7:30 AM ET. GitHub's own schedule crons, the
// workflow_run chain and the watchdog remain in place as FALLBACK layers.
//
// The contract these tests lock down:
//   1. a 7:30 external send delivers when nothing has been sent yet
//   2. a second external send the same day is a no-op
//   3. every FALLBACK layer stands down once the external send has landed
//   4. those fallbacks still fire when the external send never arrives
// Together 2 + 3 are what make "external primary + GitHub fallback" safe:
// adding the external clock cannot produce a duplicate send.
{
    const MON_615AM_EDT = '2026-08-31T10:15:00Z';  // 6:15 AM ET — external BUILD slot
    const MON_730AM_EDT = '2026-08-31T11:30:00Z';  // 7:30 AM ET — external SEND slot
    const MON_1015AM_EDT = '2026-08-31T14:15:00Z'; // 10:15 AM ET — a late, lagged GitHub cron
    const SENT_TODAY = { sent: [], lastSendDate: todayOf(MON_730AM_EDT) };

    // (1) external send at 7:30 sends if unsent
    let r = await runScript(sendGate, { nowUtc: MON_730AM_EDT, eventName: 'repository_dispatch', sentFile: EMPTY });
    check('external 7:30 ET repository_dispatch, unsent -> SENDS', r.skip === 'false');

    // The 6:15 build slot must not be able to deliver early. A deliberate
    // trigger bypasses the floor, but the build fires `build-feed` on a
    // DIFFERENT workflow, and the workflow_run it produces is an automated
    // trigger — so the 7:15 floor still holds it.
    r = await runScript(sendGate, { nowUtc: MON_615AM_EDT, eventName: 'workflow_run', sentFile: EMPTY });
    check('6:15 ET build completion -> workflow_run held by the 7:15 floor (no early send)', r.skip === 'true');

    // (2) external send after an existing successful send skips
    r = await runScript(sendGate, { nowUtc: MON_730AM_EDT, eventName: 'repository_dispatch', sentFile: SENT_TODAY });
    check('external send after a successful send -> SKIPS (external retry is safe)', r.skip === 'true');

    // (3) late workflow_run after an external send skips
    r = await runScript(sendGate, { nowUtc: MON_1015AM_EDT, eventName: 'workflow_run', sentFile: SENT_TODAY });
    check('late workflow_run after external send -> SKIPS', r.skip === 'true');

    // (4) late scheduled send after an external send skips
    r = await runScript(sendGate, { nowUtc: MON_1015AM_EDT, eventName: 'schedule', sentFile: SENT_TODAY });
    check('late lagged cron after external send -> SKIPS', r.skip === 'true');

    // (5) watchdog after an external send does nothing
    r = await runScript(watchdog, { nowUtc: MON_1015AM_EDT, eventName: 'schedule', sentFile: SENT_TODAY });
    check('watchdog after external send -> no dispatch', r.dispatches.length === 0);

    // The fallbacks must still cover a MISSED external send — otherwise moving
    // to an external clock would trade one single point of failure for another.
    r = await runScript(sendGate, { nowUtc: MON_1015AM_EDT, eventName: 'schedule', sentFile: EMPTY });
    check('fallback intact: lagged cron with no external send -> still sends', r.skip === 'false');
    r = await runScript(watchdog, { nowUtc: MON_1015AM_EDT, eventName: 'schedule', sentFile: EMPTY });
    check('fallback intact: watchdog with no external send -> dispatches', r.dispatches.length === 1);

    // Legacy per-entry state must suppress the fallbacks too, not just lastSendDate.
    const LEGACY = { sent: [{ id: 'x', sentAt: todayOf(MON_730AM_EDT) }] };
    r = await runScript(sendGate, { nowUtc: MON_1015AM_EDT, eventName: 'schedule', sentFile: LEGACY });
    check('legacy sentAt state also suppresses a late cron', r.skip === 'true');

    // A weekend external dispatch is a deliberate act by a human or a
    // misconfigured scheduler, and is NOT weekend-gated — only automated
    // triggers are. Documented in EXTERNAL-SCHEDULER.md, not a bug: the
    // external caller is responsible for firing on weekdays only.
    r = await runScript(sendGate, { nowUtc: SAT_9AM_EDT, eventName: 'repository_dispatch', sentFile: EMPTY });
    check('weekend repository_dispatch is deliberate -> proceeds (documented; caller must gate weekends)', r.skip === 'false');
}
// ================= BUILD GATE: external dispatch is authoritative =================
// newsletter-pipeline.yml skips when a build succeeded < 2h ago. That gate must
// NOT suppress the 6:15 AM ET external build, or a lagged cron build landing at
// ~5:00-6:14 ET would silently cancel it and the 7:30 send would use older
// content - making the external clock primary in name only.
{
    const buildGate = extractScript('.github/workflows/newsletter-pipeline.yml', 0);
    const recentSuccess = { data: { workflow_runs: [
        { id: 999, created_at: '2026-08-31T09:40:00Z', status: 'success' } ] } };
    async function runBuildGate(eventName) {
        const core = { outputs: {}, setOutput(k, v) { this.outputs[k] = v; },
                       notice() {}, warning() {} };
        const github = { rest: { actions: {
            async listWorkflowRuns() { return recentSuccess; },
            async createWorkflowDispatch() {} },
            repos: { async getContent() { const e = new Error('Not Found'); e.status = 404; throw e; } } } };
        const context = { eventName, runId: 1, repo: { owner: 'woodmont-industrial', repo: 'test' } };
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const rendered = buildGate.replaceAll('${{ inputs.force_build }}', 'false');
        const fn = new AsyncFunction('context', 'core', 'github', 'Date', 'console', rendered);
        // 10:15Z = 6:15 AM ET, 35 minutes after the 09:40Z 'recent' build
        await fn(context, core, github, frozenDateClass('2026-08-31T10:15:00Z'), { log: () => {} });
        return core.outputs.skip;
    }
    check('build: scheduled run with a build 35 min ago -> staleness gate SKIPS (unchanged)',
          await runBuildGate('schedule') === 'true');
    check('build: external repository_dispatch with a build 35 min ago -> RUNS anyway',
          await runBuildGate('repository_dispatch') === 'false');
}

console.log(`\n${pass} checks passed`);
