import * as http from 'http';
import { handleRequest } from './src/server/endpoints.js';
import { fetchAllRSSArticles } from './src/feeds/fetcher.js';
import { saveArticlesToFile, loadArticlesFromFile } from './src/store/storage.js';
import { log } from './src/server/logging.js';

const PORT = process.env.PORT || 8080;

type FetchResult = {
    status: "ok" | "error";
    articles: NormalizedItem[];
    error?: { type: string; message: string; httpStatus?: number };
    meta: { feed: string; fetchedRaw: number; kept: number; filteredOut: number; durationMs: number };
};

const API_KEY = process.env.API_KEY || ""; // optional: require for /api/manual when set
const ITEM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (increased for better coverage)
const FETCH_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes


type NormalizedItem = {
    id: string;
    guid?: string;
    canonicalUrl: string;
    title: string;
    link: string;
    pubDate: string;
    description: string;
    author: string;
    publisher: string;
    image: string;
    thumbnailUrl: string;
    access: string;
    status: number;
    fetchedAt: string;
    source: string;
    regions: string[];
    topics: string[];
    category: string;
    tier?: 'A' | 'B' | 'C';
    score?: number;  // Relevance score for ranking
    archived?: boolean;
};

type FeedStat = {
    lastFetch: string;
    lastSuccess: string | null;
    lastError: string | null;
    itemsFetched: number;
};

type LinkValidation = {
    ok: boolean;
    status: number;
    access: string;
    bodySample?: string;
    contentType?: string;
};

type FeedConfig = {
    url: string;
    name: string;
    region: string;
    source: string;
    enabled?: boolean;
    timeout?: number;
    headers?: Record<string, string>;
};

const circuitBreaker = new Map<string, { failureCount: number, blockedUntil: number }>();

// List of RSS feed URLs (strictly focused on CRE + Industrial content in NJ/PA/FL/TX markets)
// Browser headers to bypass 403 errors
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache"
};

// ONLY WORKING FEEDS - Based on validation results
const RSS_FEEDS: FeedConfig[] = [
  // ============================================
  // MANDATORY SOURCES (Boss's Priority List)
  // ============================================
  
  // 1. REAL ESTATE NJ ✅ - Working
  { url: "https://re-nj.com/feed/", name: "Real Estate NJ", region: "NJ", source: "Real Estate NJ", timeout: 30000 },
  
  // 2. COMMERCIAL SEARCH - Using alternative (CommercialCafe is same company)
  { url: "https://www.commercialcafe.com/blog/feed/", name: "Commercial Cafe", region: "US", source: "Commercial Search", timeout: 30000, headers: BROWSER_HEADERS },
  
  // 3. WSJ ✅ - Working
  { url: "https://feeds.content.dowjones.io/public/rss/latestnewsrealestate", name: "WSJ Real Estate", region: "US", source: "WSJ", timeout: 30000 },
  
  // 4. BISNOW ✅ - All regions working
  { url: "https://www.bisnow.com/rss-feed/new-jersey", name: "Bisnow New Jersey", region: "NJ", source: "Bisnow", timeout: 30000 },
  { url: "https://www.bisnow.com/rss-feed/philadelphia", name: "Bisnow Philadelphia", region: "PA", source: "Bisnow", timeout: 30000 },
  { url: "https://www.bisnow.com/rss-feed/south-florida", name: "Bisnow South Florida", region: "FL", source: "Bisnow", timeout: 30000 },
  { url: "https://www.bisnow.com/rss-feed/dallas-ft-worth", name: "Bisnow Dallas-Ft Worth", region: "TX", source: "Bisnow", timeout: 30000 },
  { url: "https://www.bisnow.com/rss-feed/national", name: "Bisnow National", region: "US", source: "Bisnow", timeout: 30000 },
  { url: "https://www.bisnow.com/rss-feed/houston", name: "Bisnow Houston", region: "TX", source: "Bisnow", timeout: 30000 },
  { url: "https://www.bisnow.com/rss-feed/new-york", name: "Bisnow New York", region: "NY", source: "Bisnow", timeout: 30000 },
  { url: "https://www.bisnow.com/rss-feed/boston", name: "Bisnow Boston", region: "MA", source: "Bisnow", timeout: 30000 },
  
  // 5. GLOBEST - Using alternative feed URL
  { url: "https://www.globest.com/feed/", name: "GlobeSt", region: "US", source: "GlobeSt", timeout: 30000, headers: BROWSER_HEADERS },
  
  // 6. NAIOP - Using blog feed
  { url: "https://blog.naiop.org/feed/", name: "NAIOP Blog", region: "US", source: "NAIOP", timeout: 30000, headers: BROWSER_HEADERS },
  
  // 7. COMMERCIAL PROPERTY EXECUTIVE - Using main feed
  { url: "https://www.cpexecutive.com/feed/", name: "Commercial Property Executive", region: "US", source: "CPE", timeout: 30000, headers: BROWSER_HEADERS },
  
  // 8. SOUTH FL BUSINESS JOURNAL - Multiple attempts
  { url: "https://www.bizjournals.com/southflorida/news/feed", name: "South FL Business Journal", region: "FL", source: "BizJournals", timeout: 30000, headers: BROWSER_HEADERS },
  
  // 9. LOOPNET/COSTAR - No public RSS, using CRE alternatives
  // Note: LoopNet and CoStar don't offer public RSS feeds
  
  // 10. LEHIGH VALLEY BUSINESS ✅ - Working
  { url: "https://lvb.com/feed/", name: "Lehigh Valley Business", region: "PA", source: "Lehigh Valley Business", timeout: 30000 },
  
  // 11. DAILY RECORD NJ - Alternative feeds
  { url: "https://www.northjersey.com/arcio/rss/category/news/morris/", name: "North Jersey Morris", region: "NJ", source: "Daily Record", timeout: 30000, headers: BROWSER_HEADERS },
  
  // 12. NJBIZ ✅ - Working
  { url: "https://njbiz.com/feed/", name: "NJBIZ", region: "NJ", source: "NJBIZ", timeout: 30000 },

  // ============================================
  // ADDITIONAL QUALITY SOURCES
  // ============================================
  
  // ConnectCRE (Industrial focused) ✅ - Working
  { url: "https://www.connectcre.com/feed?story-sector=industrial", name: "ConnectCRE Industrial", region: "US", source: "ConnectCRE", timeout: 30000 },
  { url: "https://www.connectcre.com/feed?story-market=new-jersey", name: "ConnectCRE NJ", region: "NJ", source: "ConnectCRE", timeout: 30000 },
  { url: "https://www.connectcre.com/feed?story-market=texas", name: "ConnectCRE Texas", region: "TX", source: "ConnectCRE", timeout: 30000 },
  { url: "https://www.connectcre.com/feed?story-market=pennsylvania", name: "ConnectCRE PA", region: "PA", source: "ConnectCRE", timeout: 30000 },
  
  // Supply Chain & Logistics
  { url: "https://www.supplychaindive.com/feeds/news/", name: "Supply Chain Dive", region: "US", source: "Supply Chain Dive", timeout: 30000 },
  { url: "https://www.freightwaves.com/feed/", name: "FreightWaves", region: "US", source: "FreightWaves", timeout: 30000 },
  
  // CRE News
  { url: "https://www.credaily.com/feed/", name: "CRE Daily", region: "US", source: "CRE Daily", timeout: 30000 },
  { url: "https://www.therealdeal.com/new-york/feed/", name: "The Real Deal NY", region: "NY", source: "The Real Deal", timeout: 30000 },
  { url: "https://www.therealdeal.com/miami/feed/", name: "The Real Deal Miami", region: "FL", source: "The Real Deal", timeout: 30000 },
  
  // REBusinessOnline (Good industrial coverage)
  { url: "https://rebusinessonline.com/feed/", name: "REBusiness Online", region: "US", source: "REBusiness", timeout: 30000, headers: BROWSER_HEADERS },
];

// Manual articles added via UI form (in-memory)
const manualArticles: NormalizedItem[] = [];

// In-memory fetch cache (per-feed) and item store (deduped, retained for 7d)
const fetchCache = new Map<string, { etag?: string; lastModified?: string; body: any; headers: any; fetchedAt: number; status: number }>(); // key: feed.url, value: { etag, lastModified, body, fetchedAt, status }
const itemStore = new Map<string, NormalizedItem>();  // key: id, value: normalized item
const feedStats = new Map<string, FeedStat>();  // key: feed.url, value: { lastFetch, lastSuccess, lastError, itemsFetched }

// Track last fetch information
let lastFetchInfo = {
    timestamp: new Date().toISOString(),
    totalFetched: 0,
    totalKept: 0,
    sourcesProcessed: 0,
    lastArticle: null as NormalizedItem | null,
    recentArticles: [] as NormalizedItem[]
};
let windowDefaultHours = 720; // default articles window if not specified (30 days)
const FRONTEND_FILE = path.join(process.cwd(), "frontend", "index.html");

// File-based persistent storage
const STORAGE_FILE = path.join(process.cwd(), 'articles.json');

function saveArticlesToFile() {
    try {
        const articles = Array.from(itemStore.values());
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(articles, null, 2), 'utf8');
        console.log(`✓ Saved ${articles.length} articles to ${STORAGE_FILE}`);
    } catch (err) {
        console.error('Failed to save articles:', err);
    }
}

function loadArticlesFromFile() {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, 'utf8');
            const articles: NormalizedItem[] = JSON.parse(data);
            
            // Re-categorize articles that have category "other" or no category
            let recategorizedCount = 0;
            articles.forEach(article => {
                if (!article.category || article.category === 'other' || article.category === '') {
                    const classification = classifyArticle(
                        article.title || '', 
                        article.description || '', 
                        article.link || '', 
                        article.source
                    );
                    article.category = classification.category;
                    recategorizedCount++;
                }
                itemStore.set(article.id, article);
            });
            
            if (recategorizedCount > 0) {
                console.log(`✓ Re-categorized ${recategorizedCount} articles`);
                // Save the updated categories
                saveArticlesToFile();
            }
            
            console.log(`✓ Loaded ${articles.length} articles from ${STORAGE_FILE}`);
            return articles.length;
        }
    } catch (err) {
        console.error('Failed to load articles:', err);
    }
    return 0;
}

// Industrial/Warehouse keyword filters - EXPANDED for better coverage
const INDUSTRIAL_KEYWORDS = [
    "industrial", "warehouse", "distribution", "logistics", "fulfillment",
    "last-mile", "last mile", "3pl", "port", "drayage", "intermodal",
    "ios", "outdoor storage", "manufacturing", "manufacturing plant",
    "cold storage", "refrigerated", "temperature-controlled", "cold chain",
    "data center", "data centre", "server farm", "cloud facility",
    "cross-dock", "cross dock", "spec industrial", "speculative industrial",
    "flex space", "flex industrial", "r&d", "research and development",
    "food processing", "food facility", "beverage facility", "brewery",
    "automotive", "auto parts", "assembly plant", "stamping plant",
    "aerospace", "aviation", "aircraft facility", "mro facility",
    "life sciences", "biotech", "pharmaceutical", "medtech",
    "chemical plant", "processing plant", "industrial park",
    "trade hub", "distribution hub", "logistics hub", "fulfillment hub",
    "e-commerce", "ecommerce", "online retail", "digital commerce",
    "supply chain", "supply chain network", "distribution network",
    "material handling", "conveyor", "automation", "robotics",
    "industrial real estate", "logistics real estate", "warehouse real estate"
];

// CRE Intent keywords - commercial real estate focus - EXPANDED
const CRE_INTENT_KEYWORDS = [
    "commercial real estate", "real estate", "cre",
    "lease", "leasing", "tenant", "landlord",
    "broker", "brokerage", "listing", "for lease", "for sale",
    "zoning", "entitlement", "planning board", "rezoning",
    "square feet", "sq ft", "sf", "acres",
    "rent", "asking rent", "nnn", "triple net", "gross lease",
    "cap rate", "noi", "acquisition", "sale", "sold", "purchased",
    "development", "redevelopment", "ground-up development",
    "investment", "investor", "institutional", "private equity",
    "reit", "real estate investment trust", "fund", "fund manager",
    "property", "asset", "portfolio", "asset management",
    "prologis", "dltr", "dre", "equity", "blackstone", "cbre", "jll",
    "cushman", "colliers", "newmark", "cushman & wakefield",
    "industrial landlord", "industrial developer", "logistics developer",
    "build-to-suit", "bts", "design-build", "turnkey",
    "net lease", "absolute net lease", "ground lease",
    "sale-leaseback", "sale leaseback", "monetization",
    "refinance", "mortgage", "loan", "financing"
];

// Property signals that catch legitimate industrial CRE stories - EXPANDED
const PROPERTY_SIGNALS = [
    "facility", "building", "site", "development", "project",
    "spec", "speculative", "build-to-suit", "bts",
    "groundbreaking", "construction", "delivered", "deliveries",
    "zoning", "entitlement", "rezoning",
    "industrial park", "distribution center", "fulfillment center",
    "square-foot", "square feet", "sf", "sq ft", "acres",
    "clear height", "dock doors", "loading docks", "truck court",
    "rail service", "rail spur", "rail-served", "rail access",
    "highway access", "interstate access", "infrastructure",
    "power capacity", "electrical service", "utilities",
    "sprinkler system", "fire suppression", "esfr",
    "temperature control", "climate control", "refrigeration",
    "security", "fenced", "gated", "24/7 access",
    "parking ratio", "truck parking", "car parking",
    "expansion", "addition", "renovation", "retrofit",
    "vacancy", "occupancy", "absorption", "demand",
    "rent rates", "rental rates", "market rent"
];

// Hard negative - obvious non-CRE business fluff - EXPANDED
const HARD_NEGATIVE_NON_CRE = [
    "opens", "grand opening", "reopens", "giveaway", "menu",
    "restaurant", "coffee", "dunkin", "starbucks", "mcdonald",
    "retail", "store", "shop", "mall", "rack", "nordstrom", "walmart",
    "cannabis", "dispensary", "marijuana", "weed",
    "gaming", "casino", "lottery", "revenue record", "sports betting",
    "sports", "bears", "nfl", "mlb", "nba", "nhl", "mls",
    "concert", "festival", "event", "entertainment", "movie theater",
    "residential", "apartment", "multifamily", "condo", "single-family",
    "hotel", "hospitality", "resort", "motel", "airbnb",
    "self-storage", "self storage", "storage unit", "climate storage",
    "school", "university", "college", "hospital", "medical center",
    "church", "religious", "museum", "library", "government building",
    "gas station", "car wash", "auto repair", "tire shop"
];

// Market keywords for NJ/PA/FL/TX focus - EXPANDED
const MARKET_KEYWORDS = [
    "new jersey","nj","pennsylvania","pa","texas","tx","florida","fl",
    "port newark","elizabeth","newark","jersey city","lehigh valley",
    "dallas","dfw","houston","miami","tampa","orlando","jacksonville",
    "fort lauderdale","west palm","palm beach","fort myers","naples",
    "austin","san antonio","fort worth","arlington","plano","irving",
    "philadelphia","pittsburgh","allentown","bethlehem","easton",
    "trenton","camden","princeton","morris county","bergen county",
    "hudson county","essex county","middlesex county","union county",
    "south florida","gold coast","treasure coast","space coast",
    "dallas-fort worth","dfw metroplex","houston metro","austin metro",
    "south texas","gulf coast","corpus christi","laredo",
    "central jersey","north jersey","south jersey","shore"
];

const GEOGRAPHY_KEYWORDS = [
    // NJ/PA ports and cities - EXPANDED
    "port newark", "elizabeth", "newark", "bayonne", "jersey city",
    "lehigh valley", "allentown", "bethlehem", "easton",
    "port of new york", "port of new jersey", "ny nj port",
    // Highways - EXPANDED
    "turnpike", "garden state parkway", "i-78", "i-80", "i-287", "i-95", "i-81",
    "i-295", "i-195", "i-76", "i-476", "route 1", "route 9", "route 18",
    "exit 8a", "exit 7a", "exit 13", "exit 15", "exit 16",
    // Florida highways and areas
    "i-95 florida", "i-75", "i-4", "i-595", "i-595", "florida turnpike",
    "miami-dade", "broward", "palm beach", "fort lauderdale",
    "port miami", "port everglades", "port of tampa", "port of jacksonville",
    "south florida", "gold coast", "treasure coast",
    // Texas highways and areas
    "i-35", "i-45", "i-10", "i-20", "i-30", "i-635", "texas tollway",
    "port houston", "port of houston", "port of galveston", "port of corpus christi",
    "dallas-fort worth", "dfw", "houston ship channel", "freeport",
    // Pennsylvania highways and areas
    "i-76 pa", "pennsylvania turnpike", "i-83", "i-79", "route 309",
    "port of philadelphia", "philadelphia port", "pittsburgh",
    // Major industrial corridors
    "logistics corridor", "distribution corridor", "industrial corridor",
    "inland port", "intermodal facility", "rail yard"
];

const EXCLUSION_KEYWORDS = [
    "apartment", "multifamily", "condo", "single-family", "homebuilder",
    "hotel", "hospitality", "self-storage", "self storage",
    "office building", "office lease", "office space", "class a office",
    "retail center", "shopping center", "strip mall", "outlet mall"
];

const INDUSTRIAL_URL_PATTERNS = [
    "/industrial/",
    "/warehouse/",
    "/logistics/",
    "/distribution/",
    "topic/industrial",
    "tag/industrial",
    "category/industrial",
    "/manufacturing/",
    "/supply-chain/",
    "/supplychain/",
    "/cold-storage/",
    "/data-center/",
    "/datacentre/",
    "/fulfillment/",
    "/e-commerce/",
    "/ecommerce/",
    "/3pl/",
    "/cross-dock/",
    "/crossdock/",
    "/material-handling/",
    "/materialhandling/",
    "/transportation/",
    "/freight/",
    "/port/",
    "/intermodal/",
    "/trade-hub/",
    "/tradehub/",
    "/industrial-park/",
    "/industrialpark/",
    "/spec-industrial/",
    "/flex-space/",
    "/flexspace/",
    "/r-d/",
    "/research-development/",
    "/food-processing/",
    "/automotive/",
    "/aerospace/",
    "/life-sciences/",
    "/biotech/",
    "/chemical/",
    "/processing-plant/",
    "/outdoor-storage/",
    "/ios/",
    "/inland-port/",
    "/inlandport/",
    "/rail-served/",
    "/railserved/",
    "/prologis/",
    "/cbre-industrial/",
    "/jll-industrial/",
    "/cushman-industrial/",
    "/colliers-industrial/",
    "/newmark-industrial/",
    "/industrial-market/",
    "/logistics-market/",
    "/warehouse-market/",
    "/distribution-market/",
    "/industrial-report/",
    "/logistics-report/",
    "/warehouse-report/",
    "/industrial-outlook/",
    "/logistics-outlook/",
    "/warehouse-outlook/"
];

// Helper functions for deal signals detection - ENHANCED
function hasSizeSignals(t: string): boolean {
    return /\b\d{1,3}(,\d{3})+\s*(sf|sq\.?\s*ft|square\s*feet)\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(acre|acres)\b/i.test(t) ||
           /\b\d{1,3}(,\d{3})+\s*(square\s*feet|sq\.?\s*ft\.?)\b/i.test(t) ||
           /\b\d+(?:,\d{3})*\s*(sf|sq\.?\s*ft)\b/i.test(t) ||
           /\b\d+(?:,\d{3})*\s*(square\s*feet|sq\.?\s*ft\.?)\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(million|billion)\s*(sf|sq\.?\s*ft|square\s*feet)\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(k|thousand)\s*(sf|sq\.?\s*ft|square\s*feet)\b/i.test(t);
}

function hasPriceSignals(t: string): boolean {
    return /\$\s*\d+(\.\d+)?\s*(m|million|b|billion)\b/i.test(t) ||
           /\$\s*\d{1,3}(,\d{3})+(,\d{3})?\b/i.test(t) ||
           /\$\s*\d+(\.\d+)?\s*(million|billion|trillion)\b/i.test(t) ||
           /\$\s*\d+(?:,\d{3})*\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(million|billion)\s*dollars?\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(million|billion)\s*usd\b/i.test(t);
}

function hasDevelopmentSignals(t: string): boolean {
    const devKeywords = [
        "groundbreaking", "under construction", "construction underway",
        "development project", "industrial development", "warehouse development",
        "speculative development", "spec development", "build-to-suit",
        "pre-lease", "preleased", "forward commitment", "under development",
        "planned development", "proposed development", "entitlements",
        "zoning approved", "site plan approval", "building permit",
        "construction start", "delivery expected", "completion expected",
        "under construction", "being built", "being developed",
        "new construction", "ground-up construction", "expansion project",
        "addition project", "renovation project", "retrofit project"
    ];
    return devKeywords.some(keyword => t.toLowerCase().includes(keyword));
}

function hasTransactionSignals(t: string): boolean {
    const transKeywords = [
        "acquired", "acquisition", "purchased", "sold", "sale",
        "transaction", "deal", "closed", "closing", "agreement",
        "contract", "lease signed", "leased", "for lease", "available",
        "for sale", "on market", "off market", "investment sale",
        "portfolio sale", "disposition", "redevelopment", "repositioning",
        "refinance", "financing", "loan", "mortgage", "equity",
        "joint venture", "partnership", "investment", "capital",
        "fund acquisition", "fund purchase", "institutional buyer",
        "private equity", "reit acquisition", "institutional investor"
    ];
    return transKeywords.some(keyword => t.toLowerCase().includes(keyword));
}

function containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

// Allowed source domains to keep output clean/approved
// Allowed domains for URL validation - includes all mandatory sources
const allowedDomains = [
    // MANDATORY SOURCES (Boss's Priority List)
    "re-nj.com",            // Real Estate NJ
    "commercialsearch.com", // Commercial Search
    "commercialcafe.com",   // Commercial Cafe (same company as Commercial Search)
    "wsj.com",              // WSJ
    "dowjones.com",         // WSJ parent
    "bisnow.com",           // Bisnow
    "globest.com",          // GlobeSt
    "naiop.org",            // NAIOP
    "blog.naiop.org",       // NAIOP Blog
    "cpexecutive.com",      // Commercial Property Executive
    "bizjournals.com",      // South FL Business Journal + others
    "loopnet.com",          // LoopNet
    "costar.com",           // CoStar
    "costargroup.com",      // CoStar Group
    "lvb.com",              // Lehigh Valley Business
    "dailyrecord.com",      // Daily Record
    "northjersey.com",      // North Jersey (Daily Record alternative)
    "njbiz.com",            // NJBIZ
    
    // Additional Quality Sources
    "connectcre.com",
    "credaily.com",
    "therealdeal.com",
    "supplychaindive.com",
    "freightwaves.com",
    "dcvelocity.com",
    "bloomberg.com",
    "reuters.com",
    "apnews.com",
    "cbre.com",
    "jll.com",
    "cushwake.com",
    "colliers.com",
    "traded.co",
    "crexi.com",
    "areadevelopment.com",
    "rebusinessonline.com",
    "multihousingnews.com",
    "wealthmanagement.com",
    "nreionline.com",
    "reit.com"
];

// Extract a thumbnail image from common RSS/Atom fields
function extractImage(item: any): string {
    if (!item) return "";
    const fields = [
        item["media:thumbnail"],
        item["media:content"],
        item.enclosure
    ].filter(Boolean);
    for (const f of fields) {
        const node = Array.isArray(f) ? f[0] : f;
        if (node && (node.url || (node.$ && node.$.url))) return node.url || node.$.url;
    }
    if (item["content:encoded"] && item["content:encoded"][0]) {
        const match = item["content:encoded"][0].match(/<img[^>]+src="([^"]+)"/i);
        if (match && match[1]) return match[1];
    }
    if (item.description && item.description[0]) {
        const match = item.description[0].match(/<img[^>]+src="([^"]+)"/i);
        if (match && match[1]) return match[1];
    }
    return "";
}

// Strip HTML tags from text for clean display
function stripHtmlTags(html: string): string {
    if (!html) return "";
    // Remove HTML tags but preserve content
    const cleaned = html.replace(/<[^>]*>/g, ' ');
    // Clean up extra whitespace
    return cleaned.replace(/\s+/g, ' ').trim();
}

// Classify article based on boss's four-section briefing format
function classifyArticle(title: string, description: string, link: string, source?: string): { isRelevant: boolean; category: string; score: number; tier?: 'A' | 'B' | 'C' } {
    const t = (title + " " + description + " " + link).toLowerCase();
    
    // APPROVED SOURCES - Only allow approved domains
    // MANDATORY SOURCES + Additional approved domains
    const approvedDomains = [
      // Boss's Mandatory Sources
      're-nj.com', 'commercialsearch.com', 'wsj.com', 'bisnow.com', 'globest.com',
      'naiop.org', 'cpexecutive.com', 'bizjournals.com', 'loopnet.com', 'costar.com',
      'lvb.com', 'dailyrecord.com', 'njbiz.com',
      // Additional Quality Sources
      'connectcre.com', 'credaily.com', 'therealdeal.com', 'freightwaves.com',
      'supplychaindive.com', 'bloomberg.com', 'reuters.com', 'apnews.com',
      'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com', 'traded.co'
    ];
    
    const hasApprovedSource = approvedDomains.some(domain => link.includes(domain)) || 
                             approvedDomains.some(domain => (source || '').toLowerCase().includes(domain));
    
    if (!hasApprovedSource) {
        return { isRelevant: false, category: "unapproved source", score: 0 };
    }
    
    // Check exclusions
    if (containsAny(t, EXCLUSION_KEYWORDS)) {
        return { isRelevant: false, category: "excluded", score: 0 };
    }
    
    // SECTION 1: RELEVANT ARTICLES - Macro trends and major industrial real estate news
    const macroKeywords = ["rates", "inflation", "freight", "construction", "labor", "market", "trend", 
                          "outlook", "forecast", "demand", "supply", "vacancy", "absorption", 
                          "rent growth", "development", "investment"];
    const hasMacro = containsAny(t, macroKeywords);
    const hasIndustrial = containsAny(t, INDUSTRIAL_KEYWORDS);
    
    if (hasMacro && hasIndustrial) {
        return { isRelevant: true, category: "relevant", score: 10, tier: 'A' };
    }
    
    // SECTION 2: TRANSACTIONS - Sales or leases (including money-related terms)
    const transactionKeywords = ["sells", "sold", "acquires", "acquired", "buys", "bought", 
                                "purchases", "purchased", "trades", "traded", "sale", "transaction",
                                "lease", "leased", "rental", "rented", "financing", "funded", 
                                "loan", "investment", "capital", "equity", "debt", "mortgage",
                                "closes on", "closed deal", "deal closed", "transaction closed", "sold for",
                                "purchase agreement", "lease agreement", "sale-leaseback", "acquisition",
                                "divestiture", "portfolio sale", "disposition", "refinance", "financing",
                                "joint venture", "partnership", "investment sale", "buyer", "seller",
                                "purchaser", "landlord", "tenant", "signs lease", "renews lease",
                                "expands lease", "new lease", "lease extension", "sale completed",
                                "deal", "transaction", "bought", "paid", "sold price", "sale price"];
    
    const hasTransaction = containsAny(t, transactionKeywords);
    
    // Check for money amounts - MORE LENIENT
    const hasMoneyAmount = /\$[\d.,]+(?:million|m|billion|b|k|thousand)/i.test(t) || 
                           /\d+(?:\s*million|\s*billion|\s*thousand|\s*k)/i.test(t) ||
                           /price:\s*\$[\d.,]+/i.test(t) || 
                           /sold for\s*\$[\d.,]+/i.test(t) || hasPriceSignals(t);
    
    if (hasTransaction && hasIndustrial && (hasMoneyAmount || containsAny(t, CRE_INTENT_KEYWORDS))) {
        // Check if meets size/price threshold (≥100K SF or ≥$25M)
        const size = extractSize(t);
        const price = extractPrice(t);
        const meetsThreshold = (size && size >= 100000) || (price && price >= 25000000);
        
        return { 
            isRelevant: true, 
            category: "transaction", 
            score: meetsThreshold ? 9 : 6, 
            tier: meetsThreshold ? 'A' : 'B' 
        };
    }
    
    // SECTION 3: AVAILABILITIES - Properties for sale or lease
    const availabilityKeywords = ["for sale", "for lease", "available", "offering", "marketing", 
                                 "listing", "listed", "seeking", "looking for", "on the market",
                                 "for rent", "lease space", "space available", "industrial space for lease",
                                 "warehouse for lease", "distribution center for lease", "industrial property for sale",
                                 "now available", "newly listed", "just listed", "available for lease",
                                 "available for sale", "for lease or sale", "sale-leaseback opportunity",
                                 "development opportunity", "build-to-suit", "spec building", "available space",
                                 "vacant", "for sublease", "sublease opportunity", "direct for lease",
                                 "for sale by owner", "investment opportunity", "development site"];
    const hasAvailability = containsAny(t, availabilityKeywords);
    
    // More lenient availability detection
    if (hasAvailability && hasIndustrial) {
        return { isRelevant: true, category: "availabilities", score: 7, tier: 'B' };
    }
    
    // SECTION 4: PEOPLE NEWS - Personnel moves
    const peopleKeywords = ["appointed", "named", "joined", "hired", "promoted", "elected", 
                           "executive", "ceo", "president", "chief", "vp", "vice president", 
                           "director", "managing director", "partner", "chairman", "board"];
    const hasPeople = containsAny(t, peopleKeywords);
    
    if (hasPeople && (hasIndustrial || containsAny(t, ["brokerage", "development", "investment"]))) {
        return { isRelevant: true, category: "people", score: 8, tier: 'A' };
    }
    
    // Fallback for other industrial CRE news
    if (hasIndustrial && containsAny(t, CRE_INTENT_KEYWORDS)) {
        return { isRelevant: true, category: "relevant", score: 4, tier: 'B' };
    }
    
    return { isRelevant: false, category: "not relevant", score: 0 };
}

// Helper function to extract size from text
function extractSize(text: string): number | null {
    const match = text.match(/(\d+(?:,\d+)*)\s*(?:sq|sf|sq\.ft|square feet|sqft)/i);
    if (match) {
        return parseInt(match[1].replace(/,/g, ''));
    }
    return null;
}

// Helper function to extract price from text
function extractPrice(text: string): number | null {
    // Match $ amounts
    const match = text.match(/\$(\d+(?:,\d+)*)\s*(?:million|m|billion|b)/i);
    if (match) {
        const num = parseFloat(match[1].replace(/,/g, ''));
        const unit = text.match(/\$(\d+(?:,\d+)*)\s*(million|m|billion|b)/i)?.[2].toLowerCase();
        
        if (unit?.startsWith('b')) {
            return num * 1000000000;
        } else if (unit?.startsWith('m')) {
            return num * 1000000;
        }
        return num;
    }
    return null;
}

// Helper functions for checking signals
function pickText(v: any): string | null {
    if (!v) return null;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return pickText(v[0]);
    if (typeof v === "object" && typeof v._ === "string") return v._.trim();
    return null;
}

function extractLink(item: any): string | null {
    if (!item) return "";

    // PRIORITY 1: Feedburner original link (GlobeSt uses this for actual article URLs)
    if (item['feedburner:origLink']) {
        const origLink = Array.isArray(item['feedburner:origLink']) ? item['feedburner:origLink'][0] : item['feedburner:origLink'];
        if (origLink && typeof origLink === "string") {
            // Debug GlobeSt feedburner links
            if (origLink.includes('globest') || origLink.includes('feedburner')) {
                console.log(`DEBUG: feedburner:origLink raw: "${origLink}"`);
            }
            return normalizeUrl(origLink);
        }
    }

    // PRIORITY 2: RSS <link>https://...</link>
    if (Array.isArray(item.link) && typeof item.link[0] === "string") {
        return normalizeUrl(item.link[0]);
    }
    if (typeof item.link === "string") {
        return normalizeUrl(item.link);
    }

    // PRIORITY 3: Atom <link href="..."/> and <link rel="alternate">
    if (Array.isArray(item.link)) {
        for (const l of item.link) {
            if (!l) continue;
            if (typeof l === "string") return normalizeUrl(l);
            const href = l.href || (l.$ && l.$.href);
            const rel = l.rel || (l.$ && l.$.rel);
            if (href && (!rel || rel === "alternate")) return normalizeUrl(href);
        }
    }

    // PRIORITY 4: Handle atom:link with href
    if (item["atom:link"]) {
        const atom = Array.isArray(item["atom:link"]) ? item["atom:link"][0] : item["atom:link"];
        const href = atom?.$?.href;
        if (typeof href === "string") return normalizeUrl(href.trim());
    }

    // PRIORITY 5: guid as permalink (RSS permalinks)
    if (item.guid) {
        const g = Array.isArray(item.guid) ? item.guid[0] : item.guid;
        if (typeof g === "string" && g.startsWith("http")) return normalizeUrl(g);
        if (g && g._ && g._.startsWith("http")) return normalizeUrl(g._);
    }

    return null;
}

function normalizeUrl(urlStr: string): string {
    try {
        // Use URL() constructor to validate and normalize the URL
        const u = new URL(urlStr);
        // Ensure we have a proper protocol
        if (!u.protocol.startsWith('http')) {
            throw new Error('Invalid protocol');
        }
        return u.toString();
    } catch {
        // If URL parsing fails, return empty string to indicate invalid URL
        return "";
    }
}

function stripTrackingParams(urlStr: string): string {
    try {
        const u = new URL(urlStr);
        const toDelete: string[] = [];
        u.searchParams.forEach((_, key) => {
            if (key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())) {
                toDelete.push(key);
            }
        });
        toDelete.forEach(k => u.searchParams.delete(k));
        u.hash = "";
        return u.toString();
    } catch {
        return urlStr;
    }
}

function computeId({ guid, canonicalUrl }: { guid?: string; canonicalUrl?: string }): string {
    let basis = guid || canonicalUrl || '';
    // Handle case where guid/canonicalUrl might be an object
    if (typeof basis !== 'string') {
        basis = String(basis);
    }
    return nodeCrypto.createHash('sha1').update(basis).digest('hex');
}

function pruneItemStore() {
    const cutoff = Date.now() - ITEM_RETENTION_MS;
    for (const [id, item] of itemStore.entries()) {
        const ts = new Date(item.fetchedAt || item.pubDate || Date.now()).getTime();
        if (ts < cutoff) {
            itemStore.delete(id);
        }
    }
}

async function fetchWithRetry(url: string, options: any, attempts = 3): Promise<any> {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await axios.get(url, options);
        } catch (err: any) {
            lastError = err;
            const status = err.response?.status;
            if (status && status >= 400 && status < 500) {
                // 4xx errors are non-retriable
                throw err;
            }
            // For timeouts or 5xx, retry with exponential backoff
            const delay = 500 * Math.pow(2, i);
            await new Promise(res => setTimeout(res, delay));
        }
    }
    throw lastError;
}

function classifyAccess(status: number, contentType?: string, bodySample = ""): string {
    if (!status) return "unknown";
    if (status === 401 || status === 402 || status === 403) return "blocked";
    if (status === 404) return "blocked";
    if (contentType && !contentType.includes("text/html")) return "unknown";
    const lower = bodySample.toLowerCase();
    if (lower.includes("subscribe") || lower.includes("paywall")) return "paywalled";
    return "ok";
}

async function validateLink(link: string): Promise<LinkValidation> {
    if (!link) return { ok: false, status: 0, access: "unknown" };
    if (!isAllowedLink(link)) return { ok: false, status: 0, access: "blocked" };
    try {
        const resp = await axios.get(link, {
            maxRedirects: 3,
            timeout: 5000,
            responseType: 'arraybuffer',
            maxContentLength: 32768,
            validateStatus: (s: number) => s >= 200 && s < 500
        });
        const contentType = resp.headers['content-type'] || "";
        const bodySample = resp.data ? resp.data.toString('utf8', 0, Math.min(resp.data.length, 2048)) : "";
        const access = classifyAccess(resp.status, contentType, bodySample);
        const ok = resp.status >= 200 && resp.status < 400 && access !== "paywalled" && access !== "blocked";
        return { ok, status: resp.status, access, bodySample, contentType };
    } catch (err: any) {
        const status = err && err.response ? err.response.status : 0;
        return { ok: false, status, access: "blocked" };
    }
}

async function fetchOgImage(url: string): Promise<string> {
    try {
        const resp = await axios.get(url, {
            maxRedirects: 3,
            timeout: 5000,
            responseType: 'arraybuffer',
            maxContentLength: 32768,
            validateStatus: (s: number) => s >= 200 && s < 500
        });
        const html = resp.data ? resp.data.toString('utf8', 0, Math.min(resp.data.length, 2048)) : "";
        const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
        if (match && match[1]) return match[1];
        return "";
    } catch {
        return "";
    }
}

function fallbackThumbnail(id: string): string {
    return `https://picsum.photos/seed/${id}/640/360`;
}

function isAllowedLink(link: string): boolean {
    try {
        const u = new URL(link);
        return allowedDomains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
    } catch {
        return false;
    }
}

// Fetch articles from all feeds
async function fetchAllRSSArticles(): Promise<FetchResult[]> {
    const startTime = Date.now();
    const promises = RSS_FEEDS
        .filter(f => f.enabled !== false)
        .map(feed => fetchRSSFeedImproved(feed));
    const results = await Promise.all(promises);
    if (manualArticles.length) {
        results.unshift({
            status: 'ok',
            articles: manualArticles,
            meta: { feed: 'Manual Articles', fetchedRaw: manualArticles.length, kept: manualArticles.length, filteredOut: 0, durationMs: 0 }
        });
    }

    // Clean up old articles that no longer pass current filtering
    const allCurrentItems = Array.from(itemStore.values());
    let cleanupCount = 0;

    // Archive articles older than 90 days (don't delete, just log)
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    let archivedCount = 0;

    for (const item of allCurrentItems) {
        const itemDate = new Date(item.pubDate || item.fetchedAt || 0).getTime();
        if (itemDate < ninetyDaysAgo) {
            // Mark as archived but keep in store
            item.archived = true;
            archivedCount++;
        }
    }

    if (archivedCount > 0) {
        log('info', `Archived ${archivedCount} articles older than 90 days (kept for reference)`);
    }

    // Update last fetch info
    const totalFetched = results.reduce((sum, r) => sum + r.meta.fetchedRaw, 0);
    const totalKept = results.reduce((sum, r) => sum + r.meta.kept, 0);
    const sourcesProcessed = results.length;

    // Get all current items to find the most recent one
    const allItems = Array.from(itemStore.values());
    const sortedItems = allItems.sort((a, b) =>
        new Date(b.fetchedAt || b.pubDate || 0).getTime() -
        new Date(a.fetchedAt || a.pubDate || 0).getTime()
    );

    lastFetchInfo = {
        timestamp: new Date().toISOString(),
        totalFetched,
        totalKept,
        sourcesProcessed,
        lastArticle: sortedItems[0] || null,
        recentArticles: sortedItems.slice(0, 5) // Keep track of 5 most recent
    };

    log('info', `Fetch completed: ${totalFetched} fetched, ${totalKept} kept from ${sourcesProcessed} sources`, {
        totalFetched,
        totalKept,
        sourcesProcessed,
        duration: Date.now() - startTime
    });

    return results;
}

// Create RSS parser instance
const rssParser = new Parser({
    timeout: 10000,
    customFields: {
        item: ['media:content', 'enclosure', 'description', 'content:encoded', 'pubDate', 'published']
    }
});

// Improved fetch function using rss-parser
async function fetchRSSFeedImproved(feed: FeedConfig): Promise<FetchResult> {
    const start = Date.now();
    const cb = circuitBreaker.get(feed.url) || { failureCount: 0, blockedUntil: 0 };
    
    if (cb.blockedUntil > Date.now()) {
        const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
        return {
            status: 'error',
            articles: oldArticles,
            error: { type: 'circuit_breaker', message: 'Feed blocked due to repeated failures', httpStatus: 0 },
            meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
        };
    }

    try {
        pruneItemStore();
        
        // First try with rss-parser
        const parsed = await rssParser.parseURL(feed.url);
        const items: NormalizedItem[] = [];
        
        for (const item of parsed.items) {
            try {
                const normalized: NormalizedItem = {
                    id: computeId(item.link || item.guid || ''),
                    guid: item.guid || '',
                    canonicalUrl: normalizeUrl(item.link || item.guid || ''),
                    title: item.title || '',
                    link: normalizeUrl(item.link || item.guid || ''),
                    source: feed.name,
                    regions: [feed.region || 'US'],
                    pubDate: new Date(item.pubDate || item.published || new Date()).toISOString(),
                    description: stripHtmlTags(item.description || item['content:encoded'] || ''),
                    author: item.creator || item.author || '',
                    publisher: feed.name,
                    image: extractImageFromItem(item),
                    thumbnailUrl: extractImageFromItem(item),
                    access: 'public',
                    status: 200,
                    fetchedAt: new Date().toISOString(),
                    topics: item.categories || [],
                    category: item.categories?.join(', ') || '',
                    tier: 'C',
                    score: 0
                };
                
                // Apply classification
                const classification = classifyArticle(
                    normalized.title,
                    normalized.description,
                    normalized.link,
                    normalized.source
                );
                normalized.tier = classification.tier || 'C';
                normalized.score = classification.score;
                normalized.category = classification.category; // Save the category
                
                // Only keep relevant articles (Tier A or B)
                if (normalized.tier !== 'C') {
                    items.push(normalized);
                }
            } catch (e) {
                console.error(`Error normalizing item from ${feed.name}:`, e);
            }
        }
        
        // Update circuit breaker on success
        if (cb.failureCount > 0) {
            cb.failureCount = 0;
            cb.blockedUntil = 0;
            circuitBreaker.set(feed.url, cb);
        }
        
        // Update feed stats
        feedStats.set(feed.url, {
            lastFetch: new Date().toISOString(),
            lastSuccess: new Date().toISOString(),
            lastError: null,
            itemsFetched: items.length
        });
        
        // Store items
        for (const item of items) {
            itemStore.set(item.id, item);
        }
        
        return {
            status: 'ok',
            articles: items,
            meta: { 
                feed: feed.name, 
                fetchedRaw: parsed.items.length, 
                kept: items.length, 
                filteredOut: parsed.items.length - items.length, 
                durationMs: Date.now() - start 
            }
        };
        
    } catch (error: any) {
        console.error(`[${feed.name}] ERROR:`, error.message);
        
        // Update circuit breaker on error
        cb.failureCount++;
        if (cb.failureCount >= 3) {
            cb.blockedUntil = Date.now() + (30 * 60 * 1000); // Block for 30 minutes
        }
        circuitBreaker.set(feed.url, cb);
        
        // Update feed stats
        feedStats.set(feed.url, {
            lastFetch: new Date().toISOString(),
            lastSuccess: null,
            lastError: error.message,
            itemsFetched: 0
        });
        
        // Return last good articles if available
        const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
        return {
            status: 'error',
            articles: oldArticles,
            error: { type: 'fetch_error', message: error.message, httpStatus: error.response?.status },
            meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
        };
    }
}

// Helper function to extract image from rss-parser item
function extractImageFromItem(item: any): string {
    if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
        return item.enclosure.url;
    }
    if (item['media:content']?.url) {
        return item['media:content'].url;
    }
    if (item['media:thumbnail']?.url) {
        return item['media:thumbnail'].url;
    }
    
    const content = item.content || item['content:encoded'] || item.description || '';
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
    return imgMatch ? imgMatch[1] : '';
}

// Helper function to fetch and parse RSS feed
async function fetchRSSFeed(feed: FeedConfig): Promise<FetchResult> {
    const start = Date.now();
    // Circuit breaker check
    const cb = circuitBreaker.get(feed.url) || { failureCount: 0, blockedUntil: 0 };
    if (cb.blockedUntil > Date.now()) {
        const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
        return {
            status: 'error',
            articles: oldArticles,
            error: { type: 'circuit_breaker', message: 'Feed blocked due to repeated failures', httpStatus: 0 },
            meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
        };
    }
    try {
        pruneItemStore();

        // Add delay for GlobeSt feeds to prevent rate limiting
        if (feed.url.includes('feeds.feedblitz.com')) {
            const delay = 300 + Math.random() * 400; // 300-700ms random delay
            console.log(`[${feed.name}] Sleeping ${delay.toFixed(0)}ms before fetch...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        // fetch cache lookup
        const cache = fetchCache.get(feed.url);
        const headers = Object.assign({
            "User-Agent": "LocalRSSViewer/1.0 (+https://localhost)"
        }, feed.headers || {});

        // Enhanced browser-like headers for GlobeSt/FeedBlitz feeds
        if (feed.url.includes('feeds.feedblitz.com')) {
            Object.assign(headers, {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
                "Accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            });
        }

        if (cache && Date.now() - cache.fetchedAt < FETCH_CACHE_TTL_MS) {
            headers["If-None-Match"] = cache.etag || "";
            headers["If-Modified-Since"] = cache.lastModified || "";
        }

        // Log the final requested URL
        console.log(`[${feed.name}] Fetching URL: ${feed.url}`);

        let response;
        try {
            response = await fetchWithRetry(feed.url, {
                timeout: feed.timeout || 15000,
                headers,
                maxRedirects: 5,
                validateStatus: () => true // Allow all status codes so we can log responses
            }, 3);
        } catch (err: any) {
            if (cache && err.response && err.response.status === 304) {
                response = { data: cache.body, headers: cache.headers || {}, status: 304 };
            } else {
                throw err;
            }
        }

        // Handle specific HTTP errors with better messages
        if (response.status === 404) {
            console.log(`[${feed.name}] ERROR: Feed URL not found (404) - ${feed.url}`);
            return {
                status: 'error',
                articles: [],
                error: { type: 'not_found', message: 'Feed URL not found (404) - the feed URL may be incorrect or the feed may have been moved', httpStatus: 404 },
                meta: { feed: feed.name, fetchedRaw: 0, kept: 0, filteredOut: 0, durationMs: Date.now() - start }
            };
        }

        if (response.status === 503) {
            console.log(`[${feed.name}] ERROR: Service unavailable (503) - ${feed.url}`);
            // For 503, try to use cached results if available
            if (cache && cache.body) {
                console.log(`[${feed.name}] Using cached results due to 503 error`);
                response = { data: cache.body, headers: cache.headers || {}, status: 200 };
            } else {
                return {
                    status: 'error',
                    articles: [],
                    error: { type: 'service_unavailable', message: 'Service temporarily unavailable (503) - server may be down or blocking requests', httpStatus: 503 },
                    meta: { feed: feed.name, fetchedRaw: 0, kept: 0, filteredOut: 0, durationMs: Date.now() - start }
                };
            }
        }

        if (response.status >= 400 && response.status < 500) {
            console.log(`[${feed.name}] ERROR: Client error (${response.status}) - ${feed.url}`);
            return {
                status: 'error',
                articles: [],
                error: { type: 'client_error', message: `Client error (${response.status}) - feed may be blocked or require authentication`, httpStatus: response.status },
                meta: { feed: feed.name, fetchedRaw: 0, kept: 0, filteredOut: 0, durationMs: Date.now() - start }
            };
        }

        // Check if response is HTML instead of RSS/XML
        const contentType = response.headers ? response.headers['content-type'] : '';
        const isHtmlResponse = contentType && contentType.includes('text/html');
        const looksLikeHtml = response.data && typeof response.data === 'string' &&
            (response.data.trim().startsWith('<!DOCTYPE html') ||
             response.data.trim().startsWith('<html') ||
             response.data.includes('<head>') ||
             response.data.includes('<body>'));

        if (isHtmlResponse || looksLikeHtml) {
            const htmlSnippet = response.data && typeof response.data === 'string' ?
                response.data.substring(0, 300) : 'No content';
            console.log(`[${feed.name}] Skipping HTML response (not RSS) - Content-Type: ${contentType}, Status: ${response.status}`);
            console.log(`[${feed.name}] HTML content preview: ${htmlSnippet}...`);
            return {
                status: 'error',
                articles: [],
                error: { type: 'not_rss', message: 'Feed returned HTML instead of RSS/XML', httpStatus: response.status },
                meta: { feed: feed.name, fetchedRaw: 0, kept: 0, filteredOut: 0, durationMs: Date.now() - start }
            };
        }

        if (response.status === 304 && cache) {
            response = { data: cache.body, headers: cache.headers || {}, status: 200 };
        } else {
            // update cache
            fetchCache.set(feed.url, {
                etag: response.headers ? response.headers['etag'] : undefined,
                lastModified: response.headers ? response.headers['last-modified'] : undefined,
                body: response.data,
                headers: response.headers,
                fetchedAt: Date.now(),
                status: response.status
            });
        }

        // Sniff content
        const ct = (response.headers['content-type'] || '').toLowerCase();
        const body = response.data;
        const looksLikeXml = ct.includes('xml') || body.trim().startsWith('<?xml') || body.includes('<rss') || body.includes('<feed');
        console.log(`[${feed.name}] HTTP ${response.status}, content-type: ${ct}, looksLikeXml: ${looksLikeXml}`);
        console.log(`[${feed.name}] First 200 chars: ${body.substring(0, 200).replace(/\n/g, ' ')}`);

        if (!looksLikeXml) {
            throw new Error('Response is not XML/RSS, possibly HTML or blocked');
        }

        const parsed = await xml2js.parseStringPromise(response.data, { mergeAttrs: true });
        // Try both "rss.channel[0].item" and "feed.entry" for Atom feeds
        let articles: any[] = [];
        if (parsed.rss && parsed.rss.channel && parsed.rss.channel[0] && parsed.rss.channel[0].item) {
            articles = parsed.rss.channel[0].item;
        } else if (parsed.feed && parsed.feed.entry) {
            articles = parsed.feed.entry;
        }
        if (!articles || !articles.length) {
            return {
                status: 'ok',
                articles: [],
                meta: { feed: feed.name, fetchedRaw: 0, kept: 0, filteredOut: 0, durationMs: Date.now() - start }
            };
        }

        const mapped: NormalizedItem[] = [];
        let totalArticles = articles.length;
        let filteredOut = 0;
        let dropReasons = { missing_title: 0, missing_url: 0, bad_date: 0, duplicate: 0, outside_date_window: 0, parse_error: 0, not_relevant: 0 };
        console.log(`[${feed.name}] Fetched ${totalArticles} raw articles`);
        for (const a of articles) {
            const rawLink = extractLink(a);

            // Debug Bloomberg link extraction
            if (feed.name === 'Bloomberg Markets' && !rawLink) {
                console.log(`[${feed.name}] DEBUG: item structure:`, JSON.stringify(a, null, 2));
            }

            if (!rawLink) {
                dropReasons.missing_url++;
                continue;
            }

            const canonicalUrl = stripTrackingParams(rawLink);

            // Validate and normalize URL to prevent malformed links
            const normalizedUrl = normalizeUrl(canonicalUrl);
            if (!normalizedUrl) {
                dropReasons.missing_url++;
                continue;
            }

            // Debug GlobeSt URL extraction
            if (feed.name.includes('GlobeSt')) {
                const linkField = a.link;
                const guidField = a.guid;
                const origLinkField = a['feedburner:origLink'];
                console.log(`[${feed.name}] DEBUG: link="${linkField}", guid="${guidField}", origLink="${origLinkField}", final rawLink="${rawLink}", canonicalUrl="${canonicalUrl}", normalized="${normalizedUrl}"`);
            }

            let guid = a.guid ? (Array.isArray(a.guid) ? a.guid[0] : a.guid) : "";
            // Ensure guid is a string, not an object
            if (typeof guid === 'object' && guid !== null) {
                guid = guid._ || guid.text || String(guid);
            }
            const id = computeId({ guid, canonicalUrl: normalizedUrl });
            if (!isAllowedLink(normalizedUrl)) {
                dropReasons.missing_url++;
                continue;
            }
            // Skip expensive link validation - just mark as "ok" to avoid blocking
            const validation = { ok: true, status: 200, access: "ok" as const };
            let thumb = extractImage(a);
            // SKIP SLOW fetchOgImage - just use fallback
            // if (!thumb) {
            //     thumb = await fetchOgImage(canonicalUrl);
            // }
            if (!thumb) {
                thumb = fallbackThumbnail(id);
            }
            const title = a.title && a.title[0] ? String(a.title[0]) : (a.title ? String(a.title) : "");
            if (!title) {
                dropReasons.missing_title++;
                continue;
            }
            const description = a.description ? String(a.description[0]) : (a.summary ? String(a.summary[0]) : "");
            const cleanDescription = stripHtmlTags(description);
            
            // Classify article using keywords and patterns with 3-tier system
            const classification = classifyArticle(title, description, normalizedUrl, feed.name);

            // NEW: Keep all articles but mark their relevance tier
            // Instead of dropping not_relevant items, keep them with lower scores
            let finalScore = classification.score;
            let finalCategory = classification.category;
            
            // If not relevant, assign minimal score and "other" category
            if (!classification.isRelevant || classification.tier === 'C') {
                finalScore = 1; // Minimal score instead of dropping
                finalCategory = "other";
                filteredOut++; // Still track for stats but don't drop
                dropReasons.not_relevant++;
            }

            // Store all Tier A and Tier B articles, but mark their tier for newsletter generation
            // Tier A: always include in briefing
            // Tier B: include only if needed for fill/context
            
            const normalized: NormalizedItem = {
                id,
                guid: guid || undefined,
                canonicalUrl,
                title,
                link: canonicalUrl,
                pubDate: a.pubDate ? a.pubDate[0] : (a.published ? a.published[0] : ""),
                description: cleanDescription,
                author: a.author ? (Array.isArray(a.author) ? (a.author[0].name ? a.author[0].name[0] : a.author[0]) : a.author) : (a["dc:creator"] ? a["dc:creator"][0] : ""),
                publisher: feed.name,
                image: thumb,
                thumbnailUrl: thumb,
                access: validation.access,
                status: validation.status,
                fetchedAt: new Date().toISOString(),
                source: feed.name,
                regions: [feed.region],
                topics: [finalCategory],
                category: finalCategory,
                tier: classification.tier,
                score: finalScore  // Add score field for relevance ranking
            };
            mapped.push(normalized);
            itemStore.set(id, normalized);
        }
        console.log(`[${feed.name}] Kept ${mapped.length} articles, filtered out ${filteredOut}, drop reasons: ${JSON.stringify(dropReasons)}`);
        feedStats.set(feed.url, {
            lastFetch: new Date().toISOString(),
            lastSuccess: new Date().toISOString(),
            lastError: null,
            itemsFetched: mapped.length
        });
        // Reset circuit breaker on success
        cb.failureCount = 0;
        circuitBreaker.set(feed.url, cb);
        return {
            status: 'ok',
            articles: mapped,
            meta: { feed: feed.name, fetchedRaw: totalArticles, kept: mapped.length, filteredOut: filteredOut, durationMs: Date.now() - start }
        };
    } catch (e: any) {
        console.error(`[${feed.name}] ERROR:`, e && e.message ? e.message : String(e));
        feedStats.set(feed.url, {
            lastFetch: new Date().toISOString(),
            lastSuccess: null,
            lastError: e && e.message ? e.message : String(e),
            itemsFetched: 0
        });
        // Increment circuit breaker on error
        cb.failureCount++;
        if (cb.failureCount >= 3) {
            cb.blockedUntil = Date.now() + 30 * 60 * 1000;
        }
        circuitBreaker.set(feed.url, cb);
        // Last good cache: if error, return old articles
        const oldArticles = Array.from(itemStore.values()).filter(i => i.source === feed.name);
        return {
            status: 'error',
            articles: oldArticles, // serve last good
            error: { type: 'fetch_error', message: e && e.message ? e.message : String(e), httpStatus: e.response?.status },
            meta: { feed: feed.name, fetchedRaw: 0, kept: oldArticles.length, filteredOut: 0, durationMs: Date.now() - start }
        };
    }
}

function getItemsFiltered({ since, until, region, source, limit = 200 }: { since: string | null; until: string | null; region: string | null; source: string | null; limit?: number }): NormalizedItem[] {
    pruneItemStore();
    let sinceTs = since ? Date.parse(since) : Date.now() - windowDefaultHours * 60 * 60 * 1000;
    let untilTs = until ? Date.parse(until) : Date.now();
    const out: NormalizedItem[] = [];
    for (const item of itemStore.values()) {
        const ts = new Date(item.pubDate || item.fetchedAt || Date.now()).getTime();
        if (isFinite(sinceTs) && ts < sinceTs) continue;
        if (isFinite(untilTs) && ts > untilTs) continue;
        if (region && item.regions && item.regions.length && !item.regions.includes(region)) continue;
        if (source && item.source && item.source !== source) continue;
        out.push(item);
        if (out.length >= limit) break;
    }
    return out.sort((a, b) => new Date(b.pubDate || b.fetchedAt || 0).getTime() - new Date(a.pubDate || a.fetchedAt || 0).getTime());
}

function getBriefByRegion({ since, until, region, source, limit = 200 }: { since: string | null; until: string | null; region: string | null; source: string | null; limit?: number }): Record<string, NormalizedItem[]> {
    const items = getItemsFiltered({ since, until, region, source, limit });
    const grouped: Record<string, NormalizedItem[]> = {};
    items.forEach(it => {
        const regs = (it.regions && it.regions.length) ? it.regions : ["Unspecified"];
        regs.forEach(r => {
            grouped[r] = grouped[r] || [];
            grouped[r].push(it);
        });
    });
    return grouped;
}

// Build HTML briefing in required format. Expects sections with arrays of items: { title, link, publisher, author, pubDate, description }
function buildBriefing({ relevant = [], transactions = [], availabilities = [], people = [] }: { relevant?: any[]; transactions?: any[]; availabilities?: any[]; people?: any[] }, period: string = "Current Period") {
    // Calculate date range for the header
    const now = new Date();
    const daysAgo = period.includes('day') ? parseInt(period.split(' ')[0]) : 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const dateRange = `${startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} (ET)`;

    const sections = [
        { title: "RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News", icon: "📰", items: relevant },
        { title: "TRANSACTIONS — Notable Sales/Leases (≥100K SF or ≥$25M)", icon: "💼", items: transactions },
        { title: "AVAILABILITIES — New Industrial Properties for Sale/Lease", icon: "🏢", items: availabilities },
        { title: "PEOPLE NEWS — Personnel Moves in Industrial Brokerage/Development", icon: "👥", items: people }
    ];

    const renderItems = (items: any[]) => {
        if (!items || !items.length) return '<div class="empty-section">No updated information provided for this section.</div>';
        const safe = items.slice(0, 6).map((it: any) => {
            const title = it.title || 'Untitled';
            const publisher = it.publisher || 'Unknown';
            const link = it.link || '#';
            const description = it.description || 'No description available.';
            
            // Create brief summary (first 150 characters)
            const briefSummary = description.length > 150 
                ? description.substring(0, 150).replace(/\s+\S*$/, '') + '...'
                : description;
            
            // Get state/region from regions array
            const state = it.regions && it.regions.length > 0 ? it.regions[0] : 'US';
            
            // Get category from category field (set by classification)
            const category = it.category || 'relevant';
            
            // Clean up category names for display
            const categoryLabels: Record<string, string> = {
                relevant: 'RELEVANT ARTICLES',
                transaction: 'TRANSACTIONS',
                availabilities: 'AVAILABILITIES',
                people: 'PEOPLE NEWS',
                corporate: 'Corporate'
            };
            
            const categoryDisplay = categoryLabels[category] || 'RELEVANT ARTICLES';
            
            // Create exactly 3 tags: state, category, source
            const tags = [
                `<span class="badge badge-location">${state}</span>`,
                `<span class="badge badge-category">${categoryDisplay}</span>`,
                `<span class="badge badge-source">${publisher}</span>`
            ].join(' ');

            return `<div class="article-card">
                <div class="article-header">
                    ${tags}
                </div>
                <div class="article-content">${briefSummary}</div>
                <div class="article-source">
                    <a href="${link}" class="source-link" target="_blank">📖 Read Full Article – ${publisher}</a>
                    <div class="action-buttons">
                        <a href="#" class="action-btn">Track</a>
                        <a href="#" class="action-btn">Share</a>
                    </div>
                </div>
            </div>`;
        });
        return safe.join('');
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Woodmont Industrial Partners - Daily Briefing</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }

        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 600;
        }

        .header .subtitle {
            font-size: 16px;
            opacity: 0.9;
            margin-bottom: 8px;
        }

        .header .date-range {
            font-size: 14px;
            opacity: 0.8;
            font-style: italic;
        }

        .content {
            padding: 30px;
        }

        .section {
            margin-bottom: 35px;
        }

        .section-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 3px solid #667eea;
        }

        .section-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 15px;
            font-size: 20px;
        }

        .section-title {
            font-size: 22px;
            color: #1e3c72;
            font-weight: 600;
        }

        .article-card {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-bottom: 15px;
            border-radius: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .article-card:hover {
            transform: translateX(5px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }

        .article-header {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 12px;
        }

        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .badge-location {
            background: #e3f2fd;
            color: #1976d2;
        }

        .badge-category {
            background: #f3e5f5;
            color: #7b1fa2;
        }

        .badge-source {
            background: #e8f5e9;
            color: #388e3c;
        }

        .badge-type {
            background: #e8f5e9;
            color: #388e3c;
        }

        .article-content {
            color: #333;
            line-height: 1.6;
            margin-bottom: 10px;
        }

        .article-source {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #dee2e6;
        }

        .source-link {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            font-size: 14px;
        }

        .source-link:hover {
            text-decoration: underline;
        }

        .action-buttons {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            text-decoration: none;
            border: 1px solid #dee2e6;
            color: #666;
            transition: all 0.2s;
        }

        .action-btn:hover {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        .highlight-box {
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 15px;
        }

        .highlight-label {
            font-weight: 600;
            color: #d84315;
            margin-bottom: 8px;
            text-transform: uppercase;
            font-size: 12px;
        }

        .highlight-text {
            color: #333;
            line-height: 1.6;
        }

        .footer {
            background: #f8f9fa;
            padding: 25px 30px;
            text-align: center;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #dee2e6;
        }

        .empty-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            color: #666;
            font-style: italic;
        }

        @media (max-width: 600px) {
            .header h1 {
                font-size: 22px;
            }

            .section-title {
                font-size: 18px;
            }

            .article-header {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏭 Woodmont Industrial Partners</h1>
            <div class="subtitle">Daily Industrial News Briefing</div>
            <div class="date-range">Coverage Period: ${dateRange}</div>
            <div class="date-range">Focus Markets: NJ, PA, FL, TX</div>
        </div>

        <div class="content">
            ${sections.map(section => `
            <div class="section">
                <div class="section-header">
                    <div class="section-icon">${section.icon}</div>
                    <div class="section-title">${section.title}</div>
                </div>
                ${renderItems(section.items)}
            </div>
            `).join('')}
        </div>

        <div class="footer">
            <strong>Woodmont Industrial Partners</strong><br>
            Daily Industrial News Briefing – Confidential & Proprietary<br>
            © 2025 All Rights Reserved
        </div>
    </div>
</body>
</html>`;
    return html;
}

// Placeholder to show how an email agent could be fed HTML.
// Integrate with your email service (SMTP/Graph/etc.) externally.
async function createBriefingEmailPayload(sections: { relevant?: any[]; transactions?: any[]; availabilities?: any[]; people?: any[] }) {
    const html = buildBriefing(sections, "Daily Briefing Period");
    return {
        subject: "Woodmont Industrial Partners Daily Industrial News Briefing",
        html
    };
}
function openBrowser(url: string) {
    const start = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    require('child_process').exec(`${start} "${url}"`);
}

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '');
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Woodmont Daily Briefing <operationssupport@woodmontproperties.com>';
const EMAIL_TO = process.env.EMAIL_TO || '';

// Send email using NodeMailer
async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
    try {
        // Dynamic import to avoid requiring it if not used
        const nodemailer = require('nodemailer');

        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465, // true for 465, false for other ports
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
        });

        const mailOptions = {
            from: EMAIL_FROM,
            to: to.join(', '),
            subject: subject,
            html: html,
        };

        console.log('SMTP Config:', { host: SMTP_HOST, port: SMTP_PORT, user: SMTP_USER, from: EMAIL_FROM, to: to });
        console.log('Mail Options:', { subject, to: to.join(', '), htmlLength: html.length });

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        console.log('Full email info:', info);
        return true;
    } catch (error) {
        console.error('Failed to send email:', error);
        return false;
    }
}

// Send daily newsletter email
async function sendDailyNewsletter(): Promise<boolean> {
    try {
        console.log('Generating daily newsletter...');
        const items = getItemsFiltered({
            since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
            until: null,
            region: null,
            source: null,
            limit: 200
        });

        if (items.length === 0) {
            console.log('No articles found for newsletter, skipping email');
            return true; // Not an error, just no content
        }

        // Filter articles by category with enhanced filtering
        let relevant = items.filter(i => (i.category || '') === 'relevant');
        const transactions = items.filter(i => (i.category || '') === 'transaction');
        let availabilities = items.filter(i => (i.category || '') === 'availabilities');
        const people = items.filter(i => (i.category || '') === 'people');

        // Pre-filter transactions to focus on major deals (≥100K SF or ≥$25M)
        const majorTransactions = transactions.filter(item => {
            const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
            return hasSizeSignals(titleAndDesc) || hasPriceSignals(titleAndDesc);
        });

        // Refine Market Intelligence section: focus on industrial real estate
        // Enhanced industrial focus - more comprehensive keywords for better coverage
        relevant = relevant.filter(item => {
            const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
            // Much broader industrial focus for better coverage
            const hasIndustrialFocus = /industrial|warehouse|logistics|distribution|manufacturing|cold storage|data center|fulfillment|cross-dock|spec|flex space|3pl|supply chain|material handling|ecommerce|transportation|freight|port|rail|outdoor storage|ios|manufacturing plant|processing plant|trade hub|distribution hub|logistics hub|fulfillment hub|automotive|aerospace|life sciences|biotech|chemical|food processing|brewery|r&d|research and development/i.test(titleAndDesc);
            
            // Commercial real estate context - broader terms
            const hasCommercialRealEstate = /commercial real estate|cre|real estate|industrial real estate|prologis|dltr|dre|equity|invest|development|reit|lease|leasing|tenant|landlord|broker|brokerage|sale|sold|acquisition|property|asset|building|facility|construction|development|industrial park|distribution center|fulfillment center|warehouse|logistics|speculative|build-to-suit|bts|net lease|cap rate|noi|financing|mortgage|loan|cbre|jll|cushman|colliers|newmark|industrial landlord|industrial developer|logistics developer/i.test(titleAndDesc);
            
            // Must have industrial focus (primary requirement) - commercial real estate is optional but preferred
            return hasIndustrialFocus;
        });
        
        // Increase limit to show more articles (was 4, now 15)
        relevant = relevant.slice(0, 15);

        // Refine Availabilities section: focus on NJ/PA/Upstate NY/South FL
        availabilities = availabilities.filter(item => {
            const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
            const targetRegions = ['NJ', 'PA', 'NY', 'FL'];
            const isInTargetRegion = item.regions?.some(r => targetRegions.includes(r));
            
            // Enhanced geographic validation - check for specific cities/areas
            const hasTargetGeography = /new jersey|nj|pennsylvania|pa|upstate ny|south florida|fl|miami-dade|broward|palm beach|north jersey|central jersey|south jersey|lehigh valley|philadelphia|pittsburgh|albany|buffalo|rochester/i.test(titleAndDesc);
            
            // Must be in target region OR have target geography mentioned
            return isInTargetRegion || hasTargetGeography;
        });
        
        // Limit to top availabilities to show more opportunities (was 3, now 8)
        availabilities = availabilities.slice(0, 8);
        
        // Increase limits to show more articles (was 2 each, now 5 each)
        const finalTransactions = majorTransactions.slice(0, 5);
        const finalPeople = people.slice(0, 5);
        
        console.log(`📊 Daily newsletter counts: Market Intelligence: ${relevant.length}, Transactions: ${finalTransactions.length}, Availabilities: ${availabilities.length}, People: ${finalPeople.length}`);
        
        const formatDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const period = `${formatDate(sinceDate)} – ${formatDate(new Date())} (1 day, ET)`;
        const html = buildBriefing({ relevant, transactions: finalTransactions, availabilities, people: finalPeople }, period);
        const subject = `Woodmont Daily Industrial News Briefing - ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
        const recipients = EMAIL_TO.split(',').map((email: string) => email.trim());

        console.log(`Sending newsletter to ${recipients.length} recipients with ${items.length} articles...`);
        const success = await sendEmail(recipients, subject, html);

        if (success) {
            console.log('Daily newsletter sent successfully!');
        }

        return success;
    } catch (error) {
        console.error('Failed to send daily newsletter:', error);
        return false;
    }
}

async function handleRequest(req: any, res: any): Promise<void> {
    const url = req.url || "/";
    const urlObj = new URL(url, `http://localhost:${PORT}`);
    
    console.log(`🌐 Incoming request: ${req.method} ${urlObj.pathname}${urlObj.search}`);
    
    // Set CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (urlObj.pathname === "/api/articles") {
        try {
            const params = {
                since: urlObj.searchParams.get("since") || null,
                until: urlObj.searchParams.get("until") || null,
                region: urlObj.searchParams.get("region") || null,
                source: urlObj.searchParams.get("source") || null,
                limit: parseInt(urlObj.searchParams.get("limit") || "200", 10)
            };
            const items = getItemsFiltered(params);
            const now = new Date().toISOString();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                generatedAt: now,
                window: { since: params.since || new Date(Date.now() - windowDefaultHours * 3600 * 1000).toISOString(), until: params.until || now },
                items
            }));
        } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
        }
        return;
    }

    if (urlObj.pathname === "/api/brief") {
        const params = {
            since: urlObj.searchParams.get("since") || null,
            until: urlObj.searchParams.get("until") || null,
            region: urlObj.searchParams.get("region") || null,
            source: urlObj.searchParams.get("source") || null,
            limit: parseInt(urlObj.searchParams.get("limit") || "200", 10)
        };
        const grouped = getBriefByRegion(params);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            generatedAt: new Date().toISOString(),
            window: { since: params.since, until: params.until },
            regions: grouped
        }));
        return;
    }

    if (urlObj.pathname === "/api/newsletter") {
        try {
            // Get days parameter, default to 1 (last 24 hours) if not specified
            const days = parseInt(urlObj.searchParams.get("days") || "1", 10);
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

            console.log(`📅 Newsletter request: days=${days}, since=${since}`);

            const allItems = getItemsFiltered({
                since: since,
                until: null,
                region: null,
                source: null,
                limit: 200
            });

            console.log(`📊 Found ${allItems.length} articles for ${days}-day period`);

            // SOURCE VALIDATION - Only allow approved domains (Boss's priority sources first)
            // MANDATORY SOURCES + Additional approved domains
            const approvedDomains = [
              // Boss's Mandatory Sources
              're-nj.com', 'commercialsearch.com', 'wsj.com', 'bisnow.com', 'globest.com',
              'naiop.org', 'cpexecutive.com', 'bizjournals.com', 'loopnet.com', 'costar.com',
              'lvb.com', 'dailyrecord.com', 'njbiz.com',
              // Additional Quality Sources
              'connectcre.com', 'credaily.com', 'therealdeal.com', 'freightwaves.com',
              'supplychaindive.com', 'bloomberg.com', 'reuters.com', 'apnews.com',
              'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com', 'traded.co'
            ];
            
            const validatedItems = allItems.filter(item => {
                const link = item.link || '';
                return approvedDomains.some(domain => link.includes(domain)) || !link; // Allow items without links
            });

            console.log(`📊 After source validation: ${validatedItems.length} articles`);

            // Filter articles by category (using the category field set by classification)
            let relevant = validatedItems.filter(i => (i.category || '') === 'relevant');
            const transactions = validatedItems.filter(i => (i.category || '') === 'transaction');
            let availabilities = validatedItems.filter(i => (i.category || '') === 'availabilities');
            const people = validatedItems.filter(i => (i.category || '') === 'people');

            // Pre-filter transactions to focus on major deals (≥100K SF or ≥$25M)
            const majorTransactions = transactions.filter(item => {
                const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                return hasSizeSignals(titleAndDesc) || hasPriceSignals(titleAndDesc);
            });

            // Refine Market Intelligence section: focus on industrial real estate
            // Enhanced industrial focus - more comprehensive keywords for better coverage
            relevant = relevant.filter(item => {
                const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                // Much broader industrial focus for better coverage
                const hasIndustrialFocus = /industrial|warehouse|logistics|distribution|manufacturing|cold storage|data center|fulfillment|cross-dock|spec|flex space|3pl|supply chain|material handling|ecommerce|transportation|freight|port|rail|outdoor storage|ios|manufacturing plant|processing plant|trade hub|distribution hub|logistics hub|fulfillment hub|automotive|aerospace|life sciences|biotech|chemical|food processing|brewery|r&d|research and development/i.test(titleAndDesc);
                
                // Commercial real estate context - broader terms
                const hasCommercialRealEstate = /commercial real estate|cre|real estate|industrial real estate|prologis|dltr|dre|equity|invest|development|reit|lease|leasing|tenant|landlord|broker|brokerage|sale|sold|acquisition|property|asset|building|facility|construction|development|industrial park|distribution center|fulfillment center|warehouse|logistics|speculative|build-to-suit|bts|net lease|cap rate|noi|financing|mortgage|loan|cbre|jll|cushman|colliers|newmark|industrial landlord|industrial developer|logistics developer/i.test(titleAndDesc);
                
                // Must have industrial focus (primary requirement) - commercial real estate is optional but preferred
                return hasIndustrialFocus;
            });
            
            // Increase limit to show more articles (was 4, now 15)
            relevant = relevant.slice(0, 15);

            // Refine Availabilities section: focus on NJ/PA/Upstate NY/South FL
            availabilities = availabilities.filter(item => {
                const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                const targetRegions = ['NJ', 'PA', 'NY', 'FL'];
                const isInTargetRegion = item.regions?.some(r => targetRegions.includes(r));
                
                // Enhanced geographic validation - check for specific cities/areas
                const hasTargetGeography = /new jersey|nj|pennsylvania|pa|upstate ny|south florida|fl|miami-dade|broward|palm beach|north jersey|central jersey|south jersey|lehigh valley|philadelphia|pittsburgh|albany|buffalo|rochester/i.test(titleAndDesc);
                
                // Must be in target region OR have target geography mentioned
                return isInTargetRegion || hasTargetGeography;
            });
            
            // Limit to top availabilities to show more opportunities (was 3, now 8)
            availabilities = availabilities.slice(0, 8);
            
            // Increase limits to show more articles (was 2 each, now 5 each)
            const finalTransactions = majorTransactions.slice(0, 5);
            const finalPeople = people.slice(0, 5);
            
            console.log(`📊 Final counts: Market Intelligence: ${relevant.length}, Transactions: ${finalTransactions.length}, Availabilities: ${availabilities.length}, People: ${finalPeople.length}`);
            
            const period = `${days} day${days > 1 ? 's' : ''}`;
            const html = buildBriefing({ relevant, transactions: finalTransactions, availabilities, people: finalPeople }, period);
            console.log('Generated newsletter HTML length:', html.length, 'first 100 chars:', html.substring(0, 100));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ html }));
        } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
        }
        return;
    }

    if (urlObj.pathname === "/api/refresh") {
        console.log('🔄 Manual refresh triggered');
        fetchAllRSSArticles().then(results => {
            const totalFetched = results.reduce((sum, r) => sum + r.meta.fetchedRaw, 0);
            const totalKept = results.reduce((sum, r) => sum + r.meta.kept, 0);
            console.log(`✅ Refresh completed: ${totalFetched} fetched, ${totalKept} kept from ${results.length} sources`);

            // Save articles after refresh for persistence
            saveArticlesToFile();

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ sources: results, totalFetched, totalKept }));
        }).catch(err => {
            console.error('❌ Refresh failed:', err);
            // Even if all fail, return empty sources to keep system resilient
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ sources: [], error: err.message }));
        });
        return;
    }

    if (urlObj.pathname === "/api/last-fetch") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(lastFetchInfo));
        return;
    }

    if (urlObj.pathname === "/api/feed-health") {
        const health = Array.from(feedStats.entries()).map(([url, stats]) => {
            const feedConfig = RSS_FEEDS.find(f => f.url === url);
            return {
                url,
                name: feedConfig?.name || 'Unknown',
                region: feedConfig?.region || 'US',
                status: stats.lastError ? 'failing' : 'working',
                lastFetch: stats.lastFetch,
                lastSuccess: stats.lastSuccess,
                lastError: stats.lastError,
                itemsFetched: stats.itemsFetched,
                failureCount: circuitBreaker.get(url)?.failureCount || 0
            };
        });
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(health));
        return;
    }

    if (urlObj.pathname === "/api/manual" && req.method === "POST") {
        if (API_KEY) {
            const key = req.headers["x-api-key"];
            if (!key || key !== API_KEY) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Unauthorized" }));
                return;
            }
        }
        let body = "";
        req.on("data", (chunk: any) => body += chunk.toString());
        req.on("end", async () => {
            try {
                const payload = JSON.parse(body || "{}");
                if (!payload.link) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "link is required" }));
                    return;
                }
                const canonicalUrl = stripTrackingParams(payload.link);
                const guid = payload.guid || "";
                const id = computeId({ guid, canonicalUrl });
                const validation = await validateLink(canonicalUrl);
                let thumb = payload.image || "";
                if (!thumb) {
                    thumb = await fetchOgImage(canonicalUrl);
                }
                if (!thumb) {
                    thumb = fallbackThumbnail(id);
                }
                const item: NormalizedItem = {
                    id,
                    guid: guid || undefined,
                    canonicalUrl,
                    title: payload.title || payload.url || "Untitled",
                    link: canonicalUrl,
                    pubDate: payload.publishedAt || payload.pubDate || new Date().toISOString(),
                    description: payload.summary || payload.description || "",
                    author: payload.author || "",
                    publisher: payload.source || payload.publisher || "Manual",
                    image: thumb,
                    thumbnailUrl: thumb,
                    access: validation.access,
                    status: validation.status,
                    fetchedAt: new Date().toISOString(),
                    source: payload.source || payload.publisher || "Manual",
                    regions: Array.isArray(payload.regions) ? payload.regions : [],
                    topics: Array.isArray(payload.topics) ? payload.topics : [],
                    category: payload.category || (Array.isArray(payload.topics) && payload.topics.length > 0 ? payload.topics[0] : "relevant"),
                    tier: 'A' // Manual articles are high-quality, user-curated
                };
                itemStore.set(id, item);
                manualArticles.unshift(item);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true, count: manualArticles.length, id }));
            } catch (err: any) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
        });
        return;
    }

    if (urlObj.pathname === "/api/approve-article" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: any) => body += chunk.toString());
        req.on("end", async () => {
            try {
                const { articleId, newCategory } = JSON.parse(body || "{}");
                
                if (!articleId || !newCategory) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Missing articleId or newCategory" }));
                    return;
                }
                
                // Find and update the article
                const article = itemStore.get(articleId);
                if (!article) {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Article not found" }));
                    return;
                }
                
                // Update article category
                article.category = newCategory;
                itemStore.set(articleId, article);
                
                // Save to file
                saveArticlesToFile();
                
                console.log(`✓ Article ${articleId} approved as ${newCategory}`);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, message: "Article approved successfully" }));
            } catch (err: any) {
                console.error('Error approving article:', err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
            }
        });
        return;
    }

    if (urlObj.pathname === "/api/blacklist-article" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: any) => body += chunk.toString());
        req.on("end", async () => {
            try {
                const { articleId } = JSON.parse(body || "{}");
                
                if (!articleId) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Missing articleId" }));
                    return;
                }
                
                // Find and update the article
                const article = itemStore.get(articleId);
                if (!article) {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Article not found" }));
                    return;
                }
                
                // Mark as blacklisted
                article.category = "blacklisted";
                itemStore.set(articleId, article);
                
                // Save to file
                saveArticlesToFile();
                
                console.log(`✓ Article ${articleId} blacklisted`);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, message: "Article blacklisted successfully" }));
            } catch (err: any) {
                console.error('Error blacklisting article:', err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
            }
        });
        return;
    }

    if (urlObj.pathname === "/api/send-newsletter" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk: any) => body += chunk.toString());
        req.on("end", async () => {
            try {
                const payload = JSON.parse(body || "{}");
                const recipients = Array.isArray(payload.recipients) ? payload.recipients.filter((r: string) => r.trim()) : EMAIL_TO.split(',').map((email: string) => email.trim()).filter(e => e);
                const days = parseInt(payload.days || "1", 10);
                const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
                
                const items = getItemsFiltered({
                    since: since,
                    until: null,
                    region: null,
                    source: null,
                    limit: 200
                });
                
                // Filter articles by category
                let relevant = items.filter(i => (i.category || '') === 'relevant');
                const transactions = items.filter(i => (i.category || '') === 'transaction');
                let availabilities = items.filter(i => (i.category || '') === 'availabilities');
                const people = items.filter(i => (i.category || '') === 'people');

                // Pre-filter transactions to focus on major deals (≥100K SF or ≥$25M)
                const majorTransactions = transactions.filter(item => {
                    const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                    return hasSizeSignals(titleAndDesc) || hasPriceSignals(titleAndDesc);
                });

                // Refine Market Intelligence section: focus on industrial real estate
                // Enhanced industrial focus - more comprehensive keywords for better coverage
                relevant = relevant.filter(item => {
                    const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                    // Much broader industrial focus for better coverage
                    const hasIndustrialFocus = /industrial|warehouse|logistics|distribution|manufacturing|cold storage|data center|fulfillment|cross-dock|spec|flex space|3pl|supply chain|material handling|ecommerce|transportation|freight|port|rail|outdoor storage|ios|manufacturing plant|processing plant|trade hub|distribution hub|logistics hub|fulfillment hub|automotive|aerospace|life sciences|biotech|chemical|food processing|brewery|r&d|research and development/i.test(titleAndDesc);
                    
                    // Commercial real estate context - broader terms
                    const hasCommercialRealEstate = /commercial real estate|cre|real estate|industrial real estate|prologis|dltr|dre|equity|invest|development|reit|lease|leasing|tenant|landlord|broker|brokerage|sale|sold|acquisition|property|asset|building|facility|construction|development|industrial park|distribution center|fulfillment center|warehouse|logistics|speculative|build-to-suit|bts|net lease|cap rate|noi|financing|mortgage|loan|cbre|jll|cushman|colliers|newmark|industrial landlord|industrial developer|logistics developer/i.test(titleAndDesc);
                    
                    // Must have industrial focus (primary requirement) - commercial real estate is optional but preferred
                    return hasIndustrialFocus;
                });
                
                // Increase limit to show more articles (was 4, now 15)
                relevant = relevant.slice(0, 15);

                // Refine Availabilities section: focus on NJ/PA/Upstate NY/South FL
                availabilities = availabilities.filter(item => {
                    const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                    const targetRegions = ['NJ', 'PA', 'NY', 'FL'];
                    const isInTargetRegion = item.regions?.some(r => targetRegions.includes(r));
                    
                    // Enhanced geographic validation - check for specific cities/areas
                    const hasTargetGeography = /new jersey|nj|pennsylvania|pa|upstate ny|south florida|fl|miami-dade|broward|palm beach|north jersey|central jersey|south jersey|lehigh valley|philadelphia|pittsburgh|albany|buffalo|rochester/i.test(titleAndDesc);
                    
                    // Must be in target region OR have target geography mentioned
                    return isInTargetRegion || hasTargetGeography;
                });
                
                // Limit to top availabilities to show more opportunities (was 3, now 8)
                availabilities = availabilities.slice(0, 8);
                
                // Increase limits to show more articles (was 2 each, now 5 each)
                const finalTransactions = majorTransactions.slice(0, 5);
                const finalPeople = people.slice(0, 5);
                
                console.log(`📊 Newsletter counts: Market Intelligence: ${relevant.length}, Transactions: ${finalTransactions.length}, Availabilities: ${availabilities.length}, People: ${finalPeople.length}`);
                
                const formatDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                const sinceDate = new Date(since);
                const untilDate = new Date();
                const period = `${formatDate(sinceDate)} – ${formatDate(untilDate)} (ET)`;
                const html = buildBriefing({ relevant, transactions: finalTransactions, availabilities, people: finalPeople }, period);
                
                const subject = `Woodmont Daily Industrial News Briefing - ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;
                
                console.log(`📧 Sending newsletter to ${recipients.length} recipients: ${recipients.join(', ')}`);
                console.log(`📧 From: ${EMAIL_FROM}`);
                console.log(`📧 Using SMTP: ${SMTP_HOST}:${SMTP_PORT}`);
                const success = await sendEmail(recipients, subject, html);
                
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success, recipients: recipients.length, articles: items.length }));
            } catch (err: any) {
                console.error('❌ Newsletter send failed:', err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
            }
        });
        return;
    }

    // Serve React/Tailwind frontend
    try {
        const content = fs.readFileSync(FRONTEND_FILE, "utf8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
    } catch {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("frontend missing");
    }
}

// Structured logging utility
interface LogEntry {
    level: 'info' | 'warn' | 'error';
    message: string;
    timestamp: string;
    context?: Record<string, any>;
}

function log(level: LogEntry['level'], message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        context
    };

    // Log to console
    console.log(JSON.stringify(entry));

    // Also log to file for server manager
    try {
        const logMessage = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}${context ? ' ' + JSON.stringify(context) : ''}\n`;
        fs.appendFileSync('server.log', logMessage);
    } catch (err) {
        // Ignore file logging errors
    }
}

// Calculate business days (excluding weekends)
function getBusinessDaysAgo(days: number): Date {
    const now = new Date();
    let count = 0;
    const result = new Date(now);

    while (count < days) {
        result.setDate(result.getDate() - 1);
        // 0 = Sunday, 6 = Saturday
        if (result.getDay() !== 0 && result.getDay() !== 6) {
            count++;
        }
    }
    return result;
}

// Enhanced URL filtering for tracking parameters and redirects
function shouldRejectUrl(url: string): boolean {
    const rejectPatterns = [
        /utm_/i,
        /redirect/i,
        /cache/i,
        /preview/i,
        /bing\.com/i,
        /fbclid/i,
        /gclid/i,
        /mc_cid/i,
        /mc_eid/i
    ];

    return rejectPatterns.some(pattern => pattern.test(url));
}

// Load existing GUID history from docs/feed.json for deduplication
function loadExistingGuids(): Set<string> {
    const feedPath = path.join(process.cwd(), 'docs', 'feed.json');
    try {
        if (fs.existsSync(feedPath)) {
            const data = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
            return new Set(data.items?.map((item: any) => item.id) || []);
        }
    } catch (err) {
        log('warn', 'Could not load existing feed.json for dedupe', { error: String(err) });
    }
    return new Set();
}

// Enhanced article filtering with expanded market coverage for better article yield
// Mandatory sources - these get VERY light filtering (basically allow everything)
const MANDATORY_SOURCE_PATTERNS = [
    'realestatenj', 'real estate nj',
    'commercialsearch', 'commercial search',
    'wsj', 'wall street journal',
    'bisnow',
    'globest',
    'naiop',
    'cpexecutive', 'commercial property executive', 'cpe',
    'bizjournals', 'business journal',
    'loopnet', 'loop net',
    'costar',
    'lehighvalley', 'lehigh valley', 'lvb',
    'dailyrecord', 'daily record',
    'njbiz'
];

function isFromMandatorySource(item: NormalizedItem): boolean {
    const source = (item.source || '').toLowerCase();
    const link = (item.link || '').toLowerCase();
    
    return MANDATORY_SOURCE_PATTERNS.some(pattern => 
        source.includes(pattern) || 
        link.includes(pattern.replace(/\s+/g, ''))
    );
}

function shouldIncludeArticle(item: NormalizedItem): boolean {
    // Check if URL should be rejected (spam, etc)
    if (shouldRejectUrl(item.link)) {
        return false;
    }

    // MANDATORY SOURCES: Very light filtering - allow almost everything
    if (isFromMandatorySource(item)) {
        // Only reject if it's clearly non-CRE content (e.g., sports, entertainment)
        const titleAndDesc = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
        const isNonCREContent = /\b(sports?|game|score|team|player|celebrity|movie|tv show|recipe|horoscope)\b/i.test(titleAndDesc);
        return !isNonCREContent;
    }

    // Check approved domains for non-mandatory sources
    if (!isAllowedLink(item.link)) {
        return false;
    }
    
    // For other sources, check for CRE/industrial keywords
    const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
    const hasCRESignal = /industrial|warehouse|logistics|distribution|manufacturing|real estate|commercial|property|lease|office|retail|development|investment|tenant|landlord|market|construction|acquisition/i.test(titleAndDesc);
    
    return hasCRESignal;
}

// Static RSS generation for GitHub Pages
async function buildStaticRSS() {
    const startTime = Date.now();
    log('info', 'Starting RSS feed generation');

    try {
        // === STEP 1: Load existing articles from GitHub Pages feed ===
        let existingArticles: NormalizedItem[] = [];
        const feedJsonPath = path.join(__dirname, 'docs', 'feed.json');
        
        if (fs.existsSync(feedJsonPath)) {
            try {
                const feedData = JSON.parse(fs.readFileSync(feedJsonPath, 'utf-8'));
                existingArticles = feedData.items || [];
                log('info', `Loaded ${existingArticles.length} existing articles from feed.json`);
            } catch (e) {
                log('warn', 'Could not parse existing feed.json, starting fresh');
            }
        }

        // Create set of existing GUIDs for deduplication
        const existingGuids = new Set(existingArticles.map(a => a.id));
        log('info', `Loaded ${existingGuids.size} existing GUIDs for deduplication`);

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

        // Get ALL freshly fetched items directly from results (bypass itemStore)
        const allItems: NormalizedItem[] = [];
        for (const result of results) {
            if (result.status === 'ok' && result.articles) {
                allItems.push(...result.articles);
            }
        }
        log('info', `Got ${allItems.length} items from fetch results`);

        // Apply light filtering - just check URL validity
        const filteredNewItems = allItems.filter(item => {
            // Skip clearly invalid items
            if (!item.link || !item.title) return false;
            // Skip spam
            if (shouldRejectUrl(item.link)) return false;
            // Allow all items from allowed domains
            return isAllowedLink(item.link);
        });
        log('info', `Filtered to ${filteredNewItems.length} articles after domain checks`, {
            beforeFiltering: allItems.length,
            fromMandatorySources: filteredNewItems.filter(i => isFromMandatorySource(i)).length
        });

        // Deduplication - only keep truly new items
        const newItems = filteredNewItems.filter(item => !existingGuids.has(item.id));
        log('info', `Found ${newItems.length} NEW articles`, {
            beforeDedupe: filteredNewItems.length,
            duplicatesRemoved: filteredNewItems.length - newItems.length
        });

        // === STEP 3: Merge new + existing articles ===
        const mergedArticles = [...newItems, ...existingArticles];
        log('info', `Merged: ${newItems.length} new + ${existingArticles.length} existing = ${mergedArticles.length} total`);

        // === STEP 4: Apply 30-day cleanup (extended for better coverage) ===
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const cleanedArticles = mergedArticles.filter(item => {
            const pubDate = new Date(item.pubDate || item.fetchedAt || Date.now());
            return pubDate >= thirtyDaysAgo;
        });
        
        const removedCount = mergedArticles.length - cleanedArticles.length;
        if (removedCount > 0) {
            log('info', `Auto-deleted ${removedCount} articles older than 30 days`);
        }

        // Sort by publication date (newest first)
        const sortedItems = cleanedArticles.sort((a, b) =>
            new Date(b.pubDate || b.fetchedAt || 0).getTime() -
            new Date(a.pubDate || a.fetchedAt || 0).getTime()
        );

        // Take top 150 for RSS feed (increased limit to show more content)
        const rssItems = sortedItems.slice(0, 150);
        
        log('info', `Final feed: ${rssItems.length} articles (capped at 150)`);

        // Generate RSS 2.0 XML with enhanced metadata
        const rssItemsXML = rssItems.map(item => {
            const category = item.category || 'relevant';
            const categoryLabels: Record<string, string> = {
                relevant: 'RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News',
                transaction: 'TRANSACTIONS — Notable Sales/Leases (≥100K SF or ≥$25M)',
                availabilities: 'AVAILABILITIES — New Industrial Properties for Sale/Lease',
                people: 'PEOPLE NEWS — Personnel Moves in Industrial Brokerage/Development'
            };
            const categoryLabel = categoryLabels[category] || 'RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News';

            return `\n    <item>
      <title><![CDATA[${item.title || 'Untitled'}]]></title>
      <link>${item.link}</link>
      <guid isPermaLink="true">${item.link}</guid>
      <pubDate>${item.pubDate ? new Date(item.pubDate).toUTCString() : new Date().toUTCString()}</pubDate>
      <description><![CDATA[${item.description || ''}]]></description>
      <category><![CDATA[${categoryLabel}]]></category>
      <source><![CDATA[${item.source || item.publisher || 'Unknown'}]]></source>
      ${item.author ? `<author><![CDATA[${item.author}]]></author>` : ''}
      ${item.image ? `<enclosure url="${(Array.isArray(item.image) ? item.image[0] : item.image || '').replace(/&/g, '&amp;')}" type="image/jpeg" />` : ''}
    </item>`;
        }).join('');

        const rssXML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Woodmont Industrial News Feed</title>
    <link>https://github.com/YOUR_USERNAME/YOUR_REPO</link>
    <description>Daily industrial and CRE updates across key regions - categorized by Relevant Articles, Transactions, Availabilities, and People News</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Woodmont RSS Aggregator</generator>
    <managingEditor>feed@woodmont.com</managingEditor>
    <webMaster>tech@woodmont.com</webMaster>
    <atom:link href="https://YOUR_USERNAME.github.io/YOUR_REPO/rss.xml" rel="self" type="application/rss+xml" />
    <category>Industrial Real Estate</category>
    <category>Commercial Real Estate</category>
    <category>Logistics</category>
    <category>Warehouse</category>${rssItemsXML}
  </channel>
</rss>`;

        // Ensure docs directory exists
        const docsDir = path.join(process.cwd(), 'docs');
        if (!fs.existsSync(docsDir)) {
            fs.mkdirSync(docsDir, { recursive: true });
        }

        // Write RSS XML
        fs.writeFileSync(path.join(docsDir, 'rss.xml'), rssXML, 'utf8');
        log('info', 'Generated docs/rss.xml', { itemCount: rssItems.length });

        // Write JSON feed with categories
        const feedJSON = {
            version: "https://jsonfeed.org/version/1.1",
            title: "Woodmont Industrial News Feed",
            home_page_url: "https://YOUR_USERNAME.github.io/YOUR_REPO/",
            feed_url: "https://YOUR_USERNAME.github.io/YOUR_REPO/feed.json",
            description: "Daily industrial and CRE updates across key regions - categorized by Relevant Articles, Transactions, Availabilities, and People News",
            author: {
                name: "Woodmont Industrial Partners",
                url: "https://YOUR_USERNAME.github.io/YOUR_REPO/"
            },
            items: rssItems.map(item => {
                const category = item.category || 'relevant';
                const categoryLabels: Record<string, string> = {
                    relevant: 'RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News',
                    transaction: 'TRANSACTIONS — Notable Sales/Leases (≥100K SF or ≥$25M)',
                    availabilities: 'AVAILABILITIES — New Industrial Properties for Sale/Lease',
                    people: 'PEOPLE NEWS — Personnel Moves in Industrial Brokerage/Development'
                };
                
                // Handle image - can be string or array
                let imageUrl = null;
                if (item.image) {
                    imageUrl = Array.isArray(item.image) ? item.image[0] : item.image;
                }
                
                // Handle author - ensure it's a string
                let authorName = '';
                if (item.author) {
                    authorName = typeof item.author === 'string' ? item.author : (item.author.name || '');
                }
                if (!authorName) {
                    authorName = item.source || item.publisher || 'Unknown';
                }
                
                // Handle description
                const description = item.description || item.content || '';
                const summary = description ? (description.substring(0, 200) + (description.length > 200 ? '...' : '')) : '';
                
                return {
                    id: item.id,
                    url: item.link || item.url || '',
                    title: item.title || 'Untitled',
                    content_html: description,
                    content_text: description,
                    summary: summary,
                    date_published: item.pubDate || item.date_published || new Date().toISOString(),
                    date_modified: item.fetchedAt || item.date_modified || new Date().toISOString(),
                    image: imageUrl,
                    author: {
                        name: authorName
                    },
                    tags: [categoryLabels[category] || category, ...(item.regions || [])]
                };
            })
        };
        fs.writeFileSync(path.join(docsDir, 'feed.json'), JSON.stringify(feedJSON, null, 2), 'utf8');
        log('info', 'Generated docs/feed.json', { itemCount: rssItems.length });

        // Generate simple HTML index
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Woodmont Industrial News Feed</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .article { border: 1px solid #ddd; margin-bottom: 15px; padding: 15px; border-radius: 5px; }
        .article-title { margin: 0 0 10px 0; }
        .article-title a { text-decoration: none; color: #0066cc; }
        .article-title a:hover { text-decoration: underline; }
        .article-meta { color: #666; font-size: 0.9em; margin-bottom: 10px; }
        .article-description { color: #333; line-height: 1.4; }
        .last-updated { text-align: center; color: #666; margin-top: 30px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏭 Woodmont Industrial Partners</h1>
        <h2>Daily Industrial News Feed</h2>
        <p>Latest industrial real estate news across NJ, PA, FL, and TX</p>
        <p><a href="rss.xml">📡 RSS Feed</a> | <a href="feed.json">📄 JSON Feed</a></p>
    </div>

    ${rssItems.length === 0 ? '<p>No new articles available.</p>' :
      rssItems.slice(0, 50).map(item => `
        <div class="article">
            <h3 class="article-title">
                <a href="${item.link}" target="_blank">${item.title || 'Untitled'}</a>
            </h3>
            <div class="article-meta">
                ${item.source || item.publisher || 'Unknown'} •
                ${item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'Unknown date'} •
                ${item.topics?.[0] ? item.topics[0].charAt(0).toUpperCase() + item.topics[0].slice(1) : 'Relevant'}
            </div>
            <div class="article-description">
                ${item.description ? item.description.substring(0, 300) + (item.description.length > 300 ? '...' : '') : 'No description available.'}
            </div>
        </div>
    `).join('')}

    <div class="last-updated">
        Last updated: ${new Date().toLocaleString()} •
        Showing ${Math.min(rssItems.length, 50)} of ${rssItems.length} articles
    </div>
</body>
</html>`;
        // NOTE: Not overwriting index.html - using React frontend from frontend/index.html
        // fs.writeFileSync(path.join(docsDir, 'index.html'), htmlContent, 'utf8');
        log('info', 'Skipped docs/index.html (using React frontend)', { itemCount: rssItems.length });

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

if (require.main === module) {
    const args = process.argv.slice(2);

    // Check for no-browser flag or environment variable
    const noBrowserFlag = args.includes('--no-browser') || process.env.NO_BROWSER === 'true';

    if (args.includes('--build-static')) {
        // Build static files for GitHub Pages
        console.log('🏗️ Building static files for GitHub Pages...');
        // Import and run buildStaticRSS from fetcher
        import('./src/feeds/fetcher.js').then(({ buildStaticRSS }) => {
            buildStaticRSS().catch(err => {
                console.error('Build failed:', err);
                process.exit(1);
            });
        });
    } else if (args.includes('--send-newsletter')) {
        // Manual newsletter sending
        console.log('Sending manual newsletter...');
        // Import and run sendDailyNewsletter from server/email
        import('./src/server/email.js').then(({ sendDailyNewsletter }) => {
            sendDailyNewsletter().then(success => {
                if (success) {
                    console.log('Newsletter sent successfully!');
                    process.exit(0);
                } else {
                    console.error('Failed to send newsletter');
                    process.exit(1);
                }
            }).catch(err => {
                console.error('Error sending newsletter:', err);
                process.exit(1);
            });
        });
    } else {
        // Load articles from file on startup
        const loadedCount = loadArticlesFromFile();

        const server = http.createServer((req: any, res: any) => {
            handleRequest(req, res);
        });
        server.listen(PORT, () => {
            log('info', `Server started successfully`, { port: PORT, loadedArticles: loadedCount });
            console.log(`\n🚀 Local RSS dashboard running at http://localhost:${PORT}`);
            console.log(`📊 Loaded ${loadedCount} articles from persistent storage`);

            // Check for no-browser flag or environment variable to skip auto-opening
            if (!noBrowserFlag) {
                console.log('Opening browser... (use --no-browser flag to disable)');
                setTimeout(() => {
                    // Import and call openBrowser
                    import('./src/server/browser.js').then(({ openBrowser }) => {
                        openBrowser(`http://localhost:${PORT}`);
                    });
                }, 1000);
            } else {
                console.log('Browser auto-open disabled (--no-browser flag or NO_BROWSER=true)');
            }

            // Always fetch RSS feeds on startup for fresh data
            setTimeout(async () => {
                try {
                    console.log('🔄 Initial: Fetching RSS feeds for fresh data...');
                    await fetchAllRSSArticles();
                    // Save articles immediately after initial fetch
                    saveArticlesToFile();
                    console.log('✅ Initial: RSS feeds loaded with fresh data');
                } catch (err: any) {
                    console.error('❌ Initial fetch failed:', err.message);
                }
            }, 2000); // Wait 2 seconds after server start

            // Save articles every minute (more aggressive persistence)
            setInterval(() => {
                saveArticlesToFile();
            }, 60 * 1000);

            // Fetch RSS feeds every 15 minutes in background
            setInterval(async () => {
                try {
                    console.log('🔄 Background: Fetching RSS feeds...');
                    await fetchAllRSSArticles();
                    // Save articles after background fetch
                    saveArticlesToFile();
                    console.log('✅ Background: RSS feeds updated');
                } catch (err: any) {
                    console.error('❌ Background fetch failed:', err.message);
                }
            }, 15 * 60 * 1000);
        });

        // Save articles on graceful shutdown
        process.on('SIGINT', () => {
            log('info', 'Server shutting down (SIGINT)');
            console.log('\n💾 Saving articles before shutdown...');
            saveArticlesToFile();
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            log('info', 'Server shutting down (SIGTERM)');
            console.log('\n💾 Saving articles before shutdown...');
            saveArticlesToFile();
            process.exit(0);
        });
    }
}
