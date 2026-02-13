/**
 * Feed generation utilities — RSS XML, JSON Feed, Raw Feed, and Health Report.
 * Extracted from static.ts to reduce file size.
 */

import { NormalizedItem, FetchResult, FeedConfig } from '../types/index.js';
import { RSS_FEEDS } from '../feeds/config.js';
import { SCRAPER_CONFIGS } from '../scrapers/scraper-config.js';

// =====================================================================
// RSS XML Generation
// =====================================================================

export function generateRSSXML(items: NormalizedItem[]): string {
    const categoryLabels: Record<string, string> = {
        relevant: 'Relevant — Market Trends & Real Estate News',
        transactions: 'Transactions — Property Sales & Leases',
        availabilities: 'Availabilities — Properties for Sale or Lease',
        people: 'People News — Personnel Moves in CRE'
    };

    const rssItemsXML = items.map(item => {
        const category = item.category || 'relevant';
        const categoryLabel = categoryLabels[category] || categoryLabels.relevant;

        let authorString = '';
        if (item.author) {
            authorString = typeof item.author === 'string' ? item.author :
                          (typeof item.author === 'object' && (item.author as any).name) ? (item.author as any).name : '';
        }

        let websiteDomain = item.publisher || item.source || 'Unknown';
        try {
            if (item.link) {
                const urlObj = new URL(item.link);
                websiteDomain = urlObj.hostname.replace(/^www\./, '');
            }
        } catch { /* keep original */ }

        let imageUrl = item.image || item.thumbnailUrl || '';
        if (!imageUrl && item.link) {
            let hash = 0;
            for (let i = 0; i < item.link.length; i++) {
                hash = ((hash << 5) - hash) + item.link.charCodeAt(i);
                hash = hash & hash;
            }
            imageUrl = `https://picsum.photos/seed/${Math.abs(hash).toString(36)}/640/360`;
        }

        const validLink = item.link && item.link.startsWith('http') ? item.link : '#';

        return `\n    <item>
      <title><![CDATA[${item.title || 'Untitled'}]]></title>
      <link>${validLink}</link>
      <guid isPermaLink="true">${validLink}</guid>
      <pubDate>${(item.pubDate || item.date_published) ? new Date(item.pubDate || item.date_published).toUTCString() : new Date().toUTCString()}</pubDate>
      <description><![CDATA[${item.description || ''}]]></description>
      <category><![CDATA[${categoryLabel}]]></category>
      <source url="${validLink}"><![CDATA[${websiteDomain}]]></source>
      ${authorString ? `<author><![CDATA[${authorString}]]></author>` : ''}
      ${imageUrl ? `<enclosure url="${imageUrl.replace(/&/g, '&amp;')}" type="image/jpeg" length="0" />` : ''}
    </item>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Woodmont Industrial News Feed</title>
    <link>https://github.com/woodmont-industrial/Woodmont-Industrial-News-Briefing</link>
    <description>Daily industrial and CRE updates across key regions</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Woodmont RSS Aggregator</generator>
    <category>Industrial Real Estate</category>
    <category>Commercial Real Estate</category>${rssItemsXML}
  </channel>
</rss>`;
}

// =====================================================================
// JSON Feed Generation
// =====================================================================

export function generateJSONFeed(items: NormalizedItem[]): object {
    const categoryLabels: Record<string, string> = {
        relevant: 'Relevant — Market Trends & Real Estate News',
        transactions: 'Transactions — Property Sales & Leases',
        availabilities: 'Availabilities — Properties for Sale or Lease',
        people: 'People News — Personnel Moves in CRE'
    };

    return {
        version: "https://jsonfeed.org/version/1.1",
        title: "Woodmont Industrial News Feed",
        home_page_url: "https://woodmont-industrial.github.io/Woodmont-Industrial-News-Briefing/",
        feed_url: "https://woodmont-industrial.github.io/Woodmont-Industrial-News-Briefing/feed.json",
        description: "Daily industrial and CRE updates across key regions",
        author: {
            name: "Woodmont Industrial Partners",
            url: "https://woodmont-industrial.github.io/Woodmont-Industrial-News-Briefing/"
        },
        items: items.filter(item => {
            const itemUrl = item.link || item.url || '';
            return itemUrl.startsWith('http') && item.title;
        }).map(item => {
            const category = item.category || 'relevant';
            const itemLink = item.link || item.url || '';

            const titleHash = (item.title || '').split('').reduce((hash, char) => {
                return ((hash << 5) - hash) + char.charCodeAt(0) | 0;
            }, 0);
            const uniqueSeed = Math.abs(titleHash).toString(36);

            let imageUrl = item.image || item.thumbnailUrl || null;
            if (!imageUrl) {
                imageUrl = `https://picsum.photos/seed/${uniqueSeed}/640/360`;
            }

            let authorName = '';
            if (item.author) {
                authorName = typeof item.author === 'string' ? item.author :
                            (typeof item.author === 'object' && (item.author as any).name) ? (item.author as any).name : '';
            }

            let websiteDomain = item.publisher || item.source || 'Unknown';
            try {
                const urlObj = new URL(itemLink);
                websiteDomain = urlObj.hostname.replace(/^www\./, '');
            } catch { /* keep original */ }

            const description = item.description || '';
            const summary = description ? (description.substring(0, 200) + (description.length > 200 ? '...' : '')) : '';

            return {
                id: item.id || uniqueSeed,
                url: itemLink,
                title: item.title || 'Untitled',
                content_html: description,
                content_text: description,
                summary: summary,
                date_published: item.pubDate || item.date_published || new Date().toISOString(),
                date_modified: item.fetchedAt || new Date().toISOString(),
                image: imageUrl,
                author: { name: authorName || item.source || websiteDomain },
                _source: {
                    name: item.source || websiteDomain || 'Unknown',
                    website: websiteDomain,
                    url: itemLink,
                    feedName: item.source || websiteDomain
                },
                category: category,
                tags: [categoryLabels[category] || category, websiteDomain, ...(item.regions || [])]
            };
        })
    };
}

// =====================================================================
// Raw Feed Generation
// =====================================================================

export function generateRawFeed(
    allItems: NormalizedItem[],
    feedItemIds: Set<string>,
    maxAgeHours: number = 72,
    maxItems: number = 500
): object {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const industrialKW = ['warehouse', 'logistics', 'distribution', 'manufacturing',
        'cold storage', 'industrial', 'fulfillment', 'supply chain', 'freight',
        'e-commerce', 'last mile', 'flex space', '3pl', 'lease', 'acquisition',
        'development', 'vacancy', 'absorption', 'cap rate'];

    const detectRegion = (item: NormalizedItem): string => {
        if (item.region) return item.region;
        if (item.regions && item.regions.length > 0) return item.regions[0];
        const text = ((item.title || '') + ' ' + (item.description || '')).toUpperCase();
        if (/\bNEW JERSEY\b|, NJ\b|\bNJ,|\bNEWARK\b|\bJERSEY CITY\b/.test(text)) return 'NJ';
        if (/\bPENNSYLVANIA\b|\bPHILADELPHIA\b|, PA\b|\bLEHIGH\b/.test(text)) return 'PA';
        if (/\bFLORIDA\b|\bMIAMI\b|\bTAMPA\b|, FL\b|\bJACKSONVILLE\b/.test(text)) return 'FL';
        return 'US';
    };

    const extractKW = (item: NormalizedItem): string[] => {
        const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
        return industrialKW.filter(kw => text.includes(kw)).slice(0, 5);
    };

    const seenTitles = new Set<string>();
    const recentItems = allItems
        .filter(item => {
            if (!item.title || !item.link) return false;
            const pubDate = new Date(item.pubDate || item.fetchedAt || Date.now());
            if (isNaN(pubDate.getTime()) || pubDate < cutoff) return false;
            const normTitle = item.title.toLowerCase().trim().substring(0, 60);
            if (seenTitles.has(normTitle)) return false;
            seenTitles.add(normTitle);
            return true;
        })
        .sort((a, b) =>
            new Date(b.pubDate || b.fetchedAt || 0).getTime() -
            new Date(a.pubDate || a.fetchedAt || 0).getTime()
        )
        .slice(0, maxItems);

    return {
        version: '1.0',
        generated_at: new Date().toISOString(),
        stats: {
            total_fetched: allItems.length,
            included_in_raw: recentItems.length,
            included_in_feed: feedItemIds.size,
            window_hours: maxAgeHours
        },
        items: recentItems.map(item => ({
            id: item.id,
            t: (item.title || '').substring(0, 200),
            u: item.link,
            s: item.source || 'Unknown',
            d: item.pubDate || item.fetchedAt || new Date().toISOString(),
            c: item.category || 'relevant',
            r: detectRegion(item),
            ex: (item.description || '').substring(0, 150),
            in_feed: feedItemIds.has(item.id),
            kw: extractKW(item)
        }))
    };
}

// =====================================================================
// Feed Health Report
// =====================================================================

interface FeedHealthEntry {
    name: string;
    url: string;
    status: 'ok' | 'failed';
    fetchedRaw: number;
    keptAfterFiltering: number;
    lastError: string | null;
    durationMs: number;
    type: 'rss' | 'scraper';
    scraperStrategy?: string;
}

interface FeedHealthReport {
    generatedAt: string;
    totalFeeds: number;
    successfulFeeds: number;
    failedFeeds: number;
    totalArticlesFetched: number;
    totalArticlesKept: number;
    feeds: FeedHealthEntry[];
    scraperSummary: {
        total: number;
        successful: number;
        failed: number;
        articlesFetched: number;
        articlesKept: number;
    };
}

export function generateFeedHealthReport(results: FetchResult[]): FeedHealthReport {
    const feeds: FeedHealthEntry[] = [];

    const feedUrlMap = new Map<string, string>();
    for (const feed of RSS_FEEDS) {
        feedUrlMap.set(feed.name, feed.url);
    }

    const scraperMap = new Map<string, typeof SCRAPER_CONFIGS[0]>();
    for (const config of SCRAPER_CONFIGS) {
        scraperMap.set(`Scraper: ${config.name}`, config);
    }

    for (const result of results) {
        const feedName = result.meta.feed;
        const isScraper = feedName.startsWith('Scraper: ');
        const scraperConfig = scraperMap.get(feedName);

        let feedUrl: string;
        if (isScraper && scraperConfig) {
            feedUrl = scraperConfig.targets.map(t => t.url).join(', ');
        } else {
            feedUrl = feedUrlMap.get(feedName) || 'unknown';
        }

        feeds.push({
            name: feedName,
            url: feedUrl,
            status: result.status === 'ok' ? 'ok' : 'failed',
            fetchedRaw: result.meta.fetchedRaw,
            keptAfterFiltering: result.meta.kept,
            lastError: result.error?.message || null,
            durationMs: result.meta.durationMs,
            type: isScraper ? 'scraper' : 'rss',
            scraperStrategy: scraperConfig?.strategy
        });
    }

    feeds.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'failed' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });

    const successfulFeeds = feeds.filter(f => f.status === 'ok').length;
    const failedFeeds = feeds.filter(f => f.status === 'failed').length;
    const totalArticlesFetched = feeds.reduce((sum, f) => sum + f.fetchedRaw, 0);
    const totalArticlesKept = feeds.reduce((sum, f) => sum + f.keptAfterFiltering, 0);

    const scraperFeeds = feeds.filter(f => f.type === 'scraper');
    const scraperSummary = {
        total: scraperFeeds.length,
        successful: scraperFeeds.filter(f => f.status === 'ok').length,
        failed: scraperFeeds.filter(f => f.status === 'failed').length,
        articlesFetched: scraperFeeds.reduce((sum, f) => sum + f.fetchedRaw, 0),
        articlesKept: scraperFeeds.reduce((sum, f) => sum + f.keptAfterFiltering, 0)
    };

    return {
        generatedAt: new Date().toISOString(),
        totalFeeds: feeds.length,
        successfulFeeds,
        failedFeeds,
        totalArticlesFetched,
        totalArticlesKept,
        feeds,
        scraperSummary
    };
}
