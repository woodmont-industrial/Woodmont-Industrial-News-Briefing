import assert from 'node:assert/strict';
import { buildWorkBriefing } from './newsletter-work.js';
import { WORK_NEWSLETTER_LIMITS } from '../shared/newsletter-limits.js';
import type { NormalizedItem } from '../types/index.js';

const names = { relevant: 'Relevant Articles', transactions: 'Transactions', availabilities: 'Availabilities', people: 'People News' };
for (const [category, limit] of Object.entries(WORK_NEWSLETTER_LIMITS)) {
    const items = Array.from({ length: limit }, (_, i) => ({
        id: 'count-' + i, title: `Synthetic industrial briefing item number ${i + 1}`,
        description: '', link: `https://example.test/item-${i}`, source: 'Example Publication',
        category, pubDate: '2026-11-02T10:00:00Z', tier: 'C',
    } as NormalizedItem));
    const sections = { relevant: [], transactions: [], availabilities: [], people: [], [category]: items };
    const html = buildWorkBriefing(sections.relevant, sections.transactions, sections.availabilities, sections.people, 'Review');
    const section = html.split(`<!-- ${names[category as keyof typeof names]} -->`)[1].split('<!--')[0];
    assert.equal((section.match(/<li\b/g) || []).length, limit, `${category}: every selected item within the existing cap renders`);
    for (const item of items) assert.ok(section.includes(item.title), `${category}: ${item.id} cannot be silently hidden`);
}
console.log('PASS: Work template renders every selected item up to each shared section cap');
