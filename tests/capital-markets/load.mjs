/**
 * Test loader for the Capital Markets module.
 *
 * The module itself (docs/js/capital-markets.js) is plain JS and needs no DOM,
 * but it takes shared helpers that still live in docs/index.html. This loader
 * evaluates only the module-scope helper region of that file - never the React
 * components - and injects the result into the factory.
 *
 * No private data is committed here. A watchlist, when a test needs one, is
 * read at runtime from WATCHLIST_CSV and is otherwise absent.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..');
const require_ = createRequire(import.meta.url);

/** Evaluate the module-scope helper region of docs/index.html. */
function loadSharedHelpers() {
  const html = fs.readFileSync(path.join(REPO, 'docs', 'index.html'), 'utf8');
  const start = html.indexOf('    const HTML_ESCAPE_MAP');
  const end = html.indexOf('    const NewsletterPreview = (');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('shared helper region not found in docs/index.html');
  }
  const src = html.slice(start, end);
  const names = ['escapeHtml', 'escapeAttr', 'safeUrl', 'firstSentences', 'splitSentences',
    'getPublisherName', 'US_STATE_NAMES', 'REGION_TARGETS', 'REGION_CITIES', 'REGION_AREAS',
    'REGION_NON_TARGET_CITIES', 'REGION_AMBIGUOUS_CITIES', 'regionPad', 'regionHas',
    'regionScan', 'regionMaskOrigins', 'resolveRegion'];
  const fn = new Function(src + '\nreturn {' + names.join(',') + '};');
  return fn();
}

/** Geography reference data, loaded through a stubbed same-origin fetch. */
function installGeographyFetch() {
  const g = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'capital-markets-geography.json'), 'utf8'));
  const p = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'capital-markets-places.json'), 'utf8'));
  globalThis.fetch = async (f) => ({
    ok: true, status: 200,
    json: async () => (String(f).includes('geography') ? g : p),
  });
}

/** Ready-to-use Capital Markets API with geography loaded. */
export async function loadCapitalMarkets() {
  installGeographyFetch();
  const shared = loadSharedHelpers();
  const { createCapitalMarkets } = require_(path.join(REPO, 'docs', 'js', 'capital-markets.js'));
  const CM = createCapitalMarkets(shared);
  await CM.cmLoadGeography();
  return { CM, shared };
}

/** The live feed, shaped the way the preview consumes it. */
export function loadFeed() {
  const feed = JSON.parse(fs.readFileSync(path.join(REPO, 'docs', 'feed.json'), 'utf8'));
  return (feed.items || []).map((i) => ({
    id: i.id, title: i.title, link: i.url, url: i.url,
    description: i.content_text || i.summary || '', summary: i.summary || '',
    source: (i.author && i.author.name) || '', pubDate: i.date_published,
  }));
}

/**
 * The private watchlist, ONLY if the caller points at it via WATCHLIST_CSV.
 * Returns null otherwise so suites can skip watchlist-dependent checks rather
 * than fail. The file is never copied, cached or committed.
 */
export function loadWatchlist(CM) {
  const p = process.env.WATCHLIST_CSV;
  if (!p || !fs.existsSync(p)) return null;
  return CM.cmParseCSV(fs.readFileSync(p, 'utf8'));
}

/** Minimal assertion helper shared by the suites. */
export function harness(title) {
  let failed = 0;
  console.log('=== ' + title + ' ===');
  return {
    chk(ok, msg) { console.log((ok ? '  OK   ' : '  FAIL ') + msg); if (!ok) failed++; return ok; },
    note(msg) { console.log('  ---  ' + msg); },
    section(name) { console.log('\n-- ' + name); },
    done() {
      console.log(failed ? '\n' + failed + ' FAILURE(S) in ' + title : '\nOK: ' + title);
      return failed;
    },
  };
}
