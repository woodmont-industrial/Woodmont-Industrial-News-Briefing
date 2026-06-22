/**
 * Backfill docs/quality-scores.json with the Newsletter Quality Score for every
 * historical send that has diagnostics on record (2026-05-11 onward), using the
 * SAME computeNewsletterScore() the live pipeline now uses.
 *
 * Fully automated from git: for each `📧 Newsletter sent` commit we read the
 * co-committed feed.json (item content), the run's diagnostics JSON (funnel /
 * tier fill), and the IDs that commit appended to sent-articles.json. No
 * hand-coded refs — discovers everything at runtime.
 *
 * Run: node --import tsx scripts/backfill-quality.ts
 */
import { execSync } from 'child_process';
import { computeNewsletterScore, writeQualityHistory } from '../src/server/newsletter-diagnostics.js';
import { extractCrossDayDedupSignatures } from '../src/shared/url-utils.js';

type Section = 'relevant' | 'transactions' | 'availabilities' | 'people';

function sh(cmd: string): string {
    return execSync(cmd, { encoding: 'utf-8', maxBuffer: 128 * 1024 * 1024 });
}
function tryJson(cmd: string): any | null {
    try { return JSON.parse(sh(cmd)); } catch { return null; }
}

// All send commits, oldest first (so cross-day signature accumulation is correct).
const sendCommits = sh(`git log --all --grep="Newsletter sent" "--pretty=%H@@%cI"`)
    .trim().split('\n').filter(Boolean)
    .map(line => { const [hash, iso] = line.split('@@'); return { hash, date: (iso || '').slice(0, 10) }; })
    .reverse();

const sigOf = (it: any) => extractCrossDayDedupSignatures(it.title || '', it.description || it.summary || '');
const recentSigs = new Set<string>();
const docsDir = 'docs';
let scored = 0, skipped = 0;

console.log('date        score grade items  cov  fresh region  penalties');
console.log('─'.repeat(70));

for (const { hash, date } of sendCommits) {
    // Find the diagnostics run file this commit added (newsletter-run-<date>-*.json).
    const files = sh(`git show --name-only --pretty=format: ${hash}`).trim().split('\n');
    const runFile = files.find(f => /docs\/diagnostics\/newsletter-run-.+\.json$/.test(f));
    if (!runFile) { skipped++; continue; } // pre-diagnostics era (before 5/11)

    const diag = tryJson(`git show ${hash}:${runFile}`);
    const feed = tryJson(`git show ${hash}:docs/feed.json`);
    if (!diag || !feed) { skipped++; continue; }

    // IDs this commit appended to sent-articles.json.
    let diffOut = '';
    try { diffOut = sh(`git show ${hash} -- docs/sent-articles.json`); } catch { /* */ }
    const ids = [...diffOut.matchAll(/^\+\s*"id":\s*"([a-f0-9]+)"/gm)].map(m => m[1]);
    if (ids.length === 0) { skipped++; continue; }

    const byId = new Map<string, any>((feed.items || []).map((i: any) => [i.id, i]));
    const selected: Record<Section, any[]> = { relevant: [], transactions: [], availabilities: [], people: [] };
    for (const id of ids) {
        const it = byId.get(id);
        if (!it) continue; // rotated out of this snapshot
        const cat = it.category as Section;
        (selected[cat] || selected.relevant).push(it);
    }

    const q = computeNewsletterScore(diag, selected, { sigOf, recentSigs });
    writeQualityHistory(docsDir, date, diag.runId || date, q);
    scored++;

    const pen = q.penalties.length ? q.penalties.map(p => `-${p.points}${p.type[0]}`).join(',') : 'clean';
    console.log(
        `${date}  ${String(q.score).padStart(3)}/100  ${q.grade}   ${String(q.itemCount).padStart(2)}   ` +
        `${String(q.breakdown.coverage).padStart(4)} ${String(q.breakdown.freshness).padStart(5)} ${String(q.breakdown.regional).padStart(5)}   ${pen}`
    );

    for (const arr of Object.values(selected)) for (const it of arr) for (const s of sigOf(it)) recentSigs.add(s);
}

console.log('─'.repeat(70));
console.log(`✅ Scored ${scored} sends, skipped ${skipped} (no diagnostics). Wrote docs/quality-scores.json`);
