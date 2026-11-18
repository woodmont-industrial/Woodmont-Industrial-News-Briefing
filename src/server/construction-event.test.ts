import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { constructionEventFromTitleKey as event, constructionEventsSameProject as same } from '../shared/construction-event.js';
import { loadSentConstructionEvents, normalizeTitleKey } from './newsletter-filters.js';

// Developer names are synthetic; the headline shapes, places and sizes are the ones that repeated.
const key = (title: string) => normalizeTitleKey(title);
const ev = (title: string) => {
    const e = event(key(title));
    assert.ok(e, `construction event: ${title}`);
    return e!;
};
const expectSame = (a: string, b: string, why: string) => assert.equal(same(ev(a), ev(b)), true, why);
const expectApart = (a: string, b: string, why: string) => assert.equal(same(ev(a), ev(b)), false, why);

// 2026-11-13 / 11-18: same groundbreaking, a town against a region, SF against acres.
expectSame('Example Holdings, Sample Investors break ground on first of four buildings at 3.7 million sq. ft. logistics campus in Logan Township',
    'Example Holdings, Sample Investors Real Estate Break Ground on 474-Acre Industrial Campus in Southern New Jersey - REBusinessOnline',
    'same developers and milestone, no conflicting place or size');
// A county contains the other report's town.
expectSame('Example Logistics breaks ground on 953,000 sq. ft. logistics park near Exit 8 in Monmouth County',
    'Example Logistics Investments breaks ground on massive logistics facility in Manalapan',
    'Monmouth County and Manalapan do not conflict');
// One developer word plus a shared distinctive detail.
expectSame('Example Foods opens coffee-derived ingredients manufacturing facility in Pennsylvania',
    'Example Foods opens coffee extraction manufacturing facility in Pennsylvania', 'the same plant opening');
// Approvals with agreeing acreage.
expectSame('Sample Township approves 4,466-acre data center overlay district in Northeast Pennsylvania',
    'Sample Township approves 4,500-acre data center district', 'acreage within 15%');

// No developer named: a tight size match plus a shared detail (sent 11-03, back as filler 11-18).
expectSame('Sample Township approves 4,466-acre data center overlay district in Northeast Pennsylvania',
    '4,500-Acre Data Center District Approved In Pennsylvania Town', 'same district approval without the township name');
expectApart('Sample Township approves 4,466-acre data center overlay district in Northeast Pennsylvania',
    '1,300-Acre Data Center District Approved In Pennsylvania Town', 'a different-size district is a different project');

// A later milestone of the same project still runs.
expectApart('Example Holdings breaks ground on 500,000 SF warehouse in Logan Township',
    'Example Holdings completes 500,000 SF warehouse in Logan Township', 'completion after groundbreaking');
expectApart('Example Builder breaks ground on 216,000 SF cold storage project in Bethlehem',
    'Example Builder nears completion of 216,000 SF cold storage project in Bethlehem', 'nearing completion is its own milestone');
// One developer, two projects in a month.
expectApart('Example Logistics breaks ground on 300,000 SF warehouse in Edison',
    'Example Logistics breaks ground on 200,000 SF warehouse in Carteret', 'different towns');
expectApart('Example Logistics breaks ground on 300,000 SF warehouse in Edison',
    'Example Logistics breaks ground on 120,000 SF warehouse in Edison', 'same town, conflicting size');
expectApart('Example Logistics breaks ground on warehouse in Edison',
    'Example Logistics breaks ground on 500,000 SF campus in South Jersey', 'one developer word and only a region: not enough');
expectApart('Example Holdings breaks ground on first of four buildings at logistics campus in Logan Township',
    'Example Holdings breaks ground on second building at logistics campus in Logan Township', 'a later phase');
// Different developers who share only what they build.
assert.equal(event(key('Data center planned for existing warehouse in Auburndale')), null,
    'with no developer named there is nothing to match on');
const proposal = event(key('Northfield Township gets second data center proposal as developer brings zoning challenge'));
assert.ok(!proposal || !proposal.developer.includes('data'), 'the object is not the developer');

// Deals are not construction milestones.
assert.equal(event(key('Example Brokers completes $13M sale of industrial building in Edison')), null);
assert.equal(event(key('Example Capital buys 63,000 sq. ft. Edison warehouse for $18.1 million')), null);

// Sent state: 30 days of title keys.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'construction-sent-'));
try {
    const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
    fs.writeFileSync(path.join(dir, 'sent-articles.json'), JSON.stringify({ sent: [
        { id: 'a', sentAt: day(5), titleKey: key('Example Holdings, Sample Investors break ground on first of four buildings at 3.7 million sq. ft. logistics campus in Logan Township') },
        { id: 'b', sentAt: day(40), titleKey: key('Example Foods opens coffee extraction manufacturing facility in Pennsylvania') },
        { id: 'c', sentAt: day(2), titleKey: key('Example Capital buys 63,000 sq. ft. Edison warehouse for $18.1 million') },
    ] }));
    const sent = loadSentConstructionEvents(dir);
    assert.equal(sent.length, 1, 'only construction milestones inside 30 days');
    assert.ok(same(ev('Example Holdings, Sample Investors Real Estate Break Ground on 474-Acre Industrial Campus in Southern New Jersey'), sent[0]));
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}

console.log('construction-event tests passed');
