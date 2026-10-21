/**
 * Social-source pilot — LOCAL ONLY (2026-10-21).
 *
 *   node --import tsx scripts/social-pilot.ts collect    # read recent posts from the configured accounts
 *   node --import tsx scripts/social-pilot.ts evaluate   # classify, verify, dedupe; write a private report
 *   node --import tsx scripts/social-pilot.ts status     # 30-day pilot totals from the ledger
 *
 * Everything private lives in WOODMONT_SOCIAL_DIR (default ~/.woodmont-social), which
 * must be OUTSIDE this repository:
 *   accounts.json        the pilot accounts (never committed: handles can name watchlist companies)
 *   posts.jsonl          normalised posts, one per line, deduplicated by id
 *   raw/<date>/…         reader output as received
 *   reports/<date>.json  findings + metrics;  reports/<date>.md  the same, readable
 *   ledger.json          first-seen date per development, for pilot metrics
 *
 * Collection uses DEDICATED accounts only: X through twitter-cli with that account's
 * TWITTER_AUTH_TOKEN / TWITTER_CT0, and Instagram / Facebook through OpenCLI's extension
 * installed in a SEPARATE Chrome profile signed in to the dedicated accounts. Only the
 * read commands in READ_COMMANDS are ever run. Refuses to run in CI.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    SocialAccount, SocialPost, KnownDevelopment, evaluateSocialPosts,
    normalizeXRecord, normalizeInstagramRecord, normalizeFacebookRecord, SocialFinding, SocialMetrics,
} from '../src/server/capital-markets-social.js';
import { httpFetcher, magnitudeUnit } from '../src/server/capital-markets-scan.js';

const REPO = path.resolve(__dirname, '..');
const DIR = path.resolve(process.env.WOODMONT_SOCIAL_DIR || path.join(os.homedir(), '.woodmont-social'));

/** The ONLY reader commands this pilot runs. Each tool also offers write actions
 *  (post, like, follow, comment, add-friend …); none of them can be built here. */
export const READ_COMMANDS = {
    x: (handle: string) => ({ tool: 'twitter', args: ['user-posts', handle, '--max', '20', '--full-text', '--json'] }),
    instagram: (handle: string) => ({ tool: 'opencli', args: ['woodmont-instagram', 'posts', handle, '--limit', '12', '-f', 'json'] }),
    facebook: () => ({ tool: 'opencli', args: ['facebook', 'feed', '--limit', '40', '-f', 'json'] }),
} as const;

export function guardEnvironment(dir: string, repo: string, env: NodeJS.ProcessEnv = process.env): string | null {
    if (env.CI || env.GITHUB_ACTIONS) return 'refusing to run in CI: the social pilot is local-only';
    const rel = path.relative(repo, dir);
    if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) return `WOODMONT_SOCIAL_DIR must be outside the repository (${dir})`;
    return null;
}

function loadAccounts(): SocialAccount[] {
    const p = path.join(DIR, 'accounts.json');
    if (!fs.existsSync(p)) throw new Error(`no accounts file at ${p} — copy scripts/social-pilot/accounts.example.json there and edit it`);
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    const list: SocialAccount[] = Array.isArray(parsed) ? parsed : parsed.accounts;
    for (const a of list) {
        if (!['x', 'instagram', 'facebook'].includes(a.platform) || !a.handle || !Array.isArray(a.domains)) {
            throw new Error(`invalid account entry: ${JSON.stringify(a)}`);
        }
        if (a.platform !== 'facebook' && !/^[A-Za-z0-9_.]{1,40}$/.test(a.handle)) throw new Error(`invalid handle: ${a.handle}`);
    }
    return list;
}

function run(tool: 'twitter' | 'opencli', args: string[]): { ok: boolean; out: string; err: string } {
    const bin = tool === 'twitter' ? (process.env.SOCIAL_TWITTER_BIN || 'twitter') : (process.env.SOCIAL_OPENCLI_BIN || 'opencli');
    // No shell: arguments go straight to the program, so a handle can't inject anything.
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 120000, shell: false, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
    return { ok: r.status === 0, out: r.stdout || '', err: (r.stderr || String(r.error || '')).slice(0, 400) };
}

function parseJsonOutput(out: string): any[] {
    const parsed = JSON.parse(out);
    if (Array.isArray(parsed)) return parsed;
    for (const k of ['data', 'tweets', 'items', 'rows', 'results']) if (Array.isArray(parsed?.[k])) return parsed[k];
    return [];
}

function readPosts(): SocialPost[] {
    const p = path.join(DIR, 'posts.jsonl');
    if (!fs.existsSync(p)) return [];
    return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}

async function collect(): Promise<void> {
    const accounts = loadAccounts();
    const today = new Date().toISOString().slice(0, 10);
    const rawDir = path.join(DIR, 'raw', today);
    fs.mkdirSync(rawDir, { recursive: true });
    const collectedAt = new Date().toISOString();
    const existing = readPosts();
    const seen = new Set(existing.map(p => `${p.platform}:${p.id}`));
    const fresh: SocialPost[] = [];
    const keep = (p: SocialPost | null) => { if (p && !seen.has(`${p.platform}:${p.id}`)) { seen.add(`${p.platform}:${p.id}`); fresh.push(p); } };

    for (const a of accounts.filter(a => a.platform !== 'facebook')) {
        const cmd = READ_COMMANDS[a.platform as 'x' | 'instagram'](a.handle);
        const r = run(cmd.tool, cmd.args);
        if (!r.ok) { console.log(`  ✗ ${a.platform}:${a.handle} — ${r.err.split('\n')[0]}`); continue; }
        fs.writeFileSync(path.join(rawDir, `${a.platform}-${a.handle}.json`), r.out);
        let records: any[] = [];
        try { records = parseJsonOutput(r.out); } catch { console.log(`  ✗ ${a.platform}:${a.handle} — output was not JSON`); continue; }
        const before = fresh.length;
        for (const rec of records) keep(a.platform === 'x' ? normalizeXRecord(rec, a.handle, collectedAt) : normalizeInstagramRecord(rec, a.handle, collectedAt));
        console.log(`  ✓ ${a.platform}:${a.handle} — ${records.length} read, ${fresh.length - before} new`);
        // Low and slow: these readers warn that frequent calls risk the account.
        await new Promise(res => setTimeout(res, 4000 + Math.random() * 4000));
    }

    const fbPages = new Set(accounts.filter(a => a.platform === 'facebook').map(a => a.handle.toLowerCase()));
    if (fbPages.size) {
        const cmd = READ_COMMANDS.facebook();
        const r = run(cmd.tool, cmd.args);
        if (!r.ok) console.log(`  ✗ facebook feed — ${r.err.split('\n')[0]}`);
        else {
            fs.writeFileSync(path.join(rawDir, 'facebook-feed.json'), r.out);
            let records: any[] = [];
            try { records = parseJsonOutput(r.out); } catch { /* counted below as 0 */ }
            const before = fresh.length;
            // The dedicated account's feed also carries suggestions and other pages:
            // keep only posts authored by a configured page.
            for (const rec of records) {
                const p = normalizeFacebookRecord(rec, collectedAt);
                if (p && fbPages.has(p.account.toLowerCase())) keep(p);
            }
            console.log(`  ✓ facebook feed — ${records.length} read, ${fresh.length - before} new from configured pages`);
        }
    }
    if (fresh.length) fs.appendFileSync(path.join(DIR, 'posts.jsonl'), fresh.map(p => JSON.stringify(p)).join('\n') + '\n');
    console.log(`Collected ${fresh.length} new post(s); ${existing.length + fresh.length} stored.`);
}

function knownFromScanner(): KnownDevelopment[] {
    const p = path.join(REPO, 'docs', 'data', 'capital-markets-scan.json');
    if (!fs.existsSync(p)) return [];
    const scan = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (scan.hits || []).map((h: any) => ({ link: h.link, section: h.section, figure: h.squareFeet ?? h.priceUsd ?? null }));
}

function knownFromFeed(CM: any): KnownDevelopment[] {
    const p = path.join(REPO, 'docs', 'feed.json');
    if (!fs.existsSync(p)) return [];
    const feed = JSON.parse(fs.readFileSync(p, 'utf8'));
    const out: KnownDevelopment[] = [];
    for (const a of (feed.items || feed)) {
        const v = CM.cmClassify({ title: a.title || '', description: a.description || '', summary: a.summary || '' });
        if (!v.section) continue;
        const n = Number(v.magnitude);
        out.push({ link: a.link || a.url, section: v.section, figure: Number.isFinite(n) && n > 0 ? n : null });
    }
    return out;
}

function markdown(findings: SocialFinding[], m: SocialMetrics, date: string): string {
    const fig = (f: SocialFinding) => f.squareFeet ? `${f.squareFeet.toLocaleString()} SF` : f.priceUsd ? `$${(f.priceUsd / 1e6).toFixed(1)}M` : '—';
    const rows = (s: string) => findings.filter(f => f.status === s).map(f =>
        `- **${f.section} / ${f.tier}** · ${fig(f)} · ${f.platform}:${f.account} · ${f.postedAt?.slice(0, 10) || 'undated'}`
        + `${f.knownFrom ? ` · already in ${f.knownFrom}` : ' · **new**'}\n  > ${f.evidence.replace(/\n/g, ' ').slice(0, 300)}\n`
        + `  ${f.postUrl ? `post: ${f.postUrl}` : ''}${f.announcementUrl ? ` · announcement: ${f.announcementUrl}` : ''}`
        + `${f.alsoSeenIn.length ? ` · also: ${f.alsoSeenIn.join(', ')}` : ''}`).join('\n') || '_none_';
    return `# Social pilot report — ${date}\n\n`
        + `Posts: ${m.postsSeen} stored, ${m.postsInWindow} in window (${Object.entries(m.byPlatform).map(([k, v]) => `${k} ${v}`).join(', ')})\n\n`
        + `Qualifying developments: **${m.qualifying}** — ${m.verified} verified, ${m.postOnly} post-only, ${m.leads} leads · `
        + `${m.duplicatesCollapsed} duplicate posts collapsed\n\n`
        + `Already known: ${m.knownFromScanner} from the scanner, ${m.knownFromFeed} from the newsletter feed · **new: ${m.newDevelopments}**\n\n`
        + `## Verified (linked announcement on the account's own domain)\n${rows('verified')}\n\n`
        + `## Post-only (needs a person to check — never published)\n${rows('post-only')}\n\n`
        + `## Facebook leads (no post link or date available)\n${rows('lead')}\n`;
}

async function evaluate(): Promise<void> {
    const accounts = loadAccounts();
    const { loadCapitalMarketsRuntime } = require(path.join(REPO, 'src', 'server', 'capital-markets-runtime.cjs'));
    const { CM } = await loadCapitalMarketsRuntime({ repoRoot: REPO, docsDir: path.join(REPO, 'docs') });
    const lookbackDays = Number(process.env.SOCIAL_LOOKBACK_DAYS || 30);
    const { findings, metrics } = await evaluateSocialPosts({
        posts: readPosts(), accounts, classifier: CM, fetcher: httpFetcher, lookbackDays,
        scannerKnown: knownFromScanner(), feedKnown: knownFromFeed(CM),
    });
    const date = new Date().toISOString().slice(0, 10);
    fs.mkdirSync(path.join(DIR, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(DIR, 'reports', `${date}.json`), JSON.stringify({ date, lookbackDays, metrics, findings }, null, 2));
    fs.writeFileSync(path.join(DIR, 'reports', `${date}.md`), markdown(findings, metrics, date));

    // Ledger: the first day each development was seen, so the 30-day pilot can count
    // genuinely new developments rather than re-counting the same post every run.
    const ledgerPath = path.join(DIR, 'ledger.json');
    const ledger: Record<string, any> = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
    for (const f of findings) {
        const fig = f.squareFeet ?? f.priceUsd ?? 'none';
        const k = f.announcementUrl || `${f.section}|${f.tier}|${fig}|${f.postUrl || f.account}`;
        if (!ledger[k]) ledger[k] = { firstSeen: date, status: f.status, section: f.section, knownFrom: f.knownFrom, platform: f.platform };
        else if (f.status === 'verified') ledger[k].status = 'verified';
    }
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    console.log(markdown(findings, metrics, date).split('\n').slice(0, 6).join('\n'));
    console.log(`Report: ${path.join(DIR, 'reports', `${date}.md`)}`);
    void magnitudeUnit;
}

function status(): void {
    const ledgerPath = path.join(DIR, 'ledger.json');
    const ledger: Record<string, any> = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {};
    const rows = Object.values(ledger);
    const days = [...new Set(rows.map(r => r.firstSeen))].sort();
    const count = (pred: (r: any) => boolean) => rows.filter(pred).length;
    console.log(`Pilot ledger: ${rows.length} developments over ${days.length} day(s) (${days[0] || '—'} → ${days[days.length - 1] || '—'})`);
    console.log(`  verified ${count(r => r.status === 'verified')} · post-only ${count(r => r.status === 'post-only')} · leads ${count(r => r.status === 'lead')}`);
    console.log(`  new (not in scanner or feed): ${count(r => !r.knownFrom)} · verified AND new: ${count(r => !r.knownFrom && r.status === 'verified')}`);
}

async function main(): Promise<void> {
    const problem = guardEnvironment(DIR, REPO);
    if (problem) { console.error(problem); process.exit(2); }
    fs.mkdirSync(DIR, { recursive: true });
    const cmd = process.argv[2];
    if (cmd === 'collect') await collect();
    else if (cmd === 'evaluate') await evaluate();
    else if (cmd === 'status') status();
    else { console.error('usage: social-pilot.ts collect | evaluate | status'); process.exit(2); }
}

if (process.argv[1] && /social-pilot\.ts$/.test(process.argv[1])) {
    main().catch(e => { console.error(String(e?.message || e)); process.exit(1); });
}
