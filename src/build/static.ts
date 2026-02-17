/**
 * Static RSS build module for GitHub Pages
 * Generates RSS/JSON feeds and static HTML for deployment
 */

import * as fs from 'fs';
import * as path from 'path';
import { log } from '../server/logging.js';
import { fetchAllRSSArticles, isAllowedLink, shouldRejectUrl, isFromMandatorySource } from '../feeds/fetcher.js';
import { NormalizedItem, FetchResult } from '../types/index.js';
import { RSS_FEEDS } from '../feeds/config.js';
import { filterArticlesWithAI, AIClassificationResult } from '../filter/ai-classifier.js';
import { generateDescriptions } from '../filter/description-generator.js';
import { SCRAPER_CONFIGS } from '../scrapers/scraper-config.js';
import { normalizeTitle, normalizeUrlForDedupe } from '../shared/url-utils.js';
import { meetsDealThreshold } from '../shared/deal-threshold.js';
import { TARGET_REGIONS, MAJOR_EXCLUDE_REGIONS, EXCLUDE_POLITICAL, INTERNATIONAL_EXCLUDE, INDUSTRIAL_PROPERTY_KEYWORDS, REGIONAL_SOURCES } from '../shared/region-data.js';
import { generateRSSXML, generateJSONFeed, generateRawFeed, generateFeedHealthReport } from './feed-generators.js';

// Directory for static output
const DOCS_DIR = path.join(process.cwd(), 'docs');

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
                // Filter out corrupted articles and map fields
                existingArticles = rawArticles
                    .filter((a: any) => {
                        const hasValidUrl = a.url && a.url.startsWith('http');
                        const hasTitle = a.title && a.title.trim();
                        return hasValidUrl && hasTitle;
                    })
                    .map((a: any) => ({
                        ...a,
                        // Map feed.json fields to NormalizedItem fields
                        link: a.url || a.link,
                        pubDate: a.date_published || a.pubDate,
                        fetchedAt: a.date_modified || a.fetchedAt,
                        // Map JSON Feed content back to NormalizedItem description
                        description: a.content_text || a.content_html || a.description || a.summary || '',
                    }));
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

        // States/regions/cities to EXCLUDE (everything except NJ, PA, FL) — from shared module
        const excludeStates = MAJOR_EXCLUDE_REGIONS;

        // NJ/PA/FL target regions — from shared module
        const targetRegions = TARGET_REGIONS;

        // Content to EXCLUDE - political + international — from shared module
        const excludeContent = [...EXCLUDE_POLITICAL.map(s => s.toUpperCase()), ...INTERNATIONAL_EXCLUDE];

        // INDUSTRIAL-focused keywords — from shared module
        const industrialKeywords = INDUSTRIAL_PROPERTY_KEYWORDS.map(s => s.toUpperCase());

        // Broader CRE keywords (what to INCLUDE - focused on industrial CRE, no non-industrial property types)
        // Industrial keywords are already covered by industrialKeywords above
        const realEstateKeywords = [
            // Transactions & deals (CRE-specific)
            'COMMERCIAL REAL ESTATE', 'REAL ESTATE', 'CRE', 'PROPERTY', 'DEVELOPMENT', 'LEASE',
            'SOLD', 'ACQUIRED', 'TRANSACTION', 'VACANCY', 'RENT',
            'ACQUISITION', 'DISPOSITION', 'GROUND-UP', 'SPEC', 'BUILD-TO-SUIT',
            'CAP RATE', 'NOI', 'SQUARE FEET', 'SQUARE FOOT', ' SF ', 'MILLION SF',
            // Market terms
            'OCCUPANCY', 'ABSORPTION', 'CONSTRUCTION', 'GROUNDBREAKING', 'DELIVERED',
            'LEASING', 'TENANT', 'LANDLORD', 'REIT',
            // CRE people/company news
            'BROKERAGE', 'BROKER',
            // Listing/availability
            'FOR LEASE', 'FOR SALE', 'ON THE MARKET',
            // Financing (CRE-specific)
            'REFINANCING', 'MORTGAGE',
            // Also include all industrial keywords for combined CRE context check
            ...industrialKeywords
        ];

        // Deal thresholds: imported from shared/deal-threshold.ts

        // Regional sources (always include if from these) — from shared module
        const regionalSources = REGIONAL_SOURCES;

        // Boss-preferred sources - VERY LIGHT filter (only exclude political, include everything else)
        // These sources are trusted by boss - include articles from ALL states
        const bossPreferredSources = [
            'globest.com',          // GlobeSt
            'naiopnj.org',          // NAIOP NJ Chapter
            'naioppa.org',          // NAIOP PA Chapter
            'connect.media',        // Connect Media
            'bisnow.com',           // Bisnow (all regional)
            're-nj.com'             // RE-NJ
        ];

        // Check if article should be included — WIDENED GATE, let AI handle region+relevance
        const shouldIncludeArticle = (item: NormalizedItem): boolean => {
            const text = `${item.title || ''} ${item.description || ''}`.toUpperCase();
            const url = (item.link || item.url || '').toLowerCase();
            const sourceName = (item.source || '').toLowerCase();

            // 1. EXCLUDE: Political + international content (from ALL sources)
            if (excludeContent.some(c => text.includes(c))) {
                log('info', `EXCLUDED (political/intl): ${item.title?.substring(0, 60)}`);
                return false;
            }

            // 2. EXCLUDE: Video content
            if (/\/(videos?)\//i.test(url) || url.endsWith('.mp4') || url.includes('video.foxbusiness') || url.includes('video.cnbc')) {
                log('info', `EXCLUDED (video): ${item.title?.substring(0, 60)}`);
                return false;
            }

            // 3. EXCLUDE: Non-industrial property types when NO industrial keywords present
            const nonIndustrialPrimary = /\b(APARTMENT|MULTIFAMILY|HOTEL|HOSPITALITY|RESIDENTIAL|CONDO|SINGLE.?FAMILY|RESTAURANT|SELF.?STORAGE)\b/.test(text);
            if (nonIndustrialPrimary && !industrialKeywords.some(k => text.includes(k))) {
                log('info', `EXCLUDED (non-industrial): ${item.title?.substring(0, 60)}`);
                return false;
            }

            // 4. INCLUDE: Boss preferred sources (GlobeSt, Bisnow, NAIOP, etc.)
            if (bossPreferredSources.some(s => url.includes(s) || sourceName.includes(s))) {
                return true;
            }

            // 5. INCLUDE: Regional sources (RE-NJ, NJBIZ, LVB, etc.)
            if (regionalSources.some(s => url.includes(s))) {
                return true;
            }

            // 6. INCLUDE: Any article with CRE or industrial keywords — let AI judge relevance
            const hasRealEstateContext = realEstateKeywords.some(k => {
                if (k.length <= 3) {
                    return text.includes(` ${k} `) || text.includes(`${k} `) || text.includes(` ${k}`);
                }
                return text.includes(k);
            });
            if (hasRealEstateContext) {
                return true;
            }

            // 7. EXCLUDE: Articles with zero CRE/industrial context
            log('info', `EXCLUDED (no CRE context): ${item.title?.substring(0, 60)}`);
            return false;
        };

        // Re-categorize articles based on content - REQUIRE CRE/INDUSTRIAL CONTEXT
        const recategorizeArticle = (item: NormalizedItem): NormalizedItem => {
            const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();

            // CRE/Industrial context check - article must be about real estate to be categorized
            const hasCREContext = /\b(warehouse|logistics|industrial|commercial|real estate|property|cre|lease|acquisition|development|construction|tenant|landlord|brokerage|broker|reit|portfolio)\b/i.test(text);

            // Check for dollar amounts ($) or square feet (SF/sq ft)
            const hasDollarAmount = /\$[\d,]+/.test(text) || /\d+\s*(million|m)\b/i.test(text);
            const hasSquareFeet = /\d+[,\d]*\s*(sf|sq\.?\s*ft|square\s*feet)/i.test(text);

            // Transaction indicators (buyer/tenant actions) - must also have CRE context
            const hasTransactionAction = /\b(purchased|acquires?d?|bought|signs?\s*lease|leased|closed|sale\s*of|sold\s*(to|for)?|acquisition|disposition|refinanc)\b/i.test(text);

            // Availability indicators - must have property type context
            const hasAvailabilityWords = /\b(available|listed|for\s*lease|for\s*sale|on\s*the\s*market|ground-?up|spec|build-?to-?suit|under\s*construction|breaks\s*ground|groundbreaking|delivers|delivered)\b/i.test(text);
            const hasPropertyType = /\b(warehouse|industrial|distribution|logistics|building|facility|property|center|park|site|acres|square\s*feet|sf|sq\.?\s*ft)\b/i.test(text);

            // People News indicators - must have CRE firm/role context
            const hasPeopleWords = /\b(promoted|hired|new\s*hire|joins|joined|named|appoints|appointed|taps|welcomes|recruits|elevated)\b/i.test(text);
            const hasCREFirmContext = /\b(brokerage|broker|development|developer|real estate|industrial|cre|reit|logistics|warehouse|nai|cbre|jll|cushman|colliers|newmark|prologis|blackstone|bridge industrial)\b/i.test(text);

            // Apply categorization rules in order of priority:

            // Strong availability signals (property being marketed, not a completed deal)
            const hasStrongAvailability = /\b(for\s*lease|for\s*sale|now\s*leasing|now\s*available|seeking\s*tenants|available\s*for\s*lease|available\s*for\s*sale|for\s*sublease|on\s*the\s*market|space\s*available|build-?to-?suit|vacant)\b/i.test(text);
            const isCompletedDeal = /\b(sold|acquired|bought|purchased|leased|closed|signed|inked|secured|landed)\b/i.test(text);

            // 1. STRONG AVAILABILITIES - Clearly marketed property, not a completed deal
            if (hasStrongAvailability && hasPropertyType && !isCompletedDeal) {
                item.category = 'availabilities';
                return item;
            }

            // 2. TRANSACTIONS - Deal signals WITH CRE context
            if (hasCREContext && (hasTransactionAction || (hasDollarAmount && hasSquareFeet) || (hasDollarAmount && hasPropertyType))) {
                item.category = 'transactions';
                return item;
            }

            // 3. SOFTER AVAILABILITIES - Property coming to market WITH property type context (may overlap with deals)
            if (hasAvailabilityWords && hasPropertyType && !isCompletedDeal) {
                item.category = 'availabilities';
                return item;
            }

            // 3. PEOPLE NEWS - Personnel moves WITH CRE firm context
            if (hasPeopleWords && hasCREFirmContext) {
                item.category = 'people';
                return item;
            }

            // 4. RELEVANT ARTICLES - default for everything else
            item.category = 'relevant';
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

        // === AI FILTERING (if CEREBRAS_API_KEY or GROQ_API_KEY is set) ===
        let aiFilteredItems = filteredNewItems;
        if (process.env.CEREBRAS_API_KEY || process.env.GROQ_API_KEY) {
            const aiProvider = process.env.CEREBRAS_API_KEY ? 'Cerebras' : 'Groq';
            log('info', `Running AI classification on articles using ${aiProvider}...`);
            try {
                const aiResult = await filterArticlesWithAI(filteredNewItems, 25); // 25% minimum relevance - more inclusive
                aiFilteredItems = aiResult.included;

                // Log AI filtering stats
                const excludedByAI = aiResult.excluded.length;
                const categoryBreakdown: Record<string, number> = {};
                for (const [_, classification] of aiResult.classifications) {
                    categoryBreakdown[classification.category] = (categoryBreakdown[classification.category] || 0) + 1;
                }

                log('info', `AI classification complete`, {
                    totalClassified: aiResult.classifications.size,
                    included: aiFilteredItems.length,
                    excludedByAI,
                    categories: categoryBreakdown
                });

                // Log some examples of excluded articles
                const excludedExamples = aiResult.excluded.slice(0, 3).map(a => ({
                    title: (a.title || '').substring(0, 50),
                    reason: (a as any)._aiClassification?.reason || 'unknown'
                }));
                if (excludedExamples.length > 0) {
                    log('info', 'AI excluded examples', { examples: excludedExamples });
                }
            } catch (error) {
                log('warn', 'AI classification failed, using rule-based filtering only', { error: String(error) });
                aiFilteredItems = filteredNewItems;
            }
        } else {
            log('info', 'No AI API key set (CEREBRAS_API_KEY or GROQ_API_KEY), skipping AI classification');
        }

        // === AI DESCRIPTION GENERATION (if CEREBRAS_API_KEY or GROQ_API_KEY is set) ===
        if (process.env.CEREBRAS_API_KEY || process.env.GROQ_API_KEY) {
            const aiProvider = process.env.CEREBRAS_API_KEY ? 'Cerebras' : 'Groq';
            log('info', `Generating AI descriptions using ${aiProvider}...`);
            try {
                await generateDescriptions(aiFilteredItems);
                const withDesc = aiFilteredItems.filter(a => a.description && a.description.length >= 20).length;
                log('info', `AI description generation complete`, { articlesWithDescriptions: withDesc, total: aiFilteredItems.length });
            } catch (error) {
                log('warn', 'AI description generation failed, continuing with existing descriptions', { error: String(error) });
            }
        }

        // === USER EXCLUDE LIST ===
        // Remove articles the user has explicitly excluded via docs/excluded-articles.json
        try {
            const excludePath = path.join(DOCS_DIR, 'excluded-articles.json');
            if (fs.existsSync(excludePath)) {
                const excludeData = JSON.parse(fs.readFileSync(excludePath, 'utf-8'));
                const excludedIds = new Set(excludeData.excludedIds || []);
                const excludedUrls = new Set((excludeData.excludedUrls || []).map((u: string) => u.toLowerCase()));
                const beforeExclude = aiFilteredItems.length;
                aiFilteredItems = aiFilteredItems.filter(a => {
                    if (a.id && excludedIds.has(a.id)) return false;
                    const url = (a.link || '').toLowerCase();
                    if (url && excludedUrls.has(url)) return false;
                    return true;
                });
                const removed = beforeExclude - aiFilteredItems.length;
                if (removed > 0) log('info', `User exclude list: removed ${removed} article(s)`);
            }
        } catch (e) { log('warn', 'Could not load excluded-articles.json', { error: String(e) }); }

        // === USER INCLUDE LIST (raw picks synced from UI) ===
        // Add articles the user manually picked via docs/included-articles.json
        try {
            const includePath = path.join(DOCS_DIR, 'included-articles.json');
            if (fs.existsSync(includePath)) {
                const includeData = JSON.parse(fs.readFileSync(includePath, 'utf-8'));
                const pickedArticles = includeData.articles || [];
                if (pickedArticles.length > 0) {
                    const existingIds = new Set(aiFilteredItems.map(a => a.id));
                    let added = 0;
                    for (const pick of pickedArticles) {
                        if (pick.id && !existingIds.has(pick.id)) {
                            aiFilteredItems.push({
                                id: pick.id,
                                title: pick.title || 'Untitled',
                                link: pick.url || '',
                                source: pick.source || 'Unknown',
                                pubDate: pick.date_published || new Date().toISOString(),
                                description: pick.description || '',
                                category: pick.category || 'relevant',
                                regions: pick.region ? [pick.region] : [],
                            } as NormalizedItem);
                            existingIds.add(pick.id);
                            added++;
                        }
                    }
                    if (added > 0) log('info', `User include list: added ${added} article(s) from raw picks`);
                }
            }
        } catch (e) { log('warn', 'Could not load included-articles.json', { error: String(e) }); }

        // === POST-AI REGIONAL VALIDATION ===
        // Light pass: AI already scored relevance — only exclude strong wrong-city signals
        const wrongCityKeywords = [
            'dallas', 'houston', 'austin', 'los angeles', 'chicago', 'atlanta', 'phoenix',
            'denver', 'seattle', 'las vegas', 'nashville', 'charlotte', 'indianapolis',
            'birmingham', 'memphis', 'st. louis', 'san antonio', 'san francisco'
        ];

        const regionallyValidated = aiFilteredItems.filter(item => {
            const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
            const url = (item.link || (item as any).url || '').toLowerCase();
            const sourceName = (item.source || '').toLowerCase();

            // Boss preferred sources — always pass
            if (bossPreferredSources.some(s => url.includes(s) || sourceName.includes(s))) {
                return true;
            }

            // If article has industrial context, always keep (national trends are valuable)
            if (/\b(warehouse|logistics|industrial|distribution|manufacturing|cold storage|fulfillment|last.?mile|supply chain|freight)\b/i.test(text)) {
                return true;
            }

            // If article has CRE context (people, transactions, availability, macro), keep
            if (/\b(promoted|hired|named|appointed|acquired|sold|purchased|leased|for lease|for sale|cap rate|vacancy|absorption|rent growth)\b/i.test(text)) {
                return true;
            }

            // Only exclude if article mentions specific wrong cities with NO NJ/PA/FL reference
            const hasWrongCity = wrongCityKeywords.some(c => text.includes(c));
            if (hasWrongCity) {
                const hasRightState = TARGET_REGIONS.some(r => text.toUpperCase().includes(r));
                if (!hasRightState) {
                    log('info', `POST-AI EXCLUDED (wrong city): ${(item.title || '').substring(0, 50)}`);
                    return false;
                }
            }

            return true;
        });

        log('info', `Post-AI regional validation: ${aiFilteredItems.length} -> ${regionallyValidated.length} articles`);
        aiFilteredItems = regionallyValidated;

        // Deduplication - only keep truly new items (check ID, URL, AND title)
        const seenUrls = new Set<string>();
        const seenTitles = new Set<string>();
        const existingTitles = new Set(existingArticles.map(a => normalizeTitle(a.title || '')));

        const newItems = aiFilteredItems.filter(item => {
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
            beforeDedupe: aiFilteredItems.length,
            duplicatesRemoved: aiFilteredItems.length - newItems.length
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

        // Clean merged articles — light pass, articles already passed AI classification
        const politicalKeywords = [
            'trump', 'biden', 'election', 'executive order', 'tariff war', 'trade war',
            'congress', 'senate', 'republican', 'democrat', 'political'
        ];
        const junkPatterns = [
            'cryptocurrency', 'bitcoin', 'crypto', 'nft',
            'student loan', 'student debt',
            'super bowl', 'world series', 'playoffs', 'championship',
            'horoscope', 'weather forecast', 'cookies settings', 'cookie policy',
            'recipe', 'restaurant review',
            'elon musk', 'spacex', 'jeff bezos', 'mark zuckerberg',
            'skip to content', 'skip to main', 'privacy policy', 'terms of service',
            'subscribe now', 'sign up for', 'newsletter signup'
        ];
        const cleanWrongCities = [
            'dallas', 'houston', 'austin', 'los angeles', 'chicago', 'atlanta', 'phoenix',
            'denver', 'seattle', 'las vegas', 'nashville', 'charlotte', 'indianapolis',
            'birmingham', 'memphis', 'st. louis', 'san antonio', 'san francisco'
        ];

        const cleanMerged = mergedArticles.filter(item => {
            const title = (item.title || '').trim();
            const text = (title + ' ' + (item.description || '')).toLowerCase();
            const url = (item.link || (item as any).url || '').toLowerCase();

            // Short title filter
            if (title.length < 15) {
                log('info', `CLEANED (short title): "${title}"`);
                return false;
            }

            // Political content exclusion
            if (politicalKeywords.some(kw => text.includes(kw))) {
                log('info', `CLEANED (political): ${title.substring(0, 50)}`);
                return false;
            }

            // Junk pattern exclusion
            if (junkPatterns.some(kw => text.includes(kw))) {
                log('info', `CLEANED (junk): ${title.substring(0, 50)}`);
                return false;
            }

            // Non-industrial primary topic exclusion (title starts with non-industrial type)
            if (/^(?:apartment|multifamily|hotel|hospitality|residential|condo|single.?family|self.?storage)\b/i.test(title)) {
                log('info', `CLEANED (non-industrial primary): ${title.substring(0, 50)}`);
                return false;
            }

            // Video exclusion
            if (/\/(videos?)\//i.test(url) || url.endsWith('.mp4')) {
                log('info', `CLEANED (video): ${title.substring(0, 50)}`);
                return false;
            }

            // Wrong-city exclusion — only strong city-name signals, not state names
            const hasWrongCity = cleanWrongCities.some(c => text.includes(c));
            if (hasWrongCity) {
                const hasRightState = TARGET_REGIONS.some(r => text.toUpperCase().includes(r));
                if (!hasRightState) {
                    log('info', `CLEANED (wrong city): ${title.substring(0, 50)}`);
                    return false;
                }
            }

            return true;
        });
        if (cleanMerged.length < mergedArticles.length) {
            log('info', `Cleaned ${mergedArticles.length - cleanMerged.length} bad articles from feed`);
        }

        // === STEP 4: Apply 90-day cleanup ===
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const cleanedArticles = cleanMerged.filter(item => {
            const pubDate = new Date(item.pubDate || item.date_published || item.fetchedAt || Date.now());
            return pubDate >= ninetyDaysAgo;
        });

        const removedCount = cleanMerged.length - cleanedArticles.length;
        if (removedCount > 0) {
            log('info', `Auto-deleted ${removedCount} articles older than 90 days`);
        }

        // Sort by publication date (newest first)
        const sortedItems = cleanedArticles.sort((a, b) =>
            new Date(b.pubDate || b.date_published || b.fetchedAt || 0).getTime() -
            new Date(a.pubDate || a.date_published || a.fetchedAt || 0).getTime()
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
        // Debug: Check how many items have descriptions
        const withDesc = rssItems.filter(i => i.description && i.description.trim().length > 0).length;
        const withoutDesc = rssItems.filter(i => !i.description || i.description.trim().length === 0).length;
        log('info', `Description check before JSON generation`, { withDesc, withoutDesc, sample: rssItems.slice(0, 3).map(i => ({ title: (i.title || '').substring(0, 30), descLen: (i.description || '').length })) });

        const feedJSON = generateJSONFeed(rssItems);
        fs.writeFileSync(path.join(DOCS_DIR, 'feed.json'), JSON.stringify(feedJSON, null, 2), 'utf8');
        log('info', 'Generated docs/feed.json', { itemCount: rssItems.length });

        // Generate Feed Health Report
        const feedHealthReport = generateFeedHealthReport(results);
        fs.writeFileSync(path.join(DOCS_DIR, 'feed-health.json'), JSON.stringify(feedHealthReport, null, 2), 'utf8');
        log('info', 'Generated docs/feed-health.json', { feedCount: feedHealthReport.feeds.length });

        // Generate Raw Feed for the Raw Articles tab (all fetched items, 72h, cap 500)
        const feedItemIds = new Set(rssItems.map(item => item.id));
        const rawFeed = generateRawFeed(allItems, feedItemIds);
        fs.writeFileSync(path.join(DOCS_DIR, 'raw-feed.json'), JSON.stringify(rawFeed), 'utf8');
        log('info', 'Generated docs/raw-feed.json', {
            rawCount: (rawFeed as any).stats.included_in_raw,
            totalFetched: (rawFeed as any).stats.total_fetched
        });

        // NOTE: docs/index.html is a separate vanilla JS implementation
        // Do NOT auto-copy frontend/index.html (React version) to docs/
        // The docs version is maintained separately for GitHub Pages

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

// Feed generators (generateRSSXML, generateJSONFeed, generateRawFeed, generateFeedHealthReport)
// imported from ./feed-generators.ts
