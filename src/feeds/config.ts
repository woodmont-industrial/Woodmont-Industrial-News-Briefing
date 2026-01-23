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

  // 2. COMMERCIAL SEARCH - DISABLED: Cloudflare protected, returns HTML (no RSS)
  // Using Commercial Cafe (sister site) instead
  {
    url: "https://commercialsearch.com/news/feed",
    name: "Commercial Search",
    region: "US",
    source: "Commercial Search",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS,
    enabled: false  // No RSS feed available - returns HTML after Cloudflare bypass
  },

  // 2b. COMMERCIAL CAFE (sister site to Commercial Search)
  {
    url: "https://www.commercialcafe.com/blog/feed/",
    name: "Commercial Cafe",
    region: "US",
    source: "Commercial Cafe",
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

  // 5. NAIOP - Using blog feed (official NAIOP Market Share blog)
  {
    url: "https://blog.naiop.org/feed/",
    name: "NAIOP Blog",
    region: "US",
    source: "NAIOP",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },

  // 5b. NAIOP MA - Massachusetts chapter blog (optional)
  {
    url: "https://www.naiopma.org/feed/",
    name: "NAIOP Massachusetts",
    region: "MA",
    source: "NAIOP MA",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },

  // 6. GLOBEST ✅ - Using FeedBlitz feeds (direct XML, no Cloudflare)
  {
    url: "http://feeds.feedblitz.com/globest/industrial",
    name: "GlobeSt Industrial",
    region: "US",
    source: "GlobeSt",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "http://feeds.feedblitz.com/globest/new-jersey",
    name: "GlobeSt New Jersey",
    region: "NJ",
    source: "GlobeSt",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "http://feeds.feedblitz.com/globest/philadelphia",
    name: "GlobeSt Philadelphia",
    region: "PA",
    source: "GlobeSt",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "http://feeds.feedblitz.com/globest/miami",
    name: "GlobeSt Miami",
    region: "FL",
    source: "GlobeSt",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "http://feeds.feedblitz.com/globest/national",
    name: "GlobeSt National",
    region: "US",
    source: "GlobeSt",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },

  // 7. SOUTH FLORIDA BUSINESS JOURNAL - DISABLED: 403 Forbidden on direct feed
  // Coverage provided via Google News RSS feeds and Bisnow South Florida
  {
    url: "https://feeds.bizjournals.com/bizj_southflorida",
    name: "South Florida Business Journal",
    region: "FL",
    source: "Business Journals",
    type: FEED_TYPES.NEWS,
    timeout: 30000,
    enabled: false  // 403 Forbidden - bizjournals blocks automated access
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

  // 11. NJBIZ - DISABLED: nginx 403 block (not Cloudflare, needs residential proxy)
  // Coverage provided via Google News RSS feeds instead
  {
    url: "https://njbiz.com/feed/",
    name: "NJBIZ",
    region: "NJ",
    source: "NJBIZ",
    type: FEED_TYPES.NEWS,
    timeout: 30000,
    enabled: false  // nginx 403 - use Google News for NJ coverage
  },

  // ============================================
  // ADDITIONAL QUALITY SOURCES
  // ============================================

  // ConnectCRE - DISABLED: Cloudflare protected, returns HTML after bypass (no RSS feed available)
  // Playwright confirmed these URLs return HTML pages, not RSS feeds
  {
    url: "https://www.connectcre.com/feed?story-sector=industrial",
    name: "ConnectCRE Industrial",
    region: "US",
    source: "ConnectCRE",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS,
    enabled: false  // No RSS feed available - returns HTML after Cloudflare bypass
  },
  {
    url: "https://www.connectcre.com/feed?story-market=new-jersey",
    name: "ConnectCRE NJ",
    region: "NJ",
    source: "ConnectCRE",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS,
    enabled: false  // No RSS feed available - returns HTML after Cloudflare bypass
  },
  {
    url: "https://www.connectcre.com/feed?story-market=pennsylvania",
    name: "ConnectCRE PA",
    region: "PA",
    source: "ConnectCRE",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS,
    enabled: false  // No RSS feed available - returns HTML after Cloudflare bypass
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

  // REBusinessOnline - DISABLED: Returns HTML instead of RSS (feed disabled or removed)
  // Coverage provided via Google News RSS feeds instead
  {
    url: "https://rebusinessonline.com/feed/",
    name: "REBusiness Online",
    region: "US",
    source: "REBusiness",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS,
    enabled: false  // Returns HTML - no RSS feed available
  },

    // ============================================
    // GOOGLE NEWS RSS FEEDS (Bypass Cloudflare)
    // ============================================

    // Google News - Industrial Real Estate NJ/PA/FL
  {
      url: "https://news.google.com/rss/search?q=industrial+real+estate+New+Jersey+OR+Pennsylvania+OR+Florida&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Industrial RE",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Warehouse Logistics Development
  {
      url: "https://news.google.com/rss/search?q=warehouse+logistics+development+construction&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Warehouse",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Distribution Center News
  {
      url: "https://news.google.com/rss/search?q=distribution+center+lease+sale+development&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Distribution",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Commercial Real Estate Transactions
  {
      url: "https://news.google.com/rss/search?q=commercial+real+estate+transaction+sale+lease&hl=en-US&gl=US&ceid=US:en",
      name: "Google News CRE Transactions",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Industrial REIT News
  {
      url: "https://news.google.com/rss/search?q=industrial+REIT+Prologis+OR+Duke+OR+Rexford&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Industrial REIT",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - New Jersey Industrial Specific
  {
      url: "https://news.google.com/rss/search?q=industrial+warehouse+%22New+Jersey%22+OR+%22Newark%22+OR+%22Jersey+City%22&hl=en-US&gl=US&ceid=US:en",
      name: "Google News NJ Industrial",
      region: "NJ",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Pennsylvania Industrial Specific
  {
      url: "https://news.google.com/rss/search?q=industrial+warehouse+%22Pennsylvania%22+OR+%22Philadelphia%22+OR+%22Lehigh+Valley%22&hl=en-US&gl=US&ceid=US:en",
      name: "Google News PA Industrial",
      region: "PA",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - South Florida Industrial Specific
  {
      url: "https://news.google.com/rss/search?q=industrial+warehouse+%22South+Florida%22+OR+%22Miami%22+OR+%22Fort+Lauderdale%22&hl=en-US&gl=US&ceid=US:en",
      name: "Google News FL Industrial",
      region: "FL",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Brokerage Research (Newmark, Cushman, CBRE, JLL)
  {
      url: "https://news.google.com/rss/search?q=%22Newmark%22+OR+%22Cushman+Wakefield%22+OR+%22CBRE%22+OR+%22JLL%22+industrial+warehouse&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Brokerage",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Logistics & Supply Chain
  {
      url: "https://news.google.com/rss/search?q=logistics+facility+%22supply+chain%22+%22last+mile%22+warehouse&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Logistics",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Industrial Development
  {
      url: "https://news.google.com/rss/search?q=%22industrial+development%22+OR+%22warehouse+development%22+OR+%22spec+industrial%22&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Industrial Dev",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Port & Intermodal
  {
      url: "https://news.google.com/rss/search?q=port+logistics+%22intermodal%22+OR+%22Port+Newark%22+OR+%22Port+Miami%22+OR+%22Port+Everglades%22&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Ports",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - E-commerce Fulfillment
  {
      url: "https://news.google.com/rss/search?q=%22e-commerce%22+OR+%22ecommerce%22+fulfillment+warehouse+distribution&hl=en-US&gl=US&ceid=US:en",
      name: "Google News E-commerce",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // Google News - Cold Storage & Food Logistics
  {
      url: "https://news.google.com/rss/search?q=%22cold+storage%22+OR+%22refrigerated+warehouse%22+OR+%22food+distribution%22&hl=en-US&gl=US&ceid=US:en",
      name: "Google News Cold Storage",
      region: "US",
      source: "Google News",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000
  },

    // ============================================
    // CRE NEWS SOURCES
    // ============================================

    // Business Journals (Market-specific coverage) - DISABLED: 403 Forbidden
    // NY coverage outside core NJ/PA/FL focus anyway
{
      url: "https://feeds.bizjournals.com/bizj_newyork",
            name: "Business Journal NY",
            region: "NY",
            source: "Business Journals",
            type: FEED_TYPES.NEWS,
            timeout: 30000,
            enabled: false  // 403 Forbidden - bizjournals blocks automated access
},

    // Traded.co - DISABLED: Cloudflare protected, returns HTML after bypass (no RSS feed available)
{
      url: "https://www.traded.co/rss/",
            name: "Traded.co",
            region: "US",
            source: "Traded",
            type: FEED_TYPES.INDUSTRIAL_NEWS,
            timeout: 30000,
            headers: BROWSER_HEADERS,
            enabled: false  // No RSS feed available - returns HTML after Cloudflare bypass
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

    // Logistics Management - Freight & Warehousing (Using Feedburner)
{
      url: "https://feeds.feedburner.com/logisticsmgmt/latest",
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

    // Modern Shipper - Freight & Logistics (FreightWaves category feed)
{
      url: "https://www.freightwaves.com/news/category/modern-shipper/feed",
      name: "Modern Shipper",
      region: "US",
      source: "Modern Shipper",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // JOC (Journal of Commerce) - REMOVED: 404 Not Found, feed URL changed
    // Alternative: Use Google News search for JOC content

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
    // NOTE: SIOR has no public RSS feed (email newsletter only)
{
      url: "https://www.sior.com/feed",
      name: "SIOR News",
      region: "US",
      source: "SIOR",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS,
      enabled: false  // No RSS available - SIOR uses email newsletters only
},

    // Prologis - IR Press Releases RSS
{
      url: "https://ir.prologis.com/press-releases/rss",
      name: "Prologis IR",
      region: "US",
      source: "Prologis",
      type: FEED_TYPES.INDUSTRIAL_NEWS,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // PR Newswire - Industrial Real Estate (aggregator, bypasses individual site blocks)
{
      url: "https://www.prnewswire.com/rss/news-releases-list.rss",
      name: "PR Newswire",
      region: "US",
      source: "PR Newswire",
      type: FEED_TYPES.PRESS_RELEASE,
      timeout: 30000,
      headers: BROWSER_HEADERS
},

    // GlobeNewswire - Real Estate (aggregator)
{
      url: "https://www.globenewswire.com/RssFeed/subjectcode/13-Real%20Estate/feedTitle/GlobeNewswire%20-%20Real%20Estate",
      name: "GlobeNewswire RE",
      region: "US",
      source: "GlobeNewswire",
      type: FEED_TYPES.PRESS_RELEASE,
      timeout: 30000,
      headers: BROWSER_HEADERS
}
];
