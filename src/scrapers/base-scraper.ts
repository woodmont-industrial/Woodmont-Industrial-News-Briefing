/**
 * Base Scraper Class
 *
 * Provides shared functionality for all domain scrapers:
 * - Playwright stealth patterns (reuses patterns from playwright-fallback.ts)
 * - Circuit breaker (3 failures → 24-hour cooldown)
 * - Rate limiting per domain
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
// STEALTH HELPERS (match playwright-fallback.ts)
// ============================================

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

export function randomDelay(min: number, max: number): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simulate human-like mouse movements on a page
 */
async function simulateHumanBehavior(page: Page): Promise<void> {
    try {
        const viewportSize = page.viewportSize() || { width: 1920, height: 1080 };
        for (let i = 0; i < 3; i++) {
            const x = Math.floor(Math.random() * viewportSize.width * 0.8) + 100;
            const y = Math.floor(Math.random() * viewportSize.height * 0.6) + 100;
            await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 10) + 5 });
            await randomDelay(100, 300);
        }
        const scrollAmount = Math.floor(Math.random() * 300) + 100;
        await page.mouse.wheel(0, scrollAmount);
        await randomDelay(200, 500);
    } catch { /* ignore errors from simulation */ }
}

/**
 * Create a stealth browser context
 */
export async function createStealthContext(browser: Browser): Promise<BrowserContext> {
    const userAgent = getRandomUserAgent();
    const context = await browser.newContext({
        userAgent,
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
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

    return context;
}

/**
 * Apply stealth init scripts to a page
 */
export async function applyStealthScripts(page: Page): Promise<void> {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        (window as any).chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });
}

/**
 * Navigate to a page with stealth behavior
 */
export async function stealthNavigate(
    page: Page,
    url: string,
    options?: { waitForSelector?: string; cloudflare?: boolean }
): Promise<void> {
    await randomDelay(500, 1500);

    await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
    });

    await simulateHumanBehavior(page);
    await randomDelay(2000, 4000);

    // Extended wait for Cloudflare-protected sites
    if (options?.cloudflare) {
        const content = await page.content();
        if (isCloudflareChallenge(content)) {
            console.log(`[Scraper] Cloudflare challenge detected, waiting...`);
            await simulateHumanBehavior(page);
            await randomDelay(8000, 18000);
        }
    }

    // Wait for specific selector if provided
    if (options?.waitForSelector) {
        try {
            await page.waitForSelector(options.waitForSelector, { timeout: 15000 });
        } catch {
            console.log(`[Scraper] Selector "${options.waitForSelector}" not found, continuing...`);
        }
    }
}

function isCloudflareChallenge(body: string): boolean {
    if (!body) return false;
    const lower = body.toLowerCase();
    const indicators = ['just a moment', 'checking your browser', 'cf-browser-verification', 'challenge-platform', 'cloudflare', 'turnstile'];
    const hasIndicator = indicators.some(i => lower.includes(i));
    const isChallengeHTML = lower.includes('<!doctype') && (lower.includes('just a moment') || lower.includes('checking your browser') || lower.includes('challenge'));
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

                if (this.config.strategy === 'playwright' || (this.config.strategy === 'axios-pw-fallback' && !browser)) {
                    if (!browser) {
                        console.log(`[Scraper:${domain}] No browser available, skipping ${target.label}`);
                        continue;
                    }
                    articles = await this.scrapeWithPlaywright(browser, target);
                } else {
                    // axios-pw-fallback: try axios first, fall back to playwright
                    articles = await this.scrapeWithAxios(target);
                    if (articles.length === 0 && browser) {
                        console.log(`[Scraper:${domain}] Axios returned 0 articles, trying Playwright...`);
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
            const response = await axios.get(target.url, {
                timeout: 15000,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Referer': 'https://www.google.com/',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'cross-site',
                    'Sec-Fetch-User': '?1'
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
