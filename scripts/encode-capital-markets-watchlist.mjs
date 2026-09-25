#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { TextDecoder } from 'util';
import { gzipSync } from 'zlib';

const MAX_WATCHLIST_BYTES = 2_000_000;
const MAX_WATCHLIST_ROWS = 2_000;
// Stay below both decimal and binary interpretations of GitHub's documented
// 48 KB limit.
const GITHUB_SECRET_LIMIT_BYTES = 48_000;

function fail(message) {
  process.stderr.write(`Watchlist encoding failed: ${message}\n`);
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (quoted) fail('CSV contains an unterminated quoted field');
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const inputArg = process.argv[2];
if (!inputArg || process.argv.length !== 3) {
  fail('usage: npm run encode:cm-watchlist -- <private-watchlist.csv>');
}

const inputPath = path.resolve(inputArg);
let stat;
try {
  stat = fs.statSync(inputPath);
} catch {
  fail('input file could not be read');
}
if (!stat.isFile()) fail('input path is not a file');
if (stat.size === 0) fail('input CSV is empty');
if (stat.size > MAX_WATCHLIST_BYTES) fail('input CSV exceeds the 2 MB safety limit');

const input = fs.readFileSync(inputPath);
let text;
try {
  text = new TextDecoder('utf-8', { fatal: true }).decode(input);
} catch {
  fail('input CSV is not valid UTF-8');
}

const rows = parseCsv(text);
if (!rows.length) fail('input CSV has no header row');
const header = rows[0].map((value, index) => {
  const trimmed = value.trim();
  return index === 0 ? trimmed.replace(/^\uFEFF/, '') : trimmed;
});
if (!header.includes('Company Name')) fail('input CSV is missing the Company Name column');
const dataRows = rows.slice(1).filter(row => row.some(value => value.trim()));
if (!dataRows.length) fail('input CSV has no company rows');
if (dataRows.length > MAX_WATCHLIST_ROWS) fail(`input CSV exceeds ${MAX_WATCHLIST_ROWS.toLocaleString('en-US')} company rows`);

const compressed = gzipSync(input, { level: 9 });
const encoded = compressed.toString('base64');
const encodedBytes = Buffer.byteLength(encoded, 'utf8');
if (encodedBytes > GITHUB_SECRET_LIMIT_BYTES) {
  fail(`compressed value is ${encodedBytes.toLocaleString('en-US')} bytes, above GitHub's 48 KB secret limit`);
}

process.stderr.write(
  `Validated ${dataRows.length.toLocaleString('en-US')} company row(s); `
  + `${input.length.toLocaleString('en-US')} raw bytes -> `
  + `${encodedBytes.toLocaleString('en-US')} encoded bytes.\n`
);
process.stdout.write(`${encoded}\n`);
