import * as net from 'net';

type WatchlistRow = Record<string, string>;

export interface CompetitorSourceEndpoint {
    watchlistIndex: number;
    url: string;
    kind: 'feed' | 'newsroom';
}

export interface CompetitorSourceDiagnostics {
    enabled: boolean;
    companiesReceived: number;
    usableSites: number;
    sitesExamined: number;
    endpointsDiscovered: number;
    rejectedInputs: number;
    failedLoads: number;
    capped: boolean;
}

export interface CompetitorSourceDiscoveryOptions {
    enabled?: boolean;
    maxCompanies?: number;
    maxEndpointsPerCompany?: number;
    homepageLoader?: (url: string) => Promise<string | null>;
}

interface PlannedSite {
    watchlistIndex: number;
    homepage: string;
}

const FEED_TYPES = new Set([
    'application/rss+xml', 'application/atom+xml', 'application/feed+json'
]);
const NEWS_SIGNAL = /(?:^|[\s/_-])(news(?:room)?|press|media|insights?|announcements?|releases?)(?:$|[\s/_-])/i;

function attributes(tag: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
        result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    }
    return result;
}

function normalizeHomepageValue(value: string): string | null {
    const raw = String(value || '').trim();
    if (!raw || /[\r\n]/.test(raw)) return null;
    let url: URL;
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); }
    catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname.includes('.') || net.isIP(hostname)
        || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        return null;
    }
    url.protocol = 'https:';
    url.hostname = hostname;
    url.port = '';
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
}

function normalizeHomepage(row: WatchlistRow): string | null {
    for (const value of [row.Website, row['Website Domain']]) {
        const homepage = normalizeHomepageValue(value);
        if (homepage) return homepage;
    }
    return null;
}

function relatedHostname(base: URL, candidate: URL): boolean {
    const baseHost = base.hostname.toLowerCase().replace(/^www\./, '');
    const candidateHost = candidate.hostname.toLowerCase().replace(/^www\./, '');
    return candidateHost === baseHost || candidateHost.endsWith(`.${baseHost}`);
}

function safeRelatedUrl(raw: string, homepage: string): string | null {
    try {
        const base = new URL(homepage);
        const candidate = new URL(raw, base);
        if (!['http:', 'https:'].includes(candidate.protocol) || candidate.username || candidate.password) return null;
        if (!relatedHostname(base, candidate)) return null;
        candidate.hash = '';
        return candidate.toString();
    } catch {
        return null;
    }
}

export function planCompetitorSites(rows: WatchlistRow[], maxCompanies = 25): {
    sites: PlannedSite[];
    rejectedInputs: number;
    capped: boolean;
} {
    const requestedLimit = Number.isFinite(maxCompanies) ? Math.floor(maxCompanies) : 25;
    const limit = Math.max(0, Math.min(100, requestedLimit));
    const seen = new Set<string>();
    const sites: PlannedSite[] = [];
    let rejectedInputs = 0;
    for (let index = 0; index < rows.length; index++) {
        const homepage = normalizeHomepage(rows[index]);
        if (!homepage) { rejectedInputs++; continue; }
        const hostname = new URL(homepage).hostname.replace(/^www\./, '');
        if (seen.has(hostname)) continue;
        seen.add(hostname);
        if (sites.length < limit) sites.push({ watchlistIndex: index, homepage });
    }
    return { sites, rejectedInputs, capped: seen.size > sites.length };
}

export function extractCompetitorSourceEndpoints(
    html: string,
    homepage: string,
    watchlistIndex: number,
    maxEndpoints = 6
): CompetitorSourceEndpoint[] {
    if (Buffer.byteLength(html, 'utf8') > 1_000_000) {
        throw new Error('Competitor homepage HTML exceeds the 1 MB parsing limit');
    }
    const requestedLimit = Number.isFinite(maxEndpoints) ? Math.floor(maxEndpoints) : 6;
    const limit = Math.max(1, Math.min(12, requestedLimit));
    const endpoints: CompetitorSourceEndpoint[] = [];
    const seen = new Set<string>();
    const add = (raw: string, kind: CompetitorSourceEndpoint['kind']) => {
        const url = safeRelatedUrl(raw, homepage);
        if (!url || seen.has(url) || endpoints.length >= limit) return;
        seen.add(url);
        endpoints.push({ watchlistIndex, url, kind });
    };

    for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
        const attrs = attributes(tag);
        const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
        const type = (attrs.type || '').toLowerCase().split(';')[0].trim();
        if (rel.includes('alternate') && attrs.href && (FEED_TYPES.has(type) || /rss|atom|feed/.test(type))) {
            add(attrs.href, 'feed');
        }
    }

    for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
        const attrs = attributes(`<a ${match[1]}>`);
        const label = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (attrs.href && NEWS_SIGNAL.test(`${attrs.href} ${label}`)) add(attrs.href, 'newsroom');
    }
    return endpoints;
}

/**
 * Phase-one discovery only. The function performs no network work unless a
 * caller deliberately sets enabled=true and injects a loader. It never writes,
 * logs, or serializes private watchlist data; returned URLs remain runtime-only.
 */
export async function discoverCompetitorSources(
    rows: WatchlistRow[],
    options: CompetitorSourceDiscoveryOptions = {}
): Promise<{ endpoints: CompetitorSourceEndpoint[]; diagnostics: CompetitorSourceDiagnostics }> {
    const enabled = options.enabled === true;
    const planned = planCompetitorSites(rows, options.maxCompanies ?? 25);
    const diagnostics: CompetitorSourceDiagnostics = {
        enabled,
        companiesReceived: rows.length,
        usableSites: planned.sites.length,
        sitesExamined: 0,
        endpointsDiscovered: 0,
        rejectedInputs: planned.rejectedInputs,
        failedLoads: 0,
        capped: planned.capped,
    };
    if (!enabled) return { endpoints: [], diagnostics };
    if (!options.homepageLoader) throw new Error('Competitor source discovery requires an explicit homepage loader');

    const endpoints: CompetitorSourceEndpoint[] = [];
    for (const site of planned.sites) {
        diagnostics.sitesExamined++;
        try {
            const html = await options.homepageLoader(site.homepage);
            if (!html) continue;
            endpoints.push(...extractCompetitorSourceEndpoints(
                html, site.homepage, site.watchlistIndex, options.maxEndpointsPerCompany ?? 6
            ));
        } catch {
            diagnostics.failedLoads++;
        }
    }
    diagnostics.endpointsDiscovered = endpoints.length;
    return { endpoints, diagnostics };
}
