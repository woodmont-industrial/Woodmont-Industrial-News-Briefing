/**
 * Publisher attribution behind Google News proxying.
 *
 * 67% of the corpus arrives via news.google.com, where `source` is the QUERY
 * name and the URL is an opaque redirect. The publisher name is recoverable
 * from the title suffix with no network call. The URL is NOT recoverable and
 * must never be claimed: proxy URLs 302 into further Google URLs, so resolving
 * one means fetching an untrusted redirect to discover where it leads.
 */
import { loadCapitalMarkets, harness } from './load.mjs';
const { CM } = await loadCapitalMarkets();
const h = harness('publisher attribution');

h.section('publisher is taken from the LAST spaced separator');
for (const [title, want, why] of [
  ['3 Pearl Ct, Allendale, NJ 07401 - Industrial for Lease - LoopNet', 'LoopNet',
   'a listing title with several spaced hyphens'],
  ['Firm arranges $6M sale in Union City - ROI-NJ', 'ROI-NJ',
   'a publisher containing an unspaced hyphen survives'],
  ['Seller sells 31,000 sq. ft. building - Real Estate NJ', 'Real Estate NJ',
   'a multi-word publisher'],
  ['Headline with no publisher suffix', null, 'no separator yields nothing'],
  ['Warehouse trades for $21M - 2026', null, 'a trailing year is not a publisher'],
  ['Portfolio trades - 450,000 SF', null, 'a trailing size is not a publisher'],
  ['Listing posted - Industrial For Lease', null, 'a descriptive fragment is not a publisher'],
]) h.chk(CM.cmPublisherFromTitle(title) === want,
  `${why.padEnd(48)} -> ${JSON.stringify(CM.cmPublisherFromTitle(title))}`);

h.section('normalisation records attribution without claiming a URL');
const proxied = CM.cmNormalizeFeedItem({
  id: 'p1', title: 'Developer breaks ground in Newark - Real Estate NJ',
  url: 'https://news.google.com/rss/articles/CBMiOPAQUE', date_published: '2026-10-01T00:00:00Z',
  _source: { name: 'Google News NJ Industrial Developers' },
});
h.chk(proxied.viaProxy === true, 'a news.google.com item is flagged as proxied');
h.chk(proxied.originalPublisher === 'Real Estate NJ', 'the real publisher is recovered');
h.chk(proxied.source === 'Google News NJ Industrial Developers',
  'the feed/query name is preserved in source, so per-feed accounting is unchanged');
h.chk(proxied.publisherVerified === false, 'a proxied item is NEVER marked verified');
h.chk(proxied.url.includes('news.google.com'),
  'the stored URL stays the proxy — no canonical URL is invented');

const direct = CM.cmNormalizeFeedItem({
  id: 'd1', title: 'Developer breaks ground in Newark', url: 'https://re-nj.com/story',
  date_published: '2026-10-01T00:00:00Z', _source: { name: 'Real Estate NJ' },
});
h.chk(direct.viaProxy === false, 'a direct item is not flagged as proxied');
h.chk(direct.publisherVerified === true, 'a direct item is verified');
h.chk(direct.originalPublisher === 'Real Estate NJ', 'a direct item keeps its feed publisher');

process.exit(h.done());
