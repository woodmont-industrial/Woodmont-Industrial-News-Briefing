/**
 * Link validation and URL filtering — canonical allowed domain list.
 * Extracted from fetcher.ts.
 */

import { NormalizedItem } from '../types/index.js';

// Allowed domains for URL validation - includes all mandatory sources
export const allowedDomains = [
    // MANDATORY SOURCES (Boss's Priority List)
    "re-nj.com", "commercialsearch.com", "commercialcafe.com",
    "wsj.com", "dowjones.com", "bisnow.com", "globest.com", "feedblitz.com",
    "naiop.org", "blog.naiop.org", "naiopma.org", "cpexecutive.com",
    "bizjournals.com", "feeds.bizjournals.com",
    "loopnet.com", "costar.com", "costargroup.com",
    "lvb.com", "dailyrecord.com", "northjersey.com", "njbiz.com",

    // Additional Quality Sources
    "connectcre.com", "credaily.com", "therealdeal.com",
    "supplychaindive.com", "freightwaves.com", "dcvelocity.com",
    "bloomberg.com", "reuters.com", "apnews.com",
    "cbre.com", "jll.com", "cushwake.com", "colliers.com",
    "traded.co", "crexi.com", "areadevelopment.com",
    "rebusinessonline.com", "multihousingnews.com", "wealthmanagement.com",
    "nreionline.com", "reit.com",

    // Google News (for bypass feeds)
    "news.google.com", "google.com",

    // Additional logistics/industrial sources
    "inboundlogistics.com", "logisticsmgmt.com",
    "constructiondive.com", "sior.com", "prologis.com",
    "commercialobserver.com", "rejournals.com", "naikeystone.com", "naiplatform.com",

    // Additional regional sources
    "roi-nj.com", "philadelphiabusinessjournal.com", "floridatrend.com",
    "southfloridabusinessjournal.com"
];

export function isAllowedLink(link: string): boolean {
    try {
        const u = new URL(link);
        return allowedDomains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`));
    } catch {
        return false;
    }
}

// Publisher pages that are not stories: service pages, report hubs, site furniture.
// Matched against the last path segment so article slugs that merely contain these words pass.
const NON_ARTICLE_SEGMENT = /^(?:about(?:-us)?|contact(?:-us)?|advertis(?:e|ing)|subscribe|newsletters?|search-partners|partners|careers|jobs|events|webinars|podcasts?|privacy(?:-policy)?|terms(?:-of-(?:use|service))?|research-center|[a-z0-9-]*-reports)$/i;

export function isNonArticlePage(url: string): boolean {
    try {
        const segments = new URL(url).pathname.split('/').filter(Boolean);
        return segments.length > 0 && NON_ARTICLE_SEGMENT.test(segments[segments.length - 1]);
    } catch {
        return false;
    }
}

export function shouldRejectUrl(url: string): boolean {
    if (isNonArticlePage(url)) return true;
    const rejectPatterns = [
        /utm_/i, /redirect/i, /cache/i, /preview/i,
        /bing\.com/i, /fbclid/i, /gclid/i, /mc_cid/i, /mc_eid/i
    ];
    return rejectPatterns.some(pattern => pattern.test(url));
}

// Mandatory sources - these get VERY light filtering
export const MANDATORY_SOURCE_PATTERNS = [
    'realestatenj', 'real estate nj', 'commercialsearch', 'commercial search',
    'wsj', 'wall street journal', 'bisnow', 'globest', 'naiop',
    'cpexecutive', 'commercial property executive', 'cpe',
    'bizjournals', 'business journal', 'loopnet', 'loop net', 'costar',
    'lehighvalley', 'lehigh valley', 'lvb', 'dailyrecord', 'daily record', 'njbiz'
];

export function isFromMandatorySource(item: NormalizedItem): boolean {
    const source = (item.source || '').toLowerCase();
    const link = (item.link || '').toLowerCase();
    return MANDATORY_SOURCE_PATTERNS.some(pattern =>
        source.includes(pattern) || link.includes(pattern.replace(/\s+/g, ''))
    );
}

export function shouldIncludeArticle(item: NormalizedItem): boolean {
    if (shouldRejectUrl(item.link)) return false;

    if (isFromMandatorySource(item)) {
        const titleAndDesc = ((item.title || '') + ' ' + (item.description || '')).toLowerCase();
        const isNonCREContent = /\b(sports?|game|score|team|player|celebrity|movie|tv show|recipe|horoscope)\b/i.test(titleAndDesc);
        return !isNonCREContent;
    }

    if (!isAllowedLink(item.link)) return false;

    const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
    const hasCRESignal = /industrial|warehouse|logistics|distribution|manufacturing|real estate|commercial|property|lease|office|retail|development|investment|tenant|landlord|market|construction|acquisition/i.test(titleAndDesc);
    return hasCRESignal;
}
