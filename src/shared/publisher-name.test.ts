import assert from 'node:assert/strict';
import { getPublisherName } from './publisher-name.js';

let pass = 0;
const eq = (name: string, got: string, want: string) => { assert.equal(got, want, `${name}: got "${got}" want "${want}"`); console.log(`✓ ${name} -> ${got}`); pass++; };

// --- The 2026-08-12 defect: Google News appended the SOURCE DOMAIN in the title, and the
//     resolver fell through to the news.google.com proxy host. Unknown domains display the raw
//     normalized hostname VERBATIM — no TLD-strip / title-case invention. ---
eq('unknown trailing domain -> raw hostname (Alpha Compute)',
   getPublisherName({ title: 'Alpha Compute Signs Term Sheet for Natural Gas-Powered 200 MW Data Center in Pennsylvania - constructionreviewonline.com', _source: { name: 'news.google.com', website: 'news.google.com' }, url: 'https://news.google.com/rss/articles/ABC' } as any),
   'constructionreviewonline.com');
eq('mapped trailing domain -> friendly name (re-nj.com)',
   getPublisherName({ title: 'Big NJ warehouse trades for $40M - re-nj.com', _source: { name: 'news.google.com' }, url: 'https://news.google.com/x' } as any),
   'Real Estate NJ');
eq('hyphenated unknown domain stays raw hostname (no cosmetic transform)',
   getPublisherName({ title: 'Some deal - real-estate-weekly-news.net', _source: { name: 'news.google.com' }, url: 'https://news.google.com/x' } as any),
   'real-estate-weekly-news.net');
eq('www-prefixed unknown domain normalized (strip www)',
   getPublisherName({ title: 'A story - www.example-trade.com', _source: { name: 'news.google.com' } } as any),
   'example-trade.com');

// --- news.google.com must never surface as the label (step-4 ordering fix) ---
eq('news.google.com _source, no title publisher -> Google News',
   getPublisherName({ title: 'Some headline with no trailing publisher', _source: { name: 'news.google.com' }, url: 'https://news.google.com/rss/articles/XYZ' } as any),
   'Google News');
eq('news.google.com only in url -> Google News',
   getPublisherName({ title: 'Another headline', _source: {}, url: 'https://news.google.com/rss/articles/Q' } as any),
   'Google News');

// --- Existing behavior must be UNCHANGED ---
eq('proper-name publisher (LoopNet)', getPublisherName({ title: '10 Culnen Dr - Industrial for Lease - LoopNet' } as any), 'LoopNet');
eq('proper-name publisher (The Business Journals)', getPublisherName({ title: 'Tampa portfolio sells - The Business Journals' } as any), 'The Business Journals');
eq('TV call sign kept', getPublisherName({ title: 'Warehouse fire in Newark - WSVN' } as any), 'WSVN');
eq('Google News feed-name prefix still stripped',
   getPublisherName({ title: 'Deal with no dash publisher', _source: { name: 'Google News RE NJ' } } as any),
   'RE NJ');

// --- Must NOT misfire ---
eq('non-domain lowercase last segment falls through (not treated as publisher)',
   getPublisherName({ title: 'Report shows demand - and more to come', _source: { name: 'CoStar' } } as any),
   'CoStar');
eq('no dash, real source name', getPublisherName({ title: 'A plain headline', _source: { name: 'ROI-NJ' } } as any), 'ROI-NJ');

console.log(`\n${pass} checks passed`);
