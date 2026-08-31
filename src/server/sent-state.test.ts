import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { saveSentArticles, loadSentArticles, loadSentSignatures, loadSentTitleKeys } from './newsletter-filters.js';

// Invariant under test (2026-08-31 audit finding 3): EVERY successful send stamps
// sent-articles.json with lastSendDate = today — including a send composed entirely
// of previously-seen article ids, which appends no new per-entry `sentAt` rows.
// Without the stamp, the workflow dedup guard ("sent today?") has nothing to trip
// on for an all-backfill edition, and every later trigger re-sends the same day.

let pass = 0;
const check = (name: string, cond: boolean) => { assert.ok(cond, name); console.log(`✓ ${name}`); pass++; };

const today = new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
};
const mkTmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sent-state-'));
const readState = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, 'sent-articles.json'), 'utf-8'));

// ---- 1. Fresh send with new ids: entries appended AND lastSendDate stamped ----
{
    const tmp = mkTmp();
    saveSentArticles(tmp, [{ id: 'a1', sigs: ['sig-a'], titleKey: 'k'.repeat(30) }]);
    const state = readState(tmp);
    check('new-id send appends the entry', state.sent.length === 1 && state.sent[0].id === 'a1');
    check('new-id send stamps lastSendDate = today', state.lastSendDate === today);
}

// ---- 2. REGRESSION (finding 3): all-previously-seen send still stamps today ----
{
    const tmp = mkTmp();
    // Seed: both articles were sent 20 days ago — outside the 14-day resend block,
    // inside the 30-day retention. Exactly the reserve/backfill resurface window.
    fs.writeFileSync(path.join(tmp, 'sent-articles.json'), JSON.stringify({
        sent: [{ id: 'old1', sentAt: daysAgo(20) }, { id: 'old2', sentAt: daysAgo(20) }],
    }, null, 2));
    saveSentArticles(tmp, [{ id: 'old1' }, { id: 'old2' }]);
    const state = readState(tmp);
    check('all-old-id send appends no duplicate entries', state.sent.length === 2);
    check('all-old-id send has ZERO entries with sentAt === today (the old guard is blind here)',
        !state.sent.some((e: any) => e.sentAt === today));
    check('all-old-id send STILL stamps lastSendDate = today (guard can now see it)',
        state.lastSendDate === today);
}

// ---- 3. Legacy file without lastSendDate parses and gains the stamp ----
{
    const tmp = mkTmp();
    fs.writeFileSync(path.join(tmp, 'sent-articles.json'), JSON.stringify({
        sent: [{ id: 'x', sentAt: daysAgo(3), sigs: ['s1'], titleKey: 't'.repeat(30) }],
    }, null, 2));
    saveSentArticles(tmp, [{ id: 'y' }]);
    const state = readState(tmp);
    check('legacy file (no lastSendDate) upgrades in place', state.lastSendDate === today && state.sent.length === 2);
}

// ---- 4. Readers are unaffected by the extra top-level field ----
{
    const tmp = mkTmp();
    fs.writeFileSync(path.join(tmp, 'sent-articles.json'), JSON.stringify({
        sent: [{ id: 'r1', sentAt: daysAgo(2), sigs: ['sig-r'], titleKey: 'r'.repeat(30) }],
        lastSendDate: today,
    }, null, 2));
    check('loadSentArticles ignores lastSendDate', loadSentArticles(tmp).has('r1'));
    check('loadSentSignatures ignores lastSendDate', loadSentSignatures(tmp).has('sig-r'));
    check('loadSentTitleKeys ignores lastSendDate', loadSentTitleKeys(tmp).has('r'.repeat(30)));
}

// ---- 5. 30-day pruning still works and does not disturb the stamp ----
{
    const tmp = mkTmp();
    fs.writeFileSync(path.join(tmp, 'sent-articles.json'), JSON.stringify({
        sent: [{ id: 'ancient', sentAt: daysAgo(45) }, { id: 'recent', sentAt: daysAgo(5) }],
    }, null, 2));
    saveSentArticles(tmp, [{ id: 'new1' }]);
    const state = readState(tmp);
    check('45-day-old entry pruned, recent kept, new appended',
        state.sent.length === 2 && !state.sent.some((e: any) => e.id === 'ancient'));
    check('pruning path also stamps lastSendDate', state.lastSendDate === today);
}

console.log(`\n${pass} checks passed`);
