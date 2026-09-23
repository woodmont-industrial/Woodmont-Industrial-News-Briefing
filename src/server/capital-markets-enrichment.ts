import { promises as dns } from 'dns';
import * as net from 'net';
import { NormalizedItem } from '../types/index.js';

export interface CapitalMarketsEnrichmentDiagnostics {
    enabled: boolean;
    candidates: number;
    attempted: number;
    metadataFound: number;
    promoted: number;
    failed: number;
}

interface EnrichmentOptions {
    asOfDate: string;
    lookbackHours: number;
    maxCandidates?: number;
    metadataLoader?: (url: string) => Promise<string | null>;
}

const ENRICH_REASONS = new Set(['MISSING_PRICE', 'MISSING_SF', 'UNMAPPED_GEO']);

function privateAddress(address: string): boolean {
    const family = net.isIP(address);
    if (family === 4) {
        const octets = address.split('.').map(Number);
        return octets[0] === 10
            || octets[0] === 127
            || (octets[0] === 169 && octets[1] === 254)
            || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
            || (octets[0] === 192 && octets[1] === 168)
            || octets[0] === 0;
    }
    if (family === 6) {
        const value = address.toLowerCase();
        return value === '::1' || value === '::' || value.startsWith('fc')
            || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9')
            || value.startsWith('fea') || value.startsWith('feb');
    }
    return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('non-http URL');
    if (url.username || url.password) throw new Error('credentialed URL');
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
        throw new Error('local hostname');
    }
    if (net.isIP(host) && privateAddress(host)) throw new Error('private IP');
    const addresses = await dns.lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(a => privateAddress(a.address))) throw new Error('private or unresolved host');
    return url;
}

function decodeEntities(value: string): string {
    const named: Record<string, string> = {
        amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' '
    };
    return value.replace(/&(#x?[0-9a-f]+|amp|quot|apos|lt|gt|nbsp);/gi, (_m, token: string) => {
        const lower = token.toLowerCase();
        if (lower[0] === '#') {
            const hex = lower[1] === 'x';
            const code = parseInt(lower.slice(hex ? 2 : 1), hex ? 16 : 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
        }
        return named[lower] || ' ';
    });
}

function metaDescription(html: string): string | null {
    const tags = html.match(/<meta\b[^>]*>/gi) || [];
    const wanted = new Set(['description', 'og:description', 'twitter:description']);
    for (const tag of tags) {
        const attrs: Record<string, string> = {};
        for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
            attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
        }
        const key = (attrs.name || attrs.property || '').toLowerCase();
        if (!wanted.has(key) || !attrs.content) continue;
        const clean = decodeEntities(attrs.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean.length >= 20) return clean.slice(0, 3000);
    }
    return null;
}

async function responseTextLimited(response: Response, maxBytes: number): Promise<string> {
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes) throw new Error('page exceeds byte limit');
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error('page exceeds byte limit');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
}

async function loadPublicMetadata(raw: string): Promise<string | null> {
    let url = await assertPublicUrl(raw);
    for (let redirect = 0; redirect <= 3; redirect++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 7000);
        let response: Response;
        try {
            response = await fetch(url, {
                redirect: 'manual', signal: controller.signal,
                headers: {
                    'User-Agent': 'Woodmont-Industrial-News-Briefing/1.0 metadata-enrichment',
                    'Accept': 'text/html,application/xhtml+xml;q=0.9'
                }
            });
        } finally {
            clearTimeout(timer);
        }
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location || redirect === 3) throw new Error('unsafe or excessive redirect');
            url = await assertPublicUrl(new URL(location, url).toString());
            continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
            throw new Error('non-HTML response');
        }
        return metaDescription(await responseTextLimited(response, 1_000_000));
    }
    return null;
}

function keyOf(article: NormalizedItem): string {
    return article.id || (article as any).url || article.link || article.title || '';
}

/**
 * Enrich only deal-shaped candidates that failed for missing price, missing SF
 * or unresolved geography. A fetched metadata description is accepted only if
 * reclassification promotes the article into a real section. Original feed
 * objects and feed.json are never mutated.
 */
export async function enrichCapitalMarketsCandidates(
    articles: NormalizedItem[],
    CM: any,
    options: EnrichmentOptions
): Promise<{ articles: NormalizedItem[]; diagnostics: CapitalMarketsEnrichmentDiagnostics }> {
    const diagnostics: CapitalMarketsEnrichmentDiagnostics = {
        enabled: true, candidates: 0, attempted: 0, metadataFound: 0, promoted: 0, failed: 0
    };
    const initial = CM.cmBuildSections(articles, options.asOfDate, options.lookbackHours);
    const candidates = initial.rejected.filter((item: any) => ENRICH_REASONS.has(item._cm?.code));
    diagnostics.candidates = candidates.length;
    const max = Math.max(0, Math.min(20, options.maxCandidates ?? 12));
    const loader = options.metadataLoader || loadPublicMetadata;
    const promoted = new Map<string, NormalizedItem>();

    for (const candidate of candidates.slice(0, max)) {
        const url = String((candidate as any).url || candidate.link || '');
        if (!url) continue;
        diagnostics.attempted++;
        try {
            const metadata = await loader(url);
            if (!metadata) continue;
            diagnostics.metadataFound++;
            const enriched = {
                ...candidate,
                description: `${candidate.description || ''} ${metadata}`.trim(),
                _cmEnrichment: { source: 'public-page-metadata', fetched: true },
            } as NormalizedItem;
            delete (enriched as any)._cm;
            const classification = CM.cmClassify(enriched);
            if (!classification.section) continue;
            promoted.set(keyOf(enriched), enriched);
            diagnostics.promoted++;
        } catch {
            diagnostics.failed++;
        }
    }

    return {
        articles: articles.map(article => promoted.get(keyOf(article)) || article),
        diagnostics,
    };
}
