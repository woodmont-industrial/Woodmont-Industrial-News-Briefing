// Writes docs/pipeline-status.json after a successful send (2026-09-01).
//
// articleCount comes from docs/newsletter-archive/latest.json — the archive
// meta this same run just wrote, whose articleCount is the EXACT number of
// articles in the sent HTML (relevant+transactions+availabilities+people,
// email.ts). It is deliberately NOT derived from sent-articles.json: that
// file's today-stamped rows are a dedup superset/subset (within-send-removed
// duplicates are persisted, previously-seen shipped ids are not re-stamped,
// and rows accumulate across same-day re-sends), which made the website badge
// wrong on any non-clean day (5 vs 7 on 2026-09-01, 6 vs 7 on 8/27, 12 vs 5
// on 8/28's force-sends).
//
// Output shape is byte-compatible with the previous inline writer: the site
// (docs/index.html) fetches this JSON and reads its fields directly.
//
// Env: PIPELINE_STATUS_DOCS_DIR (tests) defaults to 'docs';
//      GITHUB_RUN_ID / GITHUB_REPOSITORY as provided by Actions.
import * as fs from 'node:fs';
import * as path from 'node:path';

const docsDir = process.env.PIPELINE_STATUS_DOCS_DIR || 'docs';
const runId = process.env.GITHUB_RUN_ID || '';
const repo = process.env.GITHUB_REPOSITORY || '';

let articleCount = 0;
try {
    const meta = JSON.parse(fs.readFileSync(path.join(docsDir, 'newsletter-archive', 'latest.json'), 'utf-8'));
    if (Number.isFinite(meta.articleCount)) {
        articleCount = meta.articleCount;
    } else {
        console.log(`::warning::newsletter-archive/latest.json has no numeric articleCount — pipeline-status will show 0`);
    }
} catch (e) {
    console.log(`::warning::could not read newsletter-archive/latest.json (${e.message}) — pipeline-status will show 0`);
}

const status = {
    lastSent: new Date().toISOString(),
    date: new Date().toISOString().split('T')[0],
    articleCount,
    status: 'success',
    runId,
    runUrl: `https://github.com/${repo}/actions/runs/${runId}`,
};
fs.writeFileSync(path.join(docsDir, 'pipeline-status.json'), JSON.stringify(status, null, 2));
console.log(`pipeline-status updated: ${articleCount} article(s) (from archive meta)`);
