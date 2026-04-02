/**
 * Assess Scraper Gaps — Step 2 of the unified pipeline
 *
 * Reads scraper results from feed-health.json, identifies which scrapers failed,
 * and auto-enables Google News RSS backups for failed scrapers.
 *
 * Run after scraper build, before RSS build.
 */

import * as fs from 'fs';
import * as path from 'path';

interface FeedHealthEntry {
    name: string;
    status: 'ok' | 'failed';
    fetchedRaw: number;
    type: 'rss' | 'scraper';
}

// Map: scraper domain → Google News feed names that serve as backups
const SCRAPER_GN_BACKUPS: Record<string, string[]> = {
    'bloomberg.com': ['Google News Bloomberg CRE'],
    'jll.com': ['Google News JLL NJ/PA/FL'],
    'loopnet.com': ['Google News LoopNet Industrial'],
    'njbiz.com': ['Google News NJBIZ'],
    'wsj.com': ['Google News WSJ CRE'],
    'bisnow.com': ['Google News Bisnow Availabilities', 'Google News Bisnow Industrial'],
    'globest.com': ['Google News GlobeSt', 'Google News GlobeSt Industrial'],
    'commercialsearch.com': ['Google News CommercialSearch Availabilities', 'Google News CommercialSearch Industrial'],
    'costar.com': ['Google News CoStar', 'Google News CoStar Industrial'],
    'lvb.com': ['Google News LVB'],
    're-nj.com': ['Google News RE-NJ Availabilities', 'Google News RE-NJ Industrial'],
};

// Minimum articles a scraper must produce to be considered "working"
const MIN_ARTICLES = 1;

export function assessGaps(): { enabledFeeds: string[]; disabledFeeds: string[]; changes: number } {
    const docsDir = path.join(process.cwd(), 'docs');
    const feedsPath = path.join(process.cwd(), 'src', 'feeds', 'feeds.json');
    const healthPath = path.join(docsDir, 'feed-health.json');

    const enabledFeeds: string[] = [];
    const disabledFeeds: string[] = [];
    let changes = 0;

    // Load scraper health
    let scraperHealth: FeedHealthEntry[] = [];
    try {
        const health = JSON.parse(fs.readFileSync(healthPath, 'utf-8'));
        scraperHealth = (health.feeds || []).filter((f: FeedHealthEntry) => f.type === 'scraper');
    } catch {
        console.log('[Assess] No feed-health.json found — skipping gap assessment');
        return { enabledFeeds, disabledFeeds, changes: 0 };
    }

    // Load feeds config
    let feeds: any[];
    try {
        feeds = JSON.parse(fs.readFileSync(feedsPath, 'utf-8'));
    } catch {
        console.log('[Assess] Could not load feeds.json');
        return { enabledFeeds, disabledFeeds, changes: 0 };
    }

    console.log(`[Assess] Checking ${scraperHealth.length} scrapers against GN backups...`);

    // Build a map of scraper domain → success/failure
    const scraperResults = new Map<string, { ok: boolean; articles: number }>();
    for (const s of scraperHealth) {
        // Extract domain from scraper name: "Scraper: Bloomberg" → "bloomberg.com"
        const name = s.name.replace('Scraper: ', '');
        for (const [domain, _] of Object.entries(SCRAPER_GN_BACKUPS)) {
            if (domain.toLowerCase().includes(name.toLowerCase().split(' ')[0])) {
                scraperResults.set(domain, {
                    ok: s.status === 'ok' && s.fetchedRaw >= MIN_ARTICLES,
                    articles: s.fetchedRaw
                });
            }
        }
    }

    // For each scraper, toggle its GN backups
    for (const [domain, gnFeedNames] of Object.entries(SCRAPER_GN_BACKUPS)) {
        const result = scraperResults.get(domain);
        const scraperWorking = result?.ok ?? false;
        const articles = result?.articles ?? 0;

        for (const gnName of gnFeedNames) {
            const feed = feeds.find((f: any) => f.name === gnName);
            if (!feed) continue;

            const currentlyEnabled = feed.enabled !== false;

            if (scraperWorking && currentlyEnabled) {
                // Scraper is working — disable GN backup to reduce dupes
                feed.enabled = false;
                disabledFeeds.push(gnName);
                changes++;
                console.log(`[Assess] 🔒 Disabled "${gnName}" — scraper ${domain} working (${articles} articles)`);
            } else if (!scraperWorking && !currentlyEnabled) {
                // Scraper failed — enable GN backup
                feed.enabled = true;
                enabledFeeds.push(gnName);
                changes++;
                console.log(`[Assess] 🔓 Enabled "${gnName}" — scraper ${domain} failed`);
            } else if (scraperWorking) {
                disabledFeeds.push(gnName);
            } else {
                enabledFeeds.push(gnName);
            }
        }
    }

    // Save updated feeds config
    if (changes > 0) {
        fs.writeFileSync(feedsPath, JSON.stringify(feeds, null, 2));
        console.log(`[Assess] ${changes} GN feed toggles saved to feeds.json`);
    } else {
        console.log('[Assess] No changes needed — all backups correctly set');
    }

    return { enabledFeeds, disabledFeeds, changes };
}

// CLI entry point
if (process.argv[1]?.includes('assess-gaps')) {
    const result = assessGaps();
    console.log(`\n[Assess] Summary: ${result.enabledFeeds.length} GN feeds active, ${result.disabledFeeds.length} disabled, ${result.changes} changes`);
}
