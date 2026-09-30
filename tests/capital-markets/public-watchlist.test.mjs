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
h.chk(/fetch\(['"]raw-feed\.json/.test(page) && /_fromCapitalMarketsRawPool/.test(page),
  'Capital Markets adds the raw candidate pool before applying its own rules');
h.chk(/newsletterTheme === 'capital-markets'/.test(page),
  'the raw-pool expansion is scoped to Capital Markets');

process.exit(h.done());
