/**
 * Scraper Configuration for 13 Boss-Priority Sources
 *
 * Defines URLs, selectors, rate limits, and cache TTLs for each domain scraper.
 */

export interface ScraperTarget {
    url: string;
    label: string;
}

export interface ScraperDomainConfig {
    domain: string;
    name: string;
    strategy: 'playwright' | 'axios' | 'axios-pw-fallback';
    type: 'primary' | 'supplementary';
    targets: ScraperTarget[];
    maxRunsPerDay: number;
    cacheTTLMs: number;
    access?: 'public' | 'paywalled';
    cloudflareProtected?: boolean;
    region?: string;
    feedType?: string;
}

// Cache TTL constants
const HOURS = 60 * 60 * 1000;
const NEWS_TTL = 4 * HOURS;       // reuters, apnews, bloomberg, wsj
const CRE_TTL = 8 * HOURS;        // jll, cushwake, colliers, cbre, costar
const DEAL_TTL = 6 * HOURS;       // traded.co
const SUPPLEMENTARY_TTL = 6 * HOURS; // bisnow, globest, bizjournals

export const SCRAPER_CONFIGS: ScraperDomainConfig[] = [
    // ============================================
    // PRIMARY SCRAPERS (no working RSS)
    // ============================================
    {
        domain: 'costar.com',
        name: 'CoStar',
        strategy: 'playwright',
        type: 'primary',
        targets: [
            { url: 'https://www.costar.com/article/industrial', label: 'CoStar Industrial' },
            { url: 'https://www.costar.com/article/national', label: 'CoStar National' },
            { url: 'https://product.costar.com/home/news', label: 'CoStar Product News' }
        ],
        maxRunsPerDay: 8,
        cacheTTLMs: CRE_TTL,
        access: 'paywalled',
        feedType: 'news'
    },
    // Reuters disabled - strong bot detection blocks all automated access
    // {
    //     domain: 'reuters.com',
    //     name: 'Reuters Real Estate',
    //     strategy: 'playwright',
    //     type: 'primary',
    //     targets: [
    //         { url: 'https://www.reuters.com/business/finance/', label: 'Reuters Finance' },
    //         { url: 'https://www.reuters.com/business/', label: 'Reuters Business' }
    //     ],
    //     maxRunsPerDay: 10,
    //     cacheTTLMs: NEWS_TTL,
    //     feedType: 'news'
    // },
    {
        domain: 'apnews.com',
        name: 'AP News Business',
        strategy: 'axios-pw-fallback',
        type: 'primary',
        targets: [
            { url: 'https://apnews.com/hub/real-estate', label: 'AP Real Estate' },
            { url: 'https://apnews.com/hub/business', label: 'AP Business' }
        ],
        maxRunsPerDay: 10,
        cacheTTLMs: NEWS_TTL,
        feedType: 'news'
    },
    {
        domain: 'jll.com',
        name: 'JLL',
        strategy: 'axios-pw-fallback',
        type: 'primary',
        targets: [
            { url: 'https://www.us.jll.com/en/newsroom', label: 'JLL Newsroom' },
            { url: 'https://www.us.jll.com/en/trends-and-insights/research', label: 'JLL Research' },
            { url: 'https://www.us.jll.com/en/trends-and-insights/cities', label: 'JLL Cities' }
        ],
        maxRunsPerDay: 8,
        cacheTTLMs: CRE_TTL,
        feedType: 'press-release'
    },
    {
        domain: 'cushwake.com',
        name: 'Cushman & Wakefield',
        strategy: 'playwright',
        type: 'primary',
        targets: [
            { url: 'https://www.cushmanwakefield.com/en/united-states/news/press-releases', label: 'C&W Press Releases' },
            { url: 'https://www.cushmanwakefield.com/en/united-states/insights/us-articles', label: 'C&W Articles' },
            { url: 'https://www.cushmanwakefield.com/en/united-states/insights/us-marketbeats', label: 'C&W MarketBeats' }
        ],
        maxRunsPerDay: 8,
        cacheTTLMs: CRE_TTL,
        feedType: 'press-release'
    },
    {
        domain: 'colliers.com',
        name: 'Colliers',
        strategy: 'playwright',
        type: 'primary',
        targets: [
            { url: 'https://www.colliers.com/en/news', label: 'Colliers News' },
            { url: 'https://www.colliers.com/en/research', label: 'Colliers Research' }
        ],
        maxRunsPerDay: 8,
        cacheTTLMs: CRE_TTL,
        feedType: 'press-release'
    },
    // Traded.co disabled - Cloudflare protection too strong
    // {
    //     domain: 'traded.co',
    //     name: 'Traded.co',
    //     strategy: 'playwright',
    //     type: 'primary',
    //     targets: [
    //         { url: 'https://www.traded.co/', label: 'Traded Deal Feed' }
    //     ],
    //     maxRunsPerDay: 6,
    //     cacheTTLMs: DEAL_TTL,
    //     cloudflareProtected: true,
    //     feedType: 'news'
    // },

    // ============================================
    // SUPPLEMENTARY SCRAPERS (RSS already works)
    // ============================================
    {
        domain: 'bisnow.com',
        name: 'Bisnow',
        strategy: 'axios-pw-fallback',
        type: 'supplementary',
        targets: [
            { url: 'https://www.bisnow.com/national/news', label: 'Bisnow National' },
            { url: 'https://www.bisnow.com/new-york/news', label: 'Bisnow NY' },
            { url: 'https://www.bisnow.com/new-jersey/news', label: 'Bisnow NJ' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: SUPPLEMENTARY_TTL,
        access: 'paywalled',
        feedType: 'news'
    },
    {
        domain: 'globest.com',
        name: 'GlobeSt',
        strategy: 'axios-pw-fallback',
        type: 'supplementary',
        targets: [
            { url: 'https://www.globest.com/sectors/industrial/', label: 'GlobeSt Industrial' },
            { url: 'https://www.globest.com/', label: 'GlobeSt Home' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: SUPPLEMENTARY_TTL,
        access: 'paywalled',
        feedType: 'industrial-news'
    },
    {
        domain: 'bloomberg.com',
        name: 'Bloomberg',
        strategy: 'playwright',
        type: 'supplementary',
        targets: [
            { url: 'https://www.bloomberg.com/markets/real-estate', label: 'Bloomberg Real Estate' }
        ],
        maxRunsPerDay: 4,
        cacheTTLMs: NEWS_TTL,
        access: 'paywalled',
        feedType: 'macro'
    },
    {
        domain: 'wsj.com',
        name: 'WSJ',
        strategy: 'playwright',
        type: 'supplementary',
        targets: [
            { url: 'https://www.wsj.com/real-estate', label: 'WSJ Real Estate' }
        ],
        maxRunsPerDay: 4,
        cacheTTLMs: NEWS_TTL,
        access: 'paywalled',
        feedType: 'macro'
    },
    {
        domain: 'cbre.com',
        name: 'CBRE',
        strategy: 'axios-pw-fallback',
        type: 'supplementary',
        targets: [
            { url: 'https://www.cbre.com/insights/articles', label: 'CBRE Articles' },
            { url: 'https://www.cbre.com/insights/reports', label: 'CBRE Reports' },
            { url: 'https://www.cbre.com/press-releases', label: 'CBRE Press Releases' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: CRE_TTL,
        feedType: 'press-release'
    },
    {
        domain: 'bizjournals.com',
        name: 'BizJournals',
        strategy: 'playwright',
        type: 'supplementary',
        targets: [
            { url: 'https://www.bizjournals.com/southflorida/news/commercial-real-estate', label: 'BizJournals SoFla CRE' },
            { url: 'https://www.bizjournals.com/philadelphia/news/commercial-real-estate', label: 'BizJournals Philly CRE' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: SUPPLEMENTARY_TTL,
        access: 'paywalled',
        cloudflareProtected: true,
        feedType: 'news'
    },

    // ============================================
    // FAILING RSS FEED REPLACEMENTS
    // ============================================
    {
        domain: 'credaily.com',
        name: 'CRE Daily',
        strategy: 'axios-pw-fallback',
        type: 'supplementary',
        targets: [
            { url: 'https://www.credaily.com/', label: 'CRE Daily News' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: SUPPLEMENTARY_TTL,
        feedType: 'news'
    },
    {
        domain: 'njbiz.com',
        name: 'NJBIZ',
        strategy: 'axios-pw-fallback',
        type: 'supplementary',
        targets: [
            { url: 'https://njbiz.com/real-estate/', label: 'NJBIZ Real Estate' },
            { url: 'https://njbiz.com/', label: 'NJBIZ Home' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: SUPPLEMENTARY_TTL,
        access: 'paywalled',
        region: 'NJ',
        feedType: 'news'
    },
    {
        domain: 'lvb.com',
        name: 'Lehigh Valley Business',
        strategy: 'axios-pw-fallback',
        type: 'supplementary',
        targets: [
            { url: 'https://lvb.com/category/real-estate/', label: 'LVB Real Estate' },
            { url: 'https://lvb.com/', label: 'LVB Home' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: SUPPLEMENTARY_TTL,
        access: 'paywalled',
        region: 'PA',
        feedType: 'news'
    },
    {
        domain: 'rejournals.com',
        name: 'REJournals',
        strategy: 'playwright',
        type: 'supplementary',
        targets: [
            { url: 'https://rejournals.com/category/industrial/', label: 'REJournals Industrial' },
            { url: 'https://rejournals.com/', label: 'REJournals Home' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: SUPPLEMENTARY_TTL,
        feedType: 'industrial-news'
    }

    // NOTE: Additional scrapers for blocked RSS feeds require implementations.
    // These domains are covered via Google News RSS feeds instead:
    // - therealdeal.com, commercialobserver.com (paywalled CRE news)
    // - roi-nj.com, re-nj.com (NJ regional coverage)
    // - connectcre.com, commercialsearch.com (Cloudflare protected)
];

/**
 * Get config for a specific domain
 */
export function getScraperConfig(domain: string): ScraperDomainConfig | undefined {
    return SCRAPER_CONFIGS.find(c => c.domain === domain);
}

/**
 * Get all primary scraper configs
 */
export function getPrimaryScrapers(): ScraperDomainConfig[] {
    return SCRAPER_CONFIGS.filter(c => c.type === 'primary');
}

/**
 * Get all supplementary scraper configs
 */
export function getSupplementaryScrapers(): ScraperDomainConfig[] {
    return SCRAPER_CONFIGS.filter(c => c.type === 'supplementary');
}
