import assert from 'node:assert/strict';
import * as fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isDataOrProse, parseCsv, csvField, ciResult, completedCiResult, candidates } from './engineering-changelog.mjs';

// What counts as a production change: code and workflows yes; data, archives, prose no.
for (const f of ['docs/feed.json', 'docs/sent-articles.json', 'docs/engineering-changelog.csv', 'docs/newsletter-archive/2026-10-21.html',
    'docs/diagnostics/latest.json', 'docs/data/capital-markets-scan.json', 'docs/preferences/reserve-pool.json', 'README.md']) {
    assert.equal(isDataOrProse(f), true, `data/prose: ${f}`);
}
for (const f of ['docs/index.html', 'docs/js/capital-markets.js', 'src/server/email.ts', '.github/workflows/send-only.yml',
    'src/feeds/feeds.json', 'scripts/replay-send.ts']) {
    assert.equal(isDataOrProse(f), false, `code: ${f}`);
}

// CSV fields with commas, quotes and newlines survive a round trip.
const values = ['plain', 'a, b', 'say "hi"', 'two\nlines', ''];
assert.deepEqual(parseCsv(values.map(csvField).join(',') + '\r\n')[0], values);
assert.throws(() => parseCsv('a,"unfinished'), /Unterminated/);

const job = (conclusion, status = 'completed') => ({ conclusion, status });
assert.equal(completedCiResult([job('success'), job('skipped')]), 'pass');
assert.equal(completedCiResult([job('success'), job('cancelled')]), '');
assert.equal(completedCiResult([job('cancelled')]), '');
assert.equal(completedCiResult([job('skipped')]), '');
assert.equal(completedCiResult([]), '');
assert.equal(completedCiResult([job(null, 'in_progress')]), '');
assert.equal(completedCiResult([job('success'), job('failure')]), 'fail');
assert.equal(completedCiResult([job('cancelled'), job('timed_out')]), 'fail');

// The query is scoped to one CI workflow, not the whole commit's check runs.
const sha = 'a'.repeat(40);
const endpoints = [];
assert.equal(ciResult(sha, endpoint => {
    endpoints.push(endpoint);
    if (endpoint.includes('/workflows/ci.yml/runs?')) return { workflow_runs: [{ id: 7, head_sha: sha, status: 'completed' }] };
    assert.match(endpoint, /\/actions\/runs\/7\/jobs\?/);
    return { jobs: [job('success'), job('skipped')] };
}, 'example/project'), 'pass');
assert.equal(endpoints.length, 2);
assert.equal(ciResult(sha, () => ({ workflow_runs: [{ id: 8, head_sha: sha, status: 'in_progress' }] }), 'example/project'), '');
assert.equal(ciResult(sha, () => { throw new Error('unavailable'); }, 'example/project'), '');

// An updater checking out a newer main must stop at the triggering CI SHA.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-history-'));
try {
    const git = args => execFileSync('git', args, { cwd: temp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git(['init', '-q']);
    git(['config', 'user.name', 'Example Developer']);
    git(['config', 'user.email', 'developer@example.invalid']);
    const commit = (name, content) => {
        fs.writeFileSync(path.join(temp, name), content);
        git(['add', name]); git(['commit', '-qm', 'Synthetic change']);
        return git(['rev-parse', 'HEAD']);
    };
    const base = commit('logic.mjs', 'export const value = 0;\n');
    const completed = commit('logic.mjs', 'export const value = 1;\n');
    const newer = commit('logic.mjs', 'export const value = 2;\n');
    assert.deepEqual(candidates(new Set([base]), completed, temp).map(c => c.sha), [completed]);
    assert.deepEqual(candidates(new Set([base, completed]), completed, temp), []);
    assert.deepEqual(candidates(new Set([base, completed]), newer, temp).map(c => c.sha), [newer]);
    assert.equal(candidates(new Set([base]), completed, temp).some(c => c.sha === newer), false);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }

// Every row of both Power BI datasets has the header's width.
for (const file of ['docs/engineering-changelog.csv', 'docs/engineering-validations.csv']) {
    const rows = parseCsv(fs.readFileSync(file, 'utf8'));
    assert.ok(rows.length > 1, `${file} has rows`);
    for (const r of rows) assert.equal(r.length, rows[0].length, `${file}: row width`);
    const keyColumns = file.includes('validations') ? ['commit_sha', 'replay_date'] : ['commit_sha'];
    const keys = rows.slice(1).map(row => keyColumns.map(c => row[rows[0].indexOf(c)]).join('|'));
    assert.equal(new Set(keys).size, keys.length, `${file}: unique keys`);
}
const workflow = fs.readFileSync('.github/workflows/engineering-changelog.yml', 'utf8');
assert.match(workflow, /actions: read/);
assert.match(workflow, /github\.event\.workflow_run\.head_sha/);
assert.match(workflow, /--through "\$COMPLETED_SHA"/);
console.log('PASS: engineering schemas, CI isolation, incomplete CI, bounded history and idempotency');
