/**
 * Deal-size corroboration for title-only Google News transaction items.
 *
 * Google News links are opaque (they never resolve to the publisher), so a
 * headline such as "World Electric Supply leases more than half of logistics
 * center in Lakeland, Florida - CoStar" reaches the send with no square footage
 * and fails the Transactions deal-size floor (2026-11-25: it shipped in Relevant
 * although the deal was a 274,040 SF lease).
 *
 * This module looks for OTHER coverage of the same deal on an approved fact
 * source whose public WordPress REST API serves the article text, verifies that
 * the article is the same deal, and extracts only the figure tied to the deal:
 *   - same deal:  the article names the headline's subject (tenant/buyer) AND its
 *                 place, describes the same kind of deal (lease vs sale), and was
 *                 published within 30 days before (or 2 days after) the headline
 *   - lease:      the LEASED space ("a 274,040-square-foot lease", "leased
 *                 274,040 square feet"), never the building/park that contains it
 *   - sale:       the price or size tied to the sale verb
 * Anything blocked, unmatched or ambiguous (two different tied figures) stays
 * unknown — the item is left exactly as it was.
 */
import type { NewsletterFacts } from '../shared/newsletter-facts.js';
import { approvedFactUrl } from '../shared/newsletter-facts.js';
import { hasNewsletterTargetRegion } from '../shared/newsletter-geography.js';

/** Approved fact sources that publish article text through a public WordPress REST API.
 *  (connectcre.com requires authentication for its API; bisnow/businesswire are not WordPress.) */
export const WORDPRESS_FACT_HOSTS = ['rebusinessonline.com'];

export type Fetcher = (url: string, signal: AbortSignal) => Promise<{ status: number; text: string }>;
export type CorroborationResult =
    | { facts: NewsletterFacts; reason: 'corroborated' }
    | { facts: null; reason: string };

const USER_AGENT = 'Woodmont-Industrial-News-Briefing/1.0 public-fact-verification';
const DEAL_VERBS = 'Leases|Leased|Signs|Inks|Lands|Takes|Acquires|Acquired|Buys|Bought|Sells|Sold|Purchases|Purchased|Closes|Arranges|Arranged|Completes|Expands|Opens|Renews|Secures|Pays|Nabs|Grabs|Commits';

export const defaultFetcher: Fetcher = async (url, signal) => {
    const host = new URL(url).hostname;
    if (host !== 'news.google.com' && !WORDPRESS_FACT_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
        throw Error('host not allowed');
    }
    const response = await fetch(url, { signal, redirect: 'error', headers: { 'User-Agent': USER_AGENT } });
    const text = (await response.text()).slice(0, 2_000_000);
    return { status: response.status, text };
};

const decode = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&#8217;|&#039;|&#39;|&rsquo;/g, "'")
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '-').replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;|&#038;/g, '&').replace(/\s+/g, ' ').trim();
const norm = (s: string) => decode(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function cleanHeadline(title: string): string {
    return decode(title).replace(/^news\s*\|\s*/i, '').replace(/\s+[-|]\s+[^-|]{2,60}$/, '').trim();
}

export function dealKind(text: string): 'lease' | 'sale' | null {
    if (/\b(?:leases?|leased|leasing|sublease[sd]?)\b/i.test(text)) return 'lease';
    if (/\b(?:acquires?|acquired|acquisition|buys?|bought|sells?|sold|sale|purchases?|purchased)\b/i.test(text)) return 'sale';
    return null;
}

/** Leading proper-noun run of the headline, stopped at the deal verb. */
export function dealSubject(headline: string): string | null {
    const words = headline.split(/\s+/);
    const out: string[] = [];
    for (const w of words) {
        if (new RegExp(`^(?:${DEAL_VERBS})$`, 'i').test(w) && out.length) break;
        if (/^[A-Z0-9][\w&.'’-]*$/.test(w) || (/^(?:&|of|and|the)$/i.test(w) && out.length)) out.push(w);
        else break;
    }
    while (out.length && /^(?:&|of|and|the)$/i.test(out[out.length - 1])) out.pop();
    const subject = out.join(' ').replace(/['’]s$/, '');
    return subject.length >= 4 && out.length <= 6 ? subject : null;
}

/** City named after "in" (e.g. "... in Lakeland, Florida" -> "Lakeland"). */
export function dealPlace(headline: string): string | null {
    const m = /\bin\s+([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2})/.exec(headline);
    if (!m) return null;
    const place = m[1].replace(/\s+(?:County|Florida|Pennsylvania|Jersey|New)$/, '').trim();
    return place.length >= 3 ? place : null;
}

const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?\s*million)`;
const SF_UNIT = String.raw`(?:[- ]square[- ]f(?:oo|ee)t|\s*-?SF\b|\s*sq\.?\s*ft\.?)`;
const toNumber = (raw: string) => /million/i.test(raw)
    ? Math.round(parseFloat(raw) * 1_000_000) : parseInt(raw.replace(/,/g, ''), 10);

/** Figures tied to the deal itself, with the sentence each came from. */
export function tiedFigures(text: string, kind: 'lease' | 'sale'): { sf: Map<number, string>; usd: Map<number, string> } {
    const sf = new Map<number, string>();
    const usd = new Map<number, string>();
    const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/);
    const patterns: RegExp[] = kind === 'lease'
        ? [
            new RegExp(NUM + SF_UNIT + String.raw`\s+(?:[a-z-]+\s+){0,3}(?:lease|sublease)\b`, 'gi'),
            new RegExp(String.raw`\b(?:leased|subleased|leasing|lease\s+(?:of|for|covering)|signed\s+(?:a\s+)?lease\s+for)\s+(?:approximately\s+|about\s+|nearly\s+|roughly\s+|more than\s+)?` + NUM + SF_UNIT, 'gi'),
        ]
        : [
            new RegExp(String.raw`\b(?:acquired|purchased|bought|sold|acquisition of|sale of|purchase of)\s+(?:a|an|the)?\s*(?:[\w-]+\s+){0,3}?` + NUM + SF_UNIT, 'gi'),
        ];
    for (const sentence of sentences) {
        for (const re of patterns) {
            for (const m of sentence.matchAll(re)) {
                const value = toNumber(m[1]);
                if (value >= 1000 && !sf.has(value)) sf.set(value, sentence);
            }
        }
        if (kind === 'sale') {
            const price = /\b(?:for|sold for|purchase price of|price of)\s+(?:approximately\s+|about\s+)?\$(\d+(?:\.\d+)?)\s*(million|billion)\b/i.exec(sentence);
            if (price && dealKind(sentence) === 'sale') {
                const value = Math.round(parseFloat(price[1]) * (price[2].toLowerCase() === 'billion' ? 1e9 : 1e6));
                if (!usd.has(value)) usd.set(value, sentence);
            }
        }
    }
    return { sf, usd };
}

type RssHit = { title: string; host: string; pubDate: string };
function parseRss(xml: string): RssHit[] {
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => ({
        title: decode((/<title>([\s\S]*?)<\/title>/.exec(m[1]) || [])[1] || ''),
        host: (() => { try { return new URL((/<source url="([^"]+)"/.exec(m[1]) || [])[1] || '').hostname; } catch { return ''; } })(),
        pubDate: (/<pubDate>(.*?)<\/pubDate>/.exec(m[1]) || [])[1] || '',
    }));
}

/** Parse the headline without any network use; null reason means it can be looked up. */
export function corroborationTarget(title: string):
    { kind: 'lease' | 'sale'; subject: string; place: string } | { reason: string } {
    const headline = cleanHeadline(title);
    const kind = dealKind(headline);
    const subject = dealSubject(headline);
    const place = dealPlace(headline);
    if (!kind) return { reason: 'no-deal-kind' };
    if (!subject || !place) return { reason: 'no-subject-or-place' };
    return { kind, subject, place };
}

export async function corroborateDeal(
    item: { title?: string; pubDate?: string },
    opts: { now: Date; signal: AbortSignal; fetcher?: Fetcher },
): Promise<CorroborationResult> {
    const fetcher = opts.fetcher || defaultFetcher;
    const target = corroborationTarget(item.title || '');
    if ('reason' in target) return { facts: null, reason: target.reason };
    const { kind, subject, place } = target;
    const headlineTime = Date.parse(item.pubDate || '') || opts.now.getTime();

    const query = encodeURIComponent(`"${subject}" ${place}`);
    const rss = await fetcher(`https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`, opts.signal);
    if (rss.status !== 200) return { facts: null, reason: 'search-HTTP_' + rss.status };
    const hits = parseRss(rss.text).filter(h => WORDPRESS_FACT_HOSTS.some(w => h.host === w || h.host.endsWith('.' + w)))
        .filter(h => {
            const t = Date.parse(h.pubDate);
            return Number.isFinite(t) && t >= headlineTime - 30 * 86400000 && t <= headlineTime + 2 * 86400000;
        }).slice(0, 2);
    if (!hits.length) return { facts: null, reason: 'no-approved-coverage' };

    let sawArticle = false;
    for (const hit of hits) {
        const wanted = cleanHeadline(hit.title);
        // WordPress search fails on "Cushman & Wakefield"-style pairs (live check
        // 2026-11-25), so search without "X & Y" names first, then the full title.
        const queries = [...new Set([wanted.replace(/\S+\s*&\s*\S+\s*/g, '').trim(), wanted])].filter(q => q.length >= 12);
        let post: any = null;
        for (const q of queries) {
            const api = `https://${hit.host}/wp-json/wp/v2/posts?search=${encodeURIComponent(q)}&per_page=3&_fields=date_gmt,link,title,content`;
            const res = await fetcher(api, opts.signal);
            if (res.status !== 200) break;
            let posts: any[] = [];
            try { posts = JSON.parse(res.text); } catch { break; }
            post = Array.isArray(posts) ? posts.find(p => norm(p?.title?.rendered || '') === norm(wanted)) : null;
            if (post) break;
        }
        if (!post || !approvedFactUrl(post.link || '')) continue;
        sawArticle = true;
        const body = decode(post.content?.rendered || '');
        const bodyNorm = norm(body);
        // Same deal: subject, place and deal kind all present in the corroborating article.
        if (!bodyNorm.includes(norm(subject)) || !bodyNorm.includes(norm(place))) continue;
        if (dealKind(body) !== kind) continue;
        const published = Date.parse((post.date_gmt || '') + 'Z');
        if (Number.isFinite(published) && published > opts.now.getTime()) continue;

        const { sf, usd } = tiedFigures(body, kind);
        // Ambiguous: two different tied figures -> leave unknown rather than guess.
        if (sf.size > 1 || usd.size > 1) return { facts: null, reason: 'ambiguous-figures' };
        if (!sf.size && !usd.size) return { facts: null, reason: 'no-tied-figure' };
        const [sfValue, sfSentence] = [...sf.entries()][0] || [null, null];
        const [usdValue, usdSentence] = [...usd.entries()][0] || [null, null];
        const evidence = [...new Set([sfSentence, usdSentence].filter((s): s is string => !!s))]
            .map(s => s.slice(0, 1000));
        const located = evidence.find(s => hasNewsletterTargetRegion(s))
            || null;
        return {
            reason: 'corroborated',
            facts: {
                version: 1,
                sourceUrl: post.link,
                checkedAt: opts.now.toISOString(),
                evidence,
                squareFeet: sfValue,
                priceUsd: usdValue,
                propertyLocationEvidence: located,
                corroboration: {
                    headline: decode(post.title.rendered),
                    publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
                    matchedOn: { subject, place, kind },
                },
            },
        };
    }
    return { facts: null, reason: sawArticle ? 'deal-not-verified' : 'article-not-found' };
}
