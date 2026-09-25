#!/usr/bin/env node

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CM_PRIVACY_BASE || 'origin/main';
const MAX_WATCHLIST_BYTES = 2_000_000;
// The stakeholder explicitly approved these two files for publication. The
// validator now ensures watchlist terms do not spread into code, comments,
// logs or commit messages outside the source workbook and browser projection.
const AUTHORIZED_PUBLIC_FILES = new Set([
  'data/capital-markets/institutional-ownership-nnj.xlsx',
  'docs/data/capital-markets-watchlist.json',
]);

function fail(message) {
  process.stderr.write(`Capital Markets privacy validation failed: ${message}\n`);
  process.exit(1);
}

function git(args, optional = false) {
  try {
    return execFileSync('git', args, {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 20_000_000,
      stdio: ['ignore', 'pipe', optional ? 'ignore' : 'pipe'],
    });
  } catch (error) {
    if (optional) return '';
    throw error;
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (quoted) fail('watchlist contains an unterminated quoted field');
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) fail('watchlist has no header row');
  const header = rows.shift().map((value, index) =>
    index ? value.trim() : value.trim().replace(/^\uFEFF/, '')
  );
  if (!header.includes('Company Name')) fail('watchlist is missing the Company Name column');
  return rows.filter(values => values.some(value => value.trim())).map(values =>
    Object.fromEntries(header.map((name, index) => [name, (values[index] || '').trim()]))
  );
}

const suffixes = new Set([
  'inc', 'incorporated', 'llc', 'lp', 'llp', 'ltd', 'limited', 'corp',
  'corporation', 'company', 'co', 'plc', 'reit',
]);
// Encoded individually so adjacent generic dictionary entries cannot
// accidentally spell a private company name in this validator's own source.
const genericNames = new Set([
  'Y2FwaXRhbA==', 'Y29tbWVyY2lhbA==', 'ZGV2ZWxvcG1lbnQ=', 'aW5kdXN0cmlhbA==',
  'aW52ZXN0bWVudA==', 'aW52ZXN0bWVudHM=', 'bWFuYWdlbWVudA==', 'cHJvcGVydGllcw==',
  'cHJvcGVydHk=', 'cmVhbHR5', 'Z3JvdXA=', 'cGFydG5lcnM=', 'aG9sZGluZ3M=',
  'dmVudHVyZXM=', 'YWR2aXNvcnM=', 'YXNzb2NpYXRlcw==', 'ZW50ZXJwcmlzZXM=',
  'dHJ1c3Q=', 'cmVhbCBlc3RhdGU=',
].map(value => Buffer.from(value, 'base64').toString('utf8')));

function normalize(value) {
  return String(value || '').toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter(token => token && !suffixes.has(token)).join(' ');
}

function occurrenceCount(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = haystack.indexOf(needle, cursor)) >= 0) {
    count++;
    cursor += needle.length;
  }
  return count;
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const inputPath = path.resolve(process.argv[2] || process.env.WATCHLIST_CSV
  || path.join(REPO, 'docs/data/capital-markets-watchlist.json'));
let stat;
try { stat = fs.statSync(inputPath); }
catch { fail('watchlist could not be read'); }
if (!stat.isFile() || stat.size > MAX_WATCHLIST_BYTES) fail('watchlist is not a file or exceeds 2 MB');

const inputText = fs.readFileSync(inputPath, 'utf8');
let rows;
if (inputPath.toLowerCase().endsWith('.json')) {
  let parsed;
  try { parsed = JSON.parse(inputText); }
  catch { fail('watchlist JSON is invalid'); }
  rows = Array.isArray(parsed) ? parsed : parsed.companies;
  if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || typeof row !== 'object')) {
    fail('watchlist JSON has no company rows');
  }
} else {
  rows = parseCsv(inputText);
}
const names = [...new Set(rows.map(row => row['Company Name']).filter(Boolean))];
const distinctiveNames = [...new Set(names.map(normalize).filter(value =>
  value.length >= 7 && !genericNames.has(value)
))];
const acronyms = [...new Set(names.map(value => value.replace(/\b(?:REIT|LLC|LP|INC)\.?$/i, '').trim())
  .filter(value => /^[A-Z0-9&]{3,10}$/.test(value)))];
const domains = [...new Set(rows.flatMap(row => {
  const text = `${row['Website Domain'] || ''} ${row.Website || ''}`.toLowerCase();
  return [...text.matchAll(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/g)]
    .map(match => match[1]);
}).filter(Boolean))];

const changedFiles = git(['diff', '--name-only', '--diff-filter=ACMRT', `${BASE}...HEAD`])
  .split(/\r?\n/).filter(Boolean);
const findings = [];

for (const file of changedFiles) {
  if (AUTHORIZED_PUBLIC_FILES.has(file)) continue;
  const currentPath = path.join(REPO, file);
  if (!fs.existsSync(currentPath) || fs.statSync(currentPath).size > 3_000_000) continue;
  const current = fs.readFileSync(currentPath, 'utf8');
  const prior = git(['show', `${BASE}:${file}`], true);
  const currentNormalized = normalize(current);
  const priorNormalized = normalize(prior);
  const currentLower = current.toLowerCase();
  const priorLower = prior.toLowerCase();

  distinctiveNames.forEach((term, index) => {
    if (occurrenceCount(currentNormalized, term) > occurrenceCount(priorNormalized, term)) {
      findings.push({ surface: 'tree', file, kind: 'normalized-name', termIndex: index });
    }
  });
  acronyms.forEach((term, index) => {
    const pattern = new RegExp(`(^|[^A-Z0-9])${escaped(term)}([^A-Z0-9]|$)`, 'g');
    if ([...current.matchAll(pattern)].length > [...prior.matchAll(pattern)].length) {
      findings.push({ surface: 'tree', file, kind: 'acronym', termIndex: index });
    }
  });
  domains.forEach((term, index) => {
    if (occurrenceCount(currentLower, term) > occurrenceCount(priorLower, term)) {
      findings.push({ surface: 'tree', file, kind: 'domain', termIndex: index });
    }
  });
}

const messages = git(['log', '--format=%B', `${BASE}..HEAD`]);
const patchAdditions = changedFiles.filter(file => !AUTHORIZED_PUBLIC_FILES.has(file))
  .map(file => git(['log', '--format=', '-p', '--no-ext-diff', `${BASE}..HEAD`, '--', file], true))
  .flatMap(patch => patch.split(/\r?\n/))
  .filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
const additions = `${messages}\n${patchAdditions}`;
const normalizedAdditions = normalize(additions);
const lowerAdditions = additions.toLowerCase();

distinctiveNames.forEach((term, index) => {
  if (normalizedAdditions.includes(term)) {
    findings.push({ surface: 'history', kind: 'normalized-name', termIndex: index });
  }
});
acronyms.forEach((term, index) => {
  if (new RegExp(`(^|[^A-Z0-9])${escaped(term)}([^A-Z0-9]|$)`).test(additions)) {
    findings.push({ surface: 'history', kind: 'acronym', termIndex: index });
  }
});
domains.forEach((term, index) => {
  if (lowerAdditions.includes(term)) findings.push({ surface: 'history', kind: 'domain', termIndex: index });
});

const result = {
  base: BASE,
  changedFiles: changedFiles.length,
  authorizedPublicFiles: [...AUTHORIZED_PUBLIC_FILES],
  checked: {
    distinctiveNames: distinctiveNames.length,
    acronyms: acronyms.length,
    domains: domains.length,
  },
  clean: findings.length === 0,
  findingCount: findings.length,
  // Private terms are deliberately never printed. The stable index lets a
  // local operator investigate without leaking the value to CI output.
  findings,
};
console.log(JSON.stringify(result));
process.exit(findings.length ? 1 : 0);
