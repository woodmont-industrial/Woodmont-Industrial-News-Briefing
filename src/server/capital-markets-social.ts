/**
 * Social-source pilot for the Capital Markets scanner (2026-10-21).
 *
 * Developers, brokerages and municipalities sometimes announce groundbreakings,
 * completions, leases and available space on X, Instagram or Facebook before (or
 * instead of) a press release. This module evaluates posts a LOCAL collector
 * gathered (scripts/social-pilot.ts) under Jacob's existing rules:
 *
 *   - A post is VERIFIED only when it links to an announcement on a domain the
 *     account declares (its own website), that page is fetched through the
 *     scanner's approved-domain fetcher, and the classifier qualifies the PAGE.
 *     A social URL is never itself an approved publisher domain.
 *   - A post whose own text qualifies but has no verifiable link is POST-ONLY:
 *     reported for a person to check, never published.
 *   - Facebook's reader exposes no post link or date, so a qualifying Facebook
 *     post is only ever a LEAD.
 *   - One development counts once: posts are collapsed with each other and
 *     matched against the scanner's own hits and the newsletter feed.
 *
 * Nothing here writes to the repository, the website or any public artifact.
 * The account list, raw posts and reports live in a private directory outside
 * the repo (see scripts/social-pilot.ts).
 */
import { articleText, evidenceSentence, hostDeclared, magnitudeUnit, Fetcher } from './capital-markets-scan.js';

export type SocialPlatform = 'x' | 'instagram' | 'facebook';

export interface SocialAccount {
    platform: SocialPlatform;
    /** X / Instagram username, or the Facebook page's display name as its feed shows it. */
    handle: string;
    /** The account owner's own website domains. Only these can verify a post. */
    domains: string[];
    kind?: 'developer' | 'brokerage' | 'municipal' | 'other';
}

export interface SocialPost {
    platform: SocialPlatform;
    account: string;
    id: string;
    /** Permalink to the post. Null when the reader exposes none (Facebook). */
    url: string | null;
    /** ISO time. Null when the reader exposes none (Facebook). */
    postedAt: string | null;
    text: string;
    /** Expanded links found in the post. */
    links: string[];
    collectedAt: string;
}

export type FindingStatus = 'verified' | 'post-only' | 'lead';

export interface SocialFinding {
    status: FindingStatus;
    platform: SocialPlatform;
    account: string;
    postUrl: string | null;
    postedAt: string | null;
    section: string;
    tier: string;
    squareFeet: number | null;
    priceUsd: number | null;
    /** The sentence that states the figure, from the page when verified. */
    evidence: string;
    evidenceSource: 'linked announcement' | 'post text';
    announcementUrl: string | null;
    reason: string;
    /** Where this development was ALREADY known from, or null when the post is new. */
    knownFrom: 'scanner' | 'newsletter feed' | null;
    /** Other posts collapsed into this one (same development). */
    alsoSeenIn: string[];
}

export interface SocialMetrics {
    postsSeen: number;
    postsInWindow: number;
    byPlatform: Record<string, number>;
    qualifying: number;
    verified: number;
    postOnly: number;
    leads: number;
    duplicatesCollapsed: number;
    knownFromScanner: number;
    knownFromFeed: number;
    /** Qualifying developments not already known to the scanner or the newsletter feed. */
    newDevelopments: number;
}

export interface Classifier {
    cmClassify(a: { title: string; description: string; summary: string }): {
        section: string | null; tier: string; code: string | null; magnitude: number | null; reason: string;
    };
}

/** Link shorteners a post may use. Only the FIRST hop is allowed through one, and
 *  only to read its Location header; the destination must be a declared domain. */
export const SHORTENER_HOSTS = ['t.co', 'bit.ly', 'ow.ly', 'buff.ly', 'lnkd.in', 'tinyurl.com', 'fb.me',
    'l.facebook.com', 'l.instagram.com', 'instagr.am'];

const hostOf = (url: string): string => {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

/** A shortener's single redirect, read with redirect:'manual' so its destination
 *  is never requested here. The caller then fetches it through the approved fetcher. */
export type ShortLinkResolver = (url: string) => Promise<string | null>;
export const manualShortLinkResolver: ShortLinkResolver = async url => {
    try {
        const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000),
            headers: { 'user-agent': 'Mozilla/5.0 (compatible; WoodmontCapitalMarketsScan/1.0)' } });
        const location = res.headers.get('location');
        return location ? new URL(location, url).toString() : null;
    } catch { return null; }
};

/** Resolve a post link to a URL on one of the account's declared domains, or null. */
export async function declaredAnnouncementUrl(link: string, domains: string[], resolveShort: ShortLinkResolver): Promise<string | null> {
    if (hostDeclared(link, domains)) return link;
    if (!SHORTENER_HOSTS.includes(hostOf(link))) return null;
    const target = await resolveShort(link);
    return target && hostDeclared(target, domains) ? target : null;
}

/** The classifier takes a title and a description; a post has only text. Its first
 *  sentence (or line) plays the title, capped so a long caption can't pose as one. */
export function postTitle(text: string): string {
    const first = text.split(/\n/)[0].split(/(?<=[.!?])\s/)[0];
    return first.slice(0, 180).trim();
}

const developmentKey = (section: string, tier: string, figure: number | null, url: string | null): string =>
    url ? `url:${url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()}` : `fact:${section}|${tier}|${figure ?? 'none'}`;

export interface KnownDevelopment {
    link?: string;
    section: string;
    figure: number | null;
}

export interface EvaluateOptions {
    posts: SocialPost[];
    accounts: SocialAccount[];
    classifier: Classifier;
    fetcher: Fetcher;
    resolveShort?: ShortLinkResolver;
    now?: Date;
    lookbackDays?: number;
    maxPageFetches?: number;
    /** Developments the scanner already found. */
    scannerKnown?: KnownDevelopment[];
    /** Developments already in the newsletter feed. */
    feedKnown?: KnownDevelopment[];
}

export async function evaluateSocialPosts(options: EvaluateOptions): Promise<{ findings: SocialFinding[]; metrics: SocialMetrics }> {
    const now = options.now || new Date();
    const lookbackDays = options.lookbackDays || 30;
    const cutoff = now.getTime() - lookbackDays * 86400000;
    const resolveShort = options.resolveShort || manualShortLinkResolver;
    const maxPageFetches = options.maxPageFetches ?? 40;
    const accounts = new Map(options.accounts.map(a => [`${a.platform}:${a.handle.toLowerCase()}`, a]));

    const metrics: SocialMetrics = {
        postsSeen: options.posts.length, postsInWindow: 0, byPlatform: {}, qualifying: 0, verified: 0,
        postOnly: 0, leads: 0, duplicatesCollapsed: 0, knownFromScanner: 0, knownFromFeed: 0, newDevelopments: 0,
    };
    const byKey = new Map<string, SocialFinding>();
    let pageFetches = 0;

    for (const post of options.posts) {
        metrics.byPlatform[post.platform] = (metrics.byPlatform[post.platform] || 0) + 1;
        const account = accounts.get(`${post.platform}:${post.account.toLowerCase()}`);
        if (!account) continue;                                   // only configured accounts count
        if (post.postedAt) {
            const when = Date.parse(post.postedAt);
            if (!Number.isFinite(when) || when < cutoff || when > now.getTime()) continue;
        } else if (post.platform !== 'facebook') {
            continue;                                             // X / Instagram always carry a date
        }
        metrics.postsInWindow++;

        const title = postTitle(post.text);
        let verdict = options.classifier.cmClassify({ title, description: post.text, summary: '' });
        let status: FindingStatus = post.platform === 'facebook' ? 'lead' : 'post-only';
        let evidenceBody = post.text;
        let evidenceSource: SocialFinding['evidenceSource'] = 'post text';
        let announcementUrl: string | null = null;

        // Verify through a linked announcement on the account's OWN domain. The page
        // supplies evidence and a verdict; the post's own claim never stands in for it.
        if (post.platform !== 'facebook' && account.domains.length) {
            for (const link of post.links) {
                if (pageFetches >= maxPageFetches) break;
                const target = await declaredAnnouncementUrl(link, account.domains, resolveShort);
                if (!target) continue;
                pageFetches++;
                const page = await options.fetcher(target, 20000, account.domains);
                if (!page.ok) continue;
                const body = articleText(page.body).slice(0, 4000);
                const pageVerdict = options.classifier.cmClassify({ title, description: body, summary: '' });
                if (!pageVerdict.section) continue;
                verdict = pageVerdict; evidenceBody = body; evidenceSource = 'linked announcement';
                announcementUrl = page.finalUrl || target; status = 'verified';
                break;
            }
        }
        if (!verdict.section) continue;

        const amount = Number(verdict.magnitude);
        const figure = Number.isFinite(amount) && amount > 0 ? amount : null;
        const unit = magnitudeUnit(verdict.section);
        const finding: SocialFinding = {
            status, platform: post.platform, account: post.account, postUrl: post.url, postedAt: post.postedAt,
            section: verdict.section, tier: String(verdict.tier),
            squareFeet: unit === 'sf' ? figure : null, priceUsd: unit === 'usd' ? figure : null,
            evidence: evidenceSentence(evidenceBody, figure) || evidenceBody.slice(0, 240),
            evidenceSource, announcementUrl, reason: String(verdict.reason), knownFrom: null, alsoSeenIn: [],
        };

        // One development, counted once: the same announcement URL, or the same
        // section, tier and figure. Prefer a verified copy over a post-only one.
        const key = developmentKey(finding.section, finding.tier, figure, announcementUrl);
        const factKey = developmentKey(finding.section, finding.tier, figure, null);
        const existing = byKey.get(key) || (figure !== null ? byKey.get(factKey) : undefined);
        if (existing) {
            metrics.duplicatesCollapsed++;
            const rank = (s: FindingStatus) => (s === 'verified' ? 2 : s === 'post-only' ? 1 : 0);
            if (rank(finding.status) > rank(existing.status)) {
                finding.alsoSeenIn = [...existing.alsoSeenIn, existing.postUrl || `${existing.platform}:${existing.account}`];
                for (const [k, v] of byKey) if (v === existing) byKey.set(k, finding);
                byKey.set(key, finding);
                if (figure !== null) byKey.set(factKey, finding);
            } else {
                existing.alsoSeenIn.push(finding.postUrl || `${finding.platform}:${finding.account}`);
            }
            continue;
        }
        byKey.set(key, finding);
        if (figure !== null) byKey.set(factKey, finding);
    }

    const findings = [...new Set(byKey.values())];
    const sameDevelopment = (f: SocialFinding, k: KnownDevelopment): boolean => {
        const figure = f.squareFeet ?? f.priceUsd;
        if (k.link && f.announcementUrl && developmentKey('', '', null, k.link) === developmentKey('', '', null, f.announcementUrl)) return true;
        return figure !== null && k.figure === figure && k.section === f.section;
    };
    for (const f of findings) {
        if ((options.scannerKnown || []).some(k => sameDevelopment(f, k))) f.knownFrom = 'scanner';
        else if ((options.feedKnown || []).some(k => sameDevelopment(f, k))) f.knownFrom = 'newsletter feed';
        metrics.qualifying++;
        if (f.status === 'verified') metrics.verified++;
        else if (f.status === 'post-only') metrics.postOnly++;
        else metrics.leads++;
        if (f.knownFrom === 'scanner') metrics.knownFromScanner++;
        else if (f.knownFrom === 'newsletter feed') metrics.knownFromFeed++;
        else metrics.newDevelopments++;
    }
    return { findings, metrics };
}

// ---------------------------------------------------------------------------
// Reader output -> SocialPost. Each reader is defensive: a record that lacks the
// fields this pilot needs is dropped rather than guessed at.
// ---------------------------------------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const isoOrNull = (v: unknown): string | null => {
    const t = typeof v === 'number' ? v * (v < 1e12 ? 1000 : 1) : Date.parse(str(v));
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** twitter-cli `user-posts --json` record. */
export function normalizeXRecord(rec: any, account: string, collectedAt: string): SocialPost | null {
    const id = str(rec?.id ?? rec?.id_str ?? rec?.rest_id);
    const text = str(rec?.full_text ?? rec?.text);
    const postedAt = isoOrNull(rec?.created_at ?? rec?.createdAt);
    if (!id || !text || !postedAt) return null;
    const urls: string[] = [];
    for (const u of [...(rec?.urls || []), ...(rec?.entities?.urls || [])]) {
        const expanded = typeof u === 'string' ? u : str(u?.expanded_url ?? u?.expandedUrl ?? u?.url);
        if (/^https?:\/\//i.test(expanded)) urls.push(expanded);
    }
    for (const m of text.matchAll(/https?:\/\/\S+/g)) urls.push(m[0].replace(/[).,]+$/, ''));
    return { platform: 'x', account, id, url: `https://x.com/${account}/status/${id}`, postedAt, text,
        links: [...new Set(urls)], collectedAt };
}

/** Pilot adapter `opencli woodmont-instagram posts -f json` record. */
export function normalizeInstagramRecord(rec: any, account: string, collectedAt: string): SocialPost | null {
    const code = str(rec?.code);
    const text = str(rec?.caption);
    const postedAt = isoOrNull(rec?.takenAt);
    if (!/^[A-Za-z0-9_-]+$/.test(code) || !text || !postedAt) return null;
    const links = [...text.matchAll(/https?:\/\/\S+/g)].map(m => m[0].replace(/[).,]+$/, ''));
    return { platform: 'instagram', account, id: code, url: `https://www.instagram.com/p/${code}/`, postedAt, text,
        links: [...new Set(links)], collectedAt };
}

/** `opencli facebook feed -f json` record: author and a text excerpt only. */
export function normalizeFacebookRecord(rec: any, collectedAt: string): SocialPost | null {
    const account = str(rec?.author).trim();
    const text = str(rec?.content).trim();
    if (!account || !text) return null;
    const id = `fb:${account}:${text.slice(0, 80)}`;
    return { platform: 'facebook', account, id, url: null, postedAt: null, text, links: [], collectedAt };
}
