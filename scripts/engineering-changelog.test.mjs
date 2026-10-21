import assert from 'node:assert/strict';
import * as fs from 'fs';
import { isDataOrProse, parseCsv, csvField } from './engineering-changelog.mjs';

// What counts as a production change: code and workflows yes; data, archives, prose no.
for (const f of ['docs/feed.json', 'docs/sent-articles.json', 'docs/engineering-changelog.csv', 'docs/newsletter-archive/2026-10-21.html',
    'docs/diagnostics/latest.json', 'docs/data/capital-markets-scan.json', 'docs/preferences/reserve-pool.json', 'README.md']) {
    assert.equal(isDataOrProse(f), true, `data/prose: ${f}`);
}
for (const f of ['docs/index.html', 'docs/js/capital-markets.js', 'src/server/email.ts', '.github/workflows/send-only.yml',
    'src/feeds/feeds.json', 'scripts/replay-send.ts']) {
    assert.equal(isDataOrProse(f), false, `code: ${f}`);
}

// CSV fields with commas, quotes and newlines survive a round trip.
const values = ['plain', 'a, b', 'say "hi"', 'two\nlines', ''];
assert.deepEqual(parseCsv(values.map(csvField).join(',') + '\r\n')[0], values);

// Every row of both Power BI datasets has the header's width.
for (const file of ['docs/engineering-changelog.csv', 'docs/engineering-validations.csv']) {
    const rows = parseCsv(fs.readFileSync(file, 'utf8'));
    assert.ok(rows.length > 1, `${file} has rows`);
    for (const r of rows) assert.equal(r.length, rows[0].length, `${file}: row width`);
}
console.log('PASS: engineering changelog classification, CSV round trip and dataset widths');
