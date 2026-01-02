import * as fs from 'fs';
import * as path from 'path';
import { NormalizedItem, FeedStat } from '../types/index.js';
import { classifyArticle } from '../filter/classifier.js';

// File-based persistent storage
const STORAGE_FILE = path.join(process.cwd(), 'articles.json');
const ITEM_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FETCH_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

// In-memory fetch cache (per-feed) and item store (deduped, retained for 7d)
export const fetchCache = new Map<string, {
    etag?: string;
    lastModified?: string;
    body: any;
    headers: any;
    fetchedAt: number;
    status: number
}>(); // key: feed.url, value: cache data

export const itemStore = new Map<string, NormalizedItem>();  // key: id, value: normalized item
export const feedStats = new Map<string, FeedStat>();  // key: feed.url, value: stats

// Manual articles added via UI form (in-memory)
export const manualArticles: NormalizedItem[] = [];

export function saveArticlesToFile() {
    try {
        const articles = Array.from(itemStore.values());
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(articles, null, 2), 'utf8');
        console.log(`✓ Saved ${articles.length} articles to ${STORAGE_FILE}`);
    } catch (err) {
        console.error('Failed to save articles:', err);
    }
}

export function loadArticlesFromFile() {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, 'utf8');
            const articles: NormalizedItem[] = JSON.parse(data);

            // Re-categorize articles that have category "other" or no category
            let recategorizedCount = 0;
            articles.forEach(article => {
                if (!article.category || article.category === 'other' || article.category === '') {
                    const classification = classifyArticle(
                        article.title || '',
                        article.description || '',
                        article.link || '',
                        article.source
                    );
                    article.category = classification.category;
                    recategorizedCount++;
                }
                itemStore.set(article.id, article);
            });

            if (recategorizedCount > 0) {
                console.log(`✓ Re-categorized ${recategorizedCount} articles`);
                // Save the updated categories
                saveArticlesToFile();
            }

            console.log(`✓ Loaded ${articles.length} articles from ${STORAGE_FILE}`);
            return articles.length;
        }
    } catch (err) {
        console.error('Failed to load articles:', err);
    }
    return 0;
}

// Age-based cleanup - only delete by age, not by filtering criteria
export function pruneItemStore() {
    const cutoff = Date.now() - ITEM_RETENTION_MS;
    let removedCount = 0;

    for (const [id, item] of itemStore.entries()) {
        const ts = new Date(item.pubDate || item.fetchedAt || Date.now()).getTime();
        if (ts < cutoff) {
            itemStore.delete(id);
            removedCount++;
        }
    }

    if (removedCount > 0) {
        console.log(`🧹 Pruned ${removedCount} articles older than 30 days`);
    }
}

// Archive articles older than 90 days (don't delete, just mark)
export function archiveOldArticles() {
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    let archivedCount = 0;

    for (const item of itemStore.values()) {
        const itemDate = new Date(item.pubDate || item.fetchedAt || 0).getTime();
        if (itemDate < ninetyDaysAgo) {
            // Mark as archived but keep in store
            item.archived = true;
            archivedCount++;
        }
    }

    if (archivedCount > 0) {
        console.log(`📚 Archived ${archivedCount} articles older than 90 days (kept for reference)`);
    }
}
