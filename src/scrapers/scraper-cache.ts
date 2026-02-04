/**
 * Disk-based cache for scraped articles
 *
 * Stores scraper results in .scraper-cache/ with configurable TTLs per domain.
 */

import * as fs from 'fs';
import * as path from 'path';
import { NormalizedItem } from '../types/index.js';

const CACHE_DIR = path.join(process.cwd(), '.scraper-cache');

interface CacheEntry {
    articles: NormalizedItem[];
    fetchedAt: number;
    expiresAt: number;
    domain: string;
    target: string;
}

interface CacheStore {
    [key: string]: CacheEntry;
}

function ensureCacheDir(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function getCacheFilePath(): string {
    return path.join(CACHE_DIR, 'scraper-cache.json');
}

function loadCacheStore(): CacheStore {
    try {
        const filePath = getCacheFilePath();
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (e) {
        console.warn('[ScraperCache] Failed to load cache:', e);
    }
    return {};
}

function saveCacheStore(store: CacheStore): void {
    try {
        ensureCacheDir();
        fs.writeFileSync(getCacheFilePath(), JSON.stringify(store, null, 2));
    } catch (e) {
        console.warn('[ScraperCache] Failed to save cache:', e);
    }
}

/**
 * Generate a cache key from domain + target URL
 */
function cacheKey(domain: string, targetUrl: string): string {
    return `${domain}::${targetUrl}`;
}

/**
 * Get cached articles for a domain/target if not expired
 */
export function getCachedArticles(domain: string, targetUrl: string): NormalizedItem[] | null {
    const store = loadCacheStore();
    const key = cacheKey(domain, targetUrl);
    const entry = store[key];

    if (entry && entry.expiresAt > Date.now()) {
        console.log(`[ScraperCache] Cache hit for ${domain} - ${entry.articles.length} articles`);
        return entry.articles;
    }

    return null;
}

/**
 * Store articles in cache with a specific TTL
 */
export function setCachedArticles(
    domain: string,
    targetUrl: string,
    articles: NormalizedItem[],
    ttlMs: number
): void {
    const store = loadCacheStore();
    const now = Date.now();

    // Clean up expired entries
    for (const key of Object.keys(store)) {
        if (store[key].expiresAt < now) {
            delete store[key];
        }
    }

    const key = cacheKey(domain, targetUrl);
    store[key] = {
        articles,
        fetchedAt: now,
        expiresAt: now + ttlMs,
        domain,
        target: targetUrl
    };

    saveCacheStore(store);
    console.log(`[ScraperCache] Cached ${articles.length} articles for ${domain} (TTL: ${Math.round(ttlMs / 3600000)}h)`);
}

/**
 * Clear all cache entries for a domain
 */
export function clearDomainCache(domain: string): void {
    const store = loadCacheStore();
    let cleared = 0;

    for (const key of Object.keys(store)) {
        if (store[key].domain === domain) {
            delete store[key];
            cleared++;
        }
    }

    if (cleared > 0) {
        saveCacheStore(store);
        console.log(`[ScraperCache] Cleared ${cleared} entries for ${domain}`);
    }
}

/**
 * Clear entire cache
 */
export function clearAllCache(): void {
    try {
        ensureCacheDir();
        fs.writeFileSync(getCacheFilePath(), '{}');
        console.log('[ScraperCache] All cache cleared');
    } catch (e) {
        console.warn('[ScraperCache] Failed to clear cache:', e);
    }
}

/**
 * Get cache stats for monitoring
 */
export function getCacheStats(): {
    totalEntries: number;
    domains: { domain: string; entries: number; totalArticles: number }[];
    sizeBytes: number;
} {
    const store = loadCacheStore();
    const now = Date.now();
    const domainMap = new Map<string, { entries: number; totalArticles: number }>();

    for (const entry of Object.values(store)) {
        if (entry.expiresAt > now) {
            const existing = domainMap.get(entry.domain) || { entries: 0, totalArticles: 0 };
            existing.entries++;
            existing.totalArticles += entry.articles.length;
            domainMap.set(entry.domain, existing);
        }
    }

    let sizeBytes = 0;
    try {
        const filePath = getCacheFilePath();
        if (fs.existsSync(filePath)) {
            sizeBytes = fs.statSync(filePath).size;
        }
    } catch { /* ignore */ }

    return {
        totalEntries: [...domainMap.values()].reduce((sum, d) => sum + d.entries, 0),
        domains: [...domainMap.entries()].map(([domain, stats]) => ({ domain, ...stats })),
        sizeBytes
    };
}
