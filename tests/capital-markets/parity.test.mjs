/**
 * Shared candidate-pool builder contract.
 *
 * The page and the server-side shadow builder must assemble the SAME pool, or a
 * replay compares two different newsletters. Before cmBuildArticlePool existed
 * the shadow read only feed.json while the page also merged raw-feed.json, so
 * the shadow reviewed ~15% fewer candidates.
 *
 * This suite pins the builder's contract on synthetic inputs. The cross-path
 * assertion — that the REAL shadow builder produces the page pool — lives in
 * src/server/capital-markets-delivery.test.ts, because only that side can
 * invoke buildCapitalMarketsPackage.
 */
import { loadCapitalMarkets, harness } from './load.mjs';

const { CM } = await loadCapitalMarkets();
const h = harness('shared pool builder');

const feedItem = (id, url) => ({ id, title: `Feed ${id}`, link: url, pubDate: '2026-09-30T00:00:00.000Z' });
const rawItem = (id, url) => ({ id, t: `Raw ${id}`, u: url, d: '2026-09-30T00:00:00.000Z', s: 'Src', ex: 'Body', c: 'relevant' });

h.section('merge order and shape');
const pool = CM.cmBuildArticlePool(
  [feedItem('f1', 'https://example.test/a'), feedItem('f2', 'https://example.test/b')],
  [rawItem('r1', 'https://example.test/c')]);
h.chk(pool.length === 3, 'feed items and unique raw candidates are merged');
h.chk(pool[0].id === 'f1' && pool[1].id === 'f2', 'feed items keep feed order and come first');
h.chk(pool[2]._fromCapitalMarketsRawPool === true, 'raw candidates are tagged');
h.chk(pool[2].title === 'Raw r1' && pool[2].link === 'https://example.test/c'
  && pool[2].description === 'Body' && pool[2].summary === 'Body',
  'raw candidates are normalised to the article shape');

h.section('deduplication');
h.chk(CM.cmBuildArticlePool([feedItem('x', 'https://example.test/a')],
  [rawItem('x', 'https://example.test/zzz')]).length === 1, 'a raw candidate matching a feed id is dropped');
h.chk(CM.cmBuildArticlePool([feedItem('x', 'https://example.test/a')],
  [rawItem('y', 'https://EXAMPLE.test/A')]).length === 1, 'URL dedup is case-insensitive');
h.chk(CM.cmBuildArticlePool([feedItem('x', 'https://example.test/a')],
  [rawItem('y', 'https://example.test/b'), rawItem('z', 'https://example.test/b')]).length === 2,
  'two raw candidates sharing a URL collapse to one');

h.section('exclusions apply to both inputs');
h.chk(CM.cmBuildArticlePool([feedItem('f1', 'https://example.test/a')], [rawItem('r1', 'https://example.test/c')],
  { excludedIds: new Set(['f1']) }).length === 1, 'an excluded feed id is removed');
h.chk(CM.cmBuildArticlePool([feedItem('f1', 'https://example.test/a')], [rawItem('r1', 'https://example.test/c')],
  { excludedIds: new Set(['r1']) }).length === 1, 'an excluded raw id is removed');
h.chk(CM.cmBuildArticlePool([feedItem('f1', 'https://example.test/a')], [rawItem('r1', 'https://example.test/c')],
  { excludedUrls: new Set(['https://EXAMPLE.test/C']) }).length === 1,
  'an excluded URL is matched case-insensitively');

h.section('determinism');
const a = CM.cmBuildArticlePool([feedItem('f1', 'https://example.test/a')], [rawItem('r1', 'https://example.test/c')]);
const b = CM.cmBuildArticlePool([feedItem('f1', 'https://example.test/a')], [rawItem('r1', 'https://example.test/c')]);
h.chk(JSON.stringify(a) === JSON.stringify(b), 'the same inputs always produce the same pool');
h.chk(CM.cmBuildArticlePool([], []).length === 0 && CM.cmBuildArticlePool(null, null).length === 0,
  'empty and missing inputs are safe');

process.exit(h.done());
