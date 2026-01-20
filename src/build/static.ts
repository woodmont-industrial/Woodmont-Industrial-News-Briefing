/**
 * Static RSS build module for GitHub Pages
 * Generates RSS/JSON feeds and static HTML for deployment
 */

import * as fs from 'fs';
import * as path from 'path';
import { log } from '../server/logging.js';
import { fetchAllRSSArticles, isAllowedLink, shouldRejectUrl, isFromMandatorySource } from '../feeds/fetcher.js';
import { NormalizedItem } from '../types/index.js';

// Directory for static output
const DOCS_DIR = path.join(process.cwd(), 'docs');

/**
 * Normalize title for deduplication - lowercase, remove special chars
 */
function normalizeTitle(title: string): string {
    if (!title) return '';
    return title
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
}

/**
 * Normalize URL for deduplication - strips tracking params and normalizes format
 */
function normalizeUrlForDedupe(url: string): string {
    if (!url) return '';
    try {
        const u = new URL(url);
        // Remove tracking parameters
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
                                'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref', 'source'];
        trackingParams.forEach(p => u.searchParams.delete(p));
        // Remove hash
        u.hash = '';
        // Normalize to lowercase hostname
        return u.toString().toLowerCase();
    } catch {
        return url.toLowerCase();
    }
}

/**
 * Build static RSS/JSON feeds for GitHub Pages deployment
 */
export async function buildStaticRSS(): Promise<void> {
    const startTime = Date.now();
    log('info', 'Starting RSS feed generation');

    try {
        // === STEP 1: Load existing articles from GitHub Pages feed ===
        let existingArticles: NormalizedItem[] = [];
        const feedJsonPath = path.join(DOCS_DIR, 'feed.json');

        if (fs.existsSync(feedJsonPath)) {
            try {
                const feedData = JSON.parse(fs.readFileSync(feedJsonPath, 'utf-8'));
                const rawArticles = feedData.items || [];
                // Filter out corrupted articles (those with empty URLs or invalid data)
                existingArticles = rawArticles.filter((a: any) => {
                    const hasValidUrl = a.url && a.url.startsWith('http');
                    const hasTitle = a.title && a.title.trim();
                    return hasValidUrl && hasTitle;
                });
                const corruptedCount = rawArticles.length - existingArticles.length;
                if (corruptedCount > 0) {
                    log('info', `Filtered out ${corruptedCount} corrupted articles from existing feed`);
                }
                log('info', `Loaded ${existingArticles.length} valid existing articles from feed.json`);
            } catch (e) {
                log('warn', 'Could not parse existing feed.json, starting fresh');
            }
        }

        // Create sets for deduplication - by ID AND by canonical URL
        // Note: feed.json uses 'url', NormalizedItem uses 'link' - check both
        const existingGuids = new Set(existingArticles.map(a => a.id));
        const existingUrls = new Set(existingArticles.map(a => normalizeUrlForDedupe(a.link || a.url || a.canonicalUrl || '')));
        log('info', `Loaded ${existingGuids.size} existing GUIDs and ${existingUrls.size} URLs for deduplication`);

        // === STEP 2: Fetch fresh articles ===
        log('info', 'Fetching RSS feeds from sources');
        const results = await fetchAllRSSArticles();

        const fetchStats = {
            totalSources: results.length,
            successful: results.filter(r => r.status === 'ok').length,
            failed: results.filter(r => r.status === 'error').length,
            totalArticlesFetched: results.reduce((sum, r) => sum + r.meta.fetchedRaw, 0)
        };
        log('info', 'RSS fetch completed', fetchStats);

        // Get ALL freshly fetched items directly from results
        const allItems: NormalizedItem[] = [];
        for (const result of results) {
            if (result.status === 'ok' && result.articles) {
                allItems.push(...result.articles);
            }
        }
        log('info', `Got ${allItems.length} items from fetch results`);

        // === STRICT FILTERING: Regional + Content + Categorization ===

        // States/regions to EXCLUDE (everything except NJ, PA, FL)
        const excludeStates = [
            'TEXAS', 'TX,', ', TX', 'VIRGINIA', 'VA,', ', VA', 'MARYLAND', 'MD,', ', MD',
            'MONTANA', 'MT,', ', MT', 'GEORGIA', 'GA,', ', GA', 'CALIFORNIA', 'CA,', ', CA',
            'NORTH CAROLINA', 'NC,', ', NC', 'SOUTH CAROLINA', 'SC,', ', SC',
            'TENNESSEE', 'TN,', ', TN', 'OHIO', 'OH,', ', OH', 'ILLINOIS', 'IL,', ', IL',
            'MICHIGAN', 'MI,', ', MI', 'INDIANA', 'IN,', ', IN', 'WISCONSIN', 'WI,', ', WI',
            'MINNESOTA', 'MN,', ', MN', 'MISSOURI', 'MO,', ', MO', 'KENTUCKY', 'KY,', ', KY',
            'ALABAMA', 'AL,', ', AL', 'LOUISIANA', 'LA,', ', LA', 'ARKANSAS', 'AR,', ', AR',
            'OKLAHOMA', 'OK,', ', OK', 'KANSAS', 'KS,', ', KS', 'NEBRASKA', 'NE,', ', NE',
            'IOWA', 'IA,', ', IA', 'COLORADO', 'CO,', ', CO', 'ARIZONA', 'AZ,', ', AZ',
            'NEVADA', 'NV,', ', NV', 'UTAH', 'UT,', ', UT', 'NEW MEXICO', 'NM,', ', NM',
            'WYOMING', 'WY,', ', WY', 'IDAHO', 'ID,', ', ID', 'WASHINGTON', 'WA,', ', WA',
            'OREGON', 'OR,', ', OR', 'MASSACHUSETTS', 'MA,', ', MA', 'CONNECTICUT', 'CT,', ', CT',
            'NEW HAMPSHIRE', 'NH,', ', NH', 'VERMONT', 'VT,', ', VT', 'MAINE', 'ME,', ', ME',
            'RHODE ISLAND', 'RI,', ', RI', 'NEW YORK', 'NY,', ', NY', 'DELAWARE', 'DE,', ', DE'
        ];

        // Major cities in excluded states
        const excludeCities = [
            'HOUSTON', 'DALLAS', 'AUSTIN', 'SAN ANTONIO', 'FORT WORTH', 'EL PASO',
            'ATLANTA', 'BALTIMORE', 'RICHMOND', 'NORFOLK', 'VIRGINIA BEACH', 'ROANOKE',
            'LOS ANGELES', 'SAN FRANCISCO', 'SAN DIEGO', 'SACRAMENTO', 'SAN JOSE',
            'SEATTLE', 'PORTLAND', 'DENVER', 'PHOENIX', 'LAS VEGAS', 'SALT LAKE',
            'CHICAGO', 'DETROIT', 'CLEVELAND', 'CINCINNATI', 'COLUMBUS', 'INDIANAPOLIS',
            'NASHVILLE', 'MEMPHIS', 'CHARLOTTE', 'RALEIGH', 'CHARLESTON', 'COLUMBIA',
            'BOSTON', 'HARTFORD', 'PROVIDENCE', 'NEW HAVEN', 'ALBANY', 'BUFFALO',
            'MINNEAPOLIS', 'MILWAUKEE', 'ST. LOUIS', 'KANSAS CITY', 'OMAHA',
            'BIRMINGHAM', 'MOBILE', 'LITTLE ROCK', 'BATON ROUGE', 'NEW ORLEANS',
            'OKLAHOMA CITY', 'TULSA', 'ALBUQUERQUE', 'TUCSON', 'BOISE', 'CHEYENNE',
            'BEE CAVE', 'BOZEMAN', 'CHESTERFIELD COUNTY'
        ];

        // NJ/PA/FL target regions
        const targetRegions = ['NJ', 'PA', 'FL', 'NEW JERSEY', 'PENNSYLVANIA', 'FLORIDA',
            'NEWARK', 'JERSEY CITY', 'TRENTON', 'CAMDEN', 'EDISON', 'ELIZABETH', 'PATERSON',
            'PHILADELPHIA', 'PITTSBURGH', 'ALLENTOWN', 'BETHLEHEM', 'LEHIGH VALLEY', 'HARRISBURG',
            'MIAMI', 'ORLANDO', 'TAMPA', 'JACKSONVILLE', 'FORT LAUDERDALE', 'WEST PALM', 'BOCA RATON',
            'CENTRAL JERSEY', 'NORTH JERSEY', 'SOUTH JERSEY', 'RARITAN', 'MONROE', 'MIDDLESEX'];

        // Non-industrial content to EXCLUDE (hard rule per boss)
        // Property scope: Industrial only - warehouse, logistics, distribution, manufacturing, cold storage, last-mile, IOS, industrial land
        // Exclude: office, multifamily, retail, hotels, self-storage (unless industrial portfolio), data centers (unless industrial/logistics)
        const excludeContent = [
            // Sports & Entertainment
            'SOCCER', 'FOOTBALL', 'BASEBALL', 'BASKETBALL', 'SPORTS FRANCHISE', 'YOUTH SPORTS',
            // Retail
            'RESTAURANT', 'COFFEE SHOP', 'RETAIL STORE', 'SHOPPING CENTER', 'MALL', 'RETAIL LEASE',
            // Residential/Multifamily
            'RESIDENTIAL', 'APARTMENT', 'CONDO', 'SINGLE-FAMILY', 'HOMEBUILDER', 'MULTIFAMILY', 'TOWNHOME',
            // Hospitality
            'HOTEL', 'HOSPITALITY', 'RESORT', 'CASINO', 'GAMING',
            // Office (exclude unless mixed-use with industrial)
            'OFFICE LEASE', 'OFFICE BUILDING', 'OFFICE TOWER', 'OFFICE CAMPUS', 'COWORKING',
            // Institutional
            'SCHOOL', 'UNIVERSITY', 'HOSPITAL', 'MEDICAL CENTER', 'CHURCH', 'SENIOR LIVING', 'NURSING HOME',
            // Self-storage (exclude standalone)
            'SELF-STORAGE', 'MINI STORAGE'
        ];

        // Industrial property keywords (what to INCLUDE)
        const industrialKeywords = [
            'WAREHOUSE', 'LOGISTICS', 'DISTRIBUTION', 'MANUFACTURING', 'COLD STORAGE',
            'LAST-MILE', 'LAST MILE', 'INDUSTRIAL OUTDOOR STORAGE', 'IOS', 'INDUSTRIAL LAND',
            'FULFILLMENT', 'FLEX SPACE', 'SPEC INDUSTRIAL', 'INDUSTRIAL PARK', 'LOADING DOCK',
            'TRUCK COURT', 'CROSS-DOCK', 'INDUSTRIAL DEVELOPMENT', 'INDUSTRIAL PORTFOLIO'
        ];

        // Deal thresholds: ≥100,000 SF or ≥$25M (per boss rules)
        const meetsDealThreshold = (text: string): { meetsSF: boolean; meetsDollar: boolean; sizeSF: number | null; priceMillion: number | null } => {
            // Extract SF values
            const sfMatch = text.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:SF|SQ\.?\s*FT|SQUARE\s*FEET)/i);
            let sizeSF: number | null = null;
            if (sfMatch) {
                sizeSF = parseInt(sfMatch[1].replace(/,/g, ''));
            }

            // Extract dollar values (millions)
            const dollarMatch = text.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:MILLION|M\b)/i);
            let priceMillion: number | null = null;
            if (dollarMatch) {
                priceMillion = parseFloat(dollarMatch[1].replace(/,/g, ''));
            }

            // Also check for plain dollar amounts (e.g., $25,000,000)
            const bigDollarMatch = text.match(/\$(\d{2,3}(?:,\d{3}){2,})/);
            if (!priceMillion && bigDollarMatch) {
                const rawAmount = parseInt(bigDollarMatch[1].replace(/,/g, ''));
                if (rawAmount >= 25000000) {
                    priceMillion = rawAmount / 1000000;
                }
            }

            return {
                meetsSF: sizeSF !== null && sizeSF >= 100000,
                meetsDollar: priceMillion !== null && priceMillion >= 25,
                sizeSF,
                priceMillion
            };
        };

        // Regional sources (always include if from these)
        const regionalSources = ['re-nj.com', 'njbiz.com', 'lvb.com', 'bisnow.com/new-jersey',
            'bisnow.com/philadelphia', 'bisnow.com/south-florida', 'therealdeal.com/miami'];

        // Check if article should be included
        const shouldIncludeArticle = (item: NormalizedItem): boolean => {
            const text = `${item.title || ''} ${item.description || ''}`.toUpperCase();
            // Check both 'link' (from fetcher) and 'url' (from feed.json)
            const url = (item.link || item.url || '').toLowerCase();

            // Always include from regional sources
            const isRegionalSource = regionalSources.some(s => url.includes(s));

            // Check for excluded content (non-industrial)
            const hasExcludedContent = excludeContent.some(c => text.includes(c));

            // Check if has industrial context (can override some exclusions)
            const hasIndustrialContext = industrialKeywords.some(k => text.includes(k));

            // Exclude non-industrial content UNLESS it has clear industrial context
            if (hasExcludedContent && !hasIndustrialContext) {
                log('info', `EXCLUDED (non-industrial): ${item.title?.substring(0, 60)}`);
                return false;
            }

            // Check for excluded states/cities
            const mentionsExcludedState = excludeStates.some(s => text.includes(s));
            const mentionsExcludedCity = excludeCities.some(c => text.includes(c));
            const mentionsTargetRegion = targetRegions.some(r => text.includes(r));

            // If from regional source, only exclude if PRIMARILY about other state
            if (isRegionalSource) {
                if ((mentionsExcludedState || mentionsExcludedCity) && !mentionsTargetRegion) {
                    log('info', `EXCLUDED (out-of-state from regional source): ${item.title?.substring(0, 60)}`);
                    return false;
                }
                return true;
            }

            // For non-regional sources, exclude if mentions any excluded location
            if (mentionsExcludedState || mentionsExcludedCity) {
                log('info', `EXCLUDED (out-of-state): ${item.title?.substring(0, 60)}`);
                return false;
            }

            // Must mention target region OR have industrial content
            return mentionsTargetRegion || hasIndustrialContext;
        };

        // Re-categorize articles based on content (following boss's section rules)
        const recategorizeArticle = (item: NormalizedItem): NormalizedItem => {
            const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
            const textUpper = text.toUpperCase();

            // Check deal thresholds
            const threshold = meetsDealThreshold(textUpper);

            // Availability indicators (for sale/lease listings)
            const isAvailability = text.includes('for sale') || text.includes('for lease') ||
                text.includes('available') || text.includes('listing') || text.includes('on the market') ||
                text.includes('asking') || text.includes('newly marketed');

            // Transaction indicators (completed deals)
            const isTransaction = text.includes('sold') || text.includes('sale of') || text.includes('acquired') ||
                text.includes('closed') || text.includes('signed') || text.includes('leased') ||
                text.includes('deal') || text.includes('transaction') || text.includes('financing');

            // People News indicators
            const hasPeopleAction = /\b(named|appointed|hired|promoted|joined|taps|nabs|adds|welcomes|recruits|elevated|hires|appoints|promotes|leads|heads|chair)\b/i.test(text);
            const hasBrokerage = /\b(nai|cbre|jll|cushman|colliers|newmark|marcus|millichap|sior|ccim|prologis|duke|link logistics|rexford|exeter|blackstone|brookfield|dermody|hillwood|panattoni)\b/i.test(text);
            const hasPersonRole = /\b(ceo|president|director|partner|principal|vice president|managing director|broker|agent|executive|chairman|head of|chief)\b/i.test(text);

            // Macro/Relevant indicators
            const isMacro = /\b(interest rate|fed |federal reserve|inflation|cpi|lending|capital markets|freight|shipping|trucking|supply chain|port|cargo|container|construction cost|material cost|labor market|vacancy rate|absorption|rent growth|cap rate)\b/i.test(text);

            // Apply categorization rules in order of priority:

            // 1. PEOPLE NEWS - personnel moves in industrial CRE
            if (hasPeopleAction && (hasBrokerage || hasPersonRole)) {
                item.category = 'people';
                return item;
            }

            // 2. AVAILABILITIES - listings ≥100K SF (for sale/lease)
            if (isAvailability && threshold.meetsSF) {
                item.category = 'availabilities';
                return item;
            }

            // 3. TRANSACTIONS - deals meeting threshold (≥100K SF OR ≥$25M)
            if (isTransaction && (threshold.meetsSF || threshold.meetsDollar)) {
                item.category = 'transactions';
                return item;
            }

            // 4. For articles with SF that don't meet threshold but have transaction words
            // Still categorize as transactions if clearly a deal
            if (isTransaction && threshold.sizeSF && threshold.sizeSF > 0) {
                item.category = 'transactions';
                return item;
            }

            // 5. RELEVANT ARTICLES - macro trends affecting industrial CRE
            if (isMacro) {
                item.category = 'relevant';
                return item;
            }

            // Keep original category if none of the above apply
            return item;
        };

        // Apply URL validity filter first
        const urlFilteredItems = allItems.filter(item => {
            if (!item.link || !item.title) return false;
            if (shouldRejectUrl(item.link)) return false;
            return isAllowedLink(item.link);
        });

        // Apply strict regional + content filter
        const filteredNewItems = urlFilteredItems.filter(shouldIncludeArticle).map(recategorizeArticle);

        log('info', `Filtered to ${filteredNewItems.length} articles after strict regional/content checks`, {
            beforeFiltering: allItems.length,
            afterUrlFilter: urlFilteredItems.length,
            afterStrictFilter: filteredNewItems.length,
            fromMandatorySources: filteredNewItems.filter(i => isFromMandatorySource(i)).length
        });

        // Deduplication - only keep truly new items (check ID, URL, AND title)
        const seenUrls = new Set<string>();
        const seenTitles = new Set<string>();
        const existingTitles = new Set(existingArticles.map(a => normalizeTitle(a.title || '')));
        
        const newItems = filteredNewItems.filter(item => {
            const normalizedUrl = normalizeUrlForDedupe(item.link || item.canonicalUrl || '');
            const normalizedTitle = normalizeTitle(item.title || '');
            
            // Skip if we've already seen this URL in this batch
            if (seenUrls.has(normalizedUrl)) {
                return false;
            }
            
            // Skip if we've already seen this title in this batch (same article from different sources)
            if (seenTitles.has(normalizedTitle)) {
                return false;
            }
            
            // Skip if exists in previous feed (by ID, URL, or title)
            if (existingGuids.has(item.id) || existingUrls.has(normalizedUrl) || existingTitles.has(normalizedTitle)) {
                return false;
            }
            
            seenUrls.add(normalizedUrl);
            seenTitles.add(normalizedTitle);
            return true;
        });
        
        log('info', `Found ${newItems.length} NEW unique articles`, {
            beforeDedupe: filteredNewItems.length,
            duplicatesRemoved: filteredNewItems.length - newItems.length
        });

        // === STEP 3: Merge new + existing articles ===
        // First dedupe existing articles by title (in case duplicates exist from before)
        const dedupedExisting: NormalizedItem[] = [];
        const existingSeenTitles = new Set<string>();
        const existingSeenUrls = new Set<string>();
        
        for (const article of existingArticles) {
            const normTitle = normalizeTitle(article.title || '');
            // feed.json uses 'url', NormalizedItem uses 'link' - check both
            const normUrl = normalizeUrlForDedupe(article.link || article.url || '');

            if (!existingSeenTitles.has(normTitle) && !existingSeenUrls.has(normUrl)) {
                existingSeenTitles.add(normTitle);
                existingSeenUrls.add(normUrl);
                dedupedExisting.push(article);
            }
        }
        
        if (dedupedExisting.length < existingArticles.length) {
            log('info', `Removed ${existingArticles.length - dedupedExisting.length} duplicates from existing articles`);
        }
        
        // Apply recategorization to ALL articles (including existing ones)
        const recategorizedExisting = dedupedExisting.map(recategorizeArticle);
        const mergedArticles = [...newItems, ...recategorizedExisting];
        log('info', `Merged: ${newItems.length} new + ${recategorizedExisting.length} existing = ${mergedArticles.length} total`);

        // Also filter out bad existing articles (out-of-state that slipped through before)
        const cleanMerged = mergedArticles.filter(shouldIncludeArticle);
        if (cleanMerged.length < mergedArticles.length) {
            log('info', `Cleaned ${mergedArticles.length - cleanMerged.length} out-of-state articles from existing feed`);
        }

        // === STEP 4: Apply 30-day cleanup ===
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const cleanedArticles = cleanMerged.filter(item => {
            const pubDate = new Date(item.pubDate || item.fetchedAt || Date.now());
            return pubDate >= thirtyDaysAgo;
        });

        const removedCount = cleanMerged.length - cleanedArticles.length;
        if (removedCount > 0) {
            log('info', `Auto-deleted ${removedCount} articles older than 30 days`);
        }

        // Sort by publication date (newest first)
        const sortedItems = cleanedArticles.sort((a, b) =>
            new Date(b.pubDate || b.fetchedAt || 0).getTime() -
            new Date(a.pubDate || a.fetchedAt || 0).getTime()
        );

        // Take top 150 for RSS feed
        const rssItems = sortedItems.slice(0, 150);
        log('info', `Final feed: ${rssItems.length} articles (capped at 150)`);

        // Ensure docs directory exists
        if (!fs.existsSync(DOCS_DIR)) {
            fs.mkdirSync(DOCS_DIR, { recursive: true });
        }

        // Generate and write RSS XML
        const rssXML = generateRSSXML(rssItems);
        fs.writeFileSync(path.join(DOCS_DIR, 'rss.xml'), rssXML, 'utf8');
        log('info', 'Generated docs/rss.xml', { itemCount: rssItems.length });

        // Generate and write JSON feed
        const feedJSON = generateJSONFeed(rssItems);
        fs.writeFileSync(path.join(DOCS_DIR, 'feed.json'), JSON.stringify(feedJSON, null, 2), 'utf8');
        log('info', 'Generated docs/feed.json', { itemCount: rssItems.length });

        const duration = Date.now() - startTime;
        log('info', 'Static build completed successfully', {
            durationMs: duration,
            totalArticles: rssItems.length,
            sourcesProcessed: fetchStats.totalSources
        });

    } catch (error) {
        log('error', 'Static build failed', {
            error: String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    }
}

/**
 * Generate RSS 2.0 XML from articles
 */
function generateRSSXML(items: NormalizedItem[]): string {
    const categoryLabels: Record<string, string> = {
        relevant: 'RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News',
        transaction: 'TRANSACTIONS — Notable Sales/Leases (≥100K SF or ≥$25M)',
        availabilities: 'AVAILABILITIES — New Industrial Properties for Sale/Lease',
        people: 'PEOPLE NEWS — Personnel Moves in Industrial Brokerage/Development'
    };

    const rssItemsXML = items.map(item => {
        const category = item.category || 'relevant';
        const categoryLabel = categoryLabels[category] || categoryLabels.relevant;

        // Extract author - clean up any object types
        let authorString = '';
        if (item.author) {
            authorString = typeof item.author === 'string' ? item.author : 
                          (typeof item.author === 'object' && (item.author as any).name) ? (item.author as any).name : '';
        }

        // Get website domain from URL for source attribution
        let websiteDomain = item.publisher || item.source || 'Unknown';
        try {
            if (item.link) {
                const urlObj = new URL(item.link);
                websiteDomain = urlObj.hostname.replace(/^www\./, '');
            }
        } catch { /* keep original */ }

        // Get image URL with fallback
        let imageUrl = item.image || item.thumbnailUrl || '';
        if (!imageUrl && item.link) {
            // Generate fallback thumbnail
            let hash = 0;
            for (let i = 0; i < item.link.length; i++) {
                hash = ((hash << 5) - hash) + item.link.charCodeAt(i);
                hash = hash & hash;
            }
            imageUrl = `https://picsum.photos/seed/${Math.abs(hash).toString(36)}/640/360`;
        }

        // Validate link
        const validLink = item.link && item.link.startsWith('http') ? item.link : '#';

        return `\n    <item>
      <title><![CDATA[${item.title || 'Untitled'}]]></title>
      <link>${validLink}</link>
      <guid isPermaLink="true">${validLink}</guid>
      <pubDate>${item.pubDate ? new Date(item.pubDate).toUTCString() : new Date().toUTCString()}</pubDate>
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
    <link>https://github.com/prcasley/Woodmont-Industrial-News-Briefing</link>
    <description>Daily industrial and CRE updates across key regions</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Woodmont RSS Aggregator</generator>
    <category>Industrial Real Estate</category>
    <category>Commercial Real Estate</category>${rssItemsXML}
  </channel>
</rss>`;
}

/**
 * Generate JSON Feed from articles
 */
function generateJSONFeed(items: NormalizedItem[]): object {
    const categoryLabels: Record<string, string> = {
        relevant: 'RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News',
        transaction: 'TRANSACTIONS — Notable Sales/Leases (≥100K SF or ≥$25M)',
        availabilities: 'AVAILABILITIES — New Industrial Properties for Sale/Lease',
        people: 'PEOPLE NEWS — Personnel Moves in Industrial Brokerage/Development'
    };

    return {
        version: "https://jsonfeed.org/version/1.1",
        title: "Woodmont Industrial News Feed",
        home_page_url: "https://prcasley.github.io/Woodmont-Industrial-News-Briefing/",
        feed_url: "https://prcasley.github.io/Woodmont-Industrial-News-Briefing/feed.json",
        description: "Daily industrial and CRE updates across key regions",
        author: {
            name: "Woodmont Industrial Partners",
            url: "https://prcasley.github.io/Woodmont-Industrial-News-Briefing/"
        },
        items: items.filter(item => {
            // Only include items with valid links
            const itemUrl = item.link || item.url || '';
            return itemUrl.startsWith('http') && item.title;
        }).map(item => {
            const category = item.category || 'relevant';
            // Normalize: use 'link' or 'url' property
            const itemLink = item.link || item.url || '';

            // Generate unique hash from title for consistent fallback images
            const titleHash = (item.title || '').split('').reduce((hash, char) => {
                return ((hash << 5) - hash) + char.charCodeAt(0) | 0;
            }, 0);
            const uniqueSeed = Math.abs(titleHash).toString(36);

            // Get image with fallback based on title hash
            let imageUrl = item.image || item.thumbnailUrl || null;
            if (!imageUrl) {
                imageUrl = `https://picsum.photos/seed/${uniqueSeed}/640/360`;
            }

            // Extract author
            let authorName = '';
            if (item.author) {
                authorName = typeof item.author === 'string' ? item.author :
                            (typeof item.author === 'object' && (item.author as any).name) ? (item.author as any).name : '';
            }

            // Get website domain from link
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
                date_published: item.pubDate || new Date().toISOString(),
                date_modified: item.fetchedAt || new Date().toISOString(),
                image: imageUrl,
                author: { name: authorName || item.source || websiteDomain },
                _source: {
                    name: item.source || 'Unknown',
                    website: websiteDomain,
                    url: itemLink,
                    feedName: item.source
                },
                category: category,
                tags: [categoryLabels[category] || category, websiteDomain, ...(item.regions || [])]
            };
        })
    };
}
