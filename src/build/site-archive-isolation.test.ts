/**
 * The website archive must never feed newsletter selection. The build writes
 * docs/archive.json; nothing else in the pipeline may read it, and the
 * in-browser draft newsletter must keep building from the live feed.
 */
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const repo = process.cwd();
const ARCHIVE_REF = /archive\.json|site-archive/;
// The writer, its tests, and the one build call site
const ALLOWED = new Set([
    'src/build/site-archive.ts',
    'src/build/site-archive.test.ts',
    'src/build/site-archive-isolation.test.ts',
    'src/build/static.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(ts|mts|js|mjs|cjs|yml|yaml)$/.test(entry.name)) out.push(full);
    }
    return out;
}

const roots = ['src', 'scripts', '.github/workflows'].map(r => path.join(repo, r)).filter(fs.existsSync);
const files = roots.flatMap(r => walk(r)).concat(['rssfeed.ts'].map(f => path.join(repo, f)).filter(fs.existsSync));
// CI may run the archive tests; any other workflow mention would be a new reader
const RUNS_ARCHIVE_TEST = /^\s*(?:-\s*)?(?:run:\s*)?node --import tsx src\/build\/site-archive[\w.-]*\.test\.ts\s*$/;
const offenders = files
    .map(f => path.relative(repo, f).split(path.sep).join('/'))
    .filter(rel => !ALLOWED.has(rel) && fs.readFileSync(path.join(repo, rel), 'utf8')
        .split(/\r?\n/).some(line => ARCHIVE_REF.test(line) && !RUNS_ARCHIVE_TEST.test(line)));
assert.deepEqual(offenders, [], 'only the archive writer and its build call may mention the archive');

// static.ts only calls the writer, after feed.json is written; it never reads the archive back
const staticTs = fs.readFileSync(path.join(repo, 'src/build/static.ts'), 'utf8');
assert.ok(!/readFileSync\([^)]*archive/.test(staticTs), 'the build never reads archive.json');
assert.ok(staticTs.indexOf('writeSiteArchive(') > staticTs.indexOf("'feed.json'"), 'archive is written after feed.json');

// Only public feed metadata reaches the archive: nothing the site build imports, directly or
// transitively, may load the Capital Markets modules that hold ownership enrichment
function importGraph(entry: string, seen = new Set<string>()): Set<string> {
    if (seen.has(entry) || !fs.existsSync(entry)) return seen;
    seen.add(entry);
    const src = fs.readFileSync(entry, 'utf8');
    // import x from, export x from, import('...'), and bare import '...'
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
        importGraph(path.resolve(path.dirname(entry), m[1]).replace(/\.js$/, '.ts'), seen);
    }
    return seen;
}
const buildGraph = [...importGraph(path.join(repo, 'src/build/static.ts'))].map(f => path.relative(repo, f).split(path.sep).join('/'));
assert.ok(buildGraph.includes('src/build/site-archive.ts') && buildGraph.length > 10, 'the import graph walk reached the build modules');
assert.deepEqual(buildGraph.filter(f => /capital-markets/i.test(f)), [], 'the site build never loads Capital Markets enrichment');

// In the page, archived stories reach only the Article Feed's browse list
const page = fs.readFileSync(path.join(repo, 'docs/index.html'), 'utf8');
const previewStart = page.indexOf('const NewsletterPreview = (');
const previewEnd = page.indexOf('const App = () =>');
assert.ok(previewStart > 0 && previewEnd > previewStart);
assert.ok(!/archiveItems|browseItems|archive\.json/.test(page.slice(previewStart, previewEnd)), 'the newsletter preview never sees the archive');
const genStart = page.indexOf('const generateNewsletter = useCallback(');
const genEnd = page.indexOf('}, [newsletterTimeframe', genStart);
assert.ok(genStart > 0 && genEnd > genStart, 'the draft newsletter generator is where this test expects');
// Body plus its dependency list
const generator = page.slice(genStart, page.indexOf(']);', genEnd));
assert.ok(generator.includes('let recentArticles = items.filter('), 'the generator filters the live feed items');
assert.ok(!/archiveItems|browseItems/.test(generator), 'the draft newsletter generator never sees or depends on the archive');

console.log('PASS: archive.json is written by the build only and never reaches newsletter selection');
