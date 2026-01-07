import { NormalizedItem, FeedConfig, FeedType } from '../types/index.js';
import { classifyArticleWithRules } from './rule-engine.js';

// Industrial/Warehouse keyword filters - EXPANDED for better coverage
export const INDUSTRIAL_KEYWORDS = [
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
export const CRE_INTENT_KEYWORDS = [
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
export const PROPERTY_SIGNALS = [
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
export const HARD_NEGATIVE_NON_CRE = [
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
export const MARKET_KEYWORDS = [
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

export const GEOGRAPHY_KEYWORDS = [
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

export const EXCLUSION_KEYWORDS = [
    "apartment", "multifamily", "condo", "single-family", "homebuilder",
    "hotel", "hospitality", "self-storage", "self storage",
    "office building", "office lease", "office space", "class a office",
    "retail center", "shopping center", "strip mall", "outlet mall"
];

// Helper functions for deal signals detection - ENHANCED
export function hasSizeSignals(t: string): boolean {
    return /\b\d{1,3}(,\d{3})+\s*(sf|sq\.?\s*ft|square\s*feet)\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(acre|acres)\b/i.test(t) ||
           /\b\d{1,3}(,\d{3})+\s*(square\s*feet|sq\.?\s*ft\.?)\b/i.test(t) ||
           /\b\d+(?:,\d{3})*\s*(sf|sq\.?\s*ft)\b/i.test(t) ||
           /\b\d+(?:,\d{3})*\s*(square\s*feet|sq\.?\s*ft\.?)\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(million|billion)\s*(sf|sq\.?\s*ft|square\s*feet)\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(k|thousand)\s*(sf|sq\.?\s*ft|square\s*feet)\b/i.test(t);
}

export function hasPriceSignals(t: string): boolean {
    return /\$\s*\d+(\.\d+)?\s*(m|million|b|billion)\b/i.test(t) ||
           /\$\s*\d{1,3}(,\d{3})+(,\d{3})?\b/i.test(t) ||
           /\$\s*\d+(\.\d+)?\s*(million|billion|trillion)\b/i.test(t) ||
           /\$\s*\d+(?:,\d{3})*\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(million|billion)\s*dollars?\b/i.test(t) ||
           /\b\d+(\.\d+)?\s*(million|billion)\s*usd\b/i.test(t);
}

export function hasDevelopmentSignals(t: string): boolean {
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

export function hasTransactionSignals(t: string): boolean {
    const transKeywords = [
        "acquired", "acquisition", "purchased", "sold", "sale",
        "transaction", "deal", "closed", "closing", "agreement",
        "contract", "lease signed", "leased", "for lease", "available",
        "for sale", "on market", "off market", "investment sale",
        "portfolio sale", "disposition", "repositioning", "refinance",
        "financing", "joint venture", "partnership", "investment", "capital",
        "fund acquisition", "fund purchase", "institutional buyer",
        "private equity", "reit acquisition", "institutional investor"
    ];
    return transKeywords.some(keyword => t.toLowerCase().includes(keyword));
}

export function containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

// Classify article based on boss's four-section briefing format
function classifyArticleOriginal330(description: string, link: string, source?: string, feedType?: FeedType): { isRelevant: boolean; category: string; score: number; tier?: 'A' | 'B' | 'C' } {
    const t = (title + " " + description + " " + link).toLowerCase();

    // APPROVED SOURCES - Only allow approved domains (same as before)
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

    // Apply different filtering rules based on feed type
    let industrialFocus = false;
    let macroFocus = false;
    let transactionFocus = false;

    switch (feedType) {
        case 'industrial-news':
            // Strict industrial focus for dedicated industrial feeds
            industrialFocus = containsAny(t, INDUSTRIAL_KEYWORDS);
            if (!industrialFocus) {
                return { isRelevant: false, category: "not relevant", score: 0 };
            }
            break;

        case 'macro':
            // Allow macro trends even without strict industrial focus
            macroFocus = containsAny(t, ["rates", "inflation", "freight", "construction", "labor", "market", "trend",
                          "outlook", "forecast", "demand", "supply", "vacancy", "absorption",
                          "rent growth", "development", "investment"]);
            industrialFocus = containsAny(t, INDUSTRIAL_KEYWORDS);
            if (!macroFocus && !industrialFocus) {
                return { isRelevant: false, category: "not relevant", score: 0 };
            }
            break;

        case 'press-release':
            // Press releases get lighter filtering but still need industrial/CRE signals
            industrialFocus = containsAny(t, INDUSTRIAL_KEYWORDS) || containsAny(t, CRE_INTENT_KEYWORDS);
            if (!industrialFocus) {
                return { isRelevant: false, category: "not relevant", score: 0 };
            }
            break;

        case 'news':
        default:
            // General news feeds get standard filtering
            industrialFocus = containsAny(t, INDUSTRIAL_KEYWORDS);
            transactionFocus = hasTransactionSignals(t) || hasPriceSignals(t) || hasSizeSignals(t);
            if (!industrialFocus && !transactionFocus && !containsAny(t, CRE_INTENT_KEYWORDS)) {
                return { isRelevant: false, category: "not relevant", score: 0 };
            }
            break;
    }

    // SECTION 1: RELEVANT ARTICLES - Macro trends and major industrial real estate news
    const hasMacro = containsAny(t, ["rates", "inflation", "freight", "construction", "labor", "market", "trend",
                          "outlook", "forecast", "demand", "supply", "vacancy", "absorption",
                          "rent growth", "development", "investment"]);

    if (hasMacro && industrialFocus) {
        return { isRelevant: true, category: "relevant", score: 10, tier: 'A' };
    }

    // SECTION 2: TRANSACTIONS - Sales or leases (including money-related terms)
    const transactionKeywords = ["sells", "sold", "acquires", "acquired", "buys", "bought",
                                "purchases", "purchased", "trades", "traded", "sale", "transaction",
                                "lease", "leased", "rental", "rented", "financing", "funded",
                                "loan", "investment", "capital", "equity", "debt", "mortgage",
                                "closes on", "closed deal", "deal closed", "agreement", "contract"];

    const hasTransaction = containsAny(t, transactionKeywords);

    // Check for money amounts - MORE LENIENT
    const hasMoneyAmount = /\$[\d.,]+(?:million|m|billion|b|k|thousand)/i.test(t) ||
                           /\d+(?:\s*million|\s*billion|\s*thousand|\s*k)/i.test(t) ||
                           /price:\s*\$[\d.,]+/i.test(t) ||
                           /sold for\s*\$[\d.,]+/i.test(t) || hasPriceSignals(t);

    if (hasTransaction && industrialFocus && (hasMoneyAmount || containsAny(t, CRE_INTENT_KEYWORDS))) {
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
                                 "vacant", "for sublease", "sublease opportunity", "direct for lease"];
    const hasAvailability = containsAny(t, availabilityKeywords);

    // More lenient availability detection
    if (hasAvailability && industrialFocus) {
        return { isRelevant: true, category: "availabilities", score: 7, tier: 'B' };
    }

    // SECTION 4: PEOPLE NEWS - Personnel moves
    const peopleKeywords = ["appointed", "named", "joined", "hired", "promoted", "elected",
                           "executive", "ceo", "president", "chief", "vp", "vice president",
                           "director", "managing director", "partner", "chairman", "board"];
    const hasPeople = containsAny(t, peopleKeywords);

    if (hasPeople && (industrialFocus || containsAny(t, ["brokerage", "development", "investment"]))) {
        return { isRelevant: true, category: "people", score: 8, tier: 'A' };
    }

    // Fallback for other industrial CRE news
    if (industrialFocus && containsAny(t, CRE_INTENT_KEYWORDS)) {
        return { isRelevant: true, category: "relevant", score: 4, tier: 'B' };
    }

    return { isRelevant: false, category: "not relevant", score: 0 };
}

/**
 * Wrapper for classifyArticle that uses the lightweight rule engine
  * Falls back to original logic if rule engine fails
   */
export async function classifyArticle(
      title: string,
      description: string,
      link: string,
      source?: string,
      feedType?: FeedType
    ): Promise<{ isRelevant: boolean; category: string; score: number; tier?: 'A' | 'B' | 'C' }> {
      try {
              // Try using the new lightweight rule engine
              return await classifyArticleWithRules(title, description, link, source, feedType);
      } catch (error) {
              console.warn('Rule engine classification failed, falling back to original logic:', error);
              // Fallback to original implementation if rule engine fails
              return classifyArticleOriginal(title, description, link, source, feedType);
      }
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
