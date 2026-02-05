/**
 * Scraper Orchestrator
 *
 * Runs all configured scrapers, manages shared browser instance,
 * and returns FetchResult[] compatible with the RSS pipeline.
 */

import { chromium, Browser } from 'playwright';
import { FetchResult } from '../types/index.js';
import { SCRAPER_CONFIGS, getPrimaryScrapers, getSupplementaryScrapers, ScraperDomainConfig } from './scraper-config.js';
import { BaseScraper } from './base-scraper.js';

// Domain scraper imports
import { CoStarScraper } from './domains/costar.js';
import { ReutersScraper } from './domains/reuters.js';
import { APNewsScraper } from './domains/apnews.js';
import { JLLScraper } from './domains/jll.js';
import { CushWakeScraper } from './domains/cushwake.js';
import { ColliersScraper } from './domains/colliers.js';
// import { TradedScraper } from './domains/traded.js'; // Disabled - Cloudflare too strong
import { BisnowScraper } from './domains/bisnow.js';
import { GlobeStScraper } from './domains/globest.js';
import { BloombergScraper } from './domains/bloomberg.js';
import { WSJScraper } from './domains/wsj.js';
import { CBREScraper } from './domains/cbre.js';
import { BizJournalsScraper } from './domains/bizjournals.js';

// Minimum RSS article count before supplementary scraper kicks in
const SUPPLEMENTARY_THRESHOLD = 3;

// Total timeout for all scrapers combined (7 minutes to allow more scrapers to complete)
const TOTAL_TIMEOUT_MS = 7 * 60 * 1000;

// Per-scraper timeout (45 seconds)
const SCRAPER_TIMEOUT_MS = 45 * 1000;

/**
 * Map domain to its scraper class
 */
function createScraper(config: ScraperDomainConfig): BaseScraper {
    switch (config.domain) {
        case 'costar.com': return new CoStarScraper(config);
        case 'reuters.com': return new ReutersScraper(config);
        case 'apnews.com': return new APNewsScraper(config);
        case 'jll.com': return new JLLScraper(config);
        case 'cushwake.com': return new CushWakeScraper(config);
        case 'colliers.com': return new ColliersScraper(config);
        // case 'traded.co': return new TradedScraper(config); // Disabled
        case 'bisnow.com': return new BisnowScraper(config);
        case 'globest.com': return new GlobeStScraper(config);
        case 'bloomberg.com': return new BloombergScraper(config);
        case 'wsj.com': return new WSJScraper(config);
        case 'cbre.com': return new CBREScraper(config);
        case 'bizjournals.com': return new BizJournalsScraper(config);
        default:
            throw new Error(`No scraper implementation for domain: ${config.domain}`);
    }
}

/**
 * Launch a shared Playwright browser for all scrapers
 */
async function launchBrowser(): Promise<Browser> {
    return chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio',
            '--no-first-run',
            '--disable-web-security',
            '--allow-running-insecure-content',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });
}

/**
 * Run all scrapers and return results
 *
 * @param rssResultCounts - Map of domain → article count from RSS (for supplementary threshold)
 */
export async function runAllScrapers(
    rssResultCounts?: Map<string, number>
): Promise<FetchResult[]> {
    // Check if scrapers are disabled
    if (process.env.SKIP_SCRAPERS === 'true') {
        console.log('[Scrapers] Disabled via SKIP_SCRAPERS env var');
        return [];
    }

    console.log('\n========================================');
    console.log('[Scrapers] Starting web scrapers...');
    console.log('========================================');

    const startTime = Date.now();
    const results: FetchResult[] = [];
    let browser: Browser | null = null;

    try {
        // Check if any scraper needs Playwright
        const needsPlaywright = SCRAPER_CONFIGS.some(c =>
            c.strategy === 'playwright' || c.strategy === 'axios-pw-fallback'
        );

        if (needsPlaywright) {
            try {
                browser = await launchBrowser();
                console.log('[Scrapers] Playwright browser launched');
            } catch (err) {
                console.error('[Scrapers] Failed to launch Playwright browser:', (err as Error).message);
                console.log('[Scrapers] Will attempt axios-only scrapers...');
            }
        }

        // Determine which scrapers to run
        const scrapersToRun: ScraperDomainConfig[] = [];

        // Always run primary scrapers
        scrapersToRun.push(...getPrimaryScrapers());

        // Only run supplementary scrapers if RSS didn't return enough articles
        for (const config of getSupplementaryScrapers()) {
            const rssCount = rssResultCounts?.get(config.domain) ?? 0;
            if (rssCount < SUPPLEMENTARY_THRESHOLD) {
                scrapersToRun.push(config);
                console.log(`[Scrapers] ${config.name}: RSS returned ${rssCount} articles (< ${SUPPLEMENTARY_THRESHOLD}), running scraper`);
            } else {
                console.log(`[Scrapers] ${config.name}: RSS returned ${rssCount} articles, skipping scraper`);
            }
        }

        console.log(`[Scrapers] Running ${scrapersToRun.length} scrapers...`);

        // Create a timeout promise
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
            setTimeout(() => resolve('timeout'), TOTAL_TIMEOUT_MS);
        });

        // Run each scraper with isolation (failures don't crash others)
        for (const config of scrapersToRun) {
            // Check total timeout
            if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
                console.log('[Scrapers] Total timeout reached, stopping remaining scrapers');
                break;
            }

            try {
                const scraper = createScraper(config);

                // Per-scraper timeout
                const scraperPromise = scraper.scrape(browser);
                const result = await Promise.race([
                    scraperPromise,
                    new Promise<FetchResult>((_, reject) =>
                        setTimeout(() => reject(new Error('Scraper timeout')), SCRAPER_TIMEOUT_MS)
                    )
                ]);

                results.push(result);
            } catch (error) {
                const err = error as Error;
                console.error(`[Scrapers] ${config.name} failed:`, err.message);
                results.push({
                    status: 'error',
                    articles: [],
                    error: { type: 'scraper_error', message: err.message },
                    meta: {
                        feed: `Scraper: ${config.name}`,
                        fetchedRaw: 0,
                        kept: 0,
                        filteredOut: 0,
                        durationMs: 0
                    }
                });
            }
        }

    } finally {
        // Close shared browser
        if (browser) {
            try {
                await browser.close();
                console.log('[Scrapers] Browser closed');
            } catch { /* ignore */ }
        }
    }

    // Summary
    const totalArticles = results.reduce((sum, r) => sum + r.articles.length, 0);
    const successCount = results.filter(r => r.status === 'ok').length;
    const totalDuration = Date.now() - startTime;

    console.log('\n========================================');
    console.log(`[Scrapers] Complete: ${totalArticles} articles from ${successCount}/${results.length} scrapers (${Math.round(totalDuration / 1000)}s)`);
    console.log('========================================\n');

    return results;
}

/**
 * Run a single scraper by domain name (for testing)
 */
export async function runSingleScraper(domain: string): Promise<FetchResult> {
    const config = SCRAPER_CONFIGS.find(c => c.domain === domain);
    if (!config) {
        throw new Error(`No scraper config for domain: ${domain}`);
    }

    let browser: Browser | null = null;
    try {
        if (config.strategy === 'playwright' || config.strategy === 'axios-pw-fallback') {
            browser = await launchBrowser();
        }

        const scraper = createScraper(config);
        return await scraper.scrape(browser);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}
