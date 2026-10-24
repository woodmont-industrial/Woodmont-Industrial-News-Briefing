import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateJSONFeed } from '../build/feed-generators.js';
import type { NormalizedItem } from '../types/index.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'relevant-pipeline-test-'));
const instant = Date.parse('2026-10-22T12:00:20Z');
const article = (id: string, title: string, extra: Record<string, unknown> = {}): NormalizedItem => ({
    id, title, description: title + '. A published industrial real estate announcement.',
    link: `https://rebusinessonline.com/synthetic-${id}`, source: 'Example Publication',
    pubDate: new Date(instant - 3600000).toISOString(), category: 'relevant',
    _woodmontApprove: false, ...extra,
} as NormalizedItem);
try {
    fs.mkdirSync(path.join(scratch, 'preferences'));
    const items = [
        article('rejected-initial', 'Industrial warehouse investment trends in New Jersey'),
        article('rejected-shallow', 'Industrial logistics absorption report in Pennsylvania', { pubDate: new Date(instant - 60 * 3600000).toISOString() }),
        article('rejected-deep', 'Florida warehouse vacancy market analysis', { pubDate: new Date(instant - 10 * 86400000).toISOString() }),
        article('rejected-router', 'Example Buyer acquires a warehouse in Edison NJ for $4M', { category: 'transactions' }),
        article('rejected-current-reserve', 'New Jersey industrial supply chain market report'),
        article('people-control', 'Jane Doe joins Example Brokerage in New Jersey as vice president of industrial acquisitions', { category: 'people' }),
        article('availability-control', '120,000 SF industrial warehouse available for lease in Edison NJ', { category: 'availabilities' }),
        article('good-macro', 'New Jersey industrial warehouse demand outlook', { _woodmontApprove: true }),
    ];
    fs.writeFileSync(path.join(scratch, 'feed.json'), JSON.stringify(generateJSONFeed(items)));
    const manual = article('rejected-manual', 'Industrial warehouse capital markets research in Pennsylvania');
    fs.writeFileSync(path.join(scratch, 'included-articles.json'), JSON.stringify({ articles:
        [{ ...manual, url: manual.link, date_published: manual.pubDate }] }));
    const reserve = [
        article('rejected-reserve', 'Industrial warehouse construction outlook in Florida'),
        { ...items.find(a => a.id === 'rejected-current-reserve'), _woodmontApprove: undefined },
    ].map((a: any) => ({ ...a, url: a.link, date_published: a.pubDate }));
    fs.writeFileSync(path.join(scratch, 'preferences/reserve-pool.json'), JSON.stringify({ generatedAt: '2026-10-22T06:00:00Z', sections: { relevant: reserve } }));
    const output = path.join(scratch, 'result.json');
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/replay-editorial-email.ts', scratch, output], {
        cwd: process.cwd(), env: { PATH: process.env.PATH, TZ: 'America/New_York' }, stdio: 'pipe',
    });
    const result = JSON.parse(fs.readFileSync(output, 'utf8'));
    const selected = Object.values(result.sections).flat();
    for (const item of [...items, ...reserve, manual]) {
        if (!item.id.startsWith('rejected-')) continue;
        assert.ok(!selected.includes(item.id), `${item.id}: explicit rejection must not reach the email`);
        assert.ok(!(result.stages[item.id] || []).some((stage: string) => ['backfill', 'dealRouting', 'reserveAndThinPad'].includes(stage)),
            `${item.id}: the item must be blocked before it consumes a fallback slot`);
    }
    assert.ok(result.sections.people.includes('people-control'), 'the advisory People item still ships');
    assert.ok(result.sections.availabilities.includes('availability-control'), 'the advisory Availability item still ships');
    assert.ok(result.sections.relevant.includes('good-macro'), 'approved market context still ships');
    assert.equal(result.networkRequests, 0);
    const weeklyRejected = article('rejected-weekly', 'Florida industrial warehouse investment forecast');
    const weeklyApproved = article('weekly-control', 'Pennsylvania industrial capital markets research', { _woodmontApprove: true });
    fs.writeFileSync(path.join(scratch, 'weekly-top-articles.json'), JSON.stringify({ week: { '2026-10-22': [
        weeklyRejected, weeklyApproved, { ...items.find(a => a.id === 'rejected-current-reserve'), _woodmontApprove: undefined },
    ] } }));
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/replay-editorial-email.ts', scratch, output, '2026-10-23T12:00:20Z'], {
        cwd: process.cwd(), env: { PATH: process.env.PATH, TZ: 'America/New_York' }, stdio: 'pipe',
    });
    const friday = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.ok(!friday.weekInReviewIds.includes('rejected-weekly'), 'weekly output respects its own stored verdict');
    assert.ok(!friday.weekInReviewIds.includes('rejected-current-reserve'), 'weekly output cannot hide the current feed verdict');
    assert.ok(friday.weekInReviewIds.includes('weekly-control'), 'approved weekly context still renders');
    fs.unlinkSync(path.join(scratch, 'weekly-top-articles.json'));
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/replay-editorial-email.ts', scratch, output, '2026-10-23T12:00:20Z'], {
        cwd: process.cwd(), env: { PATH: process.env.PATH, TZ: 'America/New_York' }, stdio: 'pipe',
    });
    const fallback = JSON.parse(fs.readFileSync(output, 'utf8'));
    const rejectedRelevant = new Set(items.filter((item: any) => item.category === 'relevant' && item._woodmontApprove === false).map(item => item.id));
    assert.ok(!fallback.weekInReviewIds.some((id: string) => rejectedRelevant.has(id)), 'weekly feed fallback uses the same Relevant verdict');
    console.log('PASS: real offline daily and Friday pipelines enforce Relevant verdicts and render advisory People and Availability');
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}
