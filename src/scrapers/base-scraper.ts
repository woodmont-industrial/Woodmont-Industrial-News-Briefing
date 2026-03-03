/**
 * Base Scraper Class
 *
 * Provides shared functionality for all domain scrapers:
 * - Playwright stealth patterns with modern bot-detection evasion
 * - Circuit breaker (3 failures → 24-hour cooldown)
 * - Rate limiting per domain
 * - Retry logic (1 retry with fresh context on failure)
 * - Cache integration
 * - Returns FetchResult for pipeline compatibility
 */

import { Browser, BrowserContext, Page } from 'playwright';
import axios from 'axios';
import * as crypto from 'crypto';
import { NormalizedItem, FetchResult } from '../types/index.js';
import { ScraperDomainConfig, ScraperTarget } from './scraper-config.js';
import { getCachedArticles, setCachedArticles } from './scraper-cache.js';
import { classifyArticle } from '../filter/classifier.js';

// ============================================
// CIRCUIT BREAKER
// ============================================

interface ScraperCircuitState {
    failureCount: number;
    blockedUntil: number;
    lastError?: string;
}

const scraperCircuitBreaker = new Map<string, ScraperCircuitState>();
const MAX_FAILURES = 3;
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================
// RATE LIMITING
// ============================================

interface RateLimitEntry {
    date: string;
    count: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

function getTodayString(): string {
    return new Date().toISOString().split('T')[0];
}

function checkRateLimit(domain: string, maxRuns: number): boolean {
    const today = getTodayString();
    const entry = rateLimits.get(domain);
    if (!entry || entry.date !== today) return true;
    return entry.count < maxRuns;
}

function incrementRateLimit(domain: string): void {
    const today = getTodayString();
    const entry = rateLimits.get(domain);
    if (!entry || entry.date !== today) {
        rateLimits.set(domain, { date: today, count: 1 });
    } else {
        entry.count++;
    }
}

// ============================================
// STEALTH HELPERS
// ============================================

// Current 2026 browser user agents
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
];

function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function randomDelay(min: number, max: number): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simulate human-like mouse movements and scrolling
 */
async function simulateHumanBehavior(page: Page): Promise<void> {
    try {
        const viewportSize = page.viewportSize() || { width: 1920, height: 1080 };

        // Random mouse movements with variable speed
        const moveCount = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < moveCount; i++) {
            const x = Math.floor(Math.random() * viewportSize.width * 0.7) + viewportSize.width * 0.15;
            const y = Math.floor(Math.random() * viewportSize.height * 0.5) + viewportSize.height * 0.15;
            await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 15) + 8 });
            await randomDelay(80, 250);
        }

        // Natural scroll pattern
        const scrollAmount = Math.floor(Math.random() * 400) + 150;
        await page.mouse.wheel(0, scrollAmount);
        await randomDelay(300, 700);
    } catch { /* ignore errors from simulation */ }
}

// Realistic viewport sizes
const VIEWPORT_SIZES = [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 2560, height: 1440 }
];

/**
 * Create a stealth browser context with realistic fingerprint
 */
export async function createStealthContext(browser: Browser): Promise<BrowserContext> {
    const userAgent = getRandomUserAgent();
    const viewport = VIEWPORT_SIZES[Math.floor(Math.random() * VIEWPORT_SIZES.length)];
    const isChrome = userAgent.includes('Chrome') && !userAgent.includes('Firefox');

    const context = await browser.newContext({
        userAgent,
        viewport,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        javaScriptEnabled: true,
        hasTouch: false,
        isMobile: false,
        deviceScaleFactor: Math.random() > 0.7 ? 2 : 1,
        colorScheme: Math.random() > 0.3 ? 'light' : 'dark',
        extraHTTPHeaders: {
            'Accept': isChrome
                ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
                : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'DNT': '1',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Sec-CH-UA': isChrome ? '"Chromium";v="133", "Not(A:Brand";v="99", "Google Chrome";v="133"' : '',
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': userAgent.includes('Windows') ? '"Windows"' : userAgent.includes('Macintosh') ? '"macOS"' : '"Linux"',
            'Priority': 'u=0, i'
        }
    });

    return context;
}

/**
 * Comprehensive stealth init scripts that defeat common bot detectors
 */
export async function applyStealthScripts(page: Page): Promise<void> {
    await page.addInitScript(() => {
        // Hide webdriver flag
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        // Realistic chrome object
        if (!('chrome' in window)) {
            const chrome = {
                runtime: {
                    connect: () => {},
                    sendMessage: () => {},
                    onMessage: { addListener: () => {}, removeListener: () => {} }
                },
                loadTimes: () => ({
                    commitLoadTime: Date.now() / 1000,
                    connectionInfo: 'h2',
                    finishDocumentLoadTime: Date.now() / 1000 + 0.5,
                    finishLoadTime: Date.now() / 1000 + 1.0,
                    firstPaintAfterLoadTime: 0,
                    firstPaintTime: Date.now() / 1000 + 0.1,
                    navigationType: 'Other',
                    npnNegotiatedProtocol: 'h2',
                    requestTime: Date.now() / 1000 - 0.5,
                    startLoadTime: Date.now() / 1000,
                    wasAlternateProtocolAvailable: false,
                    wasFetchedViaSpdy: true,
                    wasNpnNegotiated: true
                }),
                csi: () => ({ startE: Date.now(), onloadT: Date.now() + 500 })
            };
            Object.defineProperty(window, 'chrome', { get: () => chrome, configurable: true });
        }

        // Realistic plugins array
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const plugins = [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
                ];
                const arr = Object.create(PluginArray.prototype);
                plugins.forEach((p, i) => { arr[i] = p; });
                Object.defineProperty(arr, 'length', { value: plugins.length });
                arr.item = (i: number) => arr[i] || null;
                arr.namedItem = (n: string) => plugins.find(p => p.name === n) || null;
                arr.refresh = () => {};
                return arr;
            }
        });

        // Languages
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

        // Hardware concurrency (realistic range)
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => [4, 8, 12, 16][Math.floor(Math.random() * 4)] });

        // Device memory
        Object.defineProperty(navigator, 'deviceMemory', { get: () => [4, 8, 16][Math.floor(Math.random() * 3)] });

        // Connection info
        if ('connection' in navigator) {
            Object.defineProperty((navigator as any).connection, 'rtt', { get: () => 50 });
        }

        // WebGL vendor spoofing
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (param) {
            if (param === 37445) return 'Google Inc. (NVIDIA)';  // UNMASKED_VENDOR_WEBGL
            if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)'; // UNMASKED_RENDERER_WEBGL
            return getParameter.call(this, param);
        };
        const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (param) {
            if (param === 37445) return 'Google Inc. (NVIDIA)';
            if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return getParameter2.call(this, param);
        };

        // Permissions API
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (params: any) => {
            if (params.name === 'notifications') {
                return Promise.resolve({ state: Notification.permission } as PermissionStatus);
            }
            return originalQuery.call(window.navigator.permissions, params);
        };

        // Prevent iframe detection
        if (window.self === window.top) {
            Object.defineProperty(document, 'hidden', { get: () => false });
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
        }
    });
}

/**
 * Navigate with stealth behavior and Cloudflare challenge handling
 */
export async function stealthNavigate(
    page: Page,
    url: string,
    options?: { waitForSelector?: string; cloudflare?: boolean }
): Promise<void> {
    await randomDelay(500, 1500);

    await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
    });

    await simulateHumanBehavior(page);
    await randomDelay(1500, 3000);

    // Cloudflare challenge handling with retry
    if (options?.cloudflare) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const content = await page.content();
            if (!isCloudflareChallenge(content)) break;

            console.log(`[Scraper] Cloudflare challenge detected (attempt ${attempt + 1}), waiting...`);
            await simulateHumanBehavior(page);
            // Progressive wait: longer on second attempt
            await randomDelay(10000 + attempt * 8000, 20000 + attempt * 10000);

            // Check for Turnstile checkbox and click it
            try {
                const turnstileFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
                const checkbox = turnstileFrame.locator('input[type="checkbox"], [class*="checkbox"]');
                if (await checkbox.count() > 0) {
                    await checkbox.first().click();
                    await randomDelay(3000, 6000);
                }
            } catch { /* no turnstile */ }
        }
    }

    // Wait for specific selector if provided
    if (options?.waitForSelector) {
        try {
            await page.waitForSelector(options.waitForSelector, { timeout: 20000 });
        } catch {
            console.log(`[Scraper] Selector "${options.waitForSelector}" not found, continuing...`);
        }
    }
}

function isCloudflareChallenge(body: string): boolean {
    if (!body) return false;
    const lower = body.toLowerCase();
    const indicators = [
        'just a moment', 'checking your browser', 'cf-browser-verification',
        'challenge-platform', 'turnstile', 'cf-chl-bypass',
        'cf_chl_opt', 'ray id', 'performance & security by cloudflare'
    ];
    const hasIndicator = indicators.some(i => lower.includes(i));
    const isChallengeHTML = lower.includes('<!doctype') && (
        lower.includes('just a moment') ||
        lower.includes('checking your browser') ||
        lower.includes('challenge')
    );
    return hasIndicator && isChallengeHTML;
}

// ============================================
// ID GENERATION
// ============================================

export function computeArticleId(link: string, title?: string): string {
    const basis = link || title || '';
    return crypto.createHash('sha1').update(basis).digest('hex');
}

// ============================================
// BASE SCRAPER CLASS
// ============================================

export abstract class BaseScraper {
    protected config: ScraperDomainConfig;

    constructor(config: ScraperDomainConfig) {
        this.config = config;
    }

    /**
     * Each domain scraper implements this to extract articles from a loaded page.
     * For axios-based scrapers, `page` will be null and `html` will contain the fetched HTML.
     */
    abstract extractArticles(
        target: ScraperTarget,
        page: Page | null,
        html?: string
    ): Promise<NormalizedItem[]>;

    /**
     * Main entry point: scrape all targets for this domain
     */
    async scrape(browser: Browser | null): Promise<FetchResult> {
        const start = Date.now();
        const domain = this.config.domain;

        // Check circuit breaker
        const cb = scraperCircuitBreaker.get(domain) || { failureCount: 0, blockedUntil: 0 };
        if (cb.blockedUntil > Date.now()) {
            const remainingHrs = Math.round((cb.blockedUntil - Date.now()) / 3600000 * 10) / 10;
            console.log(`[Scraper:${domain}] Blocked for ${remainingHrs}h (${cb.lastError})`);
            return this.errorResult(`Blocked for ${remainingHrs}h`, start);
        }

        // Check rate limit
        if (!checkRateLimit(domain, this.config.maxRunsPerDay)) {
            console.log(`[Scraper:${domain}] Rate limit exceeded`);
            return this.errorResult('Rate limit exceeded', start);
        }

        const allArticles: NormalizedItem[] = [];

        for (const target of this.config.targets) {
            try {
                // Check cache first
                const cached = getCachedArticles(domain, target.url);
                if (cached) {
                    allArticles.push(...cached);
                    continue;
                }

                incrementRateLimit(domain);

                let articles: NormalizedItem[];

                if (this.config.strategy === 'playwright') {
                    // Playwright-only strategy
                    if (!browser) {
                        console.log(`[Scraper:${domain}] No browser available, skipping ${target.label}`);
                        continue;
                    }
                    articles = await this.scrapeWithPlaywright(browser, target);
                    // Retry once with fresh context if no results
                    if (articles.length === 0) {
                        console.log(`[Scraper:${domain}] Retrying ${target.label} with fresh context...`);
                        await randomDelay(2000, 4000);
                        articles = await this.scrapeWithPlaywright(browser, target);
                    }
                } else {
                    // axios or axios-pw-fallback: try axios first
                    articles = await this.scrapeWithAxios(target);
                    if (articles.length === 0 && browser) {
                        console.log(`[Scraper:${domain}] Axios returned 0 articles, trying Playwright for ${target.label}...`);
                        articles = await this.scrapeWithPlaywright(browser, target);
                    }
                }

                // Classify articles
                const classified = await this.classifyArticles(articles);

                // Cache results
                if (classified.length > 0) {
                    setCachedArticles(domain, target.url, classified, this.config.cacheTTLMs);
                }

                allArticles.push(...classified);
                console.log(`[Scraper:${domain}] ${target.label}: ${classified.length} articles`);

            } catch (error) {
                const err = error as Error;
                console.error(`[Scraper:${domain}] Error scraping ${target.label}:`, err.message);
                this.recordFailure(domain, err.message);
            }
        }

        // Reset circuit breaker on success
        if (allArticles.length > 0 && cb.failureCount > 0) {
            scraperCircuitBreaker.set(domain, { failureCount: 0, blockedUntil: 0 });
        }

        return {
            status: allArticles.length > 0 ? 'ok' : 'error',
            articles: allArticles,
            meta: {
                feed: `Scraper: ${this.config.name}`,
                fetchedRaw: allArticles.length,
                kept: allArticles.length,
                filteredOut: 0,
                durationMs: Date.now() - start
            }
        };
    }

    /**
     * Scrape using Playwright (for JS-heavy/protected sites)
     */
    private async scrapeWithPlaywright(browser: Browser, target: ScraperTarget): Promise<NormalizedItem[]> {
        const context = await createStealthContext(browser);
        try {
            const page = await context.newPage();
            await applyStealthScripts(page);
            await stealthNavigate(page, target.url, {
                cloudflare: this.config.cloudflareProtected
            });
            return await this.extractArticles(target, page);
        } finally {
            await context.close();
        }
    }

    /**
     * Scrape using axios (for simpler sites)
     */
    private async scrapeWithAxios(target: ScraperTarget): Promise<NormalizedItem[]> {
        try {
            const ua = getRandomUserAgent();
            const isChrome = ua.includes('Chrome') && !ua.includes('Firefox');
            const response = await axios.get(target.url, {
                timeout: 20000,
                headers: {
                    'User-Agent': ua,
                    'Accept': isChrome
                        ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
                        : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Referer': 'https://www.google.com/',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'cross-site',
                    'Sec-Fetch-User': '?1',
                    'Sec-CH-UA': isChrome ? '"Chromium";v="133", "Not(A:Brand";v="99", "Google Chrome";v="133"' : '',
                    'Sec-CH-UA-Mobile': '?0',
                    'Sec-CH-UA-Platform': '"Windows"',
                    'Priority': 'u=0, i'
                },
                maxRedirects: 5,
                validateStatus: (s) => s < 400,
                responseType: 'text'
            });
            return await this.extractArticles(target, null, response.data);
        } catch (error) {
            const err = error as Error;
            console.log(`[Scraper:${this.config.domain}] Axios failed for ${target.url}: ${err.message}`);
            return [];
        }
    }

    /**
     * Classify and filter articles through the existing classifier
     */
    private async classifyArticles(articles: NormalizedItem[]): Promise<NormalizedItem[]> {
        const classified: NormalizedItem[] = [];
        for (const article of articles) {
            try {
                const classification = await classifyArticle(
                    article.title,
                    article.description,
                    article.link,
                    article.source,
                    this.config.feedType
                );
                article.tier = classification.tier || 'B';
                article.score = classification.score;
                article.category = classification.category;
                // Keep Tier A and B articles
                if (article.tier !== 'C') {
                    classified.push(article);
                }
            } catch {
                // On classification error, keep as Tier B (benefit of the doubt for scraped content)
                article.tier = 'B';
                classified.push(article);
            }
        }
        return classified;
    }

    /**
     * Record a failure for circuit breaker
     */
    private recordFailure(domain: string, error: string): void {
        const cb = scraperCircuitBreaker.get(domain) || { failureCount: 0, blockedUntil: 0 };
        cb.failureCount++;
        cb.lastError = error;
        if (cb.failureCount >= MAX_FAILURES) {
            cb.blockedUntil = Date.now() + COOLDOWN_MS;
            console.log(`[Scraper:${domain}] Blocked for 24 hours after ${cb.failureCount} failures`);
        }
        scraperCircuitBreaker.set(domain, cb);
    }

    /**
     * Create an error FetchResult
     */
    private errorResult(message: string, startTime: number): FetchResult {
        return {
            status: 'error',
            articles: [],
            error: { type: 'scraper_error', message },
            meta: {
                feed: `Scraper: ${this.config.name}`,
                fetchedRaw: 0,
                kept: 0,
                filteredOut: 0,
                durationMs: Date.now() - startTime
            }
        };
    }

    /**
     * Helper to build a NormalizedItem from scraped data
     */
    protected buildArticle(data: {
        title: string;
        link: string;
        description?: string;
        author?: string;
        pubDate?: string;
        image?: string;
    }): NormalizedItem {
        const link = data.link.startsWith('http') ? data.link : `https://${this.config.domain}${data.link}`;
        return {
            id: computeArticleId(link, data.title),
            title: data.title.trim(),
            link,
            source: this.config.name,
            publisher: this.config.domain,
            regions: ['US'],
            pubDate: data.pubDate || new Date().toISOString(),
            description: (data.description || '').trim(),
            author: data.author || '',
            image: data.image || '',
            thumbnailUrl: data.image || '',
            access: this.config.access || 'public',
            status: 200,
            fetchedAt: new Date().toISOString(),
            category: '',
            tier: 'B',
            score: 0,
            topics: []
        };
    }
}
