/**
 * On-demand Capital Markets scanner.
 *
 * The preview re-filters articles the newsletter already collected, which is
 * why its sections are thin: a North Jersey construction completion that no
 * subscribed feed carried can never appear in it. This scanner goes to the
 * publishers directly, on request, and reports what qualifies under Jacob's
 * rules with the evidence and a link.
 *
 * Deliberately NOT a newsletter. It is separate from department delivery, it
 * never sends mail, and its sources are absent from src/feeds/feeds.json so the
 * department's candidate pool, ordering, dedup and ranking are untouched.
 *
 * Trust: a page is fetched only when its host matches a domain the source
 * itself declares. A Google News proxy can never be fetched, because its host
 * is news.google.com rather than the publisher's.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { extractCompetitorSourceEndpoints } from './capital-markets-competitor-sources.js';

const require_ = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Endpoint labels are not evidence. An investor-relations page is routinely
 *  labelled "newsroom" and carries dividends and earnings dates, never a
 *  groundbreaking — one watchlist REIT’s IR feed kept 0 of 10 articles for
 *  exactly this reason. */
const IR_PATH = /\b(investor|ir|shareholder|sec-filings|financial|earnings|dividend|stock|proxy)\b/i;

export interface ScanSource {
    name: string;
    homepage: string;
    domains: string[];
    markets?: string[];
}

export interface ScanConfig {
    version: number;
    defaults: { lookbackDays: number; maxArticlesPerSource: number; maxArticleFetches: number; timeoutMs: number };
    cooldowns: { refusedHours: number; transientHours: number };
    selection: { states: string[]; secondaryTypeMatches: string; maxSources: number };
}

export type SourceOutcome = 'ok' | 'refused' | 'transient' | 'cooling';

export interface SourceHealth {
    name: string;
    outcome: SourceOutcome;
    status: string;
    endpoints: number;
    articles: number;
    /** ISO time this source may be retried. Absent when it is healthy. */
    retryAfter?: string;
}

/** Which unit cmClassify's magnitude carries for a given section: dollars for
 *  a sale, square feet for a lease, availability or construction milestone. */
export function magnitudeUnit(section: string): 'usd' | 'sf' | null {
    if (section === 'sales') return 'usd';
    if (section === 'leases' || section === 'availabilities' || section === 'construction') return 'sf';
    return null;
}

export interface ScanHit {
    title: string;
    link: string;
    publishedAt: string;
    source: string;
    section: string;
    tier: string;
    /** Square feet, for a lease, availability or construction milestone. */
    squareFeet: number | null;
    /** Price in dollars, for a sale. Never the same field as squareFeet: the
     *  classifier returns one magnitude and only its section says which unit. */
    priceUsd: number | null;
    /** The text the classifier actually judged, so a reader can check it. */
    evidence: string;
    /** Where the square footage came from, when a page was fetched for it. */
    evidenceSource: 'feed' | 'article page';
    reason: string;
}

export interface ScanResult {
    version: 1;
    startedAt: string;
    completedAt: string;
    runtimeSeconds: number;
    lookbackDays: number;
    requests: number;
    sources: SourceHealth[];
    hits: ScanHit[];
    /** Hits not present in the previous scan, so a reader can see what is new. */
    newSinceLastScan: string[];
    counts: Record<string, number>;
    /** Repeated coverage of one development, collapsed into a single entry. */
    duplicatesCollapsed: number;
}

export function loadScanConfig(repoRoot = REPO_ROOT): ScanConfig {
    const p = path.join(repoRoot, 'config', 'capital-markets-scan-sources.json');
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8')) as ScanConfig;
    if (!cfg.selection || !Array.isArray(cfg.selection.states) || !cfg.selection.states.length) {
        throw new Error('scan config: selection.states is required');
    }
    return cfg;
}

/** Resolve sources from the watchlist at RUNTIME.
 *
 *  The config carries selection criteria and no names, so the company list
 *  lives in exactly one file. Copying names and domains into a second config
 *  is what the privacy guard exists to stop, and it caught this. */
export function resolveSources(docsDir: string, selection: ScanConfig['selection']): ScanSource[] {
    const p = path.join(docsDir, 'data', 'capital-markets-watchlist.json');
    const rows: Array<Record<string, string>> = JSON.parse(fs.readFileSync(p, 'utf8')).companies || [];
    const states = new Set(selection.states.map(x => x.toUpperCase()));
    const typeRx = new RegExp(selection.secondaryTypeMatches || '.', 'i');
    const out: ScanSource[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
        const domain = String(r['Website Domain'] || '').toLowerCase().replace(/^www\./, '').trim();
        if (!domain || seen.has(domain)) continue;
        if (!states.has(String(r['State / Country'] || '').trim().toUpperCase())) continue;
        if (!typeRx.test(String(r['Secondary Type'] || ''))) continue;
        seen.add(domain);
        out.push({ name: String(r['Company Name'] || domain), homepage: `https://${domain}/`, domains: [domain] });
        if (out.length >= (selection.maxSources || 25)) break;
    }
    return out;
}

/** Host must match a domain the SOURCE declares. A feed cannot vouch for a host
 *  it did not name, so a syndicated link elsewhere is never fetched. */
export function hostDeclared(url: string, domains: string[]): boolean {
    let host = '';
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return false; }
    return domains.some(d => {
        const dom = String(d || '').toLowerCase().replace(/^www\./, '').trim();
        return Boolean(dom) && (host === dom || host.endsWith('.' + dom));
    });
}

/** An access refusal is a decision by the publisher and waits longer than a
 *  blip. Neither is permanent: both are rechecked once the cooldown expires. */
export function classifyFailure(status: string): 'refused' | 'transient' {
    return /^(401|403|404|410|451)$/.test(status) ? 'refused' : 'transient';
}

export interface Fetcher { (url: string, timeoutMs: number): Promise<{ ok: boolean; body: string; status: string }> }

export const httpFetcher: Fetcher = async (url, timeoutMs) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: ac.signal, redirect: 'follow',
            headers: { 'user-agent': 'Mozilla/5.0 (compatible; WoodmontCapitalMarketsScan/1.0)' },
        });
        return { ok: res.ok, body: res.ok ? await res.text() : '', status: String(res.status) };
    } catch (e) {
        return { ok: false, body: '', status: (e as Error).name === 'AbortError' ? 'timeout' : 'error' };
    } finally { clearTimeout(timer); }
};

/** RSS or Atom items. Forgiving by design: a parse miss costs one article. */
export function parseFeedArticles(xml: string, limit: number): Array<{ title: string; link: string; date: string; body: string }> {
    const blocks = xml.split(/<item[\s>]/i).slice(1).concat(xml.split(/<entry[\s>]/i).slice(1));
    const pick = (b: string, tag: string) => {
        const m = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'i').exec(b);
        return m ? m[1].trim() : '';
    };
    const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const out = [];
    for (const b of blocks.slice(0, limit)) {
        const title = strip(pick(b, 'title'));
        let link = pick(b, 'link');
        if (!link) { const m = /<link[^>]*href="([^"]+)"/i.exec(b); link = m ? m[1] : ''; }
        if (!title) continue;
        out.push({
            title, link: strip(link),
            date: pick(b, 'pubDate') || pick(b, 'published') || pick(b, 'updated') || '',
            body: strip(pick(b, 'description') || pick(b, 'summary') || pick(b, 'content')),
        });
    }
    return out;
}

/** Article links from an HTML newsroom. Only 41% of reachable developer sites
 *  expose a feed, so without this the majority of sources yield nothing. */
export function parseNewsroomLinks(html: string, pageUrl: string, domains: string[], limit = 15): Array<{ title: string; link: string }> {
    const out: Array<{ title: string; link: string }> = [];
    const seen = new Set<string>();
    for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
        if (out.length >= limit) break;
        let url: string;
        try { url = new URL(m[1], pageUrl).toString(); } catch { continue; }
        if (!hostDeclared(url, domains)) continue;
        const title = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        // A headline, not "Read more" or a nav label.
        if (title.length < 25 || title.length > 180) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({ title, link: url });
    }
    return out;
}

/** Visible text from an article page, for evidence and square footage.
 *
 *  Block-level tags become line breaks BEFORE every tag is stripped. A nav
 *  menu carries no terminal punctuation, so collapsing all tags to a space
 *  fused the entire menu onto the lead paragraph as one 1,049-character
 *  pseudo-sentence — and "the sentence containing the figure" was then the
 *  menu. Inline tags stay spaces, so a real sentence is never cut at a link. */
export function articleText(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<\/?(?:p|div|br|li|ul|ol|tr|td|th|h[1-6]|section|article|header|footer|nav|aside|blockquote|figcaption|option)\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/[^\S\n]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
}

/** The sentence carrying the verified figure, so a reader can check it.
 *
 *  Article text opens with navigation and cookie banners, so the first 300
 *  characters were quoting menus rather than the fact. Segment on block
 *  boundaries as well as sentence punctuation, then narrow any segment that is
 *  still too long to be a sentence down to the clause around the figure. */
export function evidenceSentence(text: string, magnitude: number | null | undefined): string | null {
    const body = String(text || '');
    if (!body) return null;
    const segments = body.split(/\n+|(?<=[.!?])\s+/).map(x => x.trim()).filter(x => x.length > 40);

    // A segment over ~320 characters is a fused block, not a sentence. Walk out
    // from the figure to the nearest sentence boundary instead of quoting it all.
    const narrow = (segment: string, needle: string | null): string => {
        if (segment.length <= 320 || !needle) return segment.slice(0, 300);
        const at = segment.indexOf(needle);
        if (at < 0) return segment.slice(0, 300);
        const before = segment.slice(0, at);
        const cut = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
        const start = cut >= 0 ? cut + 2 : Math.max(0, at - 160);
        const after = segment.slice(at).search(/[.!?](?:\s|$)/);
        const end = after >= 0 ? at + after + 1 : Math.min(segment.length, at + 220);
        return segment.slice(start, end).trim();
    };

    if (magnitude) {
        for (const form of [Number(magnitude).toLocaleString('en-US'), String(magnitude)]) {
            const hit = segments.find(x => x.includes(form));
            if (hit) return narrow(hit, form);
        }
    }
    const rx = /\d[\d,.]*\s*(?:square[- ]f[eo]{2}t|sq\.?\s*ft|sf\b)|\$\s?\d/i;
    const figure = segments.find(x => rx.test(x));
    return figure ? narrow(figure, (figure.match(rx) || [null])[0]) : null;
}

/** A published date from common meta tags, so an HTML article can be dated. */
export function articleDate(html: string): string {
    const patterns = [
        /<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i,
        /<meta[^>]+name="date"[^>]+content="([^"]+)"/i,
        /<time[^>]+datetime="([^"]+)"/i,
    ];
    for (const rx of patterns) {
        const m = rx.exec(html);
        if (m) { const t = Date.parse(m[1]); if (Number.isFinite(t)) return new Date(t).toISOString(); }
    }
    return '';
}

interface ScanState { sources: Record<string, { outcome: SourceOutcome; retryAfter?: string }>; lastHits: string[]; }

function loadState(docsDir: string): ScanState {
    try {
        const p = path.join(docsDir, 'data', 'capital-markets-scan-state.json');
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch { /* fall through to empty */ }
    return { sources: {}, lastHits: [] };
}

function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, file);
}

export interface RunScanOptions {
    repoRoot?: string;
    docsDir?: string;
    lookbackDays?: number;
    fetcher?: Fetcher;
    /** Skip persistence — used by tests. */
    write?: boolean;
    now?: Date;
}

export async function runCapitalMarketsScan(options: RunScanOptions = {}): Promise<ScanResult> {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const docsDir = options.docsDir || process.env.WOODMONT_DOCS_DIR || path.join(repoRoot, 'docs');
    const cfg = loadScanConfig(repoRoot);
    const fetcher = options.fetcher || httpFetcher;
    const now = options.now || new Date();
    const lookbackDays = options.lookbackDays || cfg.defaults.lookbackDays;
    const cutoff = now.getTime() - lookbackDays * 86400000;
    const started = Date.now();

    const { loadCapitalMarketsRuntime } = require_(path.join(repoRoot, 'src', 'server', 'capital-markets-runtime.cjs'));
    const { CM } = await loadCapitalMarketsRuntime({ repoRoot, docsDir });

    const state = loadState(docsDir);
    const health: SourceHealth[] = [];
    const hits: ScanHit[] = [];
    let requests = 0;
    let articleFetches = 0;

    const sources = resolveSources(docsDir, cfg.selection);
    for (const source of sources) {
        const prior = state.sources[source.name];
        if (prior?.retryAfter && Date.parse(prior.retryAfter) > now.getTime()) {
            health.push({ name: source.name, outcome: 'cooling', status: prior.outcome,
                endpoints: 0, articles: 0, retryAfter: prior.retryAfter });
            continue;
        }

        requests++;
        const home = await fetcher(source.homepage, cfg.defaults.timeoutMs);
        if (!home.ok) {
            const kind = classifyFailure(home.status);
            const hours = kind === 'refused' ? cfg.cooldowns.refusedHours : cfg.cooldowns.transientHours;
            const retryAfter = new Date(now.getTime() + hours * 3600000).toISOString();
            state.sources[source.name] = { outcome: kind, retryAfter };
            health.push({ name: source.name, outcome: kind, status: home.status, endpoints: 0, articles: 0, retryAfter });
            continue;
        }

        let endpoints: Array<{ url: string }> = [];
        try { endpoints = extractCompetitorSourceEndpoints(home.body, source.homepage, 0, 6); } catch { /* oversize page */ }
        const usable = endpoints.filter(e => !IR_PATH.test(e.url) && hostDeclared(e.url, source.domains));

        const candidates: Array<{ title: string; link: string; date: string; body: string }> = [];
        for (const ep of usable.slice(0, 3)) {
            requests++;
            const page = await fetcher(ep.url, cfg.defaults.timeoutMs);
            if (!page.ok) continue;
            const feedItems = parseFeedArticles(page.body, cfg.defaults.maxArticlesPerSource);
            if (feedItems.length) { candidates.push(...feedItems); continue; }
            // No feed: treat it as an HTML newsroom and follow its article links.
            for (const link of parseNewsroomLinks(page.body, ep.url, source.domains)) {
                if (articleFetches >= cfg.defaults.maxArticleFetches) break;
                articleFetches++; requests++;
                const art = await fetcher(link.link, cfg.defaults.timeoutMs);
                if (!art.ok) continue;
                candidates.push({ title: link.title, link: link.link, date: articleDate(art.body), body: articleText(art.body).slice(0, 1200) });
            }
        }

        let kept = 0;
        for (const c of candidates) {
            const when = Date.parse(c.date);
            if (!Number.isFinite(when) || when < cutoff) continue;
            // A future date is a parsing artefact or a scheduled post, not a
            // development that has happened. One day of slack absorbs timezone
            // skew without admitting next month's press release.
            if (when > now.getTime() + 86400000) continue;
            let body = c.body;
            let evidenceSource: ScanHit['evidenceSource'] = 'feed';
            let verdict = CM.cmClassify({ title: c.title, description: body, summary: '' });
            // Fetch the page when the feed summary is missing the figure that
            // decides the item. Gating this on verdict.section was backwards:
            // an item REJECTED as MISSING_SF or MISSING_PRICE has no section at
            // all, and those are precisely the ones whose figure is on the page.
            // The classifier then re-runs unchanged — the page supplies evidence,
            // never a verdict.
            const missingFact = verdict.code === 'MISSING_SF' || verdict.code === 'MISSING_PRICE';
            if ((missingFact || (verdict.section && !verdict.magnitude))
                && articleFetches < cfg.defaults.maxArticleFetches
                && c.link && hostDeclared(c.link, source.domains)) {
                articleFetches++; requests++;
                const art = await fetcher(c.link, cfg.defaults.timeoutMs);
                if (art.ok) {
                    const full = articleText(art.body).slice(0, 4000);
                    const better = CM.cmClassify({ title: c.title, description: full, summary: '' });
                    if (better.section) { verdict = better; body = full; evidenceSource = 'article page'; }
                }
            }
            if (!verdict.section) continue;
            kept++;
            hits.push({
                title: c.title, link: c.link, publishedAt: new Date(when).toISOString(),
                source: source.name, section: verdict.section, tier: String(verdict.tier),
                squareFeet: magnitudeUnit(verdict.section) === 'sf' ? (verdict.magnitude ?? null) : null,
                priceUsd: magnitudeUnit(verdict.section) === 'usd' ? (verdict.magnitude ?? null) : null,
                evidence: evidenceSentence(body, verdict.magnitude) || body.slice(0, 240),
                evidenceSource, reason: String(verdict.reason),
            });
        }
        state.sources[source.name] = { outcome: 'ok' };
        health.push({ name: source.name, outcome: 'ok', status: '200', endpoints: usable.length, articles: candidates.length });
        void kept;
    }

    // Collapse repeated coverage: the same development can arrive from several
    // endpoints of one source, or from two companies announcing a joint project.
    // Normalise the title — case, punctuation and any trailing publisher — and
    // keep the first, preferring one that already carries a verified figure.
    const storyKey = (h: ScanHit) => String(h.title)
        .replace(/ [-–—] [^-–—]{2,40}$/, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const byStory = new Map<string, ScanHit>();
    for (const h of hits) {
        const k = storyKey(h);
        const seen = byStory.get(k);
        if (!seen) { byStory.set(k, h); continue; }
        const seenFigure = seen.squareFeet ?? seen.priceUsd;
        const thisFigure = h.squareFeet ?? h.priceUsd;
        if (!seenFigure && thisFigure) byStory.set(k, h);
    }
    const deduplicated = [...byStory.values()];
    const duplicatesCollapsed = hits.length - deduplicated.length;
    hits.length = 0;
    hits.push(...deduplicated);

    const key = (h: ScanHit) => `${h.source}::${h.title}`;
    const previous = new Set(state.lastHits || []);
    const newSinceLastScan = hits.filter(h => !previous.has(key(h))).map(h => h.title);
    const counts: Record<string, number> = {};
    for (const h of hits) counts[h.section] = (counts[h.section] || 0) + 1;

    const completed = new Date();
    const result: ScanResult = {
        version: 1,
        startedAt: new Date(started).toISOString(),
        completedAt: completed.toISOString(),
        runtimeSeconds: Math.round((Date.now() - started) / 1000),
        lookbackDays, requests, sources: health, hits, newSinceLastScan, counts,
        duplicatesCollapsed,
    };

    if (options.write !== false) {
        writeJson(path.join(docsDir, 'data', 'capital-markets-scan.json'), result);
        writeJson(path.join(docsDir, 'data', 'capital-markets-scan-state.json'),
            { sources: state.sources, lastHits: hits.map(key) });
    }
    return result;
}
