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

/** Ready-to-use Capital Markets API with geography loaded. */
export async function loadCapitalMarkets() {
  const { loadCapitalMarketsRuntime } = require_(path.join(REPO, 'src', 'server', 'capital-markets-runtime.cjs'));
  return loadCapitalMarketsRuntime({ repoRoot: REPO, docsDir: path.join(REPO, 'docs') });
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
