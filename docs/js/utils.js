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

  // ============================================
  // GITHUB SYNC — persist ignores to excluded-articles.json
  // ============================================
  var GITHUB_TOKEN_KEY = 'woodmont_github_token';
  var GITHUB_REPO = 'woodmont-industrial/Woodmont-Industrial-News-Briefing';
  var EXCLUDE_FILE_PATH = 'docs/excluded-articles.json';

  function getGitHubToken() {
    return localStorage.getItem(GITHUB_TOKEN_KEY) || '';
  }

  function setGitHubToken(token) {
    if (token) {
      localStorage.setItem(GITHUB_TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(GITHUB_TOKEN_KEY);
    }
  }

  async function syncExcludeToGitHub(articleId, articleUrl, articleTitle) {
    var token = getGitHubToken();
    if (!token) return { ok: false, reason: 'no_token' };

    try {
      var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + EXCLUDE_FILE_PATH;
      var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

      // GET current file
      var getResp = await fetch(apiBase, { headers: headers });
      if (!getResp.ok) return { ok: false, reason: 'fetch_failed' };
      var fileData = await getResp.json();
      var content = JSON.parse(atob(fileData.content));

      // Check if already excluded
      var ids = content.excludedIds || [];
      var urls = content.excludedUrls || [];
      var alreadyExcluded = ids.indexOf(articleId) !== -1;
      if (alreadyExcluded) return { ok: true, reason: 'already_excluded' };

      // Add article
      ids.push(articleId);
      if (articleUrl && urls.indexOf(articleUrl) === -1) urls.push(articleUrl);
      content.excludedIds = ids;
      content.excludedUrls = urls;

      // PUT updated file
      var putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({
          message: 'Exclude: ' + (articleTitle || '').substring(0, 60),
          content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n'))),
          sha: fileData.sha
        })
      });
      return { ok: putResp.ok, reason: putResp.ok ? 'synced' : 'put_failed' };
    } catch (e) {
      console.error('GitHub sync error:', e);
      return { ok: false, reason: 'error' };
    }
  }

  var INCLUDE_FILE_PATH = 'docs/included-articles.json';

  /**
   * Map abbreviated raw-feed fields to full names for server consumption.
   */
  function mapPickToArticle(pickData) {
    return {
      title: pickData.t || '',
      url: pickData.u || '',
      source: pickData.s || '',
      date_published: pickData.d || '',
      description: pickData.ex || '',
      category: pickData.c || 'relevant',
      region: pickData.r || '',
      keywords: pickData.kw || []
    };
  }

  async function syncIncludeToGitHub(articleId, pickData) {
    var token = getGitHubToken();
    if (!token) return { ok: false, reason: 'no_token' };

    try {
      var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + INCLUDE_FILE_PATH;
      var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

      var getResp = await fetch(apiBase, { headers: headers });
      if (!getResp.ok) return { ok: false, reason: 'fetch_failed' };
      var fileData = await getResp.json();
      var content = JSON.parse(atob(fileData.content));

      var articles = content.articles || [];
      if (articles.some(function(a) { return a.id === articleId; })) return { ok: true, reason: 'already_included' };

      var mapped = mapPickToArticle(pickData);
      mapped.id = articleId;
      articles.push(mapped);
      content.articles = articles;

      var putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({
          message: 'Include: ' + (pickData.t || '').substring(0, 60),
          content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n'))),
          sha: fileData.sha
        })
      });
      return { ok: putResp.ok, reason: putResp.ok ? 'synced' : 'put_failed' };
    } catch (e) {
      console.error('GitHub include sync error:', e);
      return { ok: false, reason: 'error' };
    }
  }

  async function removeIncludeFromGitHub(articleId) {
    var token = getGitHubToken();
    if (!token) return { ok: false, reason: 'no_token' };

    try {
      var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + INCLUDE_FILE_PATH;
      var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

      var getResp = await fetch(apiBase, { headers: headers });
      if (!getResp.ok) return { ok: false, reason: 'fetch_failed' };
      var fileData = await getResp.json();
      var content = JSON.parse(atob(fileData.content));

      var articles = content.articles || [];
      var idx = articles.findIndex(function(a) { return a.id === articleId; });
      if (idx === -1) return { ok: true, reason: 'not_found' };

      articles.splice(idx, 1);
      content.articles = articles;

      var putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({
          message: 'Remove include: ' + articleId.substring(0, 12),
          content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n'))),
          sha: fileData.sha
        })
      });
      return { ok: putResp.ok };
    } catch (e) {
      console.error('GitHub include sync error:', e);
      return { ok: false, reason: 'error' };
    }
  }

  async function clearIncludesOnGitHub() {
    var token = getGitHubToken();
    if (!token) return { ok: false, reason: 'no_token' };

    try {
      var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + INCLUDE_FILE_PATH;
      var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

      var getResp = await fetch(apiBase, { headers: headers });
      if (!getResp.ok) return { ok: false, reason: 'fetch_failed' };
      var fileData = await getResp.json();

      var content = { _comment: 'Articles manually picked from raw feed for newsletter inclusion.', articles: [] };

      var putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({
          message: 'Clear included articles',
          content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n'))),
          sha: fileData.sha
        })
      });
      return { ok: putResp.ok };
    } catch (e) {
      console.error('GitHub include sync error:', e);
      return { ok: false, reason: 'error' };
    }
  }

  async function syncMultipleIncludesToGitHub(picksMap) {
    var token = getGitHubToken();
    if (!token) return { ok: false, reason: 'no_token' };

    try {
      var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + INCLUDE_FILE_PATH;
      var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

      var getResp = await fetch(apiBase, { headers: headers });
      if (!getResp.ok) return { ok: false, reason: 'fetch_failed' };
      var fileData = await getResp.json();
      var content = JSON.parse(atob(fileData.content));

      var articles = content.articles || [];
      var existingIds = new Set(articles.map(function(a) { return a.id; }));
      var added = 0;

      Object.keys(picksMap).forEach(function(id) {
        if (existingIds.has(id)) return;
        var mapped = mapPickToArticle(picksMap[id]);
        mapped.id = id;
        articles.push(mapped);
        added++;
      });

      if (added === 0) return { ok: true, reason: 'all_already_included' };

      content.articles = articles;

      var putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({
          message: 'Include ' + added + ' article(s) from raw picks',
          content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n'))),
          sha: fileData.sha
        })
      });
      return { ok: putResp.ok, reason: putResp.ok ? 'synced' : 'put_failed', added: added };
    } catch (e) {
      console.error('GitHub include sync error:', e);
      return { ok: false, reason: 'error' };
    }
  }

  async function removeExcludeFromGitHub(articleId) {
    var token = getGitHubToken();
    if (!token) return { ok: false, reason: 'no_token' };

    try {
      var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + EXCLUDE_FILE_PATH;
      var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

      var getResp = await fetch(apiBase, { headers: headers });
      if (!getResp.ok) return { ok: false, reason: 'fetch_failed' };
      var fileData = await getResp.json();
      var content = JSON.parse(atob(fileData.content));

      var ids = content.excludedIds || [];
      var idx = ids.indexOf(articleId);
      if (idx === -1) return { ok: true, reason: 'not_found' };

      ids.splice(idx, 1);
      content.excludedIds = ids;

      var putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({
          message: 'Un-exclude article ' + articleId.substring(0, 12),
          content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n'))),
          sha: fileData.sha
        })
      });
      return { ok: putResp.ok };
    } catch (e) {
      console.error('GitHub sync error:', e);
      return { ok: false, reason: 'error' };
    }
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
    isArticleIgnored: isArticleIgnored,
    GITHUB_TOKEN_KEY: GITHUB_TOKEN_KEY,
    getGitHubToken: getGitHubToken,
    setGitHubToken: setGitHubToken,
    syncExcludeToGitHub: syncExcludeToGitHub,
    removeExcludeFromGitHub: removeExcludeFromGitHub,
    syncIncludeToGitHub: syncIncludeToGitHub,
    removeIncludeFromGitHub: removeIncludeFromGitHub,
    clearIncludesOnGitHub: clearIncludesOnGitHub,
    syncMultipleIncludesToGitHub: syncMultipleIncludesToGitHub
  };
})();
