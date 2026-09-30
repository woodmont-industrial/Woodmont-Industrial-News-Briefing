/** Repo-backed Capital Markets watchlist and browser auto-load contract. */
import * as fs from 'fs';
import * as path from 'path';
import { loadCapitalMarkets, harness, REPO } from './load.mjs';

const h = harness('public watchlist');
const jsonPath = path.join(REPO, 'docs', 'data', 'capital-markets-watchlist.json');
const workbookPath = path.join(REPO, 'data', 'capital-markets', 'institutional-ownership-nnj.xlsx');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const companies = data.companies || [];

h.section('private source, minimal browser asset');
// The workbook carries more columns than the matcher needs, so it stays out of
// the tree; only the projection below is published.
h.chk(!fs.existsSync(workbookPath), 'source workbook is not committed');
h.chk(data.visibility === 'public-repository', 'visibility is explicit');
h.chk(data.sourceWorkbook === 'private (not committed)', 'JSON does not leak a workbook path');
h.chk(!Object.hasOwn(data, 'sourceSha256'), 'JSON does not fingerprint the private workbook');
h.chk(data.rowCount === companies.length && companies.length >= 500,
  `published row count is complete (${companies.length})`);

h.section('minimal browser projection');
const required = ['Company Name', 'Secondary Type', 'City', 'State / Country',
  'Website', 'Website Domain'];
h.chk(companies.every(row => required.every(key => Object.hasOwn(row, key))),
  'every company has all matcher fields');
h.chk(companies.every(row => Object.keys(row).every(key => required.includes(key))),
  'no field beyond the matcher projection is published');
h.chk(companies.every(row => !Object.keys(row).some(key => /phone|address|zip/i.test(key))),
  'phone, street-address and ZIP columns are not published to the browser');
// Ownership metric columns must not reappear: the matcher reads none of them.
const METRICS = /portfolio|in search|%\s*leased|leased|avail|acre|properties owned|search sf|rank/i;
h.chk(companies.every(row => !Object.keys(row).some(key => METRICS.test(key))),
  'ownership metric columns are not published to the browser');
h.chk(companies.every(row => !row['Website Domain'] || /^[a-z0-9.-]+$/.test(row['Website Domain'])),
  'published domains are normalized hostnames');

h.section('matcher accepts the repo-backed list');
const { CM } = await loadCapitalMarkets();
const result = CM.cmCompetitorWatch([], companies);
h.chk(result.diag.companiesLoaded === companies.length, 'all published companies load');
h.chk(result.diag.withDomains >= 350, `website evidence is available (${result.diag.withDomains} domains)`);
h.chk(result.diag.rejectedGenericName <= 2,
  `at most two rows lack safe matching evidence (${result.diag.rejectedGenericName})`);

h.section('website loads it automatically');
const page = fs.readFileSync(path.join(REPO, 'docs', 'index.html'), 'utf8');
h.chk(/fetch\(['"]data\/capital-markets-watchlist\.json/.test(page),
  'Capital Markets preview fetches the repo-backed list');
h.chk(/Repo watchlist/.test(page), 'the UI identifies the automatic source');
h.chk(/fetch\(['"]raw-feed\.json/.test(page) && /cmBuildArticlePool\(/.test(page),
  'Capital Markets adds the raw candidate pool before applying its own rules');
// The merge itself lives in the shared builder so the server-side shadow path
// assembles an identical pool. Keeping a second copy in the page is what let
// the two drift apart before.
const cmModule = fs.readFileSync(path.join(REPO, 'docs', 'js', 'capital-markets.js'), 'utf8');
h.chk(/_fromCapitalMarketsRawPool/.test(cmModule) && /const cmBuildArticlePool/.test(cmModule),
  'the raw-pool merge lives in the shared builder, not in the page');
// The page's own display mapping truncates the description to 200 characters
// and drops `summary`; cmText() reads both, so classifying on it made the page
// judge different text from the shadow builder. Capital Markets must normalise
// through the shared function. Browser code cannot be imported here, so this is
// asserted at the source level; output parity itself is covered by the
// end-to-end assertions in src/server/capital-markets-delivery.test.ts.
h.chk(/const cmNormalizeFeedItem\b/.test(cmModule) && /const cmNormalizeFeedItems\b/.test(cmModule),
  'the shared JSON Feed normaliser exists in the shared module');
h.chk(/cmNormalizeFeedItems\(\s*feedData\.items/.test(page),
  'the Capital Markets branch normalises feed.json with the shared normaliser');
h.chk(/fetch\(['"]feed\.json['"]/.test(page),
  'the Capital Markets branch re-reads feed.json rather than the truncated display items');
h.chk(/newsletterTheme === 'capital-markets'/.test(page),
  'the raw-pool expansion is scoped to Capital Markets');

process.exit(h.done());
