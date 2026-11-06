import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { computeNewsletterScore, DiagnosticContext, writeQualityHistory, regenerateQualityCsv } from './newsletter-diagnostics.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-method-'));
try {
    const old = { date: '2026-10-30', runId: '2026-10-30-1200', score: 84, outOf10: 8.4, grade: 'B', itemCount: 7,
        breakdown: { coverage: 27, freshness: 16.2, regional: 20.7, relevanceIntegrity: 20 }, penalties: [] };
    fs.writeFileSync(path.join(root, 'quality-scores.json'), JSON.stringify({ updatedAt: 'earlier', history: [old] }));
    const diag = new DiagnosticContext({ isFriday: false });
    const quality = computeNewsletterScore(diag.toJSON(), { relevant: [], transactions: [], availabilities: [], people: [] },
        { sigOf: () => [], recentSigs: new Set() });
    assert.equal(quality.scoringVersion, '2026-10-30-shared-geography-v1');
    writeQualityHistory(root, '2026-11-02', '2026-11-02-1200', quality);
    const history = JSON.parse(fs.readFileSync(path.join(root, 'quality-scores.json'), 'utf8')).history;
    assert.deepEqual(history[0], old, 'the previous score record remains unchanged');
    assert.equal(history[1].scoringVersion, quality.scoringVersion);
    const methodsPath = path.join(root, 'quality-score-methods.csv');
    const methods = fs.readFileSync(methodsPath, 'utf8');
    assert.equal(methods, 'date,runId,scoringVersion\n2026-10-30,2026-10-30-1200,legacy-unversioned\n2026-11-02,2026-11-02-1200,2026-10-30-shared-geography-v1\n');
    assert.equal(fs.readFileSync(path.join(root, 'quality-scores.csv'), 'utf8').split('\n')[0].split(',').length, 23,
        'existing Power BI quality CSV columns remain stable');
    regenerateQualityCsv(root);
    assert.equal(fs.readFileSync(methodsPath, 'utf8'), methods, 'CSV regeneration preserves the same method metadata');
    writeQualityHistory(root, '2026-11-02', '2026-11-02-1200', quality);
    assert.equal(fs.readFileSync(methodsPath, 'utf8'), methods, 'retry creates no duplicate method rows');
    const ours = path.join(root, 'ours'), tree = path.join(root, 'tree');
    fs.mkdirSync(path.join(ours, 'docs'), { recursive: true }); fs.mkdirSync(path.join(tree, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(ours, 'docs/quality-score-methods.csv'), methods);
    const extra = '2026-10-29,2026-10-29-1200,legacy-unversioned\n';
    fs.writeFileSync(path.join(tree, 'docs/quality-score-methods.csv'), 'date,runId,scoringVersion\n' + extra);
    execFileSync(process.execPath, ['.github/scripts/merge-send-state.mjs', ours, tree], { stdio: 'pipe' });
    const merged = fs.readFileSync(path.join(tree, 'docs/quality-score-methods.csv'), 'utf8');
    assert.ok(merged.includes(extra) && merged.includes('2026-11-02-1200'), 'a racing commit preserves both method histories');
    console.log('PASS: score method provenance, untouched legacy scores, stable CSV schema and retry/race persistence');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
