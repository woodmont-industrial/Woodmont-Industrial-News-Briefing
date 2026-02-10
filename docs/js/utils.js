/**
 * Woodmont Industrial News Feed - Shared Utilities
 * Pure JS functions for localStorage management, topic tracking, and image placeholders.
 * Exposed as window.WoodmontUtils for use in Babel-compiled React components.
 */
(function() {
  'use strict';

  // Storage keys
  var TRACKED_TOPICS_KEY = 'woodmont_tracked_topics';
  var TRACKED_ARTICLES_KEY = 'woodmont_tracked_articles';
  var IGNORED_TOPICS_KEY = 'woodmont_ignored_topics';
  var IGNORED_ARTICLES_KEY = 'woodmont_ignored_articles';

  // ============================================
  // PLACEHOLDER IMAGES
  // ============================================
  var placeholders = {
    transactions: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&h=400&fit=crop',
    ],
    availabilities: [
      'https://images.unsplash.com/photo-1565610222536-ef125c59da2e?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&h=400&fit=crop',
    ],
    people: [
      'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=400&fit=crop',
    ],
    relevant: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=400&fit=crop',
      'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=600&h=400&fit=crop',
    ]
  };

  function getPlaceholderImage(category, title) {
    title = title || '';
    var categoryImages = placeholders[category] || placeholders.relevant;
    var hash = title.split('').reduce(function(acc, char) { return acc + char.charCodeAt(0); }, 0);
    return categoryImages[hash % categoryImages.length];
  }

  // ============================================
  // TRACKED TOPICS
  // ============================================
  function getTrackedTopics() {
    try {
      var stored = localStorage.getItem(TRACKED_TOPICS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
  }

  function addTrackedTopic(keyword, articleTitle) {
    articleTitle = articleTitle || '';
    var topics = getTrackedTopics();
    var normalizedKeyword = keyword.toLowerCase().trim();
    if (topics.some(function(t) { return t.keyword.toLowerCase() === normalizedKeyword; })) return false;
    topics.push({ keyword: keyword.trim(), addedAt: new Date().toISOString(), articleTitle: articleTitle });
    try {
      localStorage.setItem(TRACKED_TOPICS_KEY, JSON.stringify(topics));
      return true;
    } catch (e) { return false; }
  }

  function removeTrackedTopic(keyword) {
    var topics = getTrackedTopics();
    var filtered = topics.filter(function(t) { return t.keyword.toLowerCase() !== keyword.toLowerCase().trim(); });
    try {
      localStorage.setItem(TRACKED_TOPICS_KEY, JSON.stringify(filtered));
      return true;
    } catch (e) { return false; }
  }

  function getMatchingTrackedTopics(article) {
    var topics = getTrackedTopics();
    var matches = [];
    var searchText = ((article.title || '') + ' ' + (article.description || '') + ' ' + (article.source || '')).toLowerCase();
    for (var i = 0; i < topics.length; i++) {
      if (searchText.includes(topics[i].keyword.toLowerCase())) {
        matches.push(topics[i].keyword);
      }
    }
    return matches;
  }

  function extractTrackableKeywords(article) {
    var keywords = [];
    var title = article.title || '';
    var companyMatches = title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g) || [];
    keywords.push.apply(keywords, companyMatches.slice(0, 3));
    var locationMatches = title.match(/(New\s+Jersey|New\s+York|South\s+Florida|Pennsylvania|Miami-Dade|Broward|Philadelphia|Newark|Fort\s+Lauderdale|Miami)/gi) || [];
    keywords.push.apply(keywords, locationMatches.slice(0, 2));
    var unique = [];
    var seen = {};
    for (var i = 0; i < keywords.length; i++) {
      var k = keywords[i].trim();
      var lower = k.toLowerCase();
      if (!seen[lower] && k.length > 2 && k.length < 50) {
        seen[lower] = true;
        unique.push(k);
      }
    }
    return unique;
  }

  // ============================================
  // IGNORED TOPICS & ARTICLES
  // ============================================
  function getIgnoredTopics() {
    try {
      var stored = localStorage.getItem(IGNORED_TOPICS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
  }

  function getIgnoredArticles() {
    try {
      var stored = localStorage.getItem(IGNORED_ARTICLES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
  }

  function addIgnoredTopic(keyword) {
    var topics = getIgnoredTopics();
    var normalizedKeyword = keyword.toLowerCase().trim();
    if (topics.some(function(t) { return t.keyword.toLowerCase() === normalizedKeyword; })) return false;
    topics.push({ keyword: keyword.trim(), addedAt: new Date().toISOString() });
    try {
      localStorage.setItem(IGNORED_TOPICS_KEY, JSON.stringify(topics));
      return true;
    } catch (e) { return false; }
  }

  function addIgnoredArticle(article, reason) {
    reason = reason || 'Not relevant';
    var ignored = getIgnoredArticles();
    var articleId = article.id || article.link || article.title;
    if (ignored.some(function(a) { return a.id === articleId; })) return false;
    ignored.push({
      id: articleId,
      title: article.title,
      source: article.source,
      reason: reason,
      addedAt: new Date().toISOString()
    });
    try {
      localStorage.setItem(IGNORED_ARTICLES_KEY, JSON.stringify(ignored));
      return true;
    } catch (e) { return false; }
  }

  function removeIgnoredTopic(keyword) {
    var topics = getIgnoredTopics();
    var filtered = topics.filter(function(t) { return t.keyword.toLowerCase() !== keyword.toLowerCase().trim(); });
    try {
      localStorage.setItem(IGNORED_TOPICS_KEY, JSON.stringify(filtered));
      return true;
    } catch (e) { return false; }
  }

  function removeIgnoredArticle(articleId) {
    var ignored = getIgnoredArticles();
    var filtered = ignored.filter(function(a) { return a.id !== articleId; });
    try {
      localStorage.setItem(IGNORED_ARTICLES_KEY, JSON.stringify(filtered));
      return true;
    } catch (e) { return false; }
  }

  function isArticleIgnored(article) {
    var ignoredArticles = getIgnoredArticles();
    var articleId = article.id || article.link || article.title;
    if (ignoredArticles.some(function(a) { return a.id === articleId; })) return true;
    var topics = getIgnoredTopics();
    if (topics.length === 0) return false;
    var searchText = ((article.title || '') + ' ' + (article.description || '') + ' ' + (article.source || '')).toLowerCase();
    return topics.some(function(t) { return searchText.includes(t.keyword.toLowerCase()); });
  }

  // Expose as global
  window.WoodmontUtils = {
    TRACKED_TOPICS_KEY: TRACKED_TOPICS_KEY,
    TRACKED_ARTICLES_KEY: TRACKED_ARTICLES_KEY,
    IGNORED_TOPICS_KEY: IGNORED_TOPICS_KEY,
    IGNORED_ARTICLES_KEY: IGNORED_ARTICLES_KEY,
    getPlaceholderImage: getPlaceholderImage,
    getTrackedTopics: getTrackedTopics,
    addTrackedTopic: addTrackedTopic,
    removeTrackedTopic: removeTrackedTopic,
    getMatchingTrackedTopics: getMatchingTrackedTopics,
    extractTrackableKeywords: extractTrackableKeywords,
    getIgnoredTopics: getIgnoredTopics,
    getIgnoredArticles: getIgnoredArticles,
    addIgnoredTopic: addIgnoredTopic,
    addIgnoredArticle: addIgnoredArticle,
    removeIgnoredTopic: removeIgnoredTopic,
    removeIgnoredArticle: removeIgnoredArticle,
    isArticleIgnored: isArticleIgnored
  };
})();
