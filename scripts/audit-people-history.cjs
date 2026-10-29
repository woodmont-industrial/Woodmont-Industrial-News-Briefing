/** Compare frozen source pools and rendered sections; never call AI or delivery. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function count(items, field) {
    return Object.fromEntries(['relevant', 'transactions', 'availabilities', 'people'].map(category =>
        [category, items.filter(item => item[field] === category).length]));
}

function decisions(code, root, output) {
    const RealDate = Date;
    let instant = 0;
    global.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [instant])); }
        static now() { return instant; }
    };
    let networkRequests = 0;
    const blocked = () => { networkRequests++; throw new Error('Offline history audit'); };
    global.fetch = blocked;
    for (const module of ['node:http', 'node:https']) {
        const transport = require(module); transport.request = transport.get = blocked;
    }
    const net = require('node:net'); net.connect = net.createConnection = blocked;
    require('node:tls').connect = blocked;
    require('node:module').syncBuiltinESMExports();
    const filters = require(path.join(code, 'src/server/newsletter-filters.ts'));
    const { isStrictlyIndustrial } = require(path.join(code, 'src/shared/region-data.ts'));
    const manifest = require(path.join(__dirname, 'fixtures/people-history.json'));
    console.log = console.warn = console.error = () => {};
    const results = manifest.snapshots.map(snapshot => {
        instant = Date.parse(snapshot.date + 'T12:00:20Z');
        const feed = JSON.parse(fs.readFileSync(path.join(root, snapshot.date, 'feed.json'), 'utf8'));
        const items = filters.mapFeedItemsToArticles(feed.items);
        const articles = items.map(item => {
            const article = filters.preparePeopleArticle ? filters.preparePeopleArticle(item) : item;
            const date = filters.getValidDate(article);
            const inWindow = !!date && date >= new Date(instant - 30 * 86400000);
            const region = filters.isTargetRegion(article);
            const people = filters.applyPeopleFilter([article]).length === 1;
            const firstRescue = filters.reCategorizeRelevantAsPeople([{ ...article, category: 'relevant' }], [], []).people.length === 1;
            const secondRescue = filters.qualifiesForPeopleRescue(article);
            const industrial = filters.passesPeopleIndustrialCheck
                ? filters.passesPeopleIndustrialCheck(article) : isStrictlyIndustrial(filters.getText(article));
            const routed = article.category === 'people'
                || ['relevant', 'transactions'].includes(article.category) && (firstRescue || secondRescue);
            return { id: article.id, originalCategory: item.category, category: article.category,
                people, eligible: inWindow && region && people && industrial && routed,
                adds: /\badds?\b/i.test(article.title) };
        });
        return { date: snapshot.date, input: items.length,
            counts: count(articles, 'category'), articles };
    });
    assert.equal(networkRequests, 0);
    // Deliberately omit names, titles, descriptions and source inventories.
    fs.writeFileSync(output, JSON.stringify(results));
}

function main() {
    const manifest = require('./fixtures/people-history.json');
    const args = process.argv.slice(2);
    const option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
    const ref = option('--baseline-ref') || process.env.PEOPLE_AUDIT_BASE || manifest.baseline;
    assert.match(ref, /^[a-f0-9]{7,40}$/i, 'baseline must be a commit SHA');
    const input = option('--input-root');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'people-history-'));
    const baseline = path.join(root, 'baseline');
    const loader = path.resolve('node_modules/tsx/dist/loader.mjs');
    const script = path.resolve(__filename);
    const harness = path.resolve('scripts/replay-people-email.ts');
    const docs = path.join(root, 'inputs');
    const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32000000, stdio: ['ignore', 'pipe', 'pipe'] });
    const childEnv = { PATH: process.env.PATH, TZ: 'America/New_York' };
    const files = ['feed.json', 'sent-articles.json', 'preferences/reserve-pool.json', 'scoring-weights.json',
        'included-articles.json', 'excluded-articles.json', 'weekly-top-articles.json', 'feed-health.json', 'build-receipt.json'];
    const report = { from: manifest.from, through: manifest.through, baseline: ref, snapshots: [], rendered: [] };
    try {
        git(['worktree', 'add', '--detach', baseline, ref]);
        fs.symlinkSync(path.resolve('node_modules'), path.join(baseline, 'node_modules'), 'dir');
        for (const snapshot of manifest.snapshots) {
            const selected = manifest.renderDates.includes(snapshot.date) ? files : ['feed.json'];
            for (const file of selected) {
                const target = path.join(docs, snapshot.date, file);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.writeFileSync(target, input
                    ? fs.readFileSync(path.join(input, snapshot.date, file))
                    : git(['show', `${snapshot.commit}:docs/${file}`]));
            }
        }
        const runDecisions = (name, cwd) => {
            const output = path.join(root, name + '.json');
            execFileSync(process.execPath, ['--import', loader, script, '--decisions', cwd, docs, output],
                { cwd, env: childEnv, stdio: 'pipe', timeout: 60000 });
            return JSON.parse(fs.readFileSync(output, 'utf8'));
        };
        const before = runDecisions('before', baseline);
        const after = runDecisions('after', process.cwd());
        const changedFilters = new Set(), dropped = new Set(), gained = new Set(), unique = new Set();
        let occurrences = 0, eligibleBefore = 0, eligibleAfter = 0, categoryChanges = 0;
        for (let i = 0; i < before.length; i++) {
            const old = before[i], current = after[i];
            assert.equal(old.date, current.date);
            const byId = new Map(current.articles.map(article => [article.id, article]));
            for (const article of old.articles) {
                const next = byId.get(article.id);
                assert.ok(next, 'the audit must compare the same article pool');
                unique.add(article.id); occurrences++;
                if (article.people !== next.people) changedFilters.add(article.id);
                if (article.eligible && !next.eligible) dropped.add(article.id);
                if (!article.eligible && next.eligible) gained.add(article.id);
                if (article.category !== next.category) categoryChanges++;
                eligibleBefore += Number(article.eligible); eligibleAfter += Number(next.eligible);
            }
            report.snapshots.push({ date: old.date, input: old.input, before: old.counts, after: current.counts });
        }
        report.summary = { articles: occurrences, uniqueArticleIds: unique.size, changedPeopleFilterIds: changedFilters.size,
            eligibleBefore, eligibleAfter, eligibleLostIds: dropped.size, eligibleGainedIds: gained.size, categoryChanges };
        assert.equal(dropped.size, 0, 'a previously eligible People article was lost; review the changed decision');
        for (const date of manifest.renderDates) {
            const run = (name, cwd) => {
                const output = path.join(root, date + '-' + name + '.json');
                execFileSync(process.execPath, ['--import', loader, harness, path.join(docs, date), output, date + 'T12:00:20Z'],
                    { cwd, env: childEnv, stdio: 'pipe', timeout: 60000 });
                const result = JSON.parse(fs.readFileSync(output, 'utf8'));
                assert.equal(result.networkRequests, 0);
                return result;
            };
            const old = run('before', baseline), current = run('after', process.cwd());
            assert.deepEqual(current.sections, old.sections, date + ': the People repair changed a historical rendered section');
            assert.deepEqual(current.renderedIds, old.renderedIds);
            assert.deepEqual(current.weekInReviewIds, old.weekInReviewIds);
            report.rendered.push({ date, sectionCounts: Object.fromEntries(Object.entries(current.sections)
                .map(([section, ids]) => [section, ids.length])), identicalArticleIds: true, networkRequests: 0 });
        }
        assert.equal(report.snapshots.length, 22);
        console.log(JSON.stringify(report));
        console.log('PASS: thirty-day People decision audit and six offline rendered-email comparisons');
    } finally {
        const modules = path.join(baseline, 'node_modules');
        try { if (fs.lstatSync(modules).isSymbolicLink()) fs.unlinkSync(modules); } catch {}
        try { git(['worktree', 'remove', '--force', baseline]); } catch {}
        fs.rmSync(root, { recursive: true, force: true });
    }
}

try {
    if (process.argv[2] === '--decisions') decisions(...process.argv.slice(3));
    else main();
} catch {
    process.stderr.write('People history audit incomplete; inspect the frozen inputs and baseline commit. No delivery was attempted.\n');
    process.exitCode = 1;
}
