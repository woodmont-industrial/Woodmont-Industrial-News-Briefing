/**
 * Social-source pilot: evaluation rules, readers and local-only guards.
 * Uses the REAL classifier (Jacob's rules) with synthetic accounts and posts,
 * and a stubbed network. All names are synthetic.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    evaluateSocialPosts, declaredAnnouncementUrl, postTitle, SocialAccount, SocialPost,
    normalizeXRecord, normalizeInstagramRecord, normalizeFacebookRecord,
} from './capital-markets-social.js';
import { Fetcher } from './capital-markets-scan.js';
import { READ_COMMANDS, guardEnvironment } from '../../scripts/social-pilot.js';

let failures = 0;
const check = (ok: unknown, label: string): void => {
    if (ok) console.log(`  OK   ${label}`);
    else { console.error(`  FAIL ${label}`); failures++; }
};

async function main(): Promise<void> {
const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-social-'));
fs.mkdirSync(path.join(docsDir, 'js'), { recursive: true });
fs.mkdirSync(path.join(docsDir, 'data'), { recursive: true });
for (const f of ['index.html', 'capital-markets-geography.json', 'capital-markets-places.json', 'js/capital-markets.js']) {
    const from = path.join(process.cwd(), 'docs', f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(docsDir, f));
}
const { loadCapitalMarketsRuntime } = require(path.join(process.cwd(), 'src', 'server', 'capital-markets-runtime.cjs'));
const { CM } = await loadCapitalMarketsRuntime({ repoRoot: process.cwd(), docsDir });

const now = new Date('2026-10-21T15:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const accounts: SocialAccount[] = [
    { platform: 'x', handle: 'exampledev', domains: ['exampledev.test'] },
    { platform: 'instagram', handle: 'exampledev', domains: ['exampledev.test'] },
    { platform: 'facebook', handle: 'Example Township', domains: [] },
];
const post = (p: Partial<SocialPost>): SocialPost => ({
    platform: 'x', account: 'exampledev', id: Math.random().toString(36).slice(2), url: 'https://x.com/exampledev/status/1',
    postedAt: day(2), text: '', links: [], collectedAt: now.toISOString(), ...p,
});
const LEASE_PAGE = '<html><nav>Home About News</nav><p>Example Tenant leased 20,000 SF of industrial warehouse space in Edison, New Jersey.</p></html>';
const requested: string[] = [];
const fetcher: Fetcher = async (url, _t, domains) => {
    requested.push(url);
    if (!domains || !domains.some(d => new URL(url).hostname.endsWith(d))) return { ok: false, body: '', status: 'unapproved-redirect' };
    if (url.includes('/news/lease')) return { ok: true, status: '200', body: LEASE_PAGE, finalUrl: url };
    return { ok: false, body: '', status: '404' };
};
const shortLinks: Record<string, string> = {
    'https://t.co/good': 'https://exampledev.test/news/lease',
    'https://t.co/elsewhere': 'https://other-publisher.test/story',
};
const resolveShort = async (u: string) => shortLinks[u] || null;
const run = (posts: SocialPost[], extra: object = {}) => evaluateSocialPosts({
    posts, accounts, classifier: CM, fetcher, resolveShort, now, lookbackDays: 30, ...extra });

console.log('=== verification goes through the account\'s OWN domain only ===');
check(await declaredAnnouncementUrl('https://exampledev.test/news/lease', ['exampledev.test'], resolveShort) === 'https://exampledev.test/news/lease',
    'a direct link on a declared domain is accepted');
check(await declaredAnnouncementUrl('https://t.co/good', ['exampledev.test'], resolveShort) === 'https://exampledev.test/news/lease',
    'a shortener resolving to a declared domain is accepted');
check(await declaredAnnouncementUrl('https://t.co/elsewhere', ['exampledev.test'], resolveShort) === null,
    'a shortener resolving elsewhere is rejected');
check(await declaredAnnouncementUrl('https://other-publisher.test/story', ['exampledev.test'], resolveShort) === null,
    'an undeclared publisher link is rejected');
check(await declaredAnnouncementUrl('https://x.com/exampledev/status/1', ['exampledev.test'], resolveShort) === null,
    'a social link is never an approved domain');

console.log('=== statuses ===');
{
    requested.length = 0;
    const { findings, metrics } = await run([post({ text: 'Big news for our Edison team! Read more https://t.co/good', links: ['https://t.co/good'] })]);
    const f = findings[0];
    check(findings.length === 1 && f.status === 'verified', `linked announcement on the own domain verifies (${f?.status})`);
    check(f?.section === 'leases' && f?.squareFeet === 20000 && f?.tier === 'TARGET', `the PAGE supplies section, figure and tier (${f?.section} ${f?.squareFeet} ${f?.tier})`);
    check(f?.evidenceSource === 'linked announcement' && /20,000 SF/.test(f?.evidence || '') && !/^Home/.test(f?.evidence || ''),
        'evidence is the sentence stating the figure, from the page');
    check(f?.announcementUrl === 'https://exampledev.test/news/lease' && f?.postUrl === 'https://x.com/exampledev/status/1', 'both the post and the announcement are cited');
    check(metrics.verified === 1 && metrics.newDevelopments === 1, 'counted as verified and new');
}
{
    requested.length = 0;
    const { findings } = await run([post({ text: 'Example Tenant leased 20,000 SF industrial warehouse in Edison, New Jersey. https://other-publisher.test/story',
        links: ['https://other-publisher.test/story'] })]);
    check(findings[0]?.status === 'post-only', `a qualifying post with no own-domain link is post-only (${findings[0]?.status})`);
    check(requested.length === 0, 'an undeclared link is never fetched');
}
{
    const { findings } = await run([post({ text: 'Happy Friday from the whole team at our New Jersey office!' })]);
    check(findings.length === 0, 'a non-qualifying post produces nothing');
}
{
    const { findings } = await run([post({ platform: 'facebook', account: 'Example Township', url: null, postedAt: null,
        text: 'Example Developer breaks ground on 250,000 SF industrial warehouse in Edison, New Jersey.' })]);
    check(findings[0]?.status === 'lead' && findings[0]?.postUrl === null, `a qualifying Facebook post is only a lead (${findings[0]?.status})`);
}
{
    const lease = 'Example Tenant leased 20,000 SF industrial warehouse in Edison, New Jersey.';
    const { findings } = await run([
        post({ text: lease, postedAt: day(45) }),
        post({ text: lease, postedAt: new Date(now.getTime() + 3600000).toISOString() }),
        post({ text: lease, account: 'someoneelse' }),
    ]);
    check(findings.length === 0, 'posts outside the window, in the future, or from unconfigured accounts are ignored');
}

console.log('=== one development counts once ===');
{
    const { findings, metrics } = await run([
        post({ platform: 'instagram', url: 'https://www.instagram.com/p/AbC/', id: 'AbC',
            text: 'Example Tenant leased 20,000 SF industrial warehouse in Edison, New Jersey.' }),
        post({ text: 'Big news for our Edison team! https://t.co/good', links: ['https://t.co/good'] }),
    ]);
    check(findings.length === 1 && metrics.duplicatesCollapsed === 1, `Instagram + X copies collapse (${findings.length})`);
    check(findings[0]?.status === 'verified' && findings[0]?.alsoSeenIn.includes('https://www.instagram.com/p/AbC/'),
        'the verified copy is kept and the other post is listed with it');
}
{
    const text = 'Example Tenant leased 20,000 SF industrial warehouse in Edison, New Jersey.';
    const a = await run([post({ text })], { scannerKnown: [{ section: 'leases', figure: 20000 }] });
    check(a.findings[0]?.knownFrom === 'scanner' && a.metrics.newDevelopments === 0, 'a development the scanner already has is not new');
    const b = await run([post({ text })], { feedKnown: [{ section: 'leases', figure: 20000 }] });
    check(b.findings[0]?.knownFrom === 'newsletter feed', 'a development already in the newsletter feed is not new');
    const c = await run([post({ text })], { scannerKnown: [{ section: 'leases', figure: 45000 }] });
    check(c.findings[0]?.knownFrom === null && c.metrics.newDevelopments === 1, 'a different figure is a different development');
}

console.log('=== readers ===');
const x = normalizeXRecord({ id: '123', text: 'Leased 20,000 SF https://t.co/good', created_at: 'Tue Oct 20 14:00:00 +0000 2026',
    urls: [{ expanded_url: 'https://exampledev.test/news/lease' }] }, 'exampledev', now.toISOString());
check(x?.url === 'https://x.com/exampledev/status/123' && x?.postedAt === '2026-10-20T14:00:00.000Z'
    && x.links.includes('https://exampledev.test/news/lease') && x.links.includes('https://t.co/good'), 'X record: permalink, ISO date, expanded and inline links');
check(normalizeXRecord({ text: 'no id' }, 'a', '') === null, 'an X record without id or date is dropped');
const ig = normalizeInstagramRecord({ code: 'AbC_1', takenAt: '2026-10-19T12:00:00.000Z', caption: 'Full caption text, not cut at 100 characters.' }, 'exampledev', '');
check(ig?.url === 'https://www.instagram.com/p/AbC_1/' && ig?.postedAt === '2026-10-19T12:00:00.000Z', 'Instagram record: permalink and date');
check(normalizeInstagramRecord({ code: 'bad code', takenAt: '2026-10-19', caption: 'x' }, 'a', '') === null, 'an Instagram record with an invalid code is dropped');
const fb = normalizeFacebookRecord({ author: 'Example Township', content: 'Planning board approves warehouse' }, '');
check(fb?.url === null && fb?.postedAt === null && fb?.account === 'Example Township', 'Facebook record: author and text only, no invented link or date');
check(postTitle('First sentence here. Second sentence.\nNext line') === 'First sentence here.', 'the first sentence plays the title');

console.log('=== local-only, read-only collector ===');
const WRITE_VERBS = /^(post|tweet|reply|quote|like|unlike|retweet|follow|unfollow|comment|add-friend|join-group|save|unsave|bookmark|delete|note|story|reel|collection-create|collection-delete|download)$/;
const argvs = [READ_COMMANDS.x('exampledev').args, READ_COMMANDS.instagram('exampledev').args, READ_COMMANDS.facebook().args];
check(argvs.every(a => !a.some(arg => WRITE_VERBS.test(arg))), 'no collector command uses a write verb');
check(READ_COMMANDS.x('exampledev').args[0] === 'user-posts' && READ_COMMANDS.instagram('h').args.slice(0, 2).join(' ') === 'woodmont-instagram posts'
    && READ_COMMANDS.facebook().args.slice(0, 2).join(' ') === 'facebook feed', 'the three read commands are exactly the expected ones');
const repo = process.cwd();
check(guardEnvironment(path.join(os.homedir(), '.woodmont-social'), repo, { CI: 'true' }) !== null, 'refuses to run in CI');
check(guardEnvironment(path.join(os.homedir(), '.woodmont-social'), repo, { GITHUB_ACTIONS: 'true' }) !== null, 'refuses to run in GitHub Actions');
check(guardEnvironment(path.join(repo, 'docs', 'social'), repo, {}) !== null, 'refuses a private directory inside the repository');
check(guardEnvironment(path.join(os.homedir(), '.woodmont-social'), repo, {}) === null, 'accepts a private directory outside the repository');
const adapter = fs.readFileSync(path.join(repo, 'scripts', 'social-pilot', 'opencli', 'woodmont-instagram', 'posts.js'), 'utf8');
check(/access: 'read'/.test(adapter) && !/method:\s*['"](POST|PUT|DELETE)/i.test(adapter), 'the Instagram adapter is declared read-only and issues no write request');

fs.rmSync(docsDir, { recursive: true, force: true });
console.log(failures ? `\n${failures} FAILURE(S)` : '\nOK: Capital Markets social pilot');
process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
