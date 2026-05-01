import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { writeNewsletterDiagnostics, emptySectionDiag } from './newsletter-diagnostics.js';
import { buildWorkBriefing } from './newsletter-work.js';

const tmp = path.join(process.cwd(), 'tmp-diag-test');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

for (let i=0;i<35;i++) {
  writeNewsletterDiagnostics(tmp, { generatedAt: new Date().toISOString(), runId: `2026-05-01-${String(i).padStart(4,'0')}`, isFriday:false, sections:{ relevant: emptySectionDiag(), transactions: emptySectionDiag(), availabilities: emptySectionDiag(), people: emptySectionDiag()}, perFeedBySection:{}, weekInReview:{totalCandidates:0,afterAgeFilter:0,afterDedup:0,selected:0,windowDays:7} });
}
const ddir = path.join(tmp, 'diagnostics');
const runs = fs.readdirSync(ddir).filter(f => f.startsWith('newsletter-run-'));
assert.equal(runs.length, 30);
assert.equal(fs.existsSync(path.join(ddir,'latest.json')), true);

const html = buildWorkBriefing([], [], [], [], 'Today');
assert.equal(html.includes('No updated information provided for this section.'), true);

console.log('newsletter diagnostics tests passed');
