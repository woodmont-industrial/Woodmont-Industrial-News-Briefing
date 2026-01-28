/**
 * Playwright Fallback for Cloudflare-protected RSS feeds
 *
 * Guardrails:
 * - Only for allowlisted domains
 * - Only triggers on Cloudflare challenge patterns
 * - Persists cf_clearance cookies per domain
 * - Caps headless runs per domain/day
 * - Caches results for 6-24 hours
 */

import { chromium, Browser, BrowserContext, Cookie } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURATION
// ============================================

// Allowlist of domains that can use Playwright fallback
const PLAYWRIGHT_ALLOWLIST = [
    'connectcre.com',
    'bizjournals.com',
    'commercialsearch.com',
    'traded.co',
    'njbiz.com',
    'rejournals.com',
    'roi-nj.com',
    'lvb.com',
    'therealdeal.com',
    'freightwaves.com'
];

// Rate limiting: max headless runs per domain per day (increased for better coverage)
const MAX_RUNS_PER_DOMAIN_PER_DAY = 20;

// Cache TTL: 6 hours (in milliseconds) - shorter for fresher content
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Paths for persistence
const DATA_DIR = path.join(process.cwd(), '.playwright-cache');
const COOKIES_FILE = path.join(DATA_DIR, 'cookies.json');
const CACHE_FILE = path.join(DATA_DIR, 'feed-cache.json');
const RATE_LIMIT_FILE = path.join(DATA_DIR, 'rate-limits.json');

// ============================================
// TYPES
// ============================================

interface CookieStore {
    [domain: string]: {
        cookies: Cookie[];
        savedAt: number;
    };
}

interface FeedCache {
    [url: string]: {
        content: string;
        fetchedAt: number;
        expiresAt: number;
    };
}

interface RateLimitStore {
    [domain: string]: {
        date: string;  // YYYY-MM-DD
        count: number;
    };
}

interface PlaywrightFetchResult {
    success: boolean;
    content?: string;
    error?: string;
    fromCache?: boolean;
    usedPlaywright?: boolean;
}

// ============================================
// PERSISTENCE HELPERS
// ============================================

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadCookies(): CookieStore {
    try {
        if (fs.existsSync(COOKIES_FILE)) {
            return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
        }
    } catch (e) {
        console.warn('[Playwright] Failed to load cookies:', e);
    }
    return {};
}

function saveCookies(store: CookieStore): void {
    try {
        ensureDataDir();
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(store, null, 2));
    } catch (e) {
        console.warn('[Playwright] Failed to save cookies:', e);
    }
}

function loadCache(): FeedCache {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        }
    } catch (e) {
        console.warn('[Playwright] Failed to load cache:', e);
    }
    return {};
}

function saveCache(cache: FeedCache): void {
    try {
        ensureDataDir();
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.warn('[Playwright] Failed to save cache:', e);
    }
}

function loadRateLimits(): RateLimitStore {
    try {
        if (fs.existsSync(RATE_LIMIT_FILE)) {
            return JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
        }
    } catch (e) {
        console.warn('[Playwright] Failed to load rate limits:', e);
    }
    return {};
}

function saveRateLimits(limits: RateLimitStore): void {
    try {
        ensureDataDir();
        fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(limits, null, 2));
    } catch (e) {
        console.warn('[Playwright] Failed to save rate limits:', e);
    }
}

// ============================================
// CLOUDFLARE DETECTION
// ============================================

/**
 * Check if a response body contains Cloudflare challenge patterns
 */
export function isCloudflareChallenge(body: string, status?: number): boolean {
    if (!body) return false;

    const lower = body.toLowerCase();
    const indicators = [
        'just a moment',
        'checking your browser',
        'cf-browser-verification',
        'challenge-platform',
        'cloudflare',
        'cf_clearance',
        'turnstile',
        'ray id'
    ];

    // Must have Cloudflare indicator AND be a challenge page (not just any CF-served page)
    const hasIndicator = indicators.some(i => lower.includes(i));
    const isChallengeHTML = lower.includes('<!doctype') && (
        lower.includes('just a moment') ||
        lower.includes('checking your browser') ||
        lower.includes('challenge')
    );

    return hasIndicator && (isChallengeHTML || status === 403);
}

// ============================================
// DOMAIN HELPERS
// ============================================

function getDomain(url: string): string {
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function isAllowlisted(url: string): boolean {
    const domain = getDomain(url);
    return PLAYWRIGHT_ALLOWLIST.some(allowed => domain.includes(allowed));
}

function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}

// ============================================
// RATE LIMITING
// ============================================

function checkRateLimit(domain: string): boolean {
    const limits = loadRateLimits();
    const today = getTodayString();

    const domainLimit = limits[domain];
    if (!domainLimit || domainLimit.date !== today) {
        return true; // No limit for today yet
    }

    return domainLimit.count < MAX_RUNS_PER_DOMAIN_PER_DAY;
}

function incrementRateLimit(domain: string): void {
    const limits = loadRateLimits();
    const today = getTodayString();

    if (!limits[domain] || limits[domain].date !== today) {
        limits[domain] = { date: today, count: 1 };
    } else {
        limits[domain].count++;
    }

    saveRateLimits(limits);
}

function getRateLimitStatus(domain: string): { remaining: number; limit: number } {
    const limits = loadRateLimits();
    const today = getTodayString();

    const domainLimit = limits[domain];
    const used = (domainLimit && domainLimit.date === today) ? domainLimit.count : 0;

    return {
        remaining: MAX_RUNS_PER_DOMAIN_PER_DAY - used,
        limit: MAX_RUNS_PER_DOMAIN_PER_DAY
    };
}

// ============================================
// CACHING
// ============================================

function getCachedContent(url: string): string | null {
    const cache = loadCache();
    const entry = cache[url];

    if (entry && entry.expiresAt > Date.now()) {
        console.log(`🗄️ [Playwright] Cache hit for ${url}`);
        return entry.content;
    }

    return null;
}

function setCachedContent(url: string, content: string): void {
    const cache = loadCache();

    // Clean up expired entries
    const now = Date.now();
    for (const key of Object.keys(cache)) {
        if (cache[key].expiresAt < now) {
            delete cache[key];
        }
    }

    cache[url] = {
        content,
        fetchedAt: now,
        expiresAt: now + CACHE_TTL_MS
    };

    saveCache(cache);
}

// ============================================
// PLAYWRIGHT FETCH
// ============================================

let browserInstance: Browser | null = null;

// User agents pool - rotate for variety
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15'
];

function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Random delay helper for human-like behavior
function randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

async function getBrowser(): Promise<Browser> {
    if (!browserInstance) {
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                // Core stealth args
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                // Hide webdriver
                '--disable-infobars',
                '--window-size=1920,1080',
                // Network and rendering
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
                // Additional stealth
                '--disable-web-security',
                '--allow-running-insecure-content',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });
    }
    return browserInstance;
}

export async function closeBrowser(): Promise<void> {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

/**
 * Simulate human-like mouse movements
 */
async function simulateHumanBehavior(page: any): Promise<void> {
    try {
        // Random mouse movements
        const viewportSize = page.viewportSize() || { width: 1920, height: 1080 };
        for (let i = 0; i < 3; i++) {
            const x = Math.floor(Math.random() * viewportSize.width * 0.8) + 100;
            const y = Math.floor(Math.random() * viewportSize.height * 0.6) + 100;
            await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
            await randomDelay(100, 300);
        }

        // Random scroll
        const scrollAmount = Math.floor(Math.random() * 300) + 100;
        await page.mouse.wheel(0, scrollAmount);
        await randomDelay(200, 500);
        await page.mouse.wheel(0, -scrollAmount / 2);
        await randomDelay(100, 200);
    } catch (e) {
        // Ignore errors from human simulation
    }
}

/**
 * Fetch a URL using Playwright with Cloudflare bypass
 */
async function fetchWithPlaywright(url: string): Promise<{ content: string; cookies: Cookie[] }> {
    const browser = await getBrowser();
    const domain = getDomain(url);

    // Load existing cookies for this domain
    const cookieStore = loadCookies();
    const existingCookies = cookieStore[domain]?.cookies || [];

    // Use random user agent for variety
    const userAgent = getRandomUserAgent();

    const context = await browser.newContext({
        userAgent,
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        // Additional browser context settings
        javaScriptEnabled: true,
        hasTouch: false,
        isMobile: false,
        deviceScaleFactor: 1,
        extraHTTPHeaders: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1'
        }
    });

    // Restore cookies if available
    if (existingCookies.length > 0) {
        try {
            await context.addCookies(existingCookies);
            console.log(`🍪 [Playwright] Restored ${existingCookies.length} cookies for ${domain}`);
        } catch (e) {
            console.warn(`[Playwright] Failed to restore cookies:`, e);
        }
    }

    const page = await context.newPage();

    // Override navigator.webdriver to hide automation
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // Override other automation indicators
        (window as any).chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    try {
        console.log(`🎭 [Playwright] Navigating to ${url} (UA: ${userAgent.substring(0, 50)}...)`);

        // Small random delay before navigation (human-like)
        await randomDelay(500, 1500);

        // Navigate and wait for network to be idle
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        // Simulate human behavior (mouse movements, scrolling)
        await simulateHumanBehavior(page);

        // Wait a bit for any Cloudflare challenge to complete
        await randomDelay(2000, 4000);

        // Check if we're still on a challenge page
        const content = await page.content();
        if (isCloudflareChallenge(content)) {
            console.log(`⏳ [Playwright] Cloudflare challenge detected, waiting...`);
            // Simulate more human behavior while waiting
            await simulateHumanBehavior(page);
            // Wait longer for challenge to resolve
            await randomDelay(8000, 12000);
        }

        // Get the final content
        let finalContent = await page.content();

        // Check if Cloudflare challenge was solved
        if (isCloudflareChallenge(finalContent)) {
            console.log(`⏳ [Playwright] Still on challenge page, waiting longer...`);
            await simulateHumanBehavior(page);
            await randomDelay(12000, 18000);
            finalContent = await page.content();
        }

        // If we got HTML, try to find the actual RSS feed URL or extract RSS content
        if (!finalContent.includes('<?xml') && !finalContent.includes('<rss') && !finalContent.includes('<feed')) {
            console.log(`🔍 [Playwright] Looking for RSS feed link in HTML...`);

            // Look for RSS link in the page
            const rssLink = await page.evaluate(() => {
                const link = document.querySelector('link[type="application/rss+xml"], link[type="application/atom+xml"]');
                return link ? link.getAttribute('href') : null;
            });

            if (rssLink) {
                console.log(`📡 [Playwright] Found RSS link: ${rssLink}`);
                // Navigate to the actual RSS feed
                const rssUrl = rssLink.startsWith('http') ? rssLink : new URL(rssLink, url).href;
                await page.goto(rssUrl, { waitUntil: 'networkidle', timeout: 30000 });
                await page.waitForTimeout(2000);
                finalContent = await page.content();
            }

            // Try common RSS URL patterns
            if (!finalContent.includes('<?xml') && !finalContent.includes('<rss')) {
                const baseUrl = new URL(url);
                const alternateUrls = [
                    `${baseUrl.origin}/feed/rss/`,
                    `${baseUrl.origin}/rss.xml`,
                    `${url}?format=xml`,
                    `${url}&format=xml`
                ];

                for (const altUrl of alternateUrls) {
                    try {
                        console.log(`🔄 [Playwright] Trying alternate URL: ${altUrl}`);
                        await page.goto(altUrl, { waitUntil: 'networkidle', timeout: 15000 });
                        const altContent = await page.content();
                        if (altContent.includes('<?xml') || altContent.includes('<rss') || altContent.includes('<feed')) {
                            finalContent = altContent;
                            console.log(`✅ [Playwright] Found RSS at: ${altUrl}`);
                            break;
                        }
                    } catch (e) {
                        // Continue trying other URLs
                    }
                }
            }
        }

        // Save cookies (including cf_clearance)
        const cookies = await context.cookies();
        const cfCookies = cookies.filter(c =>
            c.name.includes('cf_') ||
            c.name.includes('__cf') ||
            c.name === 'cf_clearance'
        );

        if (cfCookies.length > 0) {
            console.log(`🍪 [Playwright] Saving ${cfCookies.length} Cloudflare cookies for ${domain}`);
        }

        // Save all cookies for the domain
        cookieStore[domain] = {
            cookies: cookies,
            savedAt: Date.now()
        };
        saveCookies(cookieStore);

        return { content: finalContent, cookies };

    } finally {
        await context.close();
    }
}

// ============================================
// MAIN EXPORT
// ============================================

/**
 * Attempt to fetch RSS feed content using Playwright
 * Only used for Cloudflare-protected feeds on the allowlist
 */
export async function playwrightFetchRSS(
    url: string,
    originalResponse?: { status: number; body: string }
): Promise<PlaywrightFetchResult> {
    const domain = getDomain(url);

    // Check allowlist
    if (!isAllowlisted(url)) {
        return {
            success: false,
            error: `Domain ${domain} not in Playwright allowlist`
        };
    }

    // Check if this is actually a Cloudflare challenge
    if (originalResponse && !isCloudflareChallenge(originalResponse.body, originalResponse.status)) {
        return {
            success: false,
            error: 'Not a Cloudflare challenge - Playwright not needed'
        };
    }

    // Check cache first
    const cached = getCachedContent(url);
    if (cached) {
        return {
            success: true,
            content: cached,
            fromCache: true,
            usedPlaywright: false
        };
    }

    // Check rate limit
    const rateStatus = getRateLimitStatus(domain);
    if (!checkRateLimit(domain)) {
        return {
            success: false,
            error: `Rate limit exceeded for ${domain} (${rateStatus.remaining}/${rateStatus.limit} remaining today)`
        };
    }

    // Fetch with Playwright
    try {
        console.log(`🎭 [Playwright] Attempting Cloudflare bypass for ${url}`);
        console.log(`   Rate limit: ${rateStatus.remaining}/${rateStatus.limit} runs remaining today for ${domain}`);

        incrementRateLimit(domain);

        const { content } = await fetchWithPlaywright(url);

        // Try to extract RSS/XML from the page
        // The feed URL should return XML, but if Cloudflare wrapped it in HTML,
        // we need to look for the actual feed content

        // Check if content is RSS/XML
        if (content.includes('<?xml') || content.includes('<rss') || content.includes('<feed')) {
            // Content is XML - extract it
            const xmlMatch = content.match(/<\?xml[\s\S]*$/);
            const rssMatch = content.match(/<rss[\s\S]*<\/rss>/);
            const feedMatch = content.match(/<feed[\s\S]*<\/feed>/);

            const xmlContent = xmlMatch?.[0] || rssMatch?.[0] || feedMatch?.[0] || content;

            setCachedContent(url, xmlContent);

            console.log(`✅ [Playwright] Successfully fetched RSS from ${url}`);
            return {
                success: true,
                content: xmlContent,
                fromCache: false,
                usedPlaywright: true
            };
        }

        // If we got HTML, the challenge might not have been solved
        if (isCloudflareChallenge(content)) {
            return {
                success: false,
                error: 'Cloudflare challenge not solved - may need manual intervention',
                usedPlaywright: true
            };
        }

        // Got HTML but not a challenge - might be feed rendered as HTML
        // Try to find any RSS links in the page
        console.log(`⚠️ [Playwright] Got HTML instead of RSS for ${url}`);
        return {
            success: false,
            error: 'Got HTML response instead of RSS - feed may not exist',
            usedPlaywright: true
        };

    } catch (error) {
        const err = error as Error;
        console.error(`❌ [Playwright] Error fetching ${url}:`, err.message);
        return {
            success: false,
            error: err.message,
            usedPlaywright: true
        };
    }
}

/**
 * Get Playwright fallback stats for monitoring
 */
export function getPlaywrightStats(): {
    allowlist: string[];
    rateLimits: { [domain: string]: { used: number; remaining: number } };
    cacheSize: number;
    cookieDomains: string[];
} {
    const limits = loadRateLimits();
    const cache = loadCache();
    const cookies = loadCookies();
    const today = getTodayString();

    const rateLimits: { [domain: string]: { used: number; remaining: number } } = {};
    for (const domain of PLAYWRIGHT_ALLOWLIST) {
        const domainLimit = limits[domain];
        const used = (domainLimit && domainLimit.date === today) ? domainLimit.count : 0;
        rateLimits[domain] = {
            used,
            remaining: MAX_RUNS_PER_DOMAIN_PER_DAY - used
        };
    }

    return {
        allowlist: PLAYWRIGHT_ALLOWLIST,
        rateLimits,
        cacheSize: Object.keys(cache).length,
        cookieDomains: Object.keys(cookies)
    };
}
