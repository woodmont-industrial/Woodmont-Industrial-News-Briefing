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
import { SCRAPER_CONFIGS } from '../scrapers/scraper-config.js';

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

        // NJ/PA/FL target regions - EXPANDED for better coverage
        const targetRegions = [
            // State identifiers
            'NJ', 'PA', 'FL', 'NEW JERSEY', 'PENNSYLVANIA', 'FLORIDA',
            // NJ Cities
            'NEWARK', 'JERSEY CITY', 'TRENTON', 'CAMDEN', 'EDISON', 'ELIZABETH', 'PATERSON',
            'WOODBRIDGE', 'TOMS RIVER', 'CLIFTON', 'PASSAIC', 'BAYONNE', 'HOBOKEN', 'UNION CITY',
            'NEW BRUNSWICK', 'PERTH AMBOY', 'HACKENSACK', 'SAYREVILLE', 'VINELAND', 'LINDEN',
            'SECAUCUS', 'KEARNY', 'CARTERET', 'SOUTH BRUNSWICK', 'EAST BRUNSWICK', 'PISCATAWAY',
            // NJ Regions & Counties
            'CENTRAL JERSEY', 'NORTH JERSEY', 'SOUTH JERSEY', 'RARITAN', 'MONROE', 'MIDDLESEX',
            'BERGEN', 'ESSEX', 'HUDSON', 'PASSAIC', 'UNION', 'MORRIS', 'SOMERSET', 'MERCER',
            'MONMOUTH', 'OCEAN', 'BURLINGTON', 'GLOUCESTER', 'ATLANTIC', 'CUMBERLAND',
            'MEADOWLANDS', 'EXIT 8A', 'I-95 CORRIDOR', 'TURNPIKE', 'GARDEN STATE PARKWAY',
            // PA Cities
            'PHILADELPHIA', 'PITTSBURGH', 'ALLENTOWN', 'BETHLEHEM', 'HARRISBURG', 'SCRANTON',
            'READING', 'LANCASTER', 'ERIE', 'WILKES-BARRE', 'CHESTER', 'NORRISTOWN', 'KING OF PRUSSIA',
            'PLYMOUTH MEETING', 'CONSHOHOCKEN', 'BLUE BELL', 'EXTON', 'MALVERN', 'WAYNE',
            // PA Regions & Counties
            'LEHIGH VALLEY', 'DELAWARE VALLEY', 'BUCKS COUNTY', 'CHESTER COUNTY', 'MONTGOMERY COUNTY',
            'DELAWARE COUNTY', 'BERKS COUNTY', 'LANCASTER COUNTY', 'YORK COUNTY', 'DAUPHIN COUNTY',
            'GREATER PHILADELPHIA', 'PHILLY', 'PENNSYLVANIA TURNPIKE',
            // FL Cities
            'MIAMI', 'ORLANDO', 'TAMPA', 'JACKSONVILLE', 'FORT LAUDERDALE', 'WEST PALM', 'BOCA RATON',
            'ST. PETERSBURG', 'HIALEAH', 'TALLAHASSEE', 'PORT ST. LUCIE', 'CAPE CORAL', 'PEMBROKE PINES',
            'HOLLYWOOD', 'MIRAMAR', 'GAINESVILLE', 'CORAL SPRINGS', 'CLEARWATER', 'PALM BAY',
            'POMPANO BEACH', 'DORAL', 'CORAL GABLES', 'SUNRISE', 'PLANTATION', 'DAVIE', 'WESTON',
            // FL Regions & Counties
            'SOUTH FLORIDA', 'CENTRAL FLORIDA', 'BROWARD', 'MIAMI-DADE', 'PALM BEACH', 'HILLSBOROUGH',
            'ORANGE COUNTY', 'DUVAL', 'PINELLAS', 'LEE COUNTY', 'POLK COUNTY', 'BREVARD',
            'PORT EVERGLADES', 'PORT OF MIAMI', 'TRI-COUNTY',
            // Major CRE players (include national news about these)
            'PROLOGIS', 'DUKE REALTY', 'BLACKSTONE', 'CBRE', 'JLL', 'CUSHMAN', 'COLLIERS',
            'NEWMARK', 'MARCUS & MILLICHAP', 'EASTDIL', 'HFF', 'BRIDGE INDUSTRIAL', 'DERMODY',
            'FIRST INDUSTRIAL', 'STAG INDUSTRIAL', 'REXFORD', 'TERRENO', 'MONMOUTH REAL ESTATE',
            // Industrial/logistics keywords that suggest regional relevance
            'PORT NEWARK', 'ELIZABETH PORT', 'SEAGIRT', 'PORTSIDE'
        ];

        // Content to EXCLUDE - political + non-CRE junk + international
        const excludeContent = [
            // POLITICAL CONTENT - STRICT EXCLUSION
            'TRUMP', 'BIDEN', 'PRESIDENT TRUMP', 'PRESIDENT BIDEN', 'WHITE HOUSE',
            'EXECUTIVE ORDER', 'TARIFF WAR', 'TRADE WAR', 'CONGRESS', 'SENATE',
            'REPUBLICAN', 'DEMOCRAT', 'ELECTION', 'POLITICAL',
            // NON-CRE JUNK - STRICT EXCLUSION
            'CRYPTOCURRENCY', 'BITCOIN', 'CRYPTO', 'NFT',
            'STUDENT LOAN', 'STUDENT DEBT',
            'SUPER BOWL', 'WORLD SERIES', 'PLAYOFFS', 'CHAMPIONSHIP',
            'HOROSCOPE', 'WEATHER FORECAST', 'COOKIES SETTINGS',
            'RECIPE', 'RESTAURANT REVIEW',
            'ELON MUSK', 'SPACEX', 'JEFF BEZOS', 'MARK ZUCKERBERG', 'BILL GATES',
            // NON-INDUSTRIAL PROPERTY TYPES (when mentioned as primary topic)
            'APARTMENT RENT', 'APARTMENT OCCUPANCY', 'MULTIFAMILY REPORT',
            'HOTEL OCCUPANCY', 'HOSPITALITY SECTOR',
            'SELF-STORAGE', 'SELF STORAGE',
            // INTERNATIONAL - US domestic only
            'EUROPEAN REAL ESTATE', 'UK REAL ESTATE', 'ASIA PACIFIC', 'ASIA REAL ESTATE',
            'GLOBAL OUTLOOK', 'GLOBAL MARKET OUTLOOK', 'CHINA EVERGRANDE',
            'UNITED KINGDOM', 'HONG KONG', 'SINGAPORE', 'TOKYO', 'SHANGHAI', 'BEIJING',
            'LONDON MARKET', 'SYDNEY', 'TORONTO', 'DUBAI', 'LATIN AMERICA',
            'MIDDLE EAST', 'AFRICA MARKET', 'APAC MARKET', 'EMEA'
        ];

        // INDUSTRIAL-focused keywords - strict set for filtering national sources
        const industrialKeywords = [
            'WAREHOUSE', 'LOGISTICS', 'DISTRIBUTION', 'MANUFACTURING', 'COLD STORAGE',
            'INDUSTRIAL', 'FULFILLMENT', 'LAST MILE', 'LAST-MILE', 'E-COMMERCE', 'ECOMMERCE',
            'SUPPLY CHAIN', 'FREIGHT', 'CARGO', 'INTERMODAL', '3PL', 'THIRD-PARTY LOGISTICS',
            'FLEX SPACE', 'FLEX INDUSTRIAL', 'INDUSTRIAL PARK', 'DISTRIBUTION CENTER',
            'FULFILLMENT CENTER', 'CROSS-DOCK', 'SPEC INDUSTRIAL', 'LOADING DOCK',
            'TRUCK COURT', 'CLEAR HEIGHT', 'DOCK DOORS', 'RAIL-SERVED'
        ];

        // Broader CRE keywords (what to INCLUDE - focused on industrial CRE, no non-industrial property types)
        const realEstateKeywords = [
            // Industrial/logistics (same as above)
            'WAREHOUSE', 'LOGISTICS', 'DISTRIBUTION', 'MANUFACTURING', 'COLD STORAGE',
            'INDUSTRIAL', 'FULFILLMENT', 'LAST MILE', 'LAST-MILE', 'E-COMMERCE', 'ECOMMERCE',
            'SUPPLY CHAIN', 'FREIGHT', 'CARGO', 'INTERMODAL', '3PL', 'THIRD-PARTY LOGISTICS',
            'FLEX SPACE', 'FLEX INDUSTRIAL',
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
            'REFINANCING', 'MORTGAGE'
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

        // Trusted national sources (include if industrial context present)
        const trustedNationalSources = ['news.google.com', 'bloomberg.com', 'wsj.com', 'reuters.com',
            'freightwaves.com', 'supplychaindive.com', 'dcvelocity.com', 'areadevelopment.com',
            'bisnow.com/national', 'commercialcafe.com', 'prologis.com',
            'crexi.com', 'ten-x.com', 'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com'];

        // Check if article should be included - MORE INCLUSIVE VERSION
        const shouldIncludeArticle = (item: NormalizedItem): boolean => {
            const text = `${item.title || ''} ${item.description || ''}`.toUpperCase();
            const textLower = text.toLowerCase();
            // Check both 'link' (from fetcher) and 'url' (from feed.json)
            const url = (item.link || item.url || '').toLowerCase();
            // Also check source name for Google News items
            const sourceName = (item.source || '').toLowerCase();

            // Check for excluded content (political only now)
            const hasExcludedContent = excludeContent.some(c => text.includes(c));

            // Exclude political content from ALL sources
            if (hasExcludedContent) {
                log('info', `EXCLUDED (political): ${item.title?.substring(0, 60)}`);
                return false;
            }

            // Exclude video content (boss feedback: avoid videos)
            const isVideo = /\/(videos?)\//i.test(url) || url.endsWith('.mp4') || url.includes('video.foxbusiness') || url.includes('video.cnbc');
            if (isVideo) {
                log('info', `EXCLUDED (video): ${item.title?.substring(0, 60)}`);
                return false;
            }

            // BOSS PREFERRED SOURCES (e.g., GlobeSt) - light filter but require CRE relevance
            const isBossPreferred = bossPreferredSources.some(s => url.includes(s) || sourceName.includes(s));
            if (isBossPreferred) {
                // Even boss sources should exclude clearly non-industrial content
                const nonIndustrialContent = /\b(APARTMENT|MULTIFAMILY|HOTEL|HOSPITALITY|RESIDENTIAL|CONDO|SINGLE.?FAMILY|RESTAURANT|SELF.?STORAGE)\b/.test(text);
                if (nonIndustrialContent && !industrialKeywords.some(k => text.includes(k))) {
                    log('info', `EXCLUDED (boss source, non-industrial): ${item.title?.substring(0, 60)}`);
                    return false;
                }
                log('info', `INCLUDED (boss preferred): ${item.title?.substring(0, 60)}`);
                return true;
            }

            // Always include from regional sources
            const isRegionalSource = regionalSources.some(s => url.includes(s));

            // Check if from trusted national/Google News source
            const isTrustedNational = trustedNationalSources.some(s => url.includes(s) || sourceName.includes(s));
            const isGoogleNews = url.includes('news.google.com') || sourceName.includes('google news');

            // Check if has real estate context - use flexible matching
            const hasRealEstateContext = realEstateKeywords.some(k => {
                // Use word boundary matching for short keywords
                if (k.length <= 3) {
                    return text.includes(` ${k} `) || text.includes(`${k} `) || text.includes(` ${k}`);
                }
                return text.includes(k);
            });

            // Category-specific keywords - ALWAYS INCLUDE these regardless of region
            const hasAvailabilityWords = /\b(AVAILABLE|LISTED|FOR\s*LEASE|FOR\s*SALE|ON\s*THE\s*MARKET|NEWLY\s*MARKETED|ASKING|MARKETED|LISTING)\b/.test(text);
            const hasPeopleWords = /\b(PROMOTED|HIRED|JOINS|JOINED|NAMES|NAMED|APPOINTS|APPOINTED|EXPANDS?\s*TEAM|TAPS|WELCOMES|RECRUITS|ELEVATED|NEW\s*HIRE|EXECUTIVE)\b/.test(text);
            const hasTransactionWords = /\b(PURCHASED|ACQUIRES?D?|BOUGHT|SIGNS?\s*LEASE|LEASED|CLOSED|SOLD|SALE\s*OF|ACQUIRED|ACQUISITION|DISPOSITION)\b/.test(text);

            // Check for excluded states/cities - but be more lenient
            const mentionsExcludedState = excludeStates.some(s => text.includes(s));
            const mentionsExcludedCity = excludeCities.some(c => text.includes(c));
            // Use flexible matching for target regions
            const mentionsTargetRegion = targetRegions.some(r => {
                if (r.length <= 2) {
                    // State codes need word boundaries
                    return text.includes(` ${r} `) || text.includes(`${r},`) || text.includes(`${r}.`) || text.endsWith(` ${r}`);
                }
                return text.includes(r);
            });

            // If from regional source, always include (already passed political check)
            if (isRegionalSource) {
                return true;
            }

            // CATEGORY EXCEPTIONS: Include people news and availability news even without specific region
            // These categories are valuable regardless of explicit state mention
            if (hasPeopleWords && hasRealEstateContext) {
                log('info', `INCLUDED (people news with CRE context): ${item.title?.substring(0, 60)}`);
                return true;
            }

            // Check for industrial context (stricter than general CRE)
            const hasIndustrialContext = industrialKeywords.some(k => {
                if (k.length <= 3) {
                    return text.includes(` ${k} `) || text.includes(`${k} `) || text.includes(` ${k}`);
                }
                return text.includes(k);
            });

            // Google News and trusted national sources: Require INDUSTRIAL context
            if (isGoogleNews || isTrustedNational) {
                // Include if has industrial content (not just generic CRE/finance)
                if (hasIndustrialContext || (hasRealEstateContext && mentionsTargetRegion)) {
                    // Only exclude if STRONGLY about wrong state
                    if ((mentionsExcludedState || mentionsExcludedCity) && !mentionsTargetRegion) {
                        const wrongStateMentions = [...excludeStates, ...excludeCities].filter(s => text.includes(s)).length;
                        const rightStateMentions = targetRegions.filter(r => text.includes(r)).length;
                        if (wrongStateMentions > 1 && rightStateMentions === 0) {
                            log('info', `EXCLUDED (strongly out-of-state): ${item.title?.substring(0, 60)}`);
                            return false;
                        }
                    }
                    return true;
                }
                // Exclude generic finance/business news from national sources
                if (!hasRealEstateContext && !mentionsTargetRegion) {
                    log('info', `EXCLUDED (national source, no CRE context): ${item.title?.substring(0, 60)}`);
                    return false;
                }
                // Include if mentions target region with CRE context
                if (mentionsTargetRegion && hasRealEstateContext) {
                    return true;
                }
            }

            // For articles with availability or transaction signals, be inclusive
            if (hasAvailabilityWords || hasTransactionWords) {
                if (mentionsTargetRegion || !mentionsExcludedState) {
                    return true;
                }
            }

            // For other sources, require target region OR real estate context without wrong state
            if (mentionsTargetRegion) {
                return true;
            }

            // If has real estate context and no wrong state mention, include
            if (hasRealEstateContext && !mentionsExcludedState && !mentionsExcludedCity) {
                return true;
            }

            // Exclude articles that mention excluded states without target region
            if (mentionsExcludedState || mentionsExcludedCity) {
                log('info', `EXCLUDED (out-of-state): ${item.title?.substring(0, 60)}`);
                return false;
            }

            // Include anything with real estate context
            return hasRealEstateContext;
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

            // 1. TRANSACTIONS - Deal signals WITH CRE context
            if (hasCREContext && (hasTransactionAction || (hasDollarAmount && hasSquareFeet) || (hasDollarAmount && hasPropertyType))) {
                item.category = 'transactions';
                return item;
            }

            // 2. AVAILABILITIES - Property coming to market WITH property type context
            if (hasAvailabilityWords && hasPropertyType) {
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

        // === AI FILTERING (if GROQ_API_KEY is set) ===
        let aiFilteredItems = filteredNewItems;
        if (process.env.GROQ_API_KEY) {
            log('info', 'Running AI classification on articles...');
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
            log('info', 'GROQ_API_KEY not set, skipping AI classification');
        }

        // === POST-AI REGIONAL VALIDATION ===
        // Double-check that articles are actually about NJ/PA/FL - EXPANDED keyword list
        const njpaflKeywords = [
            // NJ identifiers and cities
            'new jersey', 'newjersey', ' nj ', ', nj', 'nj,', 'jersey city', 'newark', 'edison', 'trenton',
            'exit 8a', 'turnpike', 'meadowlands', 'bergen', 'middlesex', 'monmouth', 'camden',
            'woodbridge', 'elizabeth', 'paterson', 'clifton', 'passaic', 'bayonne', 'hoboken',
            'secaucus', 'kearny', 'carteret', 'piscataway', 'south brunswick', 'east brunswick',
            'new brunswick', 'perth amboy', 'hackensack', 'sayreville', 'linden', 'union',
            'morris', 'somerset', 'mercer', 'ocean', 'burlington', 'gloucester', 'atlantic',
            'garden state', 'i-95', 'north jersey', 'south jersey', 'central jersey',
            // PA identifiers and cities
            'pennsylvania', 'philadelphia', 'philly', 'lehigh valley', 'allentown', 'harrisburg',
            'pittsburgh', 'bucks county', 'chester county', 'delaware valley', 'montgomery county',
            ', pa ', ', pa,', 'king of prussia', 'conshohocken', 'plymouth meeting', 'exton',
            'malvern', 'wayne', 'blue bell', 'reading', 'lancaster', 'scranton', 'wilkes-barre',
            'berks', 'york county', 'dauphin', 'greater philadelphia', 'pa turnpike',
            // FL identifiers and cities
            'florida', 'miami', 'tampa', 'orlando', 'jacksonville', 'fort lauderdale',
            'boca raton', 'palm beach', 'broward', 'dade', 'clearwater', 'port everglades',
            ', fl ', ', fl,', 'south florida', 'central florida', 'st. petersburg', 'hialeah',
            'pembroke pines', 'hollywood', 'miramar', 'coral springs', 'pompano beach', 'doral',
            'coral gables', 'sunrise', 'plantation', 'davie', 'weston', 'hillsborough',
            'orange county', 'duval', 'pinellas', 'lee county', 'polk county', 'brevard',
            'port of miami', 'tri-county', 'palm bay', 'cape coral',
            // Major CRE firms (include national news about them)
            'prologis', 'duke realty', 'blackstone', 'bridge industrial', 'dermody',
            'first industrial', 'stag industrial', 'monmouth real estate'
        ];

        const wrongStateKeywords = [
            'texas', 'california', 'ohio', 'indiana', 'illinois', 'georgia', 'arizona',
            'tennessee', 'louisiana', 'colorado', 'washington', 'oregon', 'nevada',
            'carolina', 'virginia', 'maryland', 'michigan', 'wisconsin', 'minnesota',
            'alabama', 'kentucky', 'arkansas', 'iowa', 'kansas', 'missouri', 'oklahoma',
            'new mexico', 'utah', 'montana', 'idaho', 'wyoming', 'nebraska', 'connecticut',
            'massachusetts', 'new york', 'maine', 'vermont', 'new hampshire', 'rhode island',
            'dallas', 'houston', 'austin', 'los angeles', 'chicago', 'atlanta', 'phoenix',
            'denver', 'seattle', 'las vegas', 'nashville', 'charlotte', 'indianapolis',
            'birmingham', 'mobile', 'auburn', 'huntsville', 'louisville', 'baton rouge',
            'new orleans', 'little rock', 'memphis', 'st. louis', 'kansas city', 'oklahoma city',
            'albuquerque', 'salt lake', 'boise', 'boston', 'hartford', 'buffalo', 'albany'
        ];

        const regionallyValidated = aiFilteredItems.filter(item => {
            const text = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
            const url = (item.link || (item as any).url || '').toLowerCase();
            const sourceName = (item.source || '').toLowerCase();

            // BOSS PREFERRED SOURCES (GlobeSt) - skip state filtering entirely
            const isBossPreferred = bossPreferredSources.some(s => url.includes(s) || sourceName.includes(s));
            if (isBossPreferred) {
                return true; // Always include GlobeSt
            }

            // Check if it has CRE context - be VERY lenient for articles with CRE signals
            const hasCREContext = /\b(warehouse|logistics|industrial|commercial|real estate|property|cre|multifamily|office|retail|lease|acquisition|transaction|development|construction|investor|reit|broker|tenant|landlord)\b/i.test(text);
            const hasPeopleNews = /\b(promoted|hired|joins|joined|named|appointed|taps|welcomes|executive|ceo|cfo|president|director)\b/i.test(text);
            const hasAvailability = /\b(available|listed|for lease|for sale|on the market|marketing|groundbreaking|delivered|construction)\b/i.test(text);
            const hasTransaction = /\b(acquired|sold|purchased|leased|signed|closed|deal|financing)\b/i.test(text);
            const hasMacroTrend = /\b(cap rate|vacancy|absorption|rent growth|market report|outlook|forecast|trend|demand|supply)\b/i.test(text);

            // Check if it mentions wrong states (and doesn't mention NJ/PA/FL)
            const hasWrongState = wrongStateKeywords.some(kw => text.includes(kw));
            const hasRightState = njpaflKeywords.some(kw => text.includes(kw));

            // Include people news, availability, transaction, or macro news even without explicit region
            if ((hasPeopleNews || hasAvailability || hasTransaction || hasMacroTrend) && hasCREContext) {
                return true;
            }

            // If has any CRE context and mentions right state, always include
            if (hasCREContext && hasRightState) {
                return true;
            }

            // If it has wrong state keywords and NO right state keywords and NO CRE value
            if (hasWrongState && !hasRightState) {
                // Count how many SPECIFIC wrong state keywords appear (cities are stronger signals)
                const wrongCities = ['dallas', 'houston', 'austin', 'los angeles', 'chicago', 'atlanta', 'phoenix',
                    'denver', 'seattle', 'las vegas', 'nashville', 'charlotte', 'indianapolis', 'birmingham',
                    'mobile', 'auburn', 'huntsville', 'louisville', 'memphis', 'st. louis'];
                const wrongCityCount = wrongCities.filter(c => text.includes(c)).length;

                // Only exclude if has city-level wrong state mention (stronger signal)
                if (wrongCityCount >= 1) {
                    log('info', `POST-AI EXCLUDED (wrong state): ${(item.title || '').substring(0, 50)}`);
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

        // Also filter out bad existing articles (out-of-state that slipped through before)
        // Apply SAME strict regional validation to ALL articles including existing ones
        const wrongStateKeywordsClean = [
            'texas', 'california', 'ohio', 'indiana', 'illinois', 'georgia', 'arizona',
            'tennessee', 'louisiana', 'colorado', 'washington', 'oregon', 'nevada',
            'carolina', 'virginia', 'maryland', 'michigan', 'wisconsin', 'minnesota',
            'alabama', 'kentucky', 'arkansas', 'iowa', 'kansas', 'missouri', 'oklahoma',
            'new mexico', 'utah', 'montana', 'idaho', 'wyoming', 'nebraska', 'connecticut',
            'massachusetts', 'new york', 'maine', 'vermont', 'new hampshire', 'rhode island',
            'dallas', 'houston', 'austin', 'los angeles', 'chicago', 'atlanta', 'phoenix',
            'denver', 'seattle', 'las vegas', 'nashville', 'charlotte', 'indianapolis',
            'birmingham', 'mobile', 'auburn', 'huntsville', 'louisville', 'baton rouge',
            'new orleans', 'little rock', 'memphis', 'st. louis', 'kansas city', 'oklahoma city',
            'albuquerque', 'salt lake', 'boise', 'boston', 'hartford', 'buffalo', 'albany'
        ];
        const njpaflKeywordsClean = [
            // NJ
            'new jersey', 'jersey', ' nj ', ', nj', 'newark', 'edison', 'trenton', 'exit 8a',
            'jersey city', 'meadowlands', 'bergen', 'middlesex', 'woodbridge', 'secaucus',
            'hackensack', 'hoboken', 'elizabeth', 'passaic', 'union', 'morris', 'somerset',
            // PA
            'pennsylvania', 'philadelphia', 'philly', 'lehigh valley', 'allentown', 'pittsburgh',
            'harrisburg', 'king of prussia', 'bucks county', 'chester county', 'montgomery county',
            ', pa ', 'delaware valley', 'greater philadelphia',
            // FL
            'florida', 'miami', 'tampa', 'orlando', 'jacksonville', 'fort lauderdale',
            'boca raton', 'palm beach', 'broward', 'dade', 'south florida', 'central florida',
            ', fl ', 'hialeah', 'pembroke pines', 'coral springs', 'pompano beach', 'doral',
            // Major CRE players
            'prologis', 'duke realty', 'blackstone', 'bridge industrial'
        ];
        // Only exclude political content
        const politicalKeywords = [
            'trump', 'biden', 'election', 'executive order', 'tariff war', 'trade war',
            'congress', 'senate', 'republican', 'democrat', 'political'
        ];

        const cleanMerged = mergedArticles.filter(item => {
            const title = (item.title || '').trim();
            const text = (title + ' ' + (item.description || '')).toLowerCase();
            const url = (item.link || (item as any).url || '').toLowerCase();
            const sourceName = (item.source || '').toLowerCase();

            // Minimum title length - filter out "Cookies Settings", "Skip to content", etc
            if (title.length < 15) {
                log('info', `CLEANED (short title): "${title}"`);
                return false;
            }

            // Check for political content (exclude from ALL sources including GlobeSt)
            if (politicalKeywords.some(kw => text.includes(kw))) {
                log('info', `CLEANED (political): ${title.substring(0, 50)}`);
                return false;
            }

            // Exclude junk content patterns
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
            if (junkPatterns.some(kw => text.includes(kw))) {
                log('info', `CLEANED (junk): ${title.substring(0, 50)}`);
                return false;
            }

            // Exclude non-industrial property types (when mentioned as PRIMARY topic, not incidental)
            const nonIndustrialPrimary = /^(?:apartment|multifamily|hotel|hospitality|residential|condo|single.?family|self.?storage)\b/i.test(title);
            if (nonIndustrialPrimary) {
                log('info', `CLEANED (non-industrial primary): ${title.substring(0, 50)}`);
                return false;
            }

            // Exclude video content
            if (/\/(videos?)\//i.test(url) || url.endsWith('.mp4')) {
                log('info', `CLEANED (video): ${title.substring(0, 50)}`);
                return false;
            }

            // BOSS PREFERRED SOURCES (GlobeSt) - skip state filtering
            const isBossPreferred = bossPreferredSources.some(s => url.includes(s) || sourceName.includes(s));
            if (isBossPreferred) {
                return true;
            }

            // Check if has industrial/CRE context - use STRICT industrial keywords
            const hasIndustrialContext = /\b(warehouse|logistics|industrial|distribution|manufacturing|cold storage|fulfillment|last.?mile|supply chain|freight|3pl|flex.?space|loading dock|clear height)\b/i.test(text);
            const hasCREContext = /\b(commercial real estate|real estate|property|cre|lease|acquisition|transaction|development|construction|investor|reit|broker|tenant|landlord|deal|financing|vacancy|absorption|rent growth)\b/i.test(text);

            // Check wrong state vs right state
            const hasRightState = njpaflKeywordsClean.some(kw => text.includes(kw));

            // If has industrial context, always keep (regardless of state)
            if (hasIndustrialContext) {
                return true;
            }

            // If mentions NJ/PA/FL location with CRE context, keep
            if (hasRightState && hasCREContext) {
                return true;
            }

            // If mentions NJ/PA/FL location, keep
            if (hasRightState) {
                return true;
            }

            // If has CRE context without wrong state mention, keep
            const wrongCities = ['dallas', 'houston', 'austin', 'los angeles', 'chicago', 'atlanta', 'phoenix',
                'denver', 'seattle', 'las vegas', 'nashville', 'charlotte', 'indianapolis', 'birmingham',
                'mobile', 'auburn', 'huntsville', 'louisville', 'memphis', 'st. louis'];
            const hasWrongCity = wrongCities.some(c => text.includes(c));

            if (hasWrongCity && !hasRightState) {
                log('info', `CLEANED (wrong city): ${title.substring(0, 50)}`);
                return false;
            }

            // Keep articles with CRE context
            if (hasCREContext) {
                return true;
            }

            // Exclude articles without any CRE/industrial/regional relevance
            log('info', `CLEANED (no CRE context): ${title.substring(0, 50)}`);
            return false;
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

/**
 * Generate RSS 2.0 XML from articles
 */
function generateRSSXML(items: NormalizedItem[]): string {
    const categoryLabels: Record<string, string> = {
        relevant: 'Relevant — Market Trends & Real Estate News',
        transactions: 'Transactions — Property Sales & Leases',
        availabilities: 'Availabilities — Properties for Sale or Lease',
        people: 'People News — Personnel Moves in CRE'
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

/**
 * Generate JSON Feed from articles
 */
function generateJSONFeed(items: NormalizedItem[]): object {
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
                date_published: item.pubDate || item.date_published || new Date().toISOString(),
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

/**
 * Generate Feed Health Report - JSON report showing status of each feed
 */
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

function generateRawFeed(
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

    // Filter to recent, valid items and deduplicate by title
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

function generateFeedHealthReport(results: FetchResult[]): FeedHealthReport {
    const feeds: FeedHealthEntry[] = [];

    // Create a map of feed names to URLs from config
    const feedUrlMap = new Map<string, string>();
    for (const feed of RSS_FEEDS) {
        feedUrlMap.set(feed.name, feed.url);
    }

    // Create a map of scraper names to their config
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

    // Sort by status (failed first) then by name
    feeds.sort((a, b) => {
        if (a.status !== b.status) {
            return a.status === 'failed' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    const successfulFeeds = feeds.filter(f => f.status === 'ok').length;
    const failedFeeds = feeds.filter(f => f.status === 'failed').length;
    const totalArticlesFetched = feeds.reduce((sum, f) => sum + f.fetchedRaw, 0);
    const totalArticlesKept = feeds.reduce((sum, f) => sum + f.keptAfterFiltering, 0);

    // Scraper-specific summary
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
