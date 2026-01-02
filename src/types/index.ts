export type FetchResult = {
    status: "ok" | "error";
    articles: NormalizedItem[];
    error?: { type: string; message: string; httpStatus?: number };
    meta: { feed: string; fetchedRaw: number; kept: number; filteredOut: number; durationMs: number };
};

export type NormalizedItem = {
    id: string;
    title: string;
    link: string;
    source: string;
    region: string;
    pubDate: string;
    description: string;
    content: string;
    author: string;
    category: string;
    imageUrl: string;
    tier: 'A' | 'B' | 'C';
    keywords: string[];
    isRelevant: boolean;
    hasCRE: boolean;
    hasIndustrial: boolean;
    hasTransaction: boolean;
    hasSize: boolean;
    hasPrice: boolean;
    hasDevelopment: boolean;
    hasGeography: boolean;
    hasPropertySignals: boolean;
    hasHardNegative: boolean;
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
    enabled?: boolean;
};
