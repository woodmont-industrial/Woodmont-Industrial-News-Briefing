/**
 * Test harness for web scrapers
 *
 * Usage:
 *   npx tsx src/scrapers/test-scrapers.ts              # Run all scrapers
 *   npx tsx src/scrapers/test-scrapers.ts costar.com   # Run single scraper
 *   npx tsx src/scrapers/test-scrapers.ts --primary     # Run primary scrapers only
 *   npx tsx src/scrapers/test-scrapers.ts --supplementary  # Run supplementary only
 */

import { runAllScrapers, runSingleScraper } from './index.js';
import { SCRAPER_CONFIGS, getPrimaryScrapers, getSupplementaryScrapers } from './scraper-config.js';
import { getCacheStats, clearAllCache } from './scraper-cache.js';

async function main() {
    const args = process.argv.slice(2);
    const startTime = Date.now();

    console.log('========================================');
    console.log('  Web Scraper Test Harness');
    console.log('========================================\n');

    // Handle special flags
    if (args.includes('--clear-cache')) {
        clearAllCache();
        console.log('Cache cleared.\n');
        if (args.length === 1) return;
    }

    if (args.includes('--cache-stats')) {
        const stats = getCacheStats();
        console.log('Cache Stats:', JSON.stringify(stats, null, 2));
        return;
    }

    if (args.includes('--list')) {
        console.log('Available scrapers:\n');
        for (const config of SCRAPER_CONFIGS) {
            console.log(`  ${config.domain.padEnd(20)} ${config.type.padEnd(15)} ${config.strategy.padEnd(20)} ${config.name}`);
            for (const target of config.targets) {
                console.log(`    - ${target.url}`);
            }
        }
        return;
    }

    try {
        // Single domain test
        const domainArg = args.find(a => !a.startsWith('--'));
        if (domainArg) {
            console.log(`Testing single scraper: ${domainArg}\n`);
            const result = await runSingleScraper(domainArg);
            printResult(domainArg, result);
            return;
        }

        // Primary-only test
        if (args.includes('--primary')) {
            console.log('Testing primary scrapers only...\n');
            const configs = getPrimaryScrapers();
            for (const config of configs) {
                try {
                    const result = await runSingleScraper(config.domain);
                    printResult(config.domain, result);
                } catch (err) {
                    console.error(`  ${config.domain}: FAILED - ${(err as Error).message}\n`);
                }
            }
            return;
        }

        // Supplementary-only test
        if (args.includes('--supplementary')) {
            console.log('Testing supplementary scrapers only...\n');
            const configs = getSupplementaryScrapers();
            for (const config of configs) {
                try {
                    const result = await runSingleScraper(config.domain);
                    printResult(config.domain, result);
                } catch (err) {
                    console.error(`  ${config.domain}: FAILED - ${(err as Error).message}\n`);
                }
            }
            return;
        }

        // Run all scrapers
        console.log('Running all scrapers...\n');
        const results = await runAllScrapers();

        console.log('\n========================================');
        console.log('  Results Summary');
        console.log('========================================\n');

        let totalArticles = 0;
        let successCount = 0;

        for (const result of results) {
            const status = result.status === 'ok' ? 'OK' : 'ERR';
            const count = result.articles.length;
            totalArticles += count;
            if (result.status === 'ok') successCount++;

            console.log(`  [${status}] ${result.meta.feed.padEnd(30)} ${count} articles (${result.meta.durationMs}ms)`);

            if (result.error) {
                console.log(`        Error: ${result.error.message}`);
            }
        }

        console.log(`\n  Total: ${totalArticles} articles from ${successCount}/${results.length} scrapers`);

    } catch (error) {
        console.error('Test harness error:', (error as Error).message);
        process.exit(1);
    } finally {
        const elapsed = Date.now() - startTime;
        console.log(`\nCompleted in ${Math.round(elapsed / 1000)}s`);

        // Show cache stats
        const cacheStats = getCacheStats();
        if (cacheStats.totalEntries > 0) {
            console.log(`Cache: ${cacheStats.totalEntries} entries, ${Math.round(cacheStats.sizeBytes / 1024)}KB`);
        }
    }
}

function printResult(domain: string, result: any) {
    const status = result.status === 'ok' ? 'OK' : 'ERR';
    console.log(`[${status}] ${domain}: ${result.articles.length} articles (${result.meta.durationMs}ms)`);

    if (result.error) {
        console.log(`  Error: ${result.error.message}`);
    }

    if (result.articles.length > 0) {
        console.log(`  Sample articles:`);
        for (const article of result.articles.slice(0, 5)) {
            const tierBadge = article.tier === 'A' ? '[A]' : article.tier === 'B' ? '[B]' : '[C]';
            console.log(`    ${tierBadge} ${article.title.substring(0, 80)}`);
            console.log(`        ${article.link}`);
            if (article.description) {
                console.log(`        ${article.description.substring(0, 100)}...`);
            }
        }
    }
    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
