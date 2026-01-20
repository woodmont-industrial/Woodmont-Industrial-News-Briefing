import { FeedConfig, FeedType } from '../types/index.js';

// Browser headers to bypass 403 errors
export const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache"
};

// Feed types for better categorization and filtering
export const FEED_TYPES = {
  NEWS: 'news',
  INDUSTRIAL_NEWS: 'industrial-news',
  PRESS_RELEASE: 'press-release',
  MACRO: 'macro'
} as const;

// ONLY WORKING FEEDS - Based on validation results
export const RSS_FEEDS: FeedConfig[] = [
  // ============================================
  // MANDATORY SOURCES (Boss's Priority List)
  // ============================================

  // 1. REAL ESTATE NJ ✅ - Working
  {
    url: "https://re-nj.com/feed/",
    name: "Real Estate NJ",
    region: "NJ",
    source: "Real Estate NJ",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },

  // 2. COMMERCIAL SEARCH - Using alternative (CommercialCafe is same company)
  {
    url: "https://www.commercialcafe.com/blog/feed/",
    name: "Commercial Cafe",
    region: "US",
    source: "Commercial Search",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },

  // 3. WSJ ✅ - Working
  {
    url: "https://feeds.content.dowjones.io/public/rss/latestnewsrealestate",
    name: "WSJ Real Estate",
    region: "US",
    source: "WSJ",
    type: FEED_TYPES.MACRO,
    timeout: 30000
  },

  // 4. BISNOW ✅ - All regions working
  {
    url: "https://www.bisnow.com/rss-feed/new-jersey",
    name: "Bisnow New Jersey",
    region: "NJ",
    source: "Bisnow",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "https://www.bisnow.com/rss-feed/philadelphia",
    name: "Bisnow Philadelphia",
    region: "PA",
    source: "Bisnow",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "https://www.bisnow.com/rss-feed/south-florida",
    name: "Bisnow South Florida",
    region: "FL",
    source: "Bisnow",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  // Removed: Dallas, Houston (TX), New York (NY), Boston (MA) - focus on NJ, PA, FL only
  {
    url: "https://www.bisnow.com/rss-feed/national",
    name: "Bisnow National",
    region: "US",
    source: "Bisnow",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },

  // 5. NAIOP - Using blog feed
  {
    url: "https://blog.naiop.org/feed/",
    name: "NAIOP Blog",
    region: "US",
    source: "NAIOP",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },

  // 9. LOOPNET/COSTAR - No public RSS, using CRE alternatives
  // Note: LoopNet and CoStar don't offer public RSS feeds

  // 10. LEHIGH VALLEY BUSINESS ✅ - Working
  {
    url: "https://lvb.com/feed/",
    name: "Lehigh Valley Business",
    region: "PA",
    source: "Lehigh Valley Business",
    type: FEED_TYPES.NEWS,
    timeout: 30000
  },

  // 11. NJBIZ ✅ - Working
  {
    url: "https://njbiz.com/feed/",
    name: "NJBIZ",
    region: "NJ",
    source: "NJBIZ",
    type: FEED_TYPES.NEWS,
    timeout: 30000
  },

  // ============================================
  // ADDITIONAL QUALITY SOURCES
  // ============================================

  // ConnectCRE (Industrial focused) - Often blocks automated requests
  // Using enhanced headers to bypass; if still failing, use email ingestion
  {
    url: "https://www.connectcre.com/feed?story-sector=industrial",
    name: "ConnectCRE Industrial",
    region: "US",
    source: "ConnectCRE",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },
  {
    url: "https://www.connectcre.com/feed?story-market=new-jersey",
    name: "ConnectCRE NJ",
    region: "NJ",
    source: "ConnectCRE",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },
  // Removed: ConnectCRE Texas - focus on NJ, PA, FL only
  {
    url: "https://www.connectcre.com/feed?story-market=pennsylvania",
    name: "ConnectCRE PA",
    region: "PA",
    source: "ConnectCRE",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },

  // Supply Chain & Logistics
  {
    url: "https://www.supplychaindive.com/feeds/news/",
    name: "Supply Chain Dive",
    region: "US",
    source: "Supply Chain Dive",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "https://www.freightwaves.com/feed/",
    name: "FreightWaves",
    region: "US",
    source: "FreightWaves",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },

  // CRE News
  {
    url: "https://www.credaily.com/feed/",
    name: "CRE Daily",
    region: "US",
    source: "CRE Daily",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  // Removed: The Real Deal NY - focus on NJ, PA, FL only
  {
    url: "https://www.therealdeal.com/miami/feed/",
    name: "The Real Deal Miami",
    region: "FL",
    source: "The Real Deal",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },

  // REBusinessOnline (Good industrial coverage)
  {
    url: "https://rebusinessonline.com/feed/",
    name: "REBusiness Online",
    region: "US",
    source: "REBusiness",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },

    // GlobesSt (Commercial Real Estate News)
  {
      url: "https://www.globest.com/feed/",
            name: "GlobesSt",
            region: "US",
            source: "GlobesSt",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // Reuters Business News
{
      url: "https://feeds.reuters.com/reuters/businessNews",
            name: "Reuters Business",
            region: "US",
            source: "Reuters",
            type: FEED_TYPES.NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // AP News Business
{
      url: "https://apnews.com/hub/business/feed",
            name: "AP News Business",
            region: "US",
            source: "AP News",
            type: FEED_TYPES.NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // Business Journals (Market-specific coverage)
{
      url: "https://www.bizjournals.com/newyork/feed/",
            name: "Business Journal NY",
            region: "NY",
            source: "Business Journals",
            type: FEED_TYPES.NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // Traded.co - Commercial Real Estate Marketplace
{
      url: "https://www.traded.co/rss/",
            name: "Traded.co",
            region: "US",
            source: "Traded",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // ============================================
    // BROKERAGE RESEARCH & PREMIUM SOURCES
    // ============================================

    // CBRE - Investor Relations Press Releases (Direct)
{
      url: "https://ir.cbre.com/press-releases/rss",
            name: "CBRE Press Releases",
            region: "US",
            source: "CBRE",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // Bloomberg - Markets (Paywalled but RSS available)
{
      url: "https://feeds.bloomberg.com/markets/news.rss",
            name: "Bloomberg Markets",
            region: "US",
            source: "Bloomberg",
            type: FEED_TYPES.MACRO,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // ============================================
    // SITE SELECTION & INDUSTRIAL DEVELOPMENT
    // ============================================

    // Area Development - Master Feed (Site Selection, Economic Development)
{
      url: "https://www.areadevelopment.com/rss/rss.xml?t=5",
            name: "Area Development Master",
            region: "US",
            source: "Area Development",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // Area Development - News Items (Breaking CRE news)
{
      url: "https://www.areadevelopment.com/rss/NewsItems.xml?t=2",
            name: "Area Development News",
            region: "US",
            source: "Area Development",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // Inbound Logistics - Warehouse & Distribution Coverage
{
      url: "https://www.inboundlogistics.com/feed/",
            name: "Inbound Logistics",
            region: "US",
            source: "Inbound Logistics",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // ============================================
    // REGIONAL BROKERAGE FIRMS
    // ============================================

    // NAI Keystone - PA Regional Brokerage
{
      url: "https://naikeystone.com/feed/",
            name: "NAI Keystone",
            region: "PA",
            source: "NAI Keystone",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
},

    // NAI Platform - National Brokerage Network
{
      url: "https://naiplatform.com/feed/",
            name: "NAI Platform",
            region: "US",
            source: "NAI Platform",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS
}

    // NOTE: JLL, Cushman & Wakefield, Colliers brokerage feeds
    // - No public RSS feeds available from IR sites (403/404 errors)
    // - ConnectCRE company feeds blocked by Cloudflare in automated mode
    // - Alternative: Email ingestion or manual monitoring of:
    //   * ir.jll.com/news-releases
    //   * ir.cushmanwakefield.com/news
    //   * corporate.colliers.com/news

    // ============================================
    // ADDITIONAL LOGISTICS & INDUSTRIAL SOURCES
    // ============================================

    // SupplyChainBrain - Logistics & Supply Chain News
,{
      url: "https://www.supplychainbrain.com/rss/articles",
      name: "SupplyChainBrain",
      region: "US",
      source: "SupplyChainBrain",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // Logistics Management - Freight & Warehousing
{
      url: "https://www.logisticsmgmt.com/rss/all_content.xml",
      name: "Logistics Management",
      region: "US",
      source: "Logistics Management",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // Commercial Observer - CRE Transactions & News
{
      url: "https://commercialobserver.com/feed/",
      name: "Commercial Observer",
      region: "US",
      source: "Commercial Observer",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // REJournals - Midwest/National CRE News
{
      url: "https://rejournals.com/feed/",
      name: "REJournals",
      region: "US",
      source: "REJournals",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // Modern Shipper - Freight & Logistics
{
      url: "https://www.freightwaves.com/modern-shipper/feed",
      name: "Modern Shipper",
      region: "US",
      source: "Modern Shipper",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // JOC (Journal of Commerce) - Shipping & Freight
{
      url: "https://www.joc.com/rss/all",
      name: "Journal of Commerce",
      region: "US",
      source: "JOC",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // DC Velocity - Distribution Center & Warehouse News
{
      url: "https://www.dcvelocity.com/rss/",
      name: "DC Velocity",
      region: "US",
      source: "DC Velocity",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // Construction Dive - Construction Inputs & Labor
{
      url: "https://www.constructiondive.com/feeds/news/",
      name: "Construction Dive",
      region: "US",
      source: "Construction Dive",
      type: FEED_TYPES.MACRO,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // SIOR - Industrial & Office Brokers Association
{
      url: "https://www.sior.com/feed",
      name: "SIOR News",
      region: "US",
      source: "SIOR",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // Prologis Blog - Industrial REIT Insights
{
      url: "https://www.prologis.com/news-research/feed",
      name: "Prologis News",
      region: "US",
      source: "Prologis",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
}
];
