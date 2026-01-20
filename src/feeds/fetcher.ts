import Parser from 'rss-parser';
import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import * as xml2js from 'xml2js';
import { RSS_FEEDS, BROWSER_HEADERS } from './config.js';
import { classifyArticle } from '../filter/classifier.js';
import { itemStore, feedStats, fetchCache, manualArticles, pruneItemStore, archiveOldArticles } from '../store/storage.js';
import { FetchResult, FeedConfig, NormalizedItem, FeedStat, RawRSSItem, RSSLink, RSSEnclosure, RSSMediaContent } from '../types/index.js';

// ============================================
// BLOCKED FEED TRACKING (24-hour cooldown)
// ============================================
interface CircuitBreakerState {
    failureCount: number;
    blockedUntil: number;
    lastError?: string;
    last403Preview?: string; // Store 403 response preview for debugging
}

const circuitBreaker = new Map<string, CircuitBreakerState>();
const FETCH_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes
const BLOCKED_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours for blocked feeds
const MAX_FAILURES_BEFORE_BLOCK = 3;

// ============================================
// ENHANCED BROWSER HEADERS FOR BLOCKED FEEDS
// ============================================
const STEALTH_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1"
};

// Domains that commonly block automated requests
const BLOCKED_FEED_DOMAINS = [
    'connectcre.com',
    'bizjournals.com',
    'therealdeal.com',
    'freightwaves.com'
];

function needsStealthHeaders(url: string): boolean {
    return BLOCKED_FEED_DOMAINS.some(domain => url.includes(domain));
}

function getHeadersForFeed(feed: FeedConfig): Record<string, string> {
    // Priority: feed-specific headers > stealth headers for blocked domains > basic browser headers
    if (feed.headers) {
        return { ...STEALTH_BROWSER_HEADERS, ...feed.headers };
    }
    if (needsStealthHeaders(feed.url)) {
        // Add Referer for blocked domains
        return {
            ...STEALTH_BROWSER_HEADERS,
            "Referer": new URL(feed.url).origin + "/"
        };
    }
    return BROWSER_HEADERS;
}

// Check if a 403 response is a Cloudflare/WAF challenge
function isCloudflareChallenge(body: string): boolean {
    const indicators = [
        'cloudflare',
        'attention required',
        'checking your browser',
        'enable javascript',
        'bot detection',
        'captcha',
        'ray id',
        'cf-browser-verification',
        'challenge-platform'
    ];
    const lower = body.toLowerCase();
    return indicators.some(indicator => lower.includes(indicator));
}

// Mark a feed as blocked with extended cooldown
function markFeedBlocked(feedUrl: string, reason: string, preview?: string): void {
    const cb = circuitBreaker.get(feedUrl) || { failureCount: 0, blockedUntil: 0 };
    cb.failureCount = MAX_FAILURES_BEFORE_BLOCK;
    cb.blockedUntil = Date.now() + BLOCKED_COOLDOWN_MS;
    cb.lastError = reason;
    if (preview) {
        cb.last403Preview = preview.slice(0, 500);
    }
    circuitBreaker.set(feedUrl, cb);
    console.log(`🚫 [${feedUrl}] Blocked for 24 hours: ${reason}`);
}

// Get blocked feed status for health endpoint
export function getBlockedFeeds(): { url: string; reason: string; blockedUntil: string; preview?: string }[] {
    const blocked: { url: string; reason: string; blockedUntil: string; preview?: string }[] = [];
    const now = Date.now();
    
    circuitBreaker.forEach((state, url) => {
        if (state.blockedUntil > now) {
            blocked.push({
                url,
                reason: state.lastError || 'Unknown',
                blockedUntil: new Date(state.blockedUntil).toISOString(),
                preview: state.last403Preview
            });
        }
    });
    
    return blocked;
}

// Track last fetch information
export let lastFetchInfo = {
    timestamp: new Date().toISOString(),
    totalFetched: 0,
    totalKept: 0,
    sourcesProcessed: 0,
    lastArticle: null as NormalizedItem | null,
    recentArticles: [] as NormalizedItem[]
};

export function getLastFetchInfo() {
    return lastFetchInfo;
}

// Create RSS parser instance
const rssParser = new Parser({
    timeout: 10000,
    customFields: {
        item: ['media:content', 'enclosure', 'description', 'content:encoded', 'pubDate', 'published']
    }
});

// Helper functions
function extractImage(item: RawRSSItem): string {
    if (!item) return "";
    const fields = [
        item["media:thumbnail"],
        item["media:content"],
        item.enclosure
    ].filter(Boolean) as (RSSMediaContent | RSSMediaContent[] | RSSEnclosure | RSSEnclosure[])[];
    for (const f of fields) {
        const node = Array.isArray(f) ? f[0] : f;
        if (node && (node.url || (node.$ && node.$.url))) return node.url || node.$.url || "";
    }
    const contentEncoded = item["content:encoded"];
    if (contentEncoded) {
        const content = Array.isArray(contentEncoded) ? contentEncoded[0] : contentEncoded;
        const match = content.match(/<img[^>]+src="([^"]+)"/i);
        if (match && match[1]) return match[1];
    }
    const desc = item.description;
    if (desc) {
        const description = Array.isArray(desc) ? desc[0] : desc;
        const match = description.match(/<img[^>]+src="([^"]+)"/i);
        if (match && match[1]) return match[1];
    }
    return "";
}

function stripHtmlTags(html: string): string {
    if (!html) return "";
    // Remove HTML tags but preserve content
    const cleaned = html.replace(/<[^>]*>/g, ' ');
    // Clean up extra whitespace
    return cleaned.replace(/\s+/g, ' ').trim();
}

function extractLink(item: RawRSSItem): string | null {
    if (!item) return "";

    // PRIORITY 1: Feedburner original link (GlobeSt uses this for actual article URLs)
    if (item['feedburner:origLink']) {
        const origLink = Array.isArray(item['feedburner:origLink']) ? item['feedburner:origLink'][0] : item['feedburner:origLink'];
        if (origLink && typeof origLink === "string") {
            return normalizeUrl(origLink);
        }
    }

    // PRIORITY 2: RSS <link>https://...</link>
    if (Array.isArray(item.link) && typeof item.link[0] === "string") {
        return normalizeUrl(item.link[0]);
    }
    if (typeof item.link === "string") {
        return normalizeUrl(item.link);
    }

    // PRIORITY 3: Atom <link href="..."/> and <link rel="alternate">
    if (Array.isArray(item.link)) {
        for (const l of item.link) {
            if (!l) continue;
            if (typeof l === "string") return normalizeUrl(l);
            const linkObj = l as RSSLink;
            const href = linkObj.href || (linkObj.$ && linkObj.$.href);
            const rel = linkObj.rel || (linkObj.$ && linkObj.$.rel);
            if (href && (!rel || rel === "alternate")) return normalizeUrl(href);
        }
    }

    // PRIORITY 4: Handle atom:link with href
    if (item["atom:link"]) {
        const atomLinks = item["atom:link"];
        const atom = (Array.isArray(atomLinks) ? atomLinks[0] : atomLinks) as RSSLink;
        const href = atom?.$?.href;
        if (typeof href === "string") return normalizeUrl(href.trim());
    }

    // PRIORITY 5: guid as permalink (RSS permalinks)
    if (item.guid) {
        const g = item.guid;
        if (typeof g === "string" && g.startsWith("http")) return normalizeUrl(g);
        if (typeof g === "object" && g._ && g._.startsWith("http")) return normalizeUrl(g._);
    }

    return null;
}

function normalizeUrl(urlStr: string): string {
    try {
        // Use URL() constructor to validate and normalize the URL
        const u = new URL(urlStr);
        // Ensure we have a proper protocol
        if (!u.protocol.startsWith('http')) {
            throw new Error('Invalid protocol');
        }
        return u.toString();
    } catch {
        // If URL parsing fails, return empty string to indicate invalid URL
        return "";
    }
}

function stripTrackingParams(urlStr: string): string {
    try {
        const u = new URL(urlStr);
        const toDelete: string[] = [];
        u.searchParams.forEach((_, key) => {
            if (key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())) {
                toDelete.push(key);
            }
        });
        toDelete.forEach(k => u.searchParams.delete(k));
        u.hash = "";
        return u.toString();
    } catch {
        return urlStr;
    }
}

function computeId({ guid, canonicalUrl }: { guid?: string; canonicalUrl?: string }): string {
    let basis = guid || canonicalUrl || '';
    // Handle case where guid/canonicalUrl might be an object
    if (typeof basis !== 'string') {
        basis = String(basis);
    }
    return require('crypto').createHash('sha1').update(basis).digest('hex');
}

async function fetchWithRetry<T>(url: string, options: AxiosRequestConfig, attempts = 3): Promise<T> {
    let lastError: Error | AxiosError | undefined;
    for (let i = 0; i < attempts; i++) {
        try {
            const response = await axios.get<T>(url, options);
            return response.data;
        } catch (err) {
            lastError = err as AxiosError;
            const axiosErr = err as AxiosError;
            const status = axiosErr.response?.status;
            if (status && status >= 400 && status < 500) {
                // 4xx errors are non-retriable
                throw err;
            }
            // For timeouts or 5xx, retry with exponential backoff
            const delay = 500 * Math.pow(2, i);
            await new Promise(res => setTimeout(res, delay));
        }
    }
    throw lastError;
}

function classifyAccess(status: number, contentType?: string, bodySample = ""): string {
    if (!status) return "unknown";
    if (status === 401 || status === 402 || status === 403) return "blocked";
    if (status === 404) return "blocked";
    if (contentType && !contentType.includes("text/html")) return "unknown";
    const lower = bodySample.toLowerCase();
    if (lower.includes("subscribe") || lower.includes("paywall")) return "paywalled";
    return "ok";
}

async function validateLink(link: string): Promise<{ ok: boolean; status: number; access: string }> {
    if (!link) return { ok: false, status: 0, access: "unknown" };
    if (!isAllowedLink(link)) return { ok: false, status: 0, access: "blocked" };
    try {
        const resp = await axios.get(link, {
            maxRedirects: 3,
            timeout: 5000,
            responseType: 'arraybuffer',
            maxContentLength: 32768,
            validateStatus: (s: number) => s >= 200 && s < 500
        });
        const contentType = resp.headers['content-type'] || "";
        const bodySample = resp.data ? resp.data.toString('utf8', 0, Math.min(resp.data.length, 2048)) : "";
        const access = classifyAccess(resp.status, contentType, bodySample);
        const ok = resp.status >= 200 && resp.status < 400 && access !== "paywalled" && access !== "blocked";
        return { ok, status: resp.status, access };
    } catch (err) {
        const axiosErr = err as AxiosError;
        const status = axiosErr.response?.status || 0;
        return { ok: false, status, access: "blocked" };
    }
}

export function isAllowedLink(link: string): boolean {
    try {
        const u = new URL(link);
        return allowedDomains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
    } catch {
        return false;
    }
}

// Allowed domains for URL validation - includes all mandatory sources
const allowedDomains = [
    // MANDATORY SOURCES (Boss's Priority List)
    "re-nj.com",            // Real Estate NJ
    "commercialsearch.com", // Commercial Search
    "commercialcafe.com",   // Commercial Cafe (same company as Commercial Search)
    "wsj.com",              // WSJ
    "dowjones.com",         // WSJ parent
    "bisnow.com",           // Bisnow
    "globest.com",          // GlobeSt
    "naiop.org",            // NAIOP
    "blog.naiop.org",       // NAIOP Blog
    "cpexecutive.com",      // Commercial Property Executive
    "bizjournals.com",      // South FL Business Journal + others
    "loopnet.com",          // LoopNet
    "costar.com",           // CoStar
    "costargroup.com",      // CoStar Group
    "lvb.com",              // Lehigh Valley Business
    "dailyrecord.com",      // Daily Record
    "northjersey.com",      // North Jersey (Daily Record alternative)
    "njbiz.com",            // NJBIZ

    // Additional Quality Sources
    "connectcre.com",
    "credaily.com",
    "therealdeal.com",
    "supplychaindive.com",
    "freightwaves.com",
    "dcvelocity.com",
    "bloomberg.com",
    "reuters.com",
    "apnews.com",
    "cbre.com",
    "jll.com",
    "cushwake.com",
    "colliers.com",
    "traded.co",
    "crexi.com",
    "areadevelopment.com",
    "rebusinessonline.com",
    "multihousingnews.com",
    "wealthmanagement.com",
    "nreionline.com",
    "reit.com"
];

function fallbackThumbnail(id: string): string {
    return `https://picsum.photos/seed/${id}/640/360`;
}

// Generate a consistent fallback thumbnail based on URL hash
function generateFallbackThumbnail(url: string): string {
    if (!url) return '';
    // Create a simple hash from the URL for consistent placeholder images
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
        hash = ((hash << 5) - hash) + url.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    const seed = Math.abs(hash).toString(36);
    return `https://picsum.photos/seed/${seed}/640/360`;
}

// Enhanced article filtering with expanded market coverage for better article yield
// Mandatory sources - these get VERY light filtering (basically allow everything)
const MANDATORY_SOURCE_PATTERNS = [
    'realestatenj', 'real estate nj',
    'commercialsearch', 'commercial search',
    'wsj', 'wall street journal',
    'bisnow',
    'globest',
    'naiop',
    'cpexecutive', 'commercial property executive', 'cpe',
    'bizjournals', 'business journal',
    'loopnet', 'loop net',
    'costar',
    'lehighvalley', 'lehigh valley', 'lvb',
    'dailyrecord', 'daily record',
    'njbiz'
];

export function isFromMandatorySource(item: NormalizedItem): boolean {
    const source = (item.source || '').toLowerCase();
    const link = (item.link || '').toLowerCase();

    return MANDATORY_SOURCE_PATTERNS.some(pattern =>
        source.includes(pattern) ||
        link.includes(pattern.replace(/\s+/g, ''))
    );
}

function shouldIncludeArticle(item: NormalizedItem): boolean {
    // Check if URL should be rejected (spam, etc)
    if (shouldRejectUrl(item.link)) {
        return false;
    }

    // MANDATORY SOURCES: Very light filtering - allow almost everything
    if (isFromMandatorySource(item)) {
        // Only reject if it's clearly non-CRE content (e.g., sports, entertainment)
        const titleAndDesc = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
        const isNonCREContent = /\b(sports?|game|score|team|player|celebrity|movie|tv show|recipe|horoscope)\b/i.test(titleAndDesc);
        return !isNonCREContent;
    }

    // Check approved domains for non-mandatory sources
    if (!isAllowedLink(item.link)) {
        return false;
    }

    // For other sources, check for CRE/industrial keywords
    const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
    const hasCRESignal = /industrial|warehouse|logistics|distribution|manufacturing|real estate|commercial|property|lease|office|retail|development|investment|tenant|landlord|market|construction|acquisition/i.test(titleAndDesc);

    return hasCRESignal;
}

// Enhanced URL filtering for tracking parameters and redirects
export function shouldRejectUrl(url: string): boolean {
    const rejectPatterns = [
        /utm_/i,
        /redirect/i,
        /cache/i,
        /preview/i,
        /bing\.com/i,
        /fbclid/i,
        /gclid/i,
        /mc_cid/i,
        /mc_eid/i
    ];

    return rejectPatterns.some(pattern => pattern.test(url));
}

// Improved fetch function using axios + rss-parser (for header support)
async function fetchRSSFeedImproved(feed: FeedConfig): Promise<FetchResult> {
    const start = Date.now();
    const cb = circuitBreaker.get(feed.url) || { failureCount: 0, blockedUntil: 0 };

    // Check if feed is blocked (24-hour cooldown)
    if (cb.blockedUntil > Date.now()) {
        const remainingMs = cb.blockedUntil - Date.now();
        const remainingHrs = Math.round(remainingMs / (60 * 60 * 1000) * 10) / 10;
        console.log(`⏸️ [${feed.name}] Skipping - blocked for ${remainingHrs} more hours (${cb.lastError || 'previous failures'})`);
        const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
        return {
            status: 'error',
            articles: oldArticles,
            error: { type: 'circuit_breaker', message: `Feed blocked for ${remainingHrs}h: ${cb.lastError || 'repeated failures'}`, httpStatus: 0 },
            meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
        };
    }

    try {
        pruneItemStore();

        // ============================================
        // STEP 1: Fetch XML with axios (custom headers)
        // ============================================
        const headers = getHeadersForFeed(feed);
        const timeout = feed.timeout || 15000;
        
        let xmlContent: string;
        try {
            const response = await axios.get(feed.url, {
                timeout,
                headers,
                maxRedirects: 5,
                validateStatus: () => true, // Don't throw on any status
                responseType: 'text'
            });
            
            // Handle HTTP errors
            if (response.status === 403) {
                const bodyPreview = String(response.data).slice(0, 500);
                console.log(`🔒 [${feed.name}] 403 Forbidden - Body preview: ${bodyPreview.slice(0, 250)}`);
                
                // Check if it's Cloudflare
                if (isCloudflareChallenge(bodyPreview)) {
                    markFeedBlocked(feed.url, 'Cloudflare/WAF challenge detected - use email ingestion instead', bodyPreview);
                } else {
                    markFeedBlocked(feed.url, '403 Forbidden - feed likely blocks automated access', bodyPreview);
                }
                
                const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
                return {
                    status: 'error',
                    articles: oldArticles,
                    error: { type: 'blocked', message: '403 Forbidden', httpStatus: 403 },
                    meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
                };
            }
            
            if (response.status === 404) {
                markFeedBlocked(feed.url, '404 Not Found - feed URL may have changed');
                const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
                return {
                    status: 'error',
                    articles: oldArticles,
                    error: { type: 'not_found', message: '404 Not Found', httpStatus: 404 },
                    meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
                };
            }
            
            if (response.status >= 400) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            // Check if response is HTML (common when blocked)
            const contentType = response.headers['content-type'] || '';
            const bodyStart = String(response.data).trim().slice(0, 100).toLowerCase();
            
            if ((contentType.includes('text/html') && !contentType.includes('xml')) || 
                bodyStart.startsWith('<!doctype') || 
                bodyStart.startsWith('<html')) {
                console.log(`⚠️ [${feed.name}] Received HTML instead of RSS/XML - may be blocked`);
                markFeedBlocked(feed.url, 'HTML response instead of RSS - likely blocked or feed URL changed');
                const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
                return {
                    status: 'error',
                    articles: oldArticles,
                    error: { type: 'blocked', message: 'HTML response instead of RSS', httpStatus: response.status },
                    meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
                };
            }
            
            xmlContent = response.data;
            
        } catch (axiosError) {
            const err = axiosError as AxiosError;
            if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
                throw new Error(`Request timed out after ${timeout}ms`);
            }
            throw err;
        }
        
        // ============================================
        // STEP 2: Parse XML with rss-parser
        // ============================================
        const parsed = await rssParser.parseString(xmlContent);
        const items: NormalizedItem[] = [];

        for (const item of parsed.items) {
            try {
                const extractedLink = extractLink(item) || item.link || item.guid || '';
                const normalizedLink = normalizeUrl(extractedLink);
                
                // Skip if we can't get a valid link
                if (!normalizedLink) {
                    console.warn(`[${feed.name}] Skipping item with no valid link: ${item.title}`);
                    continue;
                }
                
                // Extract author - handle various formats
                let authorName = '';
                if (item.creator) {
                    authorName = typeof item.creator === 'string' ? item.creator : 
                                 (Array.isArray(item.creator) ? item.creator[0] : '');
                } else if (item.author) {
                    authorName = typeof item.author === 'string' ? item.author :
                                 (typeof item.author === 'object' && item.author.name) ? item.author.name : '';
                }
                
                // Extract image with fallback
                const imageUrl = extractImageFromItem(item) || generateFallbackThumbnail(normalizedLink);
                
                // Extract website domain for source attribution
                let websiteDomain = '';
                try {
                    const urlObj = new URL(normalizedLink);
                    websiteDomain = urlObj.hostname.replace(/^www\./, '');
                } catch { websiteDomain = ''; }
                
                const normalized: NormalizedItem = {
                    id: computeId({ guid: item.guid, canonicalUrl: normalizedLink }),
                    guid: item.guid || '',
                    canonicalUrl: normalizedLink,
                    title: item.title || '',
                    link: normalizedLink,
                    source: feed.name,
                    publisher: websiteDomain || feed.name,
                    regions: [feed.region || 'US'],
                    pubDate: (item.pubDate || item.published) ? new Date(item.pubDate || item.published).toISOString() : '',
                    description: stripHtmlTags(item.description || item['content:encoded'] || ''),
                    author: authorName,
                    image: imageUrl,
                    thumbnailUrl: imageUrl,
                    access: 'public',
                    status: 200,
                    fetchedAt: new Date().toISOString(),
                    topics: item.categories || [],
                    category: Array.isArray(item.categories)
                        ? item.categories.map(c => typeof c === 'string' ? c : c?._ || c?.name || '').filter(Boolean).join(', ')
                        : '',
                    tier: 'C',
                    score: 0
                };

                // Apply classification (async)
                const classification = await classifyArticle(
                    normalized.title,
                    normalized.description,
                    normalized.link,
                    normalized.source,
                    feed.type
                );
                normalized.tier = classification.tier || 'C';
                normalized.score = classification.score;
                normalized.category = classification.category; // Save the category

                // Only keep relevant articles (Tier A or B)
                if (normalized.tier !== 'C') {
                    items.push(normalized);
                }
            } catch (e) {
                console.error(`Error normalizing item from ${feed.name}:`, e);
            }
        }

        // Update circuit breaker on success
        if (cb.failureCount > 0) {
            cb.failureCount = 0;
            cb.blockedUntil = 0;
            circuitBreaker.set(feed.url, cb);
        }

        // Update feed stats
        feedStats.set(feed.url, {
            lastFetch: new Date().toISOString(),
            lastSuccess: new Date().toISOString(),
            lastError: null,
            itemsFetched: items.length
        });

        // Store items
        for (const item of items) {
            itemStore.set(item.id, item);
        }

        return {
            status: 'ok',
            articles: items,
            meta: {
                feed: feed.name,
                fetchedRaw: parsed.items.length,
                kept: items.length,
                filteredOut: parsed.items.length - items.length,
                durationMs: Date.now() - start
            }
        };

    } catch (error) {
        const err = error as Error;
        console.error(`[${feed.name}] ERROR:`, err.message);

        // Update circuit breaker on error with escalating cooldown
        cb.failureCount++;
        cb.lastError = err.message;
        
        if (cb.failureCount >= MAX_FAILURES_BEFORE_BLOCK) {
            // After 3 failures, block for 24 hours
            cb.blockedUntil = Date.now() + BLOCKED_COOLDOWN_MS;
            console.log(`🚫 [${feed.name}] Blocked for 24 hours after ${cb.failureCount} failures: ${err.message}`);
        } else {
            // Shorter cooldown for first few failures (30 min, 1 hour)
            const cooldownMs = 30 * 60 * 1000 * cb.failureCount;
            cb.blockedUntil = Date.now() + cooldownMs;
            console.log(`⏸️ [${feed.name}] Temporary cooldown for ${cooldownMs / 60000} minutes (failure ${cb.failureCount}/${MAX_FAILURES_BEFORE_BLOCK})`);
        }
        circuitBreaker.set(feed.url, cb);

        // Update feed stats
        feedStats.set(feed.url, {
            lastFetch: new Date().toISOString(),
            lastSuccess: null,
            lastError: err.message,
            itemsFetched: 0
        });

        // Return last good articles if available
        const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
        const axiosErr = error as AxiosError;
        return {
            status: 'error',
            articles: oldArticles,
            error: { type: 'fetch_error', message: err.message, httpStatus: axiosErr.response?.status },
            meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
        };
    }
}

// Helper function to extract image from rss-parser item
function extractImageFromItem(item: RawRSSItem & { content?: string }): string {
    const enclosure = item.enclosure;
    if (enclosure) {
        const enc = Array.isArray(enclosure) ? enclosure[0] : enclosure;
        if (enc?.url && enc.type?.startsWith('image/')) {
            return enc.url;
        }
    }
    const mediaContent = item['media:content'];
    if (mediaContent) {
        const mc = Array.isArray(mediaContent) ? mediaContent[0] : mediaContent;
        if (mc?.url) return mc.url;
        if (mc?.$?.url) return mc.$.url;
    }
    const mediaThumbnail = item['media:thumbnail'];
    if (mediaThumbnail) {
        const mt = Array.isArray(mediaThumbnail) ? mediaThumbnail[0] : mediaThumbnail;
        if (mt?.url) return mt.url;
        if (mt?.$?.url) return mt.$.url;
    }

    const contentEncoded = item['content:encoded'];
    const desc = item.description;
    const content = item.content ||
        (Array.isArray(contentEncoded) ? contentEncoded[0] : contentEncoded) ||
        (Array.isArray(desc) ? desc[0] : desc) || '';
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
    return imgMatch ? imgMatch[1] : '';
}

// Fetch articles from all feeds
export async function fetchAllRSSArticles(): Promise<FetchResult[]> {
    const startTime = Date.now();
    const promises = RSS_FEEDS
        .filter(f => f.enabled !== false)
        .map(feed => fetchRSSFeedImproved(feed));
    const results = await Promise.all(promises);
    if (manualArticles.length) {
        results.unshift({
            status: 'ok',
            articles: manualArticles,
            meta: { feed: 'Manual Articles', fetchedRaw: manualArticles.length, kept: manualArticles.length, filteredOut: 0, durationMs: 0 }
        });
    }

    // Clean up old articles that no longer pass current filtering
    const allCurrentItems = Array.from(itemStore.values());
    let cleanupCount = 0;

    // Archive articles older than 90 days (don't delete, just log)
    archiveOldArticles();

    // Update last fetch info
    const totalFetched = results.reduce((sum, r) => sum + r.meta.fetchedRaw, 0);
    const totalKept = results.reduce((sum, r) => sum + r.meta.kept, 0);
    const sourcesProcessed = results.length;

    // Get all current items to find the most recent one
    const allItems = Array.from(itemStore.values());
    const sortedItems = allItems.sort((a, b) =>
        new Date(b.fetchedAt || b.pubDate || 0).getTime() -
        new Date(a.fetchedAt || a.pubDate || 0).getTime()
    );

    lastFetchInfo = {
        timestamp: new Date().toISOString(),
        totalFetched,
        totalKept,
        sourcesProcessed,
        lastArticle: sortedItems[0] || null,
        recentArticles: sortedItems.slice(0, 5) // Keep track of 5 most recent
    };

    console.log(`Fetch completed: ${totalFetched} fetched, ${totalKept} kept from ${sourcesProcessed} sources`);
    return results;
}
