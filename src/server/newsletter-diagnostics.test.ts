import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { DiagnosticContext, writeNewsletterDiagnostics, REASON_CODES } from './newsletter-diagnostics.js';

// =============================================================================
// Setup — temporary docs dir
// =============================================================================

const tmp = path.join(process.cwd(), 'tmp-diag-test');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

// =============================================================================
// 1. DiagnosticContext basic recording
// =============================================================================

{
    const d = new DiagnosticContext({ isFriday: false });

    d.recordStage('relevant', 'loaded', 100);
    d.recordStage('relevant', 'inWindow', 25);
    d.recordStage('relevant', 'regionPass', 18);
    d.recordStage('relevant', 'industrialPass', 12);
    d.recordStage('relevant', 'sectionPass', 6);
    d.recordReject('relevant', 'NO_TARGET_REGION_EVIDENCE');
    d.recordReject('relevant', 'NO_TARGET_REGION_EVIDENCE');
    d.recordReject('relevant', 'NOT_INDUSTRIAL');
    d.recordTier('relevant', 'tier1_24h', 4);
    d.recordTier('relevant', 'tier3_30d_deep', 2);
    d.finalizeSection('relevant', 6, 4);

    const out = d.toJSON();
    assert.equal(out.sections.relevant.loaded, 100);
    assert.equal(out.sections.relevant.regionPass, 18);
    assert.equal(out.sections.relevant.sectionPass, 6);
    assert.equal(out.sections.relevant.rejectionReasons.NO_TARGET_REGION_EVIDENCE, 2);
    assert.equal(out.sections.relevant.rejectionReasons.NOT_INDUSTRIAL, 1);
    assert.equal(out.sections.relevant.tierFill.tier1_24h, 4);
    assert.equal(out.sections.relevant.tierFill.tier3_30d_deep, 2);
    assert.equal(out.sections.relevant.selected, 6);
    assert.equal(out.sections.relevant.underfilled, false);
    console.log('✓ basic recording');
}

// =============================================================================
// 2. Underfilled flag
// =============================================================================

{
    const d = new DiagnosticContext({ isFriday: false });
    d.finalizeSection('people', 1, 2);
    const out = d.toJSON();
    assert.equal(out.sections.people.selected, 1);
    assert.equal(out.sections.people.underfilled, true);
    assert.equal(out.sections.people.underfillReason, 'SECTION_UNDERFILLED_QUALITY_PROTECTED');
    console.log('✓ underfill flag');
}

// =============================================================================
// 3. Near-miss bounded capture
// =============================================================================

{
    const d = new DiagnosticContext({ isFriday: false });
    // Add 200 near-misses with random scores; should cap at 50 + take top by score
    for (let i = 0; i < 200; i++) {
        d.recordNearMiss('transactions', {
            id: `id-${i}`,
            title: `Article ${i}`,
            score: 50 + (i % 30), // scores 50-79
            floor: 60,
            reasons: ['BELOW_DEAL_THRESHOLD'],
        });
    }
    const out = d.toJSON();
    assert.equal(out.sections.transactions.nearMisses.length, 50, `near-miss count was ${out.sections.transactions.nearMisses.length}, expected 50`);
    // Top item by score should be present
    const top = out.sections.transactions.nearMisses[0];
    assert.ok(top.score >= 70, `top near-miss score ${top.score} expected >= 70`);
    console.log('✓ near-miss capping');
}

// =============================================================================
// 4. Near-miss floor delta — items too far below floor are skipped
// =============================================================================

{
    const d = new DiagnosticContext({ isFriday: false });
    // Floor=60, delta=20, so items below score=40 are skipped
    d.recordNearMiss('transactions', { id: 'high', title: 'High', score: 55, floor: 60, reasons: ['x'] });
    d.recordNearMiss('transactions', { id: 'low', title: 'Low', score: 30, floor: 60, reasons: ['x'] });
    const out = d.toJSON();
    assert.equal(out.sections.transactions.nearMisses.length, 1);
    assert.equal(out.sections.transactions.nearMisses[0].id, 'high');
    console.log('✓ near-miss floor delta');
}

// =============================================================================
// 5. Per-feed tracking
// =============================================================================

{
    const d = new DiagnosticContext({ isFriday: false });
    d.setFeedFetched('Real Estate NJ', 100);
    d.recordFeedCandidate('Real Estate NJ', 'candidate');
    d.recordFeedCandidate('Real Estate NJ', 'candidate');
    d.recordFeedCandidate('Real Estate NJ', 'gate-pass');
    d.recordFeedCandidate('Real Estate NJ', 'selected', undefined, 'transactions');
    d.recordFeedCandidate('Real Estate NJ', 'duplicate');
    d.recordFeedCandidate('Real Estate NJ', 'rejected', 'NO_TARGET_REGION_EVIDENCE');

    const out = d.toJSON();
    const feed = out.perFeedBySection['Real Estate NJ'];
    assert.ok(feed, 'feed entry should exist');
    assert.equal(feed.fetched, 100);
    assert.equal(feed.candidates, 2);
    assert.equal(feed.passedFinalGate, 1);
    assert.equal(feed.selected, 1);
    assert.equal(feed.duplicates, 1);
    assert.equal(feed.bySection.transactions, 1);
    assert.equal(feed.rejections.NO_TARGET_REGION_EVIDENCE, 1);
    console.log('✓ per-feed tracking');
}

// =============================================================================
// 6. JSON file write + retention (cap at 30 runs)
// =============================================================================

{
    fs.rmSync(path.join(tmp, 'diagnostics'), { recursive: true, force: true });
    for (let i = 0; i < 35; i++) {
        const d = new DiagnosticContext({ isFriday: false });
        const payload = d.toJSON();
        // give each run a unique runId so retention sort works
        payload.runId = `2026-05-08-${String(i).padStart(4, '0')}`;
        writeNewsletterDiagnostics(tmp, payload);
    }
    const ddir = path.join(tmp, 'diagnostics');
    const runs = fs.readdirSync(ddir).filter(f => f.startsWith('newsletter-run-'));
    assert.equal(runs.length, 30, `retention count was ${runs.length}, expected 30`);
    assert.equal(fs.existsSync(path.join(ddir, 'latest.json')), true);
    // Latest.json should have the most recent runId
    const latest = JSON.parse(fs.readFileSync(path.join(ddir, 'latest.json'), 'utf-8'));
    assert.equal(latest.runId, '2026-05-08-0034');
    console.log('✓ retention + latest.json');
}

// =============================================================================
// 7. Reason codes are complete
// =============================================================================

{
    const d = new DiagnosticContext({ isFriday: false });
    const out = d.toJSON();
    for (const code of REASON_CODES) {
        assert.equal(out.sections.relevant.rejectionReasons[code], 0, `expected reason ${code} to be present and zero`);
    }
    console.log('✓ all reason codes initialized to 0');
}

// =============================================================================
// 8. writeNewsletterDiagnostics rejects invalid payload
// =============================================================================

{
    let threw = false;
    try {
        writeNewsletterDiagnostics(tmp, { invalid: true } as any);
    } catch (e) {
        threw = true;
    }
    assert.equal(threw, true, 'should throw on invalid payload');
    console.log('✓ schema validation');
}

// =============================================================================
// Cleanup
// =============================================================================

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\nAll newsletter-diagnostics tests passed.');
