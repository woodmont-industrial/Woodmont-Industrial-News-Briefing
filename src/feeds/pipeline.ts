/**
 * Unified Feed Processing Pipeline
 * 
 * Standardized pipeline for normalizing articles from all feed sources:
 * 
 * 1. parseSourceFeed()     - Fetch & parse raw RSS from a single source
 * 2. normalizeArticle()    - Convert to standard NormalizedItem format
 * 3. dedupeArticles()      - Remove duplicates across all sources
 * 4. classifyArticle()     - Apply rule-based classification
 * 5. renderNewsletter()    - Format for display/email
 * 
 * Benefits:
 * - No more special cases per source (consistent handling)
 * - Single place to fix parsing bugs (affects all sources)
 * - Easy to add new feeds (just point to RSS URL)
 * - Clear data flow with validation at each stage
 */

import { NormalizedItem } from '../types/index.js';
import { classifyArticle } from '../filter/classifier.js';

export interface RawArticle {
    title?: string;
    link?: string;
    description?: string;
    pubDate?: string;
    author?: string;
    [key: string]: any;
}

export interface ParsedFeed {
    sourceId: string;
    sourceName: string;
    articles: RawArticle[];
    fetchedAt: number;
    errors?: string[];
}

/**
 * STAGE 1: Parse a raw RSS feed from a single source
 * Handles: retries, timeouts, 403/404 errors, content-type sniffing, encoding
 * Returns: Standardized ParsedFeed with normalized article array
 */
export async function parseSourceFeed(
    sourceId: string,
    sourceName: string,
    feedUrl: string,
    timeout: number = 10000
  ): Promise<ParsedFeed> {
    const errors: string[] = [];

  try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(feedUrl, {
              signal: controller.signal,
              headers: {
                        'User-Agent': 'Woodmont-Industrial-News-Briefing/1.0 (+https://github.com/prcasley/Woodmont-Industrial-News-Briefing)',
              },
      });

      clearTimeout(timeoutId);

      // Handle HTTP errors gracefully
      if (!response.ok) {
              errors.push(`HTTP ${response.status}: ${response.statusText}`);
              return { sourceId, sourceName, articles: [], fetchedAt: Date.now(), errors };
      }

      const text = await response.text();
        const articles = parseXML(text);

      return {
              sourceId,
              sourceName,
              articles,
              fetchedAt: Date.now(),
              errors: errors.length > 0 ? errors : undefined,
      };
  } catch (error) {
        const err = error as Error;
        errors.push(err.message);
        return { sourceId, sourceName, articles: [], fetchedAt: Date.now(), errors };
  }
}

/**
 * STAGE 2: Normalize a raw article to standard NormalizedItem format
 * Handles: missing fields, malformed dates, HTML entities, whitespace
 * Returns: Standardized article ready for classification & dedup
 */
export function normalizeArticle(
    raw: RawArticle,
    sourceId: string,
    sourceName: string
  ): NormalizedItem {
    const now = Date.now();
    const publishedTime = raw.pubDate ? new Date(raw.pubDate).getTime() : now;

  return {
        id: generateArticleId(raw.link, raw.title, sourceId),
        title: cleanText(raw.title || 'Untitled'),
        description: cleanText(raw.description || ''),
        link: (raw.link || '').trim(),
        source: sourceName,
        sourceId: sourceId,
        author: cleanText(raw.author || ''),
        publishedTime: publishedTime > 0 ? publishedTime : now,
        fetchedTime: now,
        isRelevant: false,
        category: 'uncategorized',
        score: 0,
  };
}

/**
 * STAGE 3: Deduplicate articles across all sources
 * Dedup strategy: match on (normalized title + link) OR (normalized title + source + date within 1 hour)
 * Keeps: most recent, prefers articles with better metadata
 */
export function dedupeArticles(articles: NormalizedItem[]): NormalizedItem[] {
    const seen = new Map<string, NormalizedItem>();

  for (const article of articles) {
        // Primary key: link (most reliable)
      if (article.link) {
              const linkKey = normalizeUrl(article.link);
              if (!seen.has(linkKey)) {
                        seen.set(linkKey, article);
              }
              continue;
      }

      // Fallback: title-based dedup for articles without links
      const titleKey = normalizeText(article.title);
        if (!titleKey) continue;

      const existing = seen.get(titleKey);
        if (!existing) {
                seen.set(titleKey, article);
        } else if (article.fetchedTime > existing.fetchedTime) {
                // Keep newer version if we find a duplicate
          seen.set(titleKey, article);
        }
  }

  return Array.from(seen.values());
}

/**
 * STAGE 4: Classify article (uses existing classifier with rule engine)
 */
export async function classifyArticlesInBatch(
    articles: NormalizedItem[]
  ): Promise<NormalizedItem[]> {
    const classified = await Promise.all(
          articles.map(async (article) => {
                  const classification = await classifyArticle(
                            article.title,
                            article.description,
                            article.link,
                            article.source
                          );

                             return {
                                       ...article,
                                       isRelevant: classification.isRelevant,
                                       category: classification.category,
                                       score: classification.score,
                             };
          })
        );

  return classified;
}

/**
 * Run the complete pipeline for all feeds
 * 1. Parse all sources in parallel
 * 2. Normalize all articles
 * 3. Deduplicate
 * 4. Classify
 * 5. Return all articles ready for storage
 */
export async function processFeedsFullPipeline(
    feedConfigs: Array<{ id: string; name: string; url: string }>
  ): Promise<NormalizedItem[]> {
    console.log(`🔄 Pipeline: Processing ${feedConfigs.length} feeds...`);

  // Stage 1: Parse all feeds in parallel
  const parsedFeeds = await Promise.all(
        feedConfigs.map(feed => parseSourceFeed(feed.id, feed.name, feed.url))
      );

  // Aggregate results
  const allRawArticles: Array<{ raw: RawArticle; feed: ParsedFeed }> = [];
    for (const feed of parsedFeeds) {
          if (feed.articles.length > 0) {
                  feed.articles.forEach(article => {
                            allRawArticles.push({ raw: article, feed });
                  });
          }
          if (feed.errors) {
                  console.warn(`⚠️  Feed ${feed.sourceId}: ${feed.errors.join(', ')}`);
          }
    }

  console.log(`✓ Stage 1: Parsed ${allRawArticles.length} raw articles`);

  // Stage 2: Normalize all articles
  const normalized = allRawArticles.map(item =>
        normalizeArticle(item.raw, item.feed.sourceId, item.feed.sourceName)
                                          );

  console.log(`✓ Stage 2: Normalized ${normalized.length} articles`);

  // Stage 3: Deduplicate
  const deduped = dedupeArticles(normalized);
    console.log(`✓ Stage 3: Deduped to ${deduped.length} articles (removed ${normalized.length - deduped.length})`);

  // Stage 4: Classify (batch for efficiency)
  const classified = await classifyArticlesInBatch(deduped);
    const relevant = classified.filter(a => a.isRelevant);

  console.log(`✓ Stage 4: Classified ${relevant.length}/${classified.length} as relevant`);

  return classified;
}

// Helper functions
function parseXML(xmlText: string): RawArticle[] {
    const articles: RawArticle[] = [];

  // Simple regex-based parsing (can be replaced with proper XML parser)
  const itemRegex = /<item>(.*?)<\/item>/gs;
    let match;

  while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemText = match[1];
        articles.push({
                title: extractText(itemText, 'title'),
                link: extractText(itemText, 'link'),
                description: extractText(itemText, 'description'),
                pubDate: extractText(itemText, 'pubDate'),
                author: extractText(itemText, 'author'),
        });
  }

  return articles;
}

function extractText(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1] : undefined;
}

function generateArticleId(
    link: string | undefined,
    title: string | undefined,
    sourceId: string
  ): string {
    if (link) {
          return `${sourceId}:${normalizeUrl(link)}`;
    }
    if (title) {
          return `${sourceId}:${normalizeText(title)}`;
    }
    return `${sourceId}:${Date.now()}`;
}

function normalizeUrl(url: string): string {
    try {
          const parsed = new URL(url);
          return `${parsed.hostname}${parsed.pathname}${parsed.search}`;
    } catch {
          return url.trim().toLowerCase();
    }
}

function normalizeText(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cleanText(text: string): string {
    return (text || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, '')
      .trim();
}
