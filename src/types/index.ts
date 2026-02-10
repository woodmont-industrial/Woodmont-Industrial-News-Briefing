export type FetchResult = {
    status: "ok" | "error";
    articles: NormalizedItem[];
    error?: { type: string; message: string; httpStatus?: number };
    meta: { feed: string; fetchedRaw: number; kept: number; filteredOut: number; durationMs: number };
};

export type NormalizedItem = {
    id: string;
    guid?: string;
    canonicalUrl?: string;
    title: string;
    link: string;
    source: string;
    regions?: string[];
    region?: string;
    pubDate: string;
    description: string;
    content?: string;
    author?: string;
    publisher?: string;
    category: string;
    image?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    tier: 'A' | 'B' | 'C';
    score?: number;
    topics?: string[];
    access?: string;
    status?: number;
    fetchedAt?: string;
    keywords?: string[];
    isRelevant?: boolean;
    hasCRE?: boolean;
    hasIndustrial?: boolean;
    hasTransaction?: boolean;
    hasSize?: boolean;
    hasPrice?: boolean;
    hasDevelopment?: boolean;
    hasGeography?: boolean;
    hasPropertySignals?: boolean;
    hasHardNegative?: boolean;
};

export type FeedStat = {
    lastFetch: string;
    lastSuccess: string | null;
    lastError: string | null;
    itemsFetched: number;
};

export type LinkValidation = {
    isAllowed: boolean;
    reason?: string;
};

export type FeedConfig = {
    url: string;
    name: string;
    region?: string;
    source?: string;
    type?: string;
    timeout?: number;
    headers?: Record<string, string>;
    enabled?: boolean;
};

// RSS Parser types for raw feed items
export interface RawRSSItem {
    title?: string;
    link?: string | string[] | RSSLink[];
    guid?: string | { _: string; $?: { isPermaLink?: string } };
    pubDate?: string;
    published?: string;
    isoDate?: string;
    description?: string | string[];
    'content:encoded'?: string | string[];
    'content:encodedSnippet'?: string;
    content?: string;
    contentSnippet?: string;  // rss-parser auto-generated plain text snippet
    summary?: string;
    creator?: string;
    author?: string;
    categories?: string[];
    category?: Array<string | { _: string }>;
    enclosure?: RSSEnclosure | RSSEnclosure[];
    'media:content'?: RSSMediaContent | RSSMediaContent[];
    'media:thumbnail'?: RSSMediaContent | RSSMediaContent[];
    'feedburner:origLink'?: string | string[];
    'atom:link'?: RSSLink | RSSLink[];
}

export interface RSSLink {
    href?: string;
    rel?: string;
    $?: { href?: string; rel?: string };
}

export interface RSSEnclosure {
    url?: string;
    type?: string;
    $?: { url?: string; type?: string };
}

export interface RSSMediaContent {
    url?: string;
    $?: { url?: string };
}

// API Request body types
export interface ManualArticlePayload {
    link: string;
    title?: string;
    description?: string;
    summary?: string;
    author?: string;
    source?: string;
    publisher?: string;
    image?: string;
    guid?: string;
    publishedAt?: string;
    pubDate?: string;
    regions?: string[];
    topics?: string[];
    category?: string;
}

export interface ApproveArticlePayload {
    articleId: string;
    newCategory: string;
}

export interface BlacklistArticlePayload {
    articleId: string;
}

export interface SendNewsletterPayload {
    recipients: string[];
    days?: number | string;
}

// Axios/HTTP types
export interface FetchOptions {
    headers?: Record<string, string>;
    timeout?: number;
    maxRedirects?: number;
    responseType?: 'arraybuffer' | 'json' | 'text';
    maxContentLength?: number;
    validateStatus?: (status: number) => boolean;
}

// Feed type for classification
export type FeedType = 'news' | 'industrial-news' | 'press-release' | 'macro' | string;

// Cache types
export interface CacheEntry {
    body: Buffer | string;
    headers: Record<string, string>;
    timestamp: number;
}
