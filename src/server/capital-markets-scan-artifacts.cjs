const assert = require('node:assert/strict');

function shape(value, fields, label, optional = []) {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
    assert.ok(Object.keys(value).every(key => fields.includes(key)), `${label}: unexpected field`);
    assert.ok(fields.filter(key => !optional.includes(key)).every(key => key in value), `${label}: missing field`);
}
function text(value, label, limit = 2000) {
    assert.ok(typeof value === 'string' && value.length > 0 && value.length <= limit, `${label}: invalid text`);
}
function count(value, label) {
    assert.ok(Number.isSafeInteger(value) && value >= 0, `${label}: invalid count`);
}
function date(value, label) {
    text(value, label, 60);
    assert.ok(Number.isFinite(Date.parse(value)), `${label}: invalid date`);
}
function approvedUrl(value, domain, label) {
    text(value, label);
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const expected = String(domain || '').toLowerCase().replace(/^www\./, '');
    assert.ok(expected && url.protocol === 'https:' && !url.username && !url.password && !url.port
        && (host === expected || host.endsWith('.' + expected)), `${label}: unapproved URL`);
}

function validateScanResult(scan, rows) {
    shape(scan, ['version', 'startedAt', 'completedAt', 'runtimeSeconds', 'lookbackDays', 'requests',
        'sources', 'hits', 'newSinceLastScan', 'counts', 'duplicatesCollapsed'], 'scan');
    assert.equal(scan.version, 1, 'scan: unsupported version');
    date(scan.startedAt, 'scan start'); date(scan.completedAt, 'scan completion');
    assert.ok(Date.parse(scan.completedAt) >= Date.parse(scan.startedAt), 'scan: reversed dates');
    for (const field of ['runtimeSeconds', 'lookbackDays', 'requests', 'duplicatesCollapsed']) count(scan[field], field);
    assert.ok(scan.lookbackDays >= 1 && scan.lookbackDays <= 365, 'scan: invalid window');
    assert.ok(Array.isArray(scan.sources) && scan.sources.length <= 500, 'scan: invalid sources');
    assert.ok(Array.isArray(scan.hits) && scan.hits.length <= 5000, 'scan: invalid hits');
    const companies = new Map(rows.map(row => [row['Company Name'], row['Website Domain']]));
    const sources = new Map();
    const outcomes = ['ok', 'refused', 'transient', 'cooling'];
    for (const source of scan.sources) {
        shape(source, ['name', 'url', 'outcome', 'status', 'endpoints', 'articles', 'retryAfter'], 'source', ['retryAfter']);
        text(source.name, 'source name', 500);
        assert.ok(companies.has(source.name), 'source: identity absent from projection');
        approvedUrl(source.url, companies.get(source.name), 'source URL');
        assert.ok(!sources.has(source.name), 'source: duplicate identity');
        sources.set(source.name, source);
        assert.ok(outcomes.includes(source.outcome), 'source: invalid outcome');
        text(source.status, 'source status', 100);
        count(source.endpoints, 'source endpoints'); count(source.articles, 'source articles');
        if (source.retryAfter !== undefined) date(source.retryAfter, 'source retry');
    }
    const sections = ['sales', 'leases', 'availabilities', 'construction', 'intel', 'municipal'];
    const totals = {};
    for (const hit of scan.hits) {
        shape(hit, ['title', 'link', 'publishedAt', 'source', 'section', 'tier', 'squareFeet', 'priceUsd',
            'evidence', 'evidenceSource', 'reason'], 'hit');
        text(hit.title, 'hit title', 1000); text(hit.source, 'hit source', 500);
        const source = sources.get(hit.source);
        assert.ok(source && source.outcome === 'ok' && source.articles > 0, 'hit: no successful public source');
        approvedUrl(hit.link, companies.get(hit.source), 'hit URL');
        date(hit.publishedAt, 'hit publication');
        assert.ok(Date.parse(hit.publishedAt) <= Date.parse(scan.completedAt), 'hit: future publication');
        assert.ok(sections.includes(hit.section), 'hit: invalid section');
        assert.ok(['TARGET', 'BROADER', 'NATIONAL', 'UNMAPPED'].includes(hit.tier), 'hit: invalid geography');
        for (const field of ['squareFeet', 'priceUsd']) {
            assert.ok(hit[field] === null || (Number.isFinite(hit[field]) && hit[field] > 0), `hit: invalid ${field}`);
        }
        if (hit.section === 'sales') assert.equal(hit.squareFeet, null, 'hit: sale units');
        else assert.equal(hit.priceUsd, null, 'hit: non-sale units');
        text(hit.evidence, 'hit evidence', 1200); text(hit.reason, 'hit reason', 5000);
        assert.ok(['feed', 'article page'].includes(hit.evidenceSource), 'hit: invalid evidence source');
        totals[hit.section] = (totals[hit.section] || 0) + 1;
    }
    shape(scan.counts, Object.keys(totals), 'section counts');
    assert.deepEqual(scan.counts, totals, 'scan: counts differ from hits');
    assert.ok(Array.isArray(scan.newSinceLastScan), 'scan: invalid new-hit references');
    const titles = new Set(scan.hits.map(hit => hit.title));
    assert.ok(scan.newSinceLastScan.every(title => titles.has(title)), 'scan: new-hit reference lacks a public claim');
    assert.equal(new Set(scan.newSinceLastScan).size, scan.newSinceLastScan.length, 'scan: duplicate new-hit reference');
}

function validateScanState(state) {
    shape(state, ['version', 'sources', 'lastHits'], 'scan state');
    assert.equal(state.version, 2, 'scan state: unsupported version');
    assert.ok(state.sources && typeof state.sources === 'object' && !Array.isArray(state.sources), 'state: invalid sources');
    for (const [key, value] of Object.entries(state.sources)) {
        assert.match(key, /^[a-f0-9]{64}$/, 'state: source keys must be opaque identifiers');
        shape(value, ['outcome', 'retryAfter'], 'state source', ['retryAfter']);
        assert.ok(['ok', 'refused', 'transient'].includes(value.outcome), 'state: invalid outcome');
        if (value.retryAfter !== undefined) date(value.retryAfter, 'state retry');
    }
    assert.ok(Array.isArray(state.lastHits) && state.lastHits.every(key => /^[a-f0-9]{64}$/.test(key)),
        'state: hit keys must be opaque identifiers');
}

module.exports = { validateScanResult, validateScanState };
