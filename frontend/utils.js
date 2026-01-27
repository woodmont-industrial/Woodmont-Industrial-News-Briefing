// Utility functions for the Woodmont Industrial News app

import { NEWSLETTER_LIMITS, CATEGORY_COLORS } from './config.js';

/**
 * Transforms article data from feed.json or API format
 * Fixes the source field bug - now correctly prioritizes source over author
 */
export function transformArticle(item) {
    // Extract author name properly
  let authorName = '';
    if (item.author) {
          authorName = typeof item.author === 'string' ? item.author : (item.author.name || '');
    }

  // Determine category from tags
  const firstTag = item.tags?.[0] || '';
    const tagLower = firstTag.toLowerCase();
    let category = 'relevant';
    if (tagLower.includes('transaction')) category = 'transaction';
    else if (tagLower.includes('availab')) category = 'availabilities';
    else if (tagLower.includes('people')) category = 'people';

  // FIX: Use actual source field first, fall back to author, then 'Unknown'
  return {
        ...item,
        link: item.url || item.link || '',
        pubDate: item.date_published || item.pubDate || new Date().toISOString(),
        description: item.content_text || item.content_html || item.description || '',
        source: item.source || item.publisher || authorName || 'Unknown',  // FIXED: source comes first
        author: authorName || undefined,  // Separate author field
        category: category,
        id: item.id || item.link || Math.random().toString()
  };
}

/**
 * Extract unique sources from articles
 */
export function getUniqueSources(articles) {
    const uniqueSources = new Set(
          articles
            .map(item => item.source || item.publisher)
            .filter(Boolean)
        );
    return Array.from(uniqueSources).sort();
}

/**
 * Filter articles based on criteria
 */
export function filterArticles(items, { timeframe, query, region, category, source, sort }) {
    let list = [...items];

  // Filter out articles with "not relevant", "excluded", and "blacklisted" categories
  list = list.filter(it => 
                         it.category !== 'not relevant' && 
                         it.category !== 'excluded' && 
                         it.category !== 'blacklisted'
                       );

  // Filter by timeframe
  if (timeframe) {
        const daysAgo = parseInt(timeframe, 10);
        const cutoffDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        list = list.filter(it => {
                const pubDate = new Date(it.pubDate || it.fetchedAt || 0);
                return pubDate >= cutoffDate;
        });
  }

  // Filter by search query
  if (query) {
        const q = query.toLowerCase();
        list = list.filter(it =>
                (it.title && it.title.toLowerCase().includes(q)) ||
                (it.description && it.description.toLowerCase().includes(q))
                               );
  }

  // Filter by region
  if (region) {
        list = list.filter(it => {
                const r = region.toLowerCase();
                return (it.title + " " + it.description).toLowerCase().includes(r);
        });
  }

  // Filter by category
  if (category) {
        list = list.filter(it => it.category === category);
  }

  // Filter by source
  if (source) {
        list = list.filter(it => (it.source || it.publisher) === source);
  }

  // Sort articles
  if (sort === "newest") {
        list.sort((a, b) => new Date(b.pubDate || b.fetchedAt || 0) - new Date(a.pubDate || a.fetchedAt || 0));
  } else {
        list.sort((a, b) => new Date(a.pubDate || a.fetchedAt || 0) - new Date(b.pubDate || b.fetchedAt || 0));
  }

  return list;
}

/**
 * Build newsletter HTML (client-side for static mode)
 */
export function buildNewsletterHTML(articles, days) {
    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const dateRange = `${startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} (ET)`;

  const relevant = articles.filter(a => a.category === 'relevant').slice(0, NEWSLETTER_LIMITS.relevant);
    const transactions = articles.filter(a => a.category === 'transaction').slice(0, NEWSLETTER_LIMITS.transaction);
    const availabilities = articles.filter(a => a.category === 'availabilities').slice(0, NEWSLETTER_LIMITS.availabilities);
    const people = articles.filter(a => a.category === 'people').slice(0, NEWSLETTER_LIMITS.people);

  const renderArticle = (item) => {
        const region = item.regions?.[0] || 'US';
        const desc = (item.description || '').substring(0, 150) + '...';
        return `<div class="article-card">
              <div class="article-header">
                      <span class="badge badge-location">${region}</span>
                              <span class="badge badge-source">${item.source || 'Unknown'}</span>
                                    </div>
                                          <div class="article-content">${desc}</div>
                                                <div class="article-source">
                                                        <a href="${item.link}" class="source-link" target="_blank">📖 Read Full Article – ${item.source || 'Source'}</a>
                                                              </div>
                                                                  </div>`;
  };

  const renderSection = (title, icon, items) => {
        const content = items.length > 0 
          ? items.map(renderArticle).join('') 
                : '<div class="empty-section">No articles available for this section.</div>';
        return `<div class="section">
              <div class="section-header">
                      <div class="section-icon">${icon}</div>
                              <div class="section-title">${title}</div>
                                    </div>
                                          ${content}
                                              </div>`;
  };

  return `<!DOCTYPE html><html><head><style>
      *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:'Segoe UI',sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);padding:20px}
              .container{max-width:800px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
                  .header{background:linear-gradient(135deg,#1e3c72,#2a5298);color:#fff;padding:40px 30px;text-align:center}
                      .header h1{font-size:28px;margin-bottom:10px}
                          .header .subtitle{font-size:16px;opacity:.9;margin-bottom:8px}
                              .header .date-range{font-size:14px;opacity:.8;font-style:italic}
                                  .content{padding:30px}
                                      .section{margin-bottom:35px}
                                          .section-header{display:flex;align-items:center;margin-bottom:20px;padding-bottom:10px;border-bottom:3px solid #667eea}
                                              .section-icon{width:40px;height:40px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:8px;display:flex;align-items:center;justify-content:center;margin-right:15px;font-size:20px}
                                                  .section-title{font-size:20px;color:#1e3c72;font-weight:600}
                                                      .article-card{background:#f8f9fa;border-left:4px solid #667eea;padding:20px;margin-bottom:15px;border-radius:8px}
                                                          .article-header{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
                                                              .badge{padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase}
                                                                  .badge-location{background:#e3f2fd;color:#1976d2}
                                                                      .badge-source{background:#e8f5e9;color:#388e3c}
                                                                          .article-content{color:#333;line-height:1.6;margin-bottom:10px}
                                                                              .article-source{margin-top:12px;padding-top:12px;border-top:1px solid #dee2e6}
                                                                                  .source-link{color:#667eea;text-decoration:none;font-weight:500;font-size:14px}
                                                                                      .empty-section{background:#f8f9fa;padding:20px;border-radius:8px;text-align:center;color:#666;font-style:italic}
                                                                                          .footer{background:#f8f9fa;padding:25px 30px;text-align:center;color:#666;font-size:14px;border-top:1px solid #dee2e6}
                                                                                            </style></head><body><div class="container">
                                                                                                <div class="header">
                                                                                                      <h1>🏭 Woodmont Industrial Partners</h1>
                                                                                                            <div class="subtitle">Daily Industrial News Briefing</div>
                                                                                                                  <div class="date-range">Coverage Period: ${dateRange}</div>
                                                                                                                        <div class="date-range">Focus Markets: NJ, PA, FL, TX</div>
                                                                                                                            </div>
                                                                                                                                <div class="content">
                                                                                                                                      ${renderSection('RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News', '📰', relevant)}
                                                                                                                                            ${renderSection('TRANSACTIONS — Notable Sales/Leases (≥100K SF or ≥$25M)', '💼', transactions)}
                                                                                                                                                  ${renderSection('AVAILABILITIES — New Industrial Properties for Sale/Lease', '🏢', availabilities)}
                                                                                                                                                        ${renderSection('PEOPLE NEWS — Personnel Moves in Industrial Brokerage/Development', '👥', people)}
                                                                                                                                                            </div>
                                                                                                                                                                <div class="footer">
                                                                                                                                                                      <strong>Woodmont Industrial Partners</strong><br>
                                                                                                                                                                            Daily Industrial News Briefing – Confidential & Proprietary<br>
                                                                                                                                                                                  © 2025 All Rights Reserved
                                                                                                                                                                                      </div>
                                                                                                                                                                                        </div></body></html>`;
}

/**
 * Get category color classes
 */
export function getCategoryColors(category) {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['relevant'];
}

/**
 * Format date for display
 */
export function formatDate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString();
}

/**
 * Format date and time for display
 */
export function formatDateTime(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
}

// ============================================
// ARTICLE TRACKING - localStorage-based
// ============================================

const TRACKED_TOPICS_KEY = 'woodmont_tracked_topics';
const TRACKED_ARTICLES_KEY = 'woodmont_tracked_articles';

/**
 * Get all tracked topics from localStorage
 * @returns {Array<{keyword: string, addedAt: string, articleTitle?: string}>}
 */
export function getTrackedTopics() {
    try {
        const stored = localStorage.getItem(TRACKED_TOPICS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error reading tracked topics:', e);
        return [];
    }
}

/**
 * Add a topic/keyword to track
 * @param {string} keyword - The keyword or phrase to track
 * @param {string} articleTitle - Optional title of the article that triggered this track
 */
export function addTrackedTopic(keyword, articleTitle = '') {
    const topics = getTrackedTopics();
    // Normalize keyword
    const normalizedKeyword = keyword.toLowerCase().trim();

    // Check if already tracking this keyword
    if (topics.some(t => t.keyword.toLowerCase() === normalizedKeyword)) {
        return false; // Already tracking
    }

    topics.push({
        keyword: keyword.trim(),
        addedAt: new Date().toISOString(),
        articleTitle: articleTitle
    });

    try {
        localStorage.setItem(TRACKED_TOPICS_KEY, JSON.stringify(topics));
        return true;
    } catch (e) {
        console.error('Error saving tracked topic:', e);
        return false;
    }
}

/**
 * Remove a tracked topic
 * @param {string} keyword - The keyword to stop tracking
 */
export function removeTrackedTopic(keyword) {
    const topics = getTrackedTopics();
    const normalizedKeyword = keyword.toLowerCase().trim();
    const filtered = topics.filter(t => t.keyword.toLowerCase() !== normalizedKeyword);

    try {
        localStorage.setItem(TRACKED_TOPICS_KEY, JSON.stringify(filtered));
        return true;
    } catch (e) {
        console.error('Error removing tracked topic:', e);
        return false;
    }
}

/**
 * Check if an article matches any tracked topics
 * @param {Object} article - The article to check
 * @returns {Array<string>} - Array of matching keywords
 */
export function getMatchingTrackedTopics(article) {
    const topics = getTrackedTopics();
    const matches = [];

    const searchText = `${article.title || ''} ${article.description || ''} ${article.source || ''}`.toLowerCase();

    for (const topic of topics) {
        if (searchText.includes(topic.keyword.toLowerCase())) {
            matches.push(topic.keyword);
        }
    }

    return matches;
}

/**
 * Extract potential keywords from an article for tracking suggestions
 * @param {Object} article - The article to extract keywords from
 * @returns {Array<string>} - Array of suggested keywords
 */
export function extractTrackableKeywords(article) {
    const keywords = [];
    const title = article.title || '';

    // Extract company/organization names (capitalized multi-word phrases)
    const companyMatches = title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
    keywords.push(...companyMatches.slice(0, 3));

    // Extract location names (common patterns)
    const locationPatterns = [
        /(?:in|at|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
        /(New\s+Jersey|New\s+York|South\s+Florida|Pennsylvania|Miami-Dade|Broward)/gi
    ];
    for (const pattern of locationPatterns) {
        const matches = title.match(pattern);
        if (matches) keywords.push(...matches.slice(0, 2));
    }

    // Extract deal size mentions
    const dealMatches = title.match(/\$[\d,.]+\s*(?:million|billion|M|B)?/gi) || [];
    if (dealMatches.length > 0) {
        keywords.push(...dealMatches.slice(0, 1));
    }

    // Extract square footage
    const sfMatches = title.match(/[\d,]+\s*(?:SF|square\s*feet)/gi) || [];
    if (sfMatches.length > 0) {
        keywords.push(...sfMatches.slice(0, 1));
    }

    // Remove duplicates and clean up
    const unique = [...new Set(keywords.map(k => k.trim()))];
    return unique.filter(k => k.length > 2 && k.length < 50);
}

/**
 * Mark an article as "seen" for tracking purposes
 * @param {string} articleId - The article ID
 */
export function markArticleSeen(articleId) {
    try {
        const seen = JSON.parse(localStorage.getItem(TRACKED_ARTICLES_KEY) || '{}');
        seen[articleId] = new Date().toISOString();
        localStorage.setItem(TRACKED_ARTICLES_KEY, JSON.stringify(seen));
    } catch (e) {
        console.error('Error marking article seen:', e);
    }
}

/**
 * Check if an article has been seen before
 * @param {string} articleId - The article ID
 * @returns {boolean}
 */
export function isArticleSeen(articleId) {
    try {
        const seen = JSON.parse(localStorage.getItem(TRACKED_ARTICLES_KEY) || '{}');
        return !!seen[articleId];
    } catch (e) {
        return false;
    }
}

/**
 * Get count of new articles matching tracked topics
 * @param {Array} articles - All articles
 * @returns {number} - Count of unseen articles matching tracked topics
 */
export function getNewMatchingArticlesCount(articles) {
    let count = 0;
    for (const article of articles) {
        const matches = getMatchingTrackedTopics(article);
        if (matches.length > 0 && !isArticleSeen(article.id || article.link)) {
            count++;
        }
    }
    return count;
}

// ============================================
// ARTICLE IGNORE - localStorage-based
// ============================================

const IGNORED_TOPICS_KEY = 'woodmont_ignored_topics';

/**
 * Get all ignored topics from localStorage
 * @returns {Array<{keyword: string, addedAt: string}>}
 */
export function getIgnoredTopics() {
    try {
        const stored = localStorage.getItem(IGNORED_TOPICS_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Error reading ignored topics:', e);
        return [];
    }
}

/**
 * Add a topic/keyword to ignore
 * @param {string} keyword - The keyword or phrase to ignore
 */
export function addIgnoredTopic(keyword) {
    const topics = getIgnoredTopics();
    const normalizedKeyword = keyword.toLowerCase().trim();

    // Check if already ignoring this keyword
    if (topics.some(t => t.keyword.toLowerCase() === normalizedKeyword)) {
        return false; // Already ignoring
    }

    topics.push({
        keyword: keyword.trim(),
        addedAt: new Date().toISOString()
    });

    try {
        localStorage.setItem(IGNORED_TOPICS_KEY, JSON.stringify(topics));
        return true;
    } catch (e) {
        console.error('Error saving ignored topic:', e);
        return false;
    }
}

/**
 * Remove an ignored topic
 * @param {string} keyword - The keyword to stop ignoring
 */
export function removeIgnoredTopic(keyword) {
    const topics = getIgnoredTopics();
    const normalizedKeyword = keyword.toLowerCase().trim();
    const filtered = topics.filter(t => t.keyword.toLowerCase() !== normalizedKeyword);

    try {
        localStorage.setItem(IGNORED_TOPICS_KEY, JSON.stringify(filtered));
        return true;
    } catch (e) {
        console.error('Error removing ignored topic:', e);
        return false;
    }
}

/**
 * Check if an article matches any ignored topics
 * @param {Object} article - The article to check
 * @returns {boolean} - True if article should be hidden
 */
export function isArticleIgnored(article) {
    const topics = getIgnoredTopics();
    if (topics.length === 0) return false;

    const searchText = `${article.title || ''} ${article.description || ''} ${article.source || ''}`.toLowerCase();

    return topics.some(topic => searchText.includes(topic.keyword.toLowerCase()));
}

/**
 * Get list of ignored keywords that match an article
 * @param {Object} article - The article to check
 * @returns {Array<string>} - Array of matching ignored keywords
 */
export function getMatchingIgnoredTopics(article) {
    const topics = getIgnoredTopics();
    const matches = [];

    const searchText = `${article.title || ''} ${article.description || ''} ${article.source || ''}`.toLowerCase();

    for (const topic of topics) {
        if (searchText.includes(topic.keyword.toLowerCase())) {
            matches.push(topic.keyword);
        }
    }

    return matches;
}

export default {
    transformArticle,
    getUniqueSources,
    filterArticles,
    buildNewsletterHTML,
    getCategoryColors,
    formatDate,
    formatDateTime,
    // Tracking functions
    getTrackedTopics,
    addTrackedTopic,
    removeTrackedTopic,
    getMatchingTrackedTopics,
    extractTrackableKeywords,
    markArticleSeen,
    isArticleSeen,
    getNewMatchingArticlesCount,
    // Ignore functions
    getIgnoredTopics,
    addIgnoredTopic,
    removeIgnoredTopic,
    isArticleIgnored,
    getMatchingIgnoredTopics
};
