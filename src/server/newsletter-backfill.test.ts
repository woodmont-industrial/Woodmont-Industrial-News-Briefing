import assert from 'node:assert/strict';
import { buildWorkBriefing } from './newsletter-work.js';
import type { NormalizedItem } from '../types/index.js';
const article = (pubDate?: string): NormalizedItem => ({
    id: 'synthetic-backfill', title: 'Example industrial warehouse development',
    link: 'https://example.test/story', description: 'A published industrial property announcement.', pubDate,
});
for (const days of [1, 13, 30]) {
    const item = article(new Date(Date.now() - days * 86400000).toISOString());
    const publishedAt = item.pubDate;
    for (const section of [0, 1, 2, 3]) {
        const sections: NormalizedItem[][] = [[], [], [], []];
        sections[section] = [item];
        const html = buildWorkBriefing(sections[0], sections[1], sections[2], sections[3], 'Review');
        assert.match(html, /Example industrial warehouse development/, 'a month-old article remains renderable');
        assert.doesNotMatch(html, /Earlier development|\[published /i, 'the briefing adds no age warning');
        assert.match(html, /\[Track\]/);
        assert.equal(item.pubDate, publishedAt, 'the original publication date stays intact');
    }
}
const undated = buildWorkBriefing([article()], [], [], [], 'Review');
assert.match(undated, /Example industrial warehouse development/);
assert.doesNotMatch(undated, /Earlier development/i);
const originalDay = Date.prototype.getDay;
try {
    Date.prototype.getDay = () => 5;
    const friday = buildWorkBriefing([], [], [], [], 'Review', [article(new Date().toISOString())]);
    assert.match(friday, /<h2[^>]*>\s*Week in Review\s*<\/h2>/);
    assert.doesNotMatch(friday, /Top 5 Developments/);
} finally { Date.prototype.getDay = originalDay; }
console.log('PASS: backfilled articles retain their dates and render without age warnings');
