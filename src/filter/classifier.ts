import { NormalizedItem, FeedConfig, FeedType } from '../types/index.js';
import { classifyArticleWithRules } from './rule-engine.js';
import {
    INDUSTRIAL_KEYWORDS, CRE_INTENT_KEYWORDS, PROPERTY_SIGNALS,
    HARD_NEGATIVE_NON_CRE, MARKET_KEYWORDS, GEOGRAPHY_KEYWORDS,
    EXCLUSION_KEYWORDS, OUT_OF_MARKET_KEYWORDS
} from '../shared/region-data.js';

// Re-export for backward compatibility
export {
    INDUSTRIAL_KEYWORDS, CRE_INTENT_KEYWORDS, PROPERTY_SIGNALS,
    HARD_NEGATIVE_NON_CRE, MARKET_KEYWORDS, GEOGRAPHY_KEYWORDS,
    EXCLUSION_KEYWORDS, OUT_OF_MARKET_KEYWORDS
} from '../shared/region-data.js';

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
      'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com', 'traded.co',
      // Listing Platforms & Marketplaces
      'crexi.com', 'ten-x.com', 'realtyrates.com',
      // Industry-Specific Sources
      'dcvelocity.com', 'supplychainbrain.com', 'logisticsmgmt.com', 'inboundlogistics.com',
      'manufacturing.net', 'industryweek.com', 'mbtmag.com', 'modernmaterialshandling.com',
      'commercialcafe.com', 'commercialobserver.com', 'rejournals.com',
      // Logistics & Warehousing
      'logisticsmanagement.com', 'warehouseiq.com', 'supplychain247.com',
      // Local/Regional CRE Markets
      'njcre.com', 'philadelphiacre.com', 'southfloridacre.com', 'sfbj.com',
      // Brokerage & Research
      'newmarkkf.com', 'avisonyoung.com', 'leecorrentals.com', 'naimertz.com',
      'naikeystone.com', 'naiplatform.com', 'sior.com', 'ccim.com',
      // Wire Services & Aggregators
      'prnewswire.com', 'globenewswire.com', 'businesswire.com',
      // Industrial REIT Sources
      'prologis.com', 'dfreit.com', 'rfreit.com', 'firstindustrial.com',
      'stagindustrial.com', 'terreno.com', 'eastgroup.net'
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

    // Check out-of-market regions - exclude if article is about non-target markets
    // UNLESS it also mentions a target market (NJ, PA, FL)
    const hasOutOfMarket = containsAny(t, OUT_OF_MARKET_KEYWORDS);
    const hasTargetMarket = containsAny(t, MARKET_KEYWORDS);
    if (hasOutOfMarket && !hasTargetMarket) {
        return { isRelevant: false, category: "out of market", score: 0 };
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

    // SECTION 2: TRANSACTIONS - Sales or leases (TIGHTENED to reduce false positives)
    const transactionKeywords = ["sells", "sold", "acquires", "acquired", "buys", "bought",
                                "purchases", "purchased", "trades", "traded", "sale", "transaction",
                                "lease", "leased", "rental", "rented", "closes on", "closed deal",
                                "deal closed"];

    const hasTransaction = containsAny(t, transactionKeywords);

    // Exclude non-real estate transactions (software, stocks, retail sales, etc.)
    const nonRealEstateSignals = [
        "stock", "shares", "equity stake", "software", "technology", "platform",
        "retail sales", "consumer spending", "e-commerce sales", "holiday sales",
        "revenue", "earnings", "profit", "valuation", "ipo", "merger"
    ];
    const isNonRealEstate = containsAny(t, nonRealEstateSignals);

    // Check for money amounts
    const hasMoneyAmount = /\$[\d.,]+(?:million|m|billion|b)\b/i.test(t) || hasPriceSignals(t);

    // STRICTER: Must have transaction keyword + industrial focus + CRE intent + money/size + NOT non-real estate
    if (hasTransaction && industrialFocus && containsAny(t, CRE_INTENT_KEYWORDS) &&
        (hasMoneyAmount || hasSizeSignals(t)) && !isNonRealEstate) {
        // Check if meets size/price threshold (≥100K SF or ≥$25M)
        const size = extractSize(t);
        const price = extractPrice(t);
        const meetsThreshold = (size && size >= 100000) || (price && price >= 25000000);

        return {
            isRelevant: true,
            category: "transactions",
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
