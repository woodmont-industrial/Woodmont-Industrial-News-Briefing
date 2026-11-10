import assert from 'node:assert/strict';
import { mergeSiteArchive } from './site-archive.js';

const now = new Date('2026-11-10T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 864e5).toISOString();
const item = (id: string, title: string, age: number, extra = {}) =>
    ({ id, title, url: `https://example.test/news/${id}`, date_published: daysAgo(age), category: 'relevant', ...extra });
const none = { ids: new Set<string>(), urls: new Set<string>(), titles: new Set<string>() };

// Older stories stay in the archive after they leave the 31-day feed
const archived = [item('a', 'Example Builder buys Edison warehouse', 60), item('b', 'Example Tenant leases Newark space', 95)];
const feed = [item('c', 'Example Developer breaks ground in Allentown', 2)];
let merged = mergeSiteArchive(archived, feed, now, none);
assert.deepEqual(merged.map(i => i.id), ['c', 'a'], 'keeps 90 days, newest first, and drops older items');

// The current feed's copy replaces the archived one and heavy fields are dropped
merged = mergeSiteArchive([item('a', 'Old title', 10, { category: 'relevant', content_html: '<p>x</p>' })],
    [item('a', 'Old title', 10, { category: 'transactions', content_html: '<p>x</p>', _source: { feed: 'x' } })], now, none);
assert.equal(merged[0].category, 'transactions');
assert.ok(!('content_html' in merged[0]) && !('_source' in merged[0]));

// User exclusions and non-article pages are removed from history too
merged = mergeSiteArchive([item('a', 'Example Builder buys Edison warehouse', 40), item('d', 'Example Partners', 40, { url: 'https://example.test/search-partners' })],
    [], now, { ids: new Set(['a']), urls: new Set(), titles: new Set() });
assert.deepEqual(merged.map(i => i.id), []);

// Items the build marked as excluded never show
assert.deepEqual(mergeSiteArchive([item('e', 'Example roundup', 5, { category: 'exclude' })], [], now, none), []);

// The same story under two ids keeps the newest copy
merged = mergeSiteArchive([item('x', 'Example Builder buys Edison warehouse', 40)], [item('y', 'Example Builder buys Edison warehouse', 3)], now, none);
assert.deepEqual(merged.map(i => i.id), ['y']);

console.log('PASS: site archive keeps 90 days, prefers current copies, honours exclusions and dedupes titles');
