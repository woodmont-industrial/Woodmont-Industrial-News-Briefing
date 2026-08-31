// Semantic merge of shared/cumulative send-state files, used by
// commit-send-state.sh on its push-retry rebuild path (2026-08-31 race-safety
// review). When origin/main gained commits AFTER this run's snapshot, a
// whole-file restore would clobber the competing commit's legitimate state
// (e.g. another workflow's independently-recorded entry). Instead, for the
// files that are unions of keyed records, merge:
//
//   docs/sent-articles.json        union of sent[] by id; ours wins on the
//                                  same id; lastSendDate = ours (this run
//                                  just sent — its stamp is today's truth)
//   docs/quality-scores.json      union of history[] by runId (ours wins);
//                                  updatedAt = ours
//   docs/quality-scores.csv        union of rows by (date,runId) cols 1-2;
//   docs/daily-logic-impact.csv    ours wins on the same key; origin row
//                                  order preserved, new rows appended
//
// Files NOT handled here (policy set in commit-send-state.sh): feed.json is
// origin-wins on the rebuild path (a racing fresh build outranks our enriched
// copy); diagnostics/, newsletter-archive/, included-articles.json are
// send-owned and ours-wins.
//
// Usage: node merge-send-state.mjs <oursDir> <treeDir>
//   oursDir: snapshot of this run's outputs;  treeDir: worktree currently at
//   origin/main. Merged results are written into treeDir.
import * as fs from 'node:fs';
import * as path from 'node:path';

const [oursDir, treeDir] = process.argv.slice(2);
if (!oursDir || !treeDir) { console.error('usage: merge-send-state.mjs <oursDir> <treeDir>'); process.exit(2); }

const readIf = (p) => { try { return fs.readFileSync(p, 'utf-8'); } catch { return null; } };
const writeTree = (rel, content) => fs.writeFileSync(path.join(treeDir, rel), content);

function mergePair(rel, mergeFn) {
    const ours = readIf(path.join(oursDir, rel));
    const theirs = readIf(path.join(treeDir, rel));
    if (ours === null) return;                       // run didn't write it — keep origin's
    if (theirs === null) { writeTree(rel, ours); return; } // origin lacks it — take ours
    try {
        writeTree(rel, mergeFn(ours, theirs));
        console.log(`merged ${rel}`);
    } catch (e) {
        // A merge failure must never lose THIS run's dedup state — fall back to
        // ours (the pre-review whole-file behavior) rather than aborting.
        console.log(`merge failed for ${rel} (${e.message}) — falling back to this run's version`);
        writeTree(rel, ours);
    }
}

// ---- sent-articles.json: union by id, ours wins, lastSendDate = ours -------
mergePair('docs/sent-articles.json', (ours, theirs) => {
    const o = JSON.parse(ours), t = JSON.parse(theirs);
    const byId = new Map();
    for (const e of t.sent || []) if (e && e.id) byId.set(e.id, e);
    for (const e of o.sent || []) if (e && e.id) byId.set(e.id, e); // ours wins
    const merged = { ...t, ...o, sent: [...byId.values()] };
    if (o.lastSendDate) merged.lastSendDate = o.lastSendDate;
    return JSON.stringify(merged, null, 2) + '\n';
});

// ---- quality-scores.json: union of history[] by runId, ours wins -----------
mergePair('docs/quality-scores.json', (ours, theirs) => {
    const o = JSON.parse(ours), t = JSON.parse(theirs);
    const key = (r) => r.runId ?? `${r.date}`;
    const byRun = new Map();
    for (const r of t.history || []) byRun.set(key(r), r);
    for (const r of o.history || []) byRun.set(key(r), r); // ours wins
    return JSON.stringify({ ...t, ...o, history: [...byRun.values()], updatedAt: o.updatedAt ?? t.updatedAt }, null, 2) + '\n';
});

// ---- cumulative CSVs: union of rows keyed by (col1,col2), ours wins --------
const mergeCsv = (ours, theirs) => {
    const parse = (s) => s.split(/\r?\n/).filter(l => l.length > 0);
    const [oursL, theirsL] = [parse(ours), parse(theirs)];
    if (oursL.length === 0) return theirs;
    const header = theirsL[0] ?? oursL[0];
    const key = (line) => line.split(',').slice(0, 2).join('|');
    const rows = new Map();
    for (const l of theirsL.slice(1)) rows.set(key(l), l);
    for (const l of oursL.slice(1)) rows.set(key(l), l); // ours wins
    return [header, ...rows.values()].join('\n') + '\n';
};
mergePair('docs/quality-scores.csv', mergeCsv);
mergePair('docs/daily-logic-impact.csv', mergeCsv);
