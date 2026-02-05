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
            { url: 'https://www.costar.com/article', label: 'CoStar News' }
        ],
        maxRunsPerDay: 8,
        cacheTTLMs: CRE_TTL,
        access: 'paywalled',
        feedType: 'news'
    },
    {
        domain: 'reuters.com',
        name: 'Reuters Real Estate',
        strategy: 'playwright',
        type: 'primary',
        targets: [
            { url: 'https://www.reuters.com/business/finance/', label: 'Reuters Finance' },
            { url: 'https://www.reuters.com/business/', label: 'Reuters Business' }
        ],
        maxRunsPerDay: 10,
        cacheTTLMs: NEWS_TTL,
        feedType: 'news'
    },
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
        strategy: 'playwright',
        type: 'primary',
        targets: [
            { url: 'https://www.us.jll.com/en/newsroom', label: 'JLL Newsroom' },
            { url: 'https://www.us.jll.com/en/trends-and-insights', label: 'JLL Insights' }
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
            { url: 'https://www.cushmanwakefield.com/en/united-states/news', label: 'C&W News' },
            { url: 'https://www.cushmanwakefield.com/en/united-states/insights', label: 'C&W Insights' }
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
            { url: 'https://www.colliers.com/en-us/news', label: 'Colliers News' },
            { url: 'https://www.colliers.com/en-us/research', label: 'Colliers Research' }
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
        feedType: 'news'
    },
    {
        domain: 'globest.com',
        name: 'GlobeSt',
        strategy: 'axios-pw-fallback',
        type: 'supplementary',
        targets: [
            { url: 'https://www.globest.com/industrial/', label: 'GlobeSt Industrial' },
            { url: 'https://www.globest.com/logistics/', label: 'GlobeSt Logistics' }
        ],
        maxRunsPerDay: 6,
        cacheTTLMs: SUPPLEMENTARY_TTL,
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
            { url: 'https://www.cbre.com/insights', label: 'CBRE Insights' },
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
        feedType: 'news'
    }
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
