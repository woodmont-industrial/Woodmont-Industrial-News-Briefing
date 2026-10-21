#!/usr/bin/env node
/**
 * Keeps docs/engineering-changelog.csv current (2026-10-21).
 *
 * The changelog and docs/engineering-validations.csv feed the Power BI engineering
 * pages. Both were hand-maintained and stopped at 2026-08-26 while ~40 changes shipped.
 * This script appends one row per production change on main that is not yet logged:
 *
 *   AUTO (from git / GitHub checks): date, commit_sha, implemented_date, files_changed,
 *     lines_added, lines_removed, test_suite, tests_added, ci_checks_passed, status,
 *     production_status (from reviewed annotations; blank when unclassified).
 *   ANNOTATION (judgement): change_name, change_type, component, bug_class,
 *     validation_level, replay_dates, editorial_outcome, risk_level, notes.
 *     Taken from --annotations <json> when given; otherwise change_name is the commit
 *     subject and notes say "auto-logged: annotation pending" so the gap is visible.
 *
 * A "production change" is a non-merge commit reachable from main, by a person (not the
 * newsletter bot), that touches something other than data or prose: send-state JSON,
 * CSV datasets, archives, diagnostics and *.md files are excluded. A squash-merged PR is
 * one commit; a branch merged with a merge commit contributes each of its commits.
 *
 *   node scripts/engineering-changelog.mjs                  # dry run: print rows
 *   node scripts/engineering-changelog.mjs --append         # append to the CSV
 *   node scripts/engineering-changelog.mjs --append --annotations scripts/engineering-annotations/2026-10-backfill.json
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.join(REPO, 'docs', 'engineering-changelog.csv');
const BOT = /github-actions|\[bot\]/i;

const gitAt = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const git = (args) => gitAt(REPO, args);

/** Data and prose, not logic. docs/index.html and docs/js/* are code and DO count. */
export function isDataOrProse(file) {
    if (/\.md$/i.test(file)) return true;
    if (/^docs\/(newsletter-archive|diagnostics|data)\//.test(file)) return true;
    if (/^docs\/[^/]+\.(json|csv|xml|txt)$/i.test(file)) return true;
    if (/^docs\/preferences\//.test(file)) return true;
    if (/^feed-validation-report\.json$/.test(file)) return true;
    return false;
}

const TEST_FILE = /(\.test\.(ts|tsx|js|cjs|mjs)$)|(^tests\/)/;
/** Added assertion calls, the same unit the hand-written rows counted as tests_added. */
const ASSERTION = /\b(check|chk|assert(?:\.\w+)?|expect(?:Paths)?|keep|block|ok|equal|deepEqual|strictEqual|throws)\s*\(/;

export function parseCsv(text) {
    const rows = []; let row = []; let field = ''; let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else field += c;
    }
    if (quoted) throw new Error('Unterminated CSV field');
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

export const csvField = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function etDate(iso) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(iso));
}

export function ciResult(sha, api, repository) {
    try {
        if (!/^[a-f0-9]{40}$/.test(sha)) return '';
        if (!repository) {
            const remote = git(['remote', 'get-url', 'origin']).trim();
            repository = process.env.GITHUB_REPOSITORY || remote.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1];
        }
        if (!repository) return '';
        api ||= endpoint => JSON.parse(execFileSync('gh', ['api', endpoint], {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000,
        }));
        // Inspect only the exact commit's CI workflow. Pages, this updater, and
        // unrelated running jobs must not contaminate the recorded result.
        const runs = api(`repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`)
            .workflow_runs.filter(run => run.head_sha === sha)
            .sort((a, b) => b.id - a.id);
        const run = runs[0];
        if (!run || run.status !== 'completed') return '';
        const jobs = [];
        for (let page = 1; ; page++) {
            const batch = api(`repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100&page=${page}`).jobs;
            jobs.push(...batch);
            if (batch.length < 100) break;
        }
        return completedCiResult(jobs);
    } catch { return ''; }
}

export function completedCiResult(jobs) {
        if (jobs.some(job => ['failure', 'timed_out', 'action_required', 'startup_failure'].includes(job.conclusion))) return 'fail';
        // Cancellation leaves coverage incomplete, even if some checks passed.
        if (!jobs.length || jobs.some(job => job.status !== 'completed' ||
            !['success', 'neutral', 'skipped'].includes(job.conclusion))) return '';
        if (!jobs.some(job => job.conclusion === 'success')) return '';
        return 'pass';
}

export function commitFacts(sha) {
    const numstat = git(['show', '--numstat', '--format=', sha]).trim().split('\n').filter(Boolean);
    let files = 0, added = 0, removed = 0;
    const tests = new Set();
    for (const line of numstat) {
        const [a, r, file] = line.split('\t');
        if (!file || isDataOrProse(file)) continue;
        files++;
        added += Number(a) || 0; removed += Number(r) || 0;
        if (TEST_FILE.test(file)) tests.add(path.basename(file));
    }
    let testsAdded = 0;
    if (tests.size) {
        const patch = git(['show', '--format=', '--unified=0', sha, '--', ...numstat.map(l => l.split('\t')[2]).filter(f => f && TEST_FILE.test(f))]);
        for (const line of patch.split('\n')) if (line.startsWith('+') && !line.startsWith('+++') && ASSERTION.test(line)) testsAdded++;
    }
    return { files, added, removed, testSuite: [...tests].sort().join(';'), testsAdded };
}

export function candidates(loggedShas, through = 'HEAD', repo = REPO) {
    const runGit = args => gitAt(repo, args);
    const end = runGit(['rev-parse', '--verify', `${through}^{commit}`]).trim();
    runGit(['merge-base', '--is-ancestor', end, 'HEAD']);
    const lastLogged = [...loggedShas].reverse().find(s => {
        try { runGit(['merge-base', '--is-ancestor', s, end]); return true; } catch { return false; }
    });
    const range = lastLogged ? `${lastLogged}..${end}` : end;
    const log = runGit(['log', '--no-merges', '--reverse', '--format=%H%x09%an%x09%ae%x09%cI%x09%s', range]).trim();
    const out = [];
    for (const line of log ? log.split('\n') : []) {
        const [sha, author, email, when, subject] = line.split('\t');
        if (loggedShas.has(sha) || BOT.test(author) || BOT.test(email)) continue;
        const files = runGit(['show', '--name-only', '--format=', sha]).trim().split('\n').filter(Boolean);
        if (!files.length || files.every(isDataOrProse)) continue;
        out.push({ sha, when, subject: subject.replace(/^﻿/, '').trim() });
    }
    return out;
}

function main() {
    const args = process.argv.slice(2);
    const append = args.includes('--append');
    const annIdx = args.indexOf('--annotations');
    const throughIdx = args.indexOf('--through');
    if (throughIdx >= 0 && !/^[a-f0-9]{40}$/.test(args[throughIdx + 1] || '')) throw new Error('--through requires a full commit SHA');
    const through = throughIdx >= 0 ? args[throughIdx + 1] : 'HEAD';
    const annotations = annIdx >= 0 ? JSON.parse(fs.readFileSync(path.resolve(args[annIdx + 1]), 'utf8')) : {};
    const text = fs.readFileSync(CSV, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const rows = parseCsv(text);
    const header = rows[0];
    const shaCol = header.indexOf('commit_sha');
    if (shaCol < 0 || rows.some(row => row.length !== header.length)) throw new Error('Invalid changelog schema');
    const logged = new Set(rows.slice(1).map(r => r[shaCol]));
    const fresh = candidates(logged, through);
    const lines = [];
    for (const c of fresh) {
        const f = commitFacts(c.sha);
        const found = Object.entries(annotations).find(([k]) => c.sha.startsWith(k));
        const ann = found?.[1] || {};
        const date = etDate(c.when);
        const record = {
            date, commit_sha: c.sha, change_name: ann.change_name || c.subject.replace(/\s*\(#\d+\)$/, ''),
            change_type: ann.change_type || '', component: ann.component || '', bug_class: ann.bug_class || '',
            status: 'shipped', production_status: ann.production_status || '',
            issue_found_date: ann.issue_found_date || '', implemented_date: date,
            files_changed: f.files, lines_added: f.added, lines_removed: f.removed,
            test_suite: f.testSuite, tests_added: f.testsAdded, ci_checks_passed: ciResult(c.sha),
            validation_level: ann.validation_level || '',
            historical_items_reviewed: ann.historical_items_reviewed ?? '', historical_items_affected: ann.historical_items_affected ?? '',
            false_positives_found: ann.false_positives_found ?? '', live_occurrences_blocked: ann.live_occurrences_blocked ?? '',
            replay_dates: ann.replay_dates || '', editorial_outcome: ann.editorial_outcome || '',
            risk_level: ann.risk_level || '', notes: found ? (ann.notes || '') : 'auto-logged: annotation pending',
        };
        lines.push(header.map(h => csvField(record[h] ?? '')).join(','));
    }
    if (!lines.length) { console.log('engineering changelog: up to date'); return; }
    if (append) {
        const body = text.endsWith('\n') ? text : text + eol;
        fs.writeFileSync(CSV, body + lines.join(eol) + eol);
        console.log(`engineering changelog: appended ${lines.length} row(s)`);
    } else {
        console.log(lines.join('\n'));
        console.log(`(dry run: ${lines.length} row(s); pass --append to write)`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
