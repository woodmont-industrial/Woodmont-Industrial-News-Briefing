import * as fs from 'node:fs';
import * as path from 'node:path';
import { promises as dns } from 'node:dns';
import * as net from 'node:net';
import { createHash } from 'node:crypto';
import type { NormalizedItem } from '../types/index.js';
import { summaryQuantities } from '../filter/summary-quantities.js';
import { approvedFactUrl, newsletterFactFields, type NewsletterFacts } from '../shared/newsletter-facts.js';
import { hasNewsletterTargetRegion } from '../shared/newsletter-geography.js';
import { newsletterCategory } from '../shared/development-signal.js';
import references from '../feeds/article-source-references.json' with { type: 'json' };

type FactArticle = NormalizedItem & { url?: string; _newsletterFacts?: NewsletterFacts };
type Page = { url: string; html: string };
type CacheEntry = { checkedAt: string; facts: NewsletterFacts | null };
type SourceReference = { articleId: string; sourceUrl: string; alternateUrls?: string[] };
const EXTRACTION_CACHE_VERSION = 'property-facts-v2';

interface FactRecoveryOptions {
    cachePath: string;
    now?: Date;
    maxPages?: number;
    budgetMs?: number;
    loader?: (url: string, signal: AbortSignal) => Promise<Page>;
    sourceReferences?: SourceReference[];
}

export interface FactRecoveryStats {
    inputArticles: number;
    eligible: number;
    alreadySupported: number;
    excluded: number;
    referenced: number;
    direct: number;
    unresolved: number;
    unresolvedReasons: { opaqueProxy: number; unapprovedDirect: number; missingUrl: number };
    budgetDeferred: number;
    attempted: number;
    httpRequests: number;
    cached: number;
    enriched: number;
    unavailable: number;
    noFacts: number;
    failures: Record<string, number>;
}

function plain(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"').replace(/&#(?:39|x27);/gi, "'").replace(/\s+/g, ' ').trim();
}

function topicWords(text: string): Set<string> {
    return new Set(text.toLowerCase()
        .replace(/\b(?:business wire|connect cre|the business journals)\b/g, '')
        .split(/[^a-z0-9]+/)
        .filter(word => word.length >= 3 && !/^(the|and|for|with|from|has|new|real|estate)$/.test(word)));
}

function newsContainer(html: string): string | undefined {
    const start = /<div\b[^>]*\bid=["']news["'][^>]*>/i.exec(html);
    if (!start) return;
    const rest = html.slice(start.index + start[0].length);
    let depth = 1;
    for (const tag of rest.matchAll(/<\/?div\b[^>]*>/gi)) {
        depth += /^<\//.test(tag[0]) ? -1 : 1;
        if (!depth) return rest.slice(0, tag.index);
    }
}

function isAggregateLeasing(paragraph: string): boolean {
    const explicitAggregate = /\b(?:total|overall|aggregate|combined)\s+(?:industrial\s+)?leasing\b/i.test(paragraph);
    const groupActivity = /\b(?:businesses|companies|tenants|industries)\s+(?:have\s+)?leased\b/i.test(paragraph);
    const marketContext = /\b(?:nationwide|nationally|market[- ]wide|across the country|quarter|year[- ]to[- ]date|year[- ]over[- ]year|between\s+Q[1-4])\b/i.test(paragraph);
    // Keep the actor and reporting period for this check. Slicing at "leased"
    // first would turn market-wide activity into an apparent property area.
    return explicitAggregate || (groupActivity && marketContext);
}

export function extractNewsletterFacts(
    html: string,
    article: NormalizedItem,
    sourceUrl: string,
    now: Date,
): NewsletterFacts | null {
    if (!approvedFactUrl(sourceUrl)) return null;
    const published = /["']datePublished["']\s*:\s*["']([^"']+)/i.exec(html)?.[1];
    if (published && Date.parse(published) > now.getTime()) return null;

    const title = plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || '');
    const wanted = topicWords(article.title || '');
    const actual = topicWords(title);
    const common = [...wanted].filter(word => actual.has(word)).length;
    if (common < 3 || common / Math.max(1, Math.min(wanted.size, actual.size)) < 0.5) return null;

    let body = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1]
        || newsContainer(html)
        || /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1];
    if (!body) return null;
    body = body.replace(/<(script|style|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    const paragraphs = body.replace(/<\/?(?:p|div|section|h[1-6]|li|br)\b[^>]*>/gi, '\n')
        .split(/\n+/).map(plain).filter(paragraph => paragraph.length > 35);
    const stop = paragraphs.findIndex(paragraph => /^About\s|^Contacts?\b|^\*.*assets under management/i.test(paragraph));
    const story = stop >= 0 ? paragraphs.slice(0, stop) : paragraphs;

    let primary = '';
    for (const paragraph of story) {
        if (!/\b(?:warehouse|industrial|distribution|logistics|portfolio)\b/i.test(paragraph)) continue;
        if (isAggregateLeasing(paragraph)) continue;
        const action = /\b(?:has acquired|acquired|purchased|sold|leased|closing of|closed|begins? construction|breaks? ground)\b/i.exec(paragraph);
        if (!action) continue;
        const text = paragraph.slice(action.index).split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
        if (summaryQuantities(text).length) {
            primary = text;
            break;
        }
    }
    if (!primary || primary.length > 1200) return null;

    const quantities = summaryQuantities(primary);
    const sizes = [...new Set(quantities.filter(quantity => quantity.unit === 'sf').map(quantity => quantity.value))];
    const prices = [...new Set(quantities.filter(quantity => quantity.unit === 'usd').map(quantity => quantity.value))];
    // Multiple areas may describe leased space and its container. Decline the
    // sentence rather than accidentally selecting the largest or first figure.
    if (sizes.length > 1 || prices.length > 1) return null;

    const market = story.map(paragraph => paragraph.split(/(?<=[.!?])\s+(?=[A-Z])/)[0])
        .find(paragraph => /\b(?:portfolio\s+(?:spans|includes)|properties\s+(?:are\s+)?(?:located\s+)?in)\b/i.test(paragraph)
            && hasNewsletterTargetRegion(paragraph));
    const assetLocation = /\b(?:portfolio|property|properties|warehouse|facility|building)\b.{0,100}\b(?:in|at|located in)\b/i.test(primary)
        && hasNewsletterTargetRegion(primary) ? primary : null;
    const evidence = [primary, ...(market && market !== primary ? [market] : [])];
    if (evidence.join(' ').split(/\s+/).length > 160) return null;

    return {
        version: 1,
        sourceUrl,
        checkedAt: now.toISOString(),
        evidence,
        squareFeet: sizes[0] ?? null,
        priceUsd: prices[0] ?? null,
        propertyLocationEvidence: market || assetLocation,
    };
}

function publicAddress(raw: string): boolean {
    if (net.isIP(raw) === 4) {
        const [first, second] = raw.split('.').map(Number);
        return first !== 0 && first !== 10 && first !== 127 && first !== 169
            && !(first === 172 && second >= 16 && second <= 31)
            && !(first === 192 && second === 168) && first < 224;
    }
    return net.isIP(raw) === 6 && !/^(?:::|fc|fd|fe[89ab])/i.test(raw);
}

export async function loadApprovedFactPage(
    raw: string,
    signal: AbortSignal,
    resolve: (host: string) => Promise<Array<{ address: string }>> = host => dns.lookup(host, { all: true }),
    onRequest: () => void = () => {},
): Promise<Page> {
    let url = raw;
    for (let redirects = 0; redirects <= 2; redirects++) {
        if (!approvedFactUrl(url)) throw Error('unapproved source or redirect');
        const addresses = await resolve(new URL(url).hostname);
        if (!addresses.length || addresses.some(address => !publicAddress(address.address))) throw Error('non-public address');
        onRequest();
        const response = await fetch(url, {
            redirect: 'manual',
            signal,
            headers: {
                'User-Agent': 'Woodmont-Industrial-News-Briefing/1.0 public-fact-verification',
                Accept: 'text/html',
            },
        });
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            await response.body?.cancel();
            if (!location || redirects === 2) throw Error('redirect limit');
            url = new URL(location, url).toString();
            continue;
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw Error('HTTP_' + response.status);
        }
        if (!response.headers.get('content-type')?.includes('text/html')
            || Number(response.headers.get('content-length')) > 1_000_000) {
            await response.body?.cancel();
            throw Error('invalid content');
        }
        const reader = response.body?.getReader();
        if (!reader) throw Error('empty page');
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const result = await reader.read();
                if (result.done) break;
                size += result.value.length;
                if (size > 1_000_000) throw Error('page byte limit');
                chunks.push(result.value);
            }
        } catch (error) {
            await reader.cancel();
            throw error;
        }
        return { url, html: Buffer.concat(chunks).toString('utf8') };
    }
    throw Error('redirect limit');
}

function failureReason(error: unknown): string {
    if (!(error instanceof Error)) return 'download-failed';
    if (/^HTTP_\d{3}$/.test(error.message)) return error.message;
    if (error.name === 'TimeoutError') return 'timeout';
    if (/private|non-public/.test(error.message)) return 'non-public-address';
    const code = (error as NodeJS.ErrnoException).code || '';
    return /^(EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT)$/.test(code) ? code : 'download-failed';
}

export async function enrichNewsletterFacts(
    items: FactArticle[],
    options: FactRecoveryOptions,
): Promise<FactRecoveryStats> {
    const now = options.now || new Date();
    const started = Date.now();
    const budget = Math.max(0, Math.min(45000, options.budgetMs ?? 45000));
    const maxPages = Math.max(0, Math.min(8, options.maxPages ?? 6));
    let cache: Record<string, CacheEntry> = {};
    try {
        if (fs.statSync(options.cachePath).size < 1_000_000) {
            cache = JSON.parse(fs.readFileSync(options.cachePath, 'utf8'));
        }
    } catch { /* A missing or invalid cache starts empty. */ }

    const reference = new Map((options.sourceReferences || references)
        .map(entry => [entry.articleId, [entry.sourceUrl, ...(entry.alternateUrls || [])]]));
    const stats: FactRecoveryStats = {
        inputArticles: items.length, eligible: 0, alreadySupported: 0, excluded: 0,
        referenced: 0, direct: 0, unresolved: 0, budgetDeferred: 0,
        attempted: 0, httpRequests: 0, cached: 0, enriched: 0, unavailable: 0,
        noFacts: 0, failures: {},
        unresolvedReasons: { opaqueProxy: 0, unapprovedDirect: 0, missingUrl: 0 },
    };
    const candidates = [...items].sort((left, right) =>
        Number(reference.has(right.id)) - Number(reference.has(left.id))
        || Date.parse(right.pubDate || '') - Date.parse(left.pubDate || ''));

    for (const item of candidates) {
        if (item.category === 'exclude' || item.category === 'people'
            || Date.parse(item.pubDate || '') > now.getTime()
            || !/\b(?:warehouse|industrial|distribution|logistics)\b/i.test(item.title || '')) {
            stats.excluded++;
            continue;
        }
        const quantities = summaryQuantities((item.title || '') + ' ' + (item.description || ''));
        const hasRequiredQuantity = item.category === 'availabilities'
            ? quantities.some(quantity => quantity.unit === 'sf')
            : quantities.some(quantity => quantity.unit === 'sf' || quantity.unit === 'usd');
        const hasReference = reference.has(item.id);
        if (!hasReference && hasRequiredQuantity && hasNewsletterTargetRegion(item.title || '')) {
            stats.alreadySupported++;
            continue;
        }

        stats.eligible++;
        const urls = (reference.get(item.id) || [item.link || item.url || ''])
            .slice(0, 3).filter(approvedFactUrl);
        if (!urls.length) {
            stats.unresolved++;
            const link = item.link || item.url || '';
            try {
                if (new URL(link).hostname === 'news.google.com') stats.unresolvedReasons.opaqueProxy++;
                else stats.unresolvedReasons.unapprovedDirect++;
            } catch { stats.unresolvedReasons.missingUrl++; }
            continue;
        }
        if (hasReference) stats.referenced++;
        else stats.direct++;

        let facts: NewsletterFacts | null = null;
        let deferred = false;
        for (const url of urls) {
            const key = createHash('sha256')
                .update(EXTRACTION_CACHE_VERSION + '\n' + url + '\n' + item.title).digest('hex');
            const prior = cache[key];
            const age = prior ? now.getTime() - Date.parse(prior.checkedAt) : Infinity;
            if (age >= 0 && age < (prior?.facts ? 7 * 86400000 : 86400000)) {
                stats.cached++;
                facts = prior.facts;
            } else {
                if (stats.attempted >= maxPages || Date.now() - started >= budget) {
                    deferred = true;
                    break;
                }
                stats.attempted++;
                const remaining = budget - (Date.now() - started);
                const signal = AbortSignal.timeout(Math.max(1, Math.min(10000, remaining)));
                try {
                    const page = options.loader
                        ? await options.loader(url, signal)
                        : await loadApprovedFactPage(url, signal, undefined, () => { stats.httpRequests++; });
                    if (!approvedFactUrl(page.url)) throw Error('unapproved final source');
                    // Stable public references need no company-name URL slug.
                    facts = extractNewsletterFacts(page.html, item, url, now);
                    if (!facts) stats.noFacts++;
                } catch (error) {
                    stats.unavailable++;
                    const reason = failureReason(error);
                    stats.failures[reason] = (stats.failures[reason] || 0) + 1;
                }
                cache[key] = { checkedAt: now.toISOString(), facts };
            }
            if (facts) break;
        }
        if (deferred && !facts) stats.budgetDeferred++;
        if (!facts || !newsletterFactFields({ _newsletterFacts: facts })._newsletterFacts) continue;

        const normalized = [
            facts.squareFeet !== null ? `${facts.squareFeet.toLocaleString('en-US')} SF` : null,
            facts.priceUsd !== null ? `$${facts.priceUsd.toLocaleString('en-US')}` : null,
        ].filter(Boolean).join('; ');
        // Refresh the suffix instead of accumulating excerpts every build.
        item.description = (item.description || '').split('\nVerified publisher facts:')[0]
            + '\nVerified publisher facts: ' + facts.evidence.join(' ')
            + (normalized ? ' [' + normalized + ']' : '');
        item._newsletterFacts = facts;
        item.category = newsletterCategory(item);
        stats.enriched++;
    }

    const bounded = Object.fromEntries(Object.entries(cache)
        .filter(([, entry]) => now.getTime() - Date.parse(entry.checkedAt) < 7 * 86400000)
        .sort((left, right) => Date.parse(right[1].checkedAt) - Date.parse(left[1].checkedAt))
        .slice(0, 200));
    fs.mkdirSync(path.dirname(options.cachePath), { recursive: true });
    fs.writeFileSync(options.cachePath, JSON.stringify(bounded));
    return stats;
}
