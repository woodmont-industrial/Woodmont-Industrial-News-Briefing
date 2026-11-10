import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ARCHIVE_FIELDS, hasEnrichment, mergeSiteArchive, toArchiveItem, validateArchiveItem, writeArchiveFile, writeSiteArchive } from './site-archive.js';

const DAY = 864e5;
const now = new Date('2026-11-10T12:00:00Z');
const daysAgo = (d: number, from = now) => new Date(from.getTime() - d * DAY).toISOString();
const item = (id: string, title: string, age: number, extra = {}) =>
    ({ id, title, url: `https://example.test/news/${id}`, date_published: daysAgo(age), category: 'relevant', ...extra });
const none = { ids: new Set<string>(), urls: new Set<string>(), titles: new Set<string>() };

// Only approved public metadata survives: pipeline flags, AI reasoning and any enrichment are dropped
const enriched = toArchiveItem(item('a', 'Example Builder buys Edison warehouse', 3, {
    content_html: '<p>x</p>', _source: { feed: 'x' }, _predictedPublish: true, _woodmontReason: 'model reasoning',
    _woodmontApprove: true, _tier: 'A', owner: 'Example Holdings', capitalMarkets: { watchlist: true },
    author: { name: 'Example Wire', email: 'desk@example.test' }, tags: ['Relevant', 7],
}))!;
assert.deepEqual(Object.keys(enriched).filter(k => !(ARCHIVE_FIELDS as readonly string[]).includes(k)), []);
assert.deepEqual(enriched.author, { name: 'Example Wire' });
assert.deepEqual(enriched.tags, ['Relevant']);
assert.doesNotThrow(() => validateArchiveItem(enriched));
assert.throws(() => validateArchiveItem({ ...enriched, _woodmontReason: 'x' }), /unapproved fields: _woodmontReason/);
assert.throws(() => validateArchiveItem({ ...enriched, author: { name: 'x', email: 'y' } }), /author shape/);

// Items without a real article link, date or site section never enter
assert.equal(toArchiveItem(item('b', 'No link', 1, { url: 'javascript:alert(1)' })), null);
assert.equal(toArchiveItem(item('c', 'No date', 1, { date_published: 'not a date' })), null);
assert.equal(toArchiveItem(item('d', 'Excluded roundup', 1, { category: 'exclude' })), null);

// Growth: replay daily builds where the feed only ever holds the last 31 days.
// The archive must reach past 31 days and stop at 90.
const start = new Date('2026-11-10T12:00:00Z');
let archive: any[] = [];
const oldestAge = (at: Date) => (at.getTime() - Math.min(...archive.map(i => Date.parse(i.date_published)))) / DAY;
for (let day = 0; day <= 120; day++) {
    const at = new Date(start.getTime() + day * DAY);
    // One new story a day; the feed is the stories from the last 31 days
    const feed = Array.from({ length: Math.min(day + 1, 32) }, (_, back) =>
        item(`story-${day - back}`, `Example story number ${day - back}`, 0, { date_published: daysAgo(back, at) }));
    archive = mergeSiteArchive(archive, feed, at, none);
    if (day === 30) assert.ok(oldestAge(at) <= 31, 'day 30: history still matches the feed');
    if (day === 60) assert.ok(oldestAge(at) >= 59, `day 60: archive reaches past the 31-day feed (${oldestAge(at)} days)`);
    if (day === 120) {
        assert.ok(oldestAge(at) <= 90, 'day 120: nothing older than 90 days');
        assert.ok(oldestAge(at) >= 89, 'day 120: a full 90 days kept');
    }
}

// The current feed's copy replaces the archived one (latest section)
let merged = mergeSiteArchive([item('a', 'Old title', 10)], [item('a', 'Old title', 10, { category: 'transactions' })], now, none);
assert.equal(merged[0].category, 'transactions');

// User exclusions and non-article pages are removed from history too
merged = mergeSiteArchive([item('a', 'Example Builder buys Edison warehouse', 40), item('d', 'Example Partners', 40, { url: 'https://example.test/search-partners' })],
    [], now, { ids: new Set(['a']), urls: new Set(), titles: new Set() });
assert.deepEqual(merged.map(i => i.id), []);

// The same story under two ids keeps the newest copy
merged = mergeSiteArchive([item('x', 'Example Builder buys Edison warehouse', 40)], [item('y', 'Example Builder buys Edison warehouse', 3)], now, none);
assert.deepEqual(merged.map(i => i.id), ['y']);

// An item carrying Capital Markets enrichment is refused whole, not stripped, because the
// enrichment is appended to its text fields
const cmEnriched = item('cm', 'Example Builder buys Edison warehouse', 2, {
    content_text: 'Public story text. Owner: Example Holdings (watchlist)', _cmEnrichment: { source: 'public-page-metadata' },
});
assert.equal(hasEnrichment(cmEnriched), true);
assert.equal(toArchiveItem(cmEnriched), null);
assert.deepEqual(mergeSiteArchive([cmEnriched], [], now, none), []);

// A failed write publishes nothing: the previous archive stays byte-for-byte
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-archive-'));
const file = path.join(dir, 'archive.json');
writeArchiveFile(file, [toArchiveItem(item('ok', 'Example story', 1))!], now);
const before = fs.readFileSync(file, 'utf8');
assert.throws(() => writeArchiveFile(file, [{ ...toArchiveItem(item('bad', 'Example story two', 1))!, _woodmontReason: 'x' }], now), /left unchanged/);
assert.equal(fs.readFileSync(file, 'utf8'), before, 'invalid records never reach the file');
assert.ok(!fs.existsSync(file + '.tmp'), 'no partial file is left behind');
// An unreadable archive is an error, not an empty archive (which would silently drop history)
fs.writeFileSync(file, '{"items": "not a list"}');
assert.throws(() => writeSiteArchive(dir, [item('n', 'Example story three', 1)], now), /left unchanged/);
assert.equal(fs.readFileSync(file, 'utf8'), '{"items": "not a list"}');
fs.rmSync(dir, { recursive: true, force: true });

// Whatever archive is committed must already meet the same rules
const published = path.join(process.cwd(), 'docs/archive.json');
if (fs.existsSync(published)) {
    const items = JSON.parse(fs.readFileSync(published, 'utf8')).items;
    assert.ok(Array.isArray(items), 'docs/archive.json has an items array');
    items.forEach((record: any) => {
        validateArchiveItem(record);
        assert.equal(hasEnrichment(record), false);
    });
}

console.log('PASS: site archive keeps public metadata only, refuses enriched items, never publishes a failed write, grows past 31 days to 90');
