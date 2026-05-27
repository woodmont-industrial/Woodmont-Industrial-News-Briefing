// Plain Node test (no test framework) for the HTML-escape helpers.
// Run: node tests/html-escape.test.mjs
//
// Mirrors src/shared/html-escape.ts. If you change the TS file, update this
// fixture too (or eventually move to a real test runner).

const HTML_ESCAPE_MAP = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;', '`': '&#96;', '/': '&#47;'
};

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text).replace(/[&<>"'`\/]/g, ch => HTML_ESCAPE_MAP[ch] || ch);
}

function safeUrl(url) {
    if (!url) return '#';
    const s = String(url).trim();
    if (!s) return '#';
    if (/^\s*(javascript|data|vbscript|file):/i.test(s)) return '#';
    try {
        const u = new URL(s);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? s : '#';
    } catch { return '#'; }
}

let pass = 0, fail = 0;
function assert(actual, expected, label) {
    if (actual === expected) {
        pass++;
        console.log(`  ✓ ${label}`);
    } else {
        fail++;
        console.log(`  ✗ ${label}`);
        console.log(`    expected: ${JSON.stringify(expected)}`);
        console.log(`    actual:   ${JSON.stringify(actual)}`);
    }
}

console.log('escapeHtml:');
assert(escapeHtml('hello world'), 'hello world', 'plain text passes through');
assert(escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;&#47;script&gt;', 'script tag fully escaped');
assert(escapeHtml('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;', 'img injection escaped');
assert(escapeHtml('a&b'), 'a&amp;b', 'ampersand escaped');
assert(escapeHtml('she said "hi"'), 'she said &quot;hi&quot;', 'double quote escaped');
assert(escapeHtml("it's fine"), 'it&#39;s fine', 'single quote escaped');
assert(escapeHtml(null), '', 'null returns empty string');
assert(escapeHtml(undefined), '', 'undefined returns empty string');
assert(escapeHtml(123), '123', 'number coerced to string');

console.log('\nsafeUrl:');
assert(safeUrl('https://example.com/path'), 'https://example.com/path', 'https URL preserved');
assert(safeUrl('http://example.com'), 'http://example.com', 'http URL preserved');
assert(safeUrl('javascript:alert(1)'), '#', 'javascript: URL blocked');
assert(safeUrl('JAVASCRIPT:alert(1)'), '#', 'case-insensitive js block');
assert(safeUrl('  javascript:alert(1)'), '#', 'leading-whitespace js block');
assert(safeUrl('data:text/html,<script>alert(1)</script>'), '#', 'data: URL blocked');
assert(safeUrl('vbscript:msgbox'), '#', 'vbscript: URL blocked');
assert(safeUrl('file:///etc/passwd'), '#', 'file: URL blocked');
assert(safeUrl(''), '#', 'empty string returns #');
assert(safeUrl(null), '#', 'null returns #');
assert(safeUrl('not a url'), '#', 'invalid URL returns #');
assert(safeUrl('ftp://example.com'), '#', 'ftp: scheme blocked');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
