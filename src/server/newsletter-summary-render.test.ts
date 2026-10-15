import assert from 'node:assert/strict';
import { buildWorkBriefing } from './newsletter-work.js';
import type { NormalizedItem } from '../types/index.js';

const title = 'Example Developer completes a 120,000 SF industrial warehouse in Edison, New Jersey';
const description = 'The developer completed a 120,000 SF industrial warehouse in Edison, New Jersey.';
const article = (overrides: Partial<NormalizedItem> = {}): NormalizedItem => ({
    id: 'summary-fixture', title, description, category: 'relevant',
    source: 'Example Wire', link: 'https://example.com/release',
    pubDate: new Date().toISOString(), ...overrides,
} as NormalizedItem);
const render = (item: NormalizedItem) => buildWorkBriefing([item], [], [], [], 'Review');

assert.ok(render(article()).includes(description), 'a factual summary survives high vocabulary overlap with its headline');
assert.ok(!render(article({ description: title + ' Example Wire' })).includes(' — <span'),
    'a feed description containing only the headline and publisher stays hidden');
assert.ok(!render(article({ description: title })).includes(' — <span'), 'an exact repeated headline stays hidden');
const html = render(article({ description: 'Published property detail & supporting context. '.repeat(20) }));
assert.equal((html.match(/<span\b/g) || []).length, (html.match(/<\/span>/g) || []).length,
    'long summaries keep balanced HTML spans');
assert.ok(render(article({ description: 'The property announcement includes <script>alert(1)</script> text & details.' }))
    .includes('&lt;script&gt;'), 'summary text remains escaped');
console.log('PASS: rendered summaries, repeated headlines, escaping and long-summary markup');
