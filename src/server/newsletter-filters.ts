/**
 * Shared newsletter filtering logic — used by all newsletter variants.
 * Consolidates duplicated filter functions from email.ts into one place.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NormalizedItem } from '../types/index.js';
import { meetsDealThreshold, getDealScore } from '../shared/deal-threshold.js';
import {
    TARGET_REGIONS, MAJOR_EXCLUDE_REGIONS, INTERNATIONAL_EXCLUDE,
    EXCLUDE_POLITICAL, EXCLUDE_NON_INDUSTRIAL, INDUSTRIAL_PROPERTY_KEYWORDS,
    RELEVANT_KEYWORDS, PEOPLE_ACTION_KEYWORDS, INDUSTRIAL_CONTEXT_KEYWORDS,
    TRANSACTION_ACTION_WORDS, APPROVAL_KEYWORDS, EXCLUDE_FROM_PEOPLE,
    APPROVED_DOMAINS, REGIONAL_SOURCES, BROKERAGE_SOURCES
} from '../shared/region-data.js';

// =====================================================================
// TEXT HELPERS
// =====================================================================

export function getText(article: NormalizedItem): string {
    return `${article.title || ''} ${article.description || ''} ${(article as any).summary || ''}`.toLowerCase();
}

export function containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(kw => text.includes(kw));
}

export function isPolitical(text: string): boolean {
    return containsAny(text, EXCLUDE_POLITICAL);
}

export function isIndustrialProperty(text: string): boolean {
    if (containsAny(text, INDUSTRIAL_PROPERTY_KEYWORDS)) return true;
    return !containsAny(text, EXCLUDE_NON_INDUSTRIAL);
}

// =====================================================================
// DATE HELPERS
// =====================================================================

export function getValidDate(article: NormalizedItem): Date | null {
    const dateStr = (article as any).date_published || article.pubDate || (article as any).date_modified || article.fetchedAt;
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    if (date > new Date()) return null;
    if (date < new Date('2020-01-01')) return null;
    return date;
}

// =====================================================================
// REGION FILTER
// =====================================================================

export function isTargetRegion(article: NormalizedItem): boolean {
    const text = `${article.title || ''} ${article.description || ''} ${(article as any).summary || ''}`.toUpperCase();
    const url = ((article as any).url || article.link || '').toLowerCase();

    // BLOCK: international content — always reject
    if (INTERNATIONAL_EXCLUDE.some(term => text.includes(term))) return false;

    // BLOCK: unapproved source domains
    try {
        const hostname = new URL(url).hostname.replace('www.', '');
        if (!APPROVED_DOMAINS.some(d => hostname.includes(d))) return false;
    } catch { /* keep going if URL parse fails */ }

    // INCLUDE if from a NJ/PA/FL regional source
    const isFromRegionalSource = REGIONAL_SOURCES.some(s => url.includes(s));

    const targetCount = TARGET_REGIONS.reduce((count, r) => count + (text.split(r).length - 1), 0);
    const excludeCount = MAJOR_EXCLUDE_REGIONS.reduce((count, r) => count + (text.split(r).length - 1), 0);

    if (isFromRegionalSource) {
        if (excludeCount > targetCount && excludeCount >= 2) return false;
        return true;
    }

    if (article.regions && article.regions.length > 0) {
        const hasTarget = article.regions.some(r => TARGET_REGIONS.some(tr => r.toUpperCase().includes(tr)));
        if (hasTarget) return true;
    }

    const hasTargetRegion = TARGET_REGIONS.some(r => text.includes(r));
    if (hasTargetRegion && targetCount >= excludeCount) return true;

    return hasTargetRegion && excludeCount === 0;
}

// =====================================================================
// SECTION FILTERS
// =====================================================================

export function applyStrictFilter(items: NormalizedItem[], keywords: string[], sectionName: string): NormalizedItem[] {
    const filtered = items.filter(article => {
        const text = getText(article);
        if (isPolitical(text)) return false;
        return containsAny(text, keywords);
    });
    console.log(`🔍 ${sectionName}: ${items.length} → ${filtered.length} (strict filter)`);
    return filtered;
}

export function applyTransactionFilter(items: NormalizedItem[]): NormalizedItem[] {
    const filtered = items.filter(article => {
        const text = getText(article);
        if (isPolitical(text)) return false;
        // Accept if it has transaction action words
        if (containsAny(text, TRANSACTION_ACTION_WORDS)) return true;
        if (!isIndustrialProperty(text)) return false;
        // Project approvals/zoning are ALWAYS relevant (no threshold needed)
        if (containsAny(text, APPROVAL_KEYWORDS)) return true;
        const threshold = meetsDealThreshold(text);
        return threshold.meetsSF || threshold.meetsDollar || (threshold.sizeSF !== null && threshold.sizeSF > 0);
    });
    console.log(`🔍 Transactions: ${items.length} → ${filtered.length} (threshold filter)`);
    return filtered;
}

export function applyAvailabilityFilter(items: NormalizedItem[]): NormalizedItem[] {
    const filtered = items.filter(article => {
        const text = getText(article);
        if (isPolitical(text)) return false;
        // Accept availability-specific language
        const availabilityWords = ['available', 'for sale', 'for lease', 'listing', 'on the market', 'seeking buyer', 'buyer wanted'];
        if (containsAny(text, availabilityWords)) return true;
        if (!isIndustrialProperty(text)) return false;
        const threshold = meetsDealThreshold(text);
        return threshold.meetsSF || (threshold.sizeSF !== null && threshold.sizeSF > 0);
    });
    console.log(`🔍 Availabilities: ${items.length} → ${filtered.length} (threshold filter)`);
    return filtered;
}

export function applyPeopleFilter(items: NormalizedItem[]): NormalizedItem[] {
    const filtered = items.filter(article => {
        const text = getText(article);
        const url = ((article as any).url || article.link || '').toLowerCase();
        if (isPolitical(text)) return false;
        if (containsAny(text, EXCLUDE_FROM_PEOPLE)) return false;
        // If it's actually a transaction, don't put it in people
        if (containsAny(text, TRANSACTION_ACTION_WORDS)) return false;
        const hasAction = containsAny(text, PEOPLE_ACTION_KEYWORDS);
        const hasIndustrial = containsAny(text, INDUSTRIAL_CONTEXT_KEYWORDS);
        return hasAction && hasIndustrial;
    });
    console.log(`🔍 People News: ${items.length} → ${filtered.length} (people filter)`);
    return filtered;
}

// =====================================================================
// POST-DESCRIPTION REGIONAL RE-CHECK
// =====================================================================

export function postDescriptionRegionCheck(article: NormalizedItem): boolean {
    const desc = (article.description || '').toUpperCase();
    if (!desc) return true;
    if (MAJOR_EXCLUDE_REGIONS.some(r => desc.includes(r))) {
        console.log(`🚫 Post-desc filter removed: "${article.title?.substring(0, 50)}" (excluded region in description)`);
        return false;
    }
    if (INTERNATIONAL_EXCLUDE.some(t => desc.includes(t))) {
        console.log(`🚫 Post-desc filter removed: "${article.title?.substring(0, 50)}" (international in description)`);
        return false;
    }
    return true;
}

// =====================================================================
// ARTICLE LOADING & TIME RANGE
// =====================================================================

/**
 * Map feed.json items to NormalizedItem with proper description field
 */
export function mapFeedItemsToArticles(feedItems: any[]): NormalizedItem[] {
    return feedItems.map((a: any) => ({
        ...a,
        link: a.url || a.link,
        pubDate: a.date_published || a.pubDate,
        fetchedAt: a.date_modified || a.fetchedAt,
        description: a.content_text || a.content_html || a.description || a.summary || '',
        source: a._source?.name || a.source || '',
        publisher: a._source?.website || a.publisher || '',
    }));
}

/**
 * Load user-excluded article IDs/URLs from docs/excluded-articles.json
 */
function loadExcludedArticles(docsDir: string): { ids: Set<string>; urls: Set<string> } {
    const excludePath = path.join(docsDir, 'excluded-articles.json');
    try {
        if (fs.existsSync(excludePath)) {
            const data = JSON.parse(fs.readFileSync(excludePath, 'utf-8'));
            return {
                ids: new Set(data.excludedIds || []),
                urls: new Set((data.excludedUrls || []).map((u: string) => u.toLowerCase()))
            };
        }
    } catch (e) { console.warn('Could not load excluded-articles.json:', e); }
    return { ids: new Set(), urls: new Set() };
}

export function loadArticlesFromFeed(): { articles: NormalizedItem[]; feedPath: string; docsDir: string } {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const docsDir = path.join(__dirname, '../../docs');
    const feedPath = path.join(docsDir, 'feed.json');

    if (!fs.existsSync(feedPath)) {
        throw new Error(`Feed file not found: ${feedPath}`);
    }

    const feedData = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
    let articles = mapFeedItemsToArticles(feedData.items || []);

    // Filter out user-excluded articles
    const excluded = loadExcludedArticles(docsDir);
    if (excluded.ids.size > 0 || excluded.urls.size > 0) {
        const before = articles.length;
        articles = articles.filter(a => {
            if (a.id && excluded.ids.has(a.id)) return false;
            const url = ((a as any).url || a.link || '').toLowerCase();
            if (url && excluded.urls.has(url)) return false;
            return true;
        });
        const removed = before - articles.length;
        if (removed > 0) console.log(`🚫 Excluded ${removed} article(s) from user exclude list`);
    }

    return { articles, feedPath, docsDir };
}

export function filterArticlesByTimeRange(articles: NormalizedItem[], hours: number): NormalizedItem[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return articles.filter(a => {
        const pubDate = getValidDate(a);
        if (!pubDate) return false;
        return pubDate >= cutoff;
    });
}

// =====================================================================
// INCLUDED ARTICLES (manually picked from raw feed)
// =====================================================================

export function loadIncludedArticles(docsDir: string): NormalizedItem[] {
    const includePath = path.join(docsDir, 'included-articles.json');
    try {
        if (!fs.existsSync(includePath)) return [];
        const data = JSON.parse(fs.readFileSync(includePath, 'utf-8'));
        const articles = data.articles || [];
        if (articles.length === 0) return [];
        console.log(`📌 Loaded ${articles.length} manually included article(s)`);
        return articles.map((a: any) => ({
            id: a.id || a.url || '',
            title: a.title || '',
            link: a.url || '',
            pubDate: a.date_published || '',
            description: a.description || '',
            source: a.source || '',
            category: a.category || 'relevant',
            regions: a.region ? [a.region] : [],
            keywords: a.keywords || [],
        } as NormalizedItem));
    } catch (e) {
        console.warn('Could not load included-articles.json:', e);
        return [];
    }
}

export function clearIncludedArticles(docsDir: string): void {
    const includePath = path.join(docsDir, 'included-articles.json');
    try {
        const content = {
            _comment: 'Articles manually picked from raw feed for newsletter inclusion.',
            articles: []
        };
        fs.writeFileSync(includePath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
        console.log('🧹 Cleared included-articles.json');
    } catch (e) {
        console.warn('Could not clear included-articles.json:', e);
    }
}

export function sortByDealThenDate(a: NormalizedItem, b: NormalizedItem): number {
    const scoreA = getDealScore(a);
    const scoreB = getDealScore(b);
    if (scoreB !== scoreA) return scoreB - scoreA;
    return new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime();
}
