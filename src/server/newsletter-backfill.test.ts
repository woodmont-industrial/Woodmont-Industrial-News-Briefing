import assert from 'node:assert/strict';
import { earlierDevelopmentLabel, buildWorkBriefing } from './newsletter-work.js';
import type { NormalizedItem } from '../types/index.js';
const now = new Date('2026-10-12T12:00:00Z');
const article = (pubDate?: string): NormalizedItem => ({
    id: 'synthetic-backfill', title: 'Example industrial warehouse development',
    link: 'https://example.test/story', description: 'A published industrial property announcement.', pubDate,
});
assert.equal(earlierDevelopmentLabel(article('2026-10-11T12:00:00Z'), now), null);
assert.equal(earlierDevelopmentLabel(article('2026-10-09T12:00:00Z'), now), null);
assert.equal(earlierDevelopmentLabel(article('2026-10-13T12:00:00Z'), now), null);
assert.equal(earlierDevelopmentLabel(article('invalid'), now), null);
assert.equal(earlierDevelopmentLabel(article(), now), null);
assert.match(earlierDevelopmentLabel(article('2026-09-30T12:00:00Z'), now)!, /Earlier development.*Sep 30/);
const old = article(new Date(Date.now() - 13 * 86400000).toISOString());
const html = buildWorkBriefing([old], [], [], [], 'October 12, 2026');
assert.match(html, /Earlier development · published/);
assert.match(html, /Example industrial warehouse development/);
assert.match(html, /\[Track\]/);
console.log('PASS: 9 backfill publication-label assertions');
