/**
 * Publisher / journal name extraction.
 *
 * Goal: every newsletter bullet and SPA card should show the actual publisher
 * (CoStar, Bisnow, Real Estate NJ, WSVN, …) instead of internal feed names like
 * "Google News CoStar Industrial" or raw domains like "re-nj.com".
 *
 * Three extraction strategies, in order:
 *   1. Trailing-dash in the title — Google News articles append " - Publisher"
 *      to the title (e.g., "Crews contain warehouse fire in Medley - WSVN").
 *   2. Direct-source domain map — direct RSS feeds set _source.name to the
 *      domain (e.g., "re-nj.com"); map to display name ("Real Estate NJ").
 *   3. Google News feed name fallback — strip "Google News " prefix
 *      ("Google News CoStar Industrial" → "CoStar Industrial").
 *
 * If all three fail, return the raw _source.name as last resort.
 */

export const PUBLISHER_DOMAIN_MAP: Record<string, string> = {
    // NJ trade publications
    're-nj.com': 'Real Estate NJ',
    'roi-nj.com': 'ROI-NJ',
    'njbiz.com': 'NJBIZ',
    'realestatenjmag.com': 'Real Estate NJ Magazine',
    'njspotlightnews.org': 'NJ Spotlight News',
    'nj.com': 'NJ.com',
    // PA trade publications
    'lvb.com': 'Lehigh Valley Business',
    'philly.com': 'Philly.com',
    // FL trade publications
    'sun-sentinel.com': 'Sun Sentinel',
    'miamiherald.com': 'Miami Herald',
    'tampabay.com': 'Tampa Bay Times',
    'jacksonville.com': 'The Florida Times-Union',
    // National CRE direct sources
    'globest.com': 'GlobeSt',
    'bisnow.com': 'Bisnow',
    'commercialobserver.com': 'Commercial Observer',
    'costar.com': 'CoStar',
    'connectcre.com': 'Connect CRE',
    'rebusinessonline.com': 'REBusiness Online',
    'commercialsearch.com': 'CommercialSearch',
    'commercialcafe.com': 'CommercialCafe',
    'credaily.com': 'CRE Daily',
    'cpexecutive.com': 'CPE',
    'therealdeal.com': 'The Real Deal',
    // Trade publications
    'naiop.org': 'NAIOP',
    'supplychaindive.com': 'Supply Chain Dive',
    'supplychainbrain.com': 'SupplyChainBrain',
    'mhlnews.com': 'MHL News',
    'areadevelopment.com': 'Area Development',
    'bizjournals.com': 'The Business Journals',
    // News wires (industrial-only filter applied upstream)
    'prnewswire.com': 'PR Newswire',
    'businesswire.com': 'BusinessWire',
    // Major papers
    'wsj.com': 'WSJ',
    'bloomberg.com': 'Bloomberg',
    'reuters.com': 'Reuters',
    // Corporate
    'prologis.com': 'Prologis',
};

/**
 * Lightweight article shape — keep this loose so it works with both
 * NormalizedItem (server) and the SPA's item shape.
 */
interface PublisherInput {
    title?: string;
    source?: string;
    url?: string;
    link?: string;
    _source?: {
        name?: string;
        website?: string;
        feedName?: string;
    };
}

// A trailing title segment that is a bare hostname (no spaces, at least one dot,
// domain-legal chars) — Google News sometimes appends the SOURCE DOMAIN instead of a
// display name, e.g. "… in Pennsylvania - constructionreviewonline.com".
function looksLikeDomain(s: string): boolean {
    return s.length <= 60 && !/\s/.test(s) && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/i.test(s);
}
// For a trailing bare domain: prefer a friendly name from PUBLISHER_DOMAIN_MAP; otherwise return
// the NORMALIZED hostname VERBATIM (strip www + lowercase). Deliberately does NOT invent a display
// name by stripping the TLD and title-casing a concatenated hostname (e.g. "constructionreviewonline")
// — an unknown domain stays "constructionreviewonline.com". news.google.com stays "Google News".
function domainPublisher(domain: string): string {
    const host = domain.toLowerCase().replace(/^www\./, '');
    if (host === 'news.google.com') return 'Google News';
    for (const [d, display] of Object.entries(PUBLISHER_DOMAIN_MAP)) {
        if (host === d || host.endsWith('.' + d)) return display;
    }
    return host;
}

export function getPublisherName(article: PublisherInput | null | undefined): string {
    if (!article) return 'Source';

    // 1. Trailing-dash in title (Google News pattern)
    //    "Title - WSVN" / "Title - The Business Journals" / "Title — CoStar"
    //    Strategy: split on dash separators and take the LAST segment. This
    //    correctly handles multi-dash titles like
    //    "Greengate, Manchester, M24 1GS - Industrial for Lease - LoopNet"
    //    by anchoring to the trailing publisher, not the first dash.
    //    All-caps 4+ chars (WSVN, KABC, WTAE) are kept — TV call signs are
    //    legitimate publishers.
    const title = article.title || '';
    const segs = title.split(/\s+[-–—|]\s+/);
    if (segs.length >= 2) {
        const last = segs[segs.length - 1].trim();
        if (/^[A-Z]/.test(last) && last.length >= 2 && last.length <= 60) {
            return last;
        }
        // Bare trailing domain (lowercase) → map to a friendly name, else the raw hostname,
        // instead of falling through to the news.google.com proxy host. (2026-08-12)
        if (looksLikeDomain(last)) {
            return domainPublisher(last);
        }
    }

    // 2. Direct-source domain map
    const sourceField = (article._source?.name || article._source?.website || (article as any).source || '').toLowerCase();
    const url = ((article as any).url || article.link || '').toLowerCase();
    const haystack = sourceField + ' ' + url;
    for (const [domain, display] of Object.entries(PUBLISHER_DOMAIN_MAP)) {
        if (haystack.includes(domain)) return display;
    }

    // 3. Google News feed name fallback — strip "Google News " prefix
    if (/^google news\b/i.test(sourceField)) {
        const stripped = sourceField.replace(/^google news\s+/i, '').trim();
        // Title-case the result for display, but keep multi-letter caps (RE-NJ, NJ, FL, etc.)
        return stripped
            .split(/\s+/)
            .map(w => /^[A-Z]{2,}(-[A-Z]+)?$/.test(w) || w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
            .join(' ')
            .trim();
    }

    // 4. Last resort. Downgrade the Google News proxy host to a clean label BEFORE returning a
    //    raw _source.name — which is itself frequently "news.google.com" (previously that raw
    //    host leaked through as the visible publisher label). (2026-08-12)
    if (sourceField === 'news.google.com' || /news\.google\.com/.test(url)) return 'Google News';
    if (article._source?.name) return article._source.name;
    return (article as any).source || 'Source';
}
