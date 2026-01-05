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
  {
    url: "https://www.bisnow.com/rss-feed/dallas-ft-worth",
    name: "Bisnow Dallas-Ft Worth",
    region: "TX",
    source: "Bisnow",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "https://www.bisnow.com/rss-feed/national",
    name: "Bisnow National",
    region: "US",
    source: "Bisnow",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "https://www.bisnow.com/rss-feed/houston",
    name: "Bisnow Houston",
    region: "TX",
    source: "Bisnow",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "https://www.bisnow.com/rss-feed/new-york",
    name: "Bisnow New York",
    region: "NY",
    source: "Bisnow",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000
  },
  {
    url: "https://www.bisnow.com/rss-feed/boston",
    name: "Bisnow Boston",
    region: "MA",
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
  {
    url: "https://www.connectcre.com/feed?story-market=texas",
    name: "ConnectCRE Texas",
    region: "TX",
    source: "ConnectCRE",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },
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
  {
    url: "https://www.therealdeal.com/new-york/feed/",
    name: "The Real Deal NY",
    region: "NY",
    source: "The Real Deal",
    type: FEED_TYPES.INDUSTRIAL_NEWS,
    timeout: 30000,
    headers: BROWSER_HEADERS
  },
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
}
];
