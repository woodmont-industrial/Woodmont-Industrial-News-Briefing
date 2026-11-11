/**
 * Woodmont Industrial News Feed - Shared Utilities
 * Pure JS functions for localStorage management, topic tracking, and image placeholders.
 * Server-backed preferences: per-user JSON files in docs/preferences/{userId}.json
 * Exposed as window.WoodmontUtils for use in Babel-compiled React components.
 */
(function() {
  'use strict';

  // Storage keys (legacy localStorage — used as fallback when server prefs not loaded)
  var TRACKED_TOPICS_KEY = 'woodmont_tracked_topics';
  var TRACKED_ARTICLES_KEY = 'woodmont_tracked_articles';
  var IGNORED_TOPICS_KEY = 'woodmont_ignored_topics';
  var IGNORED_ARTICLES_KEY = 'woodmont_ignored_articles';

  // === USER IDENTITY ===
  var USER_ID_KEY = 'woodmont_user_id';
  var PREFS_DIR = 'docs/preferences';

  function getUserId() {
    return localStorage.getItem(USER_ID_KEY) || '';
  }

  function setUserId(id) {
    localStorage.setItem(USER_ID_KEY, id.toLowerCase().trim());
  }

  // === SERVER PREFERENCES ===
  var _serverPrefs = null; // In-memory cache of current user's prefs
  var _saveTimer = null;

  function getServerPrefs() {
    return _serverPrefs;
  }

  async function loadServerPreferences(userId) {
    // Try fetching from GitHub Pages (fast, cached)
    try {
      var resp = await fetch('preferences/' + userId + '.json?t=' + Date.now());
      if (resp.ok) {
        _serverPrefs = await resp.json();
        // Ensure all expected fields exist
        _serverPrefs.ignoredArticles = _serverPrefs.ignoredArticles || [];
        _serverPrefs.ignoredTopics = _serverPrefs.ignoredTopics || [];
        _serverPrefs.trackedTopics = _serverPrefs.trackedTopics || [];
        _serverPrefs.rawPicks = _serverPrefs.rawPicks || {};
        _serverPrefs.theme = _serverPrefs.theme || 'light';
        localStorage.setItem('woodmont_server_prefs_cache', JSON.stringify(_serverPrefs));
        return _serverPrefs;
      }
    } catch (e) {
      console.warn('Could not fetch server prefs:', e);
    }

    // Fallback: localStorage cache (only if same user)
    try {
      var cached = localStorage.getItem('woodmont_server_prefs_cache');
      if (cached) {
        var parsed = JSON.parse(cached);
        if (parsed.userId === userId) {
          _serverPrefs = parsed;
          _serverPrefs.ignoredArticles = _serverPrefs.ignoredArticles || [];
          _serverPrefs.ignoredTopics = _serverPrefs.ignoredTopics || [];
          _serverPrefs.trackedTopics = _serverPrefs.trackedTopics || [];
          _serverPrefs.rawPicks = _serverPrefs.rawPicks || {};
          return _serverPrefs;
        }
      }
    } catch (e) {}

    // New user — initialize empty prefs
    _serverPrefs = {
      userId: userId,
      updatedAt: new Date().toISOString(),
      ignoredArticles: [],
      ignoredTopics: [],
      trackedTopics: [],
      theme: 'light',
      rawPicks: {}
    };
    return _serverPrefs;
  }

  async function saveServerPreferences() {
    var token = getGitHubToken();
    if (!token || !_serverPrefs) return { ok: false, reason: 'no_token' };

    var userId = _serverPrefs.userId;
    _serverPrefs.updatedAt = new Date().toISOString();
    var filePath = PREFS_DIR + '/' + userId + '.json';
    var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + filePath;
    var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

    // GET current file SHA (if exists)
    var sha = null;
    try {
      var getResp = await fetch(apiBase, { headers: headers });
      if (getResp.ok) {
        var fileData = await getResp.json();
        sha = fileData.sha;
      }
    } catch (e) {}

    // PUT updated file
    var body = {
      message: 'Update preferences: ' + userId,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(_serverPrefs, null, 2) + '\n')))
    };
    if (sha) body.sha = sha;

    try {
      var putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body)
      });
      // Update localStorage cache
      localStorage.setItem('woodmont_server_prefs_cache', JSON.stringify(_serverPrefs));
      return { ok: putResp.ok };
    } catch (e) {
      console.error('Error saving server preferences:', e);
      return { ok: false, reason: 'error' };
    }
  }

  function debouncedSave() {
    // Update localStorage cache immediately for consistency
    if (_serverPrefs) {
      localStorage.setItem('woodmont_server_prefs_cache', JSON.stringify(_serverPrefs));
    }
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function() {
      saveServerPreferences().then(function(result) {
        if (!result.ok && result.reason !== 'no_token') {
          console.warn('Server prefs save failed:', result.reason);
        }
      }).catch(function(e) {
        console.error('Server prefs save error:', e);
      });
    }, 2000);
  }

  // ============================================
  // PLACEHOLDER IMAGES
  // ============================================
  // Stock photos for articles without their own image. Pools are large enough
  // that a section of tiles rarely repeats; the grid also hands out distinct ones.
  function unsplash(id) { return 'https://images.unsplash.com/photo-' + id + '?w=600&h=400&fit=crop'; }
  var placeholders = {
    transactions: [
      '1449824913935-59a10b8d2000', '1480714378408-67cf0d13bc1b', '1486325212027-8081e485255e',
      '1486406146926-c627a92ad1ab', '1521791136064-7986c2920216', '1503387762-592deb58ef4e',
      '1454165804606-c3d57bc86b40', '1600880292203-757bb62b4baf', '1494412574643-ff11b0a5c1c3',
      '1578575437130-527eed3abbec', '1586528116311-ad8dd3c8310d', '1553413077-190dd305871c',
      '1601584115197-04ecc0da31d7', '1545324418-cc1a3fa10c00'
    ].map(unsplash),
    availabilities: [
      '1497366216548-37526070297c', '1497366811353-6870744d04b2', '1565610222536-ef125c59da2e',
      '1553413077-190dd305871c', '1586528116311-ad8dd3c8310d', '1587293852726-70cdb56c2866',
      '1565891741441-64926e441838', '1497215728101-856f4ea42174', '1524758631624-e2822e304c36',
      '1541888946425-d81bb19240f5', '1504307651254-35680f356dfd', '1545324418-cc1a3fa10c00'
    ].map(unsplash),
    people: [
      '1560250097-0b93528c311a', '1573496359142-b8d87734a5a2', '1519085360753-af0119f7cbe7',
      '1472099645785-5658abf4ff4e', '1438761681033-6461ffad8d80', '1500648767791-00dcc994a43e',
      '1507679799987-c73779587ccf', '1494790108377-be9c29b29330'
    ].map(unsplash),
    relevant: [
      '1494412574643-ff11b0a5c1c3', '1578575437130-527eed3abbec', '1601584115197-04ecc0da31d7',
      '1519003722824-194d4455a60c', '1553413077-190dd305871c', '1586528116311-ad8dd3c8310d',
      '1587293852726-70cdb56c2866', '1513828583688-c52646db42da', '1516937941344-00b4e0337589',
      '1581091226825-a6a2a5aee158', '1504307651254-35680f356dfd', '1541888946425-d81bb19240f5',
      '1565891741441-64926e441838', '1566576721346-d4a3b4eaeb55', '1449824913935-59a10b8d2000',
      '1486406146926-c627a92ad1ab'
    ].map(unsplash)
  };

  // `used` (optional Set) makes the pick skip images already shown nearby
  function getPlaceholderImage(category, title, used) {
    title = title || '';
    var categoryImages = placeholders[category] || placeholders.relevant;
    var hash = 2166136261;
    for (var i = 0; i < title.length; i++) { hash ^= title.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    var start = (hash >>> 0) % categoryImages.length;
    for (var k = 0; used && k < categoryImages.length; k++) {
      var candidate = categoryImages[(start + k) % categoryImages.length];
      if (!used.has(candidate)) { used.add(candidate); return candidate; }
    }
    return categoryImages[start];
  }

  // ============================================
  // TRACKED TOPICS
  // ============================================
  function getTrackedTopics() {
    if (_serverPrefs) return _serverPrefs.trackedTopics || [];
    try {
      var stored = localStorage.getItem(TRACKED_TOPICS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
  }

  function addTrackedTopic(keyword, articleTitle) {
    articleTitle = articleTitle || '';
    var normalizedKeyword = keyword.toLowerCase().trim();

    if (_serverPrefs) {
      if (!_serverPrefs.trackedTopics) _serverPrefs.trackedTopics = [];
      if (_serverPrefs.trackedTopics.some(function(t) { return t.keyword.toLowerCase() === normalizedKeyword; })) return false;
      _serverPrefs.trackedTopics.push({ keyword: keyword.trim(), addedAt: new Date().toISOString(), articleTitle: articleTitle });
      debouncedSave();
      return true;
    }

    var topics = getTrackedTopics();
    if (topics.some(function(t) { return t.keyword.toLowerCase() === normalizedKeyword; })) return false;
    topics.push({ keyword: keyword.trim(), addedAt: new Date().toISOString(), articleTitle: articleTitle });
    try {
      localStorage.setItem(TRACKED_TOPICS_KEY, JSON.stringify(topics));
      return true;
    } catch (e) { return false; }
  }

  function removeTrackedTopic(keyword) {
    if (_serverPrefs) {
      if (!_serverPrefs.trackedTopics) _serverPrefs.trackedTopics = [];
      _serverPrefs.trackedTopics = _serverPrefs.trackedTopics.filter(function(t) { return t.keyword.toLowerCase() !== keyword.toLowerCase().trim(); });
      debouncedSave();
      return true;
    }

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
    if (_serverPrefs) return _serverPrefs.ignoredTopics || [];
    try {
      var stored = localStorage.getItem(IGNORED_TOPICS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
  }

  function getIgnoredArticles() {
    if (_serverPrefs) return _serverPrefs.ignoredArticles || [];
    try {
      var stored = localStorage.getItem(IGNORED_ARTICLES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) { return []; }
  }

  function addIgnoredTopic(keyword) {
    var normalizedKeyword = keyword.toLowerCase().trim();

    if (_serverPrefs) {
      if (!_serverPrefs.ignoredTopics) _serverPrefs.ignoredTopics = [];
      if (_serverPrefs.ignoredTopics.some(function(t) { return t.keyword.toLowerCase() === normalizedKeyword; })) return false;
      _serverPrefs.ignoredTopics.push({ keyword: keyword.trim(), addedAt: new Date().toISOString() });
      debouncedSave();
      return true;
    }

    var topics = getIgnoredTopics();
    if (topics.some(function(t) { return t.keyword.toLowerCase() === normalizedKeyword; })) return false;
    topics.push({ keyword: keyword.trim(), addedAt: new Date().toISOString() });
    try {
      localStorage.setItem(IGNORED_TOPICS_KEY, JSON.stringify(topics));
      return true;
    } catch (e) { return false; }
  }

  function addIgnoredArticle(article, reason) {
    reason = reason || 'Not relevant';
    var articleId = article.id || article.link || article.title;

    if (_serverPrefs) {
      if (!_serverPrefs.ignoredArticles) _serverPrefs.ignoredArticles = [];
      if (_serverPrefs.ignoredArticles.some(function(a) { return a.id === articleId; })) return false;
      _serverPrefs.ignoredArticles.push({
        id: articleId,
        title: article.title,
        source: article.source,
        reason: reason,
        addedAt: new Date().toISOString()
      });
      debouncedSave();
      return true;
    }

    var ignored = getIgnoredArticles();
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
    if (_serverPrefs) {
      if (!_serverPrefs.ignoredTopics) _serverPrefs.ignoredTopics = [];
      _serverPrefs.ignoredTopics = _serverPrefs.ignoredTopics.filter(function(t) { return t.keyword.toLowerCase() !== keyword.toLowerCase().trim(); });
      debouncedSave();
      return true;
    }

    var topics = getIgnoredTopics();
    var filtered = topics.filter(function(t) { return t.keyword.toLowerCase() !== keyword.toLowerCase().trim(); });
    try {
      localStorage.setItem(IGNORED_TOPICS_KEY, JSON.stringify(filtered));
      return true;
    } catch (e) { return false; }
  }

  function removeIgnoredArticle(articleId) {
    if (_serverPrefs) {
      if (!_serverPrefs.ignoredArticles) _serverPrefs.ignoredArticles = [];
      _serverPrefs.ignoredArticles = _serverPrefs.ignoredArticles.filter(function(a) { return a.id !== articleId; });
      debouncedSave();
      return true;
    }

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
  // RAW PICKS — server-backed per-user picks
  // ============================================
  function getRawPicks() {
    if (_serverPrefs) return _serverPrefs.rawPicks || {};
    try { return JSON.parse(localStorage.getItem('woodmont_raw_picks') || '{}'); } catch (e) { return {}; }
  }

  function setRawPick(id, pickData) {
    if (_serverPrefs) {
      if (!_serverPrefs.rawPicks) _serverPrefs.rawPicks = {};
      _serverPrefs.rawPicks[id] = pickData;
      debouncedSave();
      return;
    }
    try {
      var picks = JSON.parse(localStorage.getItem('woodmont_raw_picks') || '{}');
      picks[id] = pickData;
      localStorage.setItem('woodmont_raw_picks', JSON.stringify(picks));
    } catch (e) {}
  }

  function removeRawPick(id) {
    if (_serverPrefs) {
      if (_serverPrefs.rawPicks) delete _serverPrefs.rawPicks[id];
      debouncedSave();
      return;
    }
    try {
      var picks = JSON.parse(localStorage.getItem('woodmont_raw_picks') || '{}');
      delete picks[id];
      localStorage.setItem('woodmont_raw_picks', JSON.stringify(picks));
    } catch (e) {}
  }

  function clearRawPicks() {
    if (_serverPrefs) {
      _serverPrefs.rawPicks = {};
      debouncedSave();
      return;
    }
    localStorage.removeItem('woodmont_raw_picks');
  }

  function setAllRawPicks(picksObj) {
    if (_serverPrefs) {
      _serverPrefs.rawPicks = picksObj;
      debouncedSave();
      return;
    }
    localStorage.setItem('woodmont_raw_picks', JSON.stringify(picksObj));
  }

  // ============================================
  // CLEAR ALL IGNORED (for "Clear all" button)
  // ============================================
  async function clearAllIgnored() {
    if (_serverPrefs) {
      _serverPrefs.ignoredArticles = [];
      _serverPrefs.ignoredTopics = [];
      return saveServerPreferences();
    }
    localStorage.removeItem(IGNORED_ARTICLES_KEY);
    localStorage.removeItem(IGNORED_TOPICS_KEY);
    return { ok: true };
  }

  // ============================================
  // MIGRATION — import localStorage to server prefs
  // ============================================
  async function migrateAndClearLocalStorage() {
    if (!_serverPrefs) return false;

    // 1. Read old localStorage data
    var oldTracked = [];
    var oldIgnoredTopics = [];
    var oldIgnoredArticles = [];
    var oldRawPicks = {};
    try { oldTracked = JSON.parse(localStorage.getItem(TRACKED_TOPICS_KEY) || '[]'); } catch(e) {}
    try { oldIgnoredTopics = JSON.parse(localStorage.getItem(IGNORED_TOPICS_KEY) || '[]'); } catch(e) {}
    try { oldIgnoredArticles = JSON.parse(localStorage.getItem(IGNORED_ARTICLES_KEY) || '[]'); } catch(e) {}
    try { oldRawPicks = JSON.parse(localStorage.getItem('woodmont_raw_picks') || '{}'); } catch(e) {}

    // 2. Merge into server prefs (avoid duplicates)
    var existingTracked = {};
    (_serverPrefs.trackedTopics || []).forEach(function(t) { existingTracked[t.keyword.toLowerCase()] = true; });
    oldTracked.forEach(function(t) {
      if (!existingTracked[t.keyword.toLowerCase()]) {
        _serverPrefs.trackedTopics.push(t);
      }
    });

    var existingIgnoredTopics = {};
    (_serverPrefs.ignoredTopics || []).forEach(function(t) { existingIgnoredTopics[t.keyword.toLowerCase()] = true; });
    oldIgnoredTopics.forEach(function(t) {
      if (!existingIgnoredTopics[t.keyword.toLowerCase()]) {
        _serverPrefs.ignoredTopics.push(t);
      }
    });

    var existingIgnoredArticles = {};
    (_serverPrefs.ignoredArticles || []).forEach(function(a) { existingIgnoredArticles[a.id] = true; });
    oldIgnoredArticles.forEach(function(a) {
      if (!existingIgnoredArticles[a.id]) {
        _serverPrefs.ignoredArticles.push(a);
      }
    });

    Object.keys(oldRawPicks).forEach(function(id) {
      if (!_serverPrefs.rawPicks[id]) {
        _serverPrefs.rawPicks[id] = oldRawPicks[id];
      }
    });

    // 3. Save to server
    var result = await saveServerPreferences();

    if (result.ok) {
      // 4. Clear old localStorage keys
      localStorage.removeItem(TRACKED_TOPICS_KEY);
      localStorage.removeItem(IGNORED_TOPICS_KEY);
      localStorage.removeItem(IGNORED_ARTICLES_KEY);
      localStorage.removeItem('woodmont_raw_picks');

      // 5. Set migration flag
      localStorage.setItem('woodmont_prefs_migrated', 'true');
    }

    return result.ok;
  }

  // ============================================
  // GITHUB SYNC — persist ignores to excluded-articles.json
  // ============================================
  var GITHUB_REPO = 'woodmont-industrial/Woodmont-Industrial-News-Briefing';
  var EXCLUDE_FILE_PATH = 'docs/excluded-articles.json';

  // Session-only in-memory token storage (clears on reload/tab close).
  // We deliberately do NOT persist the GitHub PAT in localStorage anymore —
  // a stored write-scoped token combined with any XSS bug would let an
  // attacker exfiltrate the token and modify the repo. See SECURITY notes.
  var _sessionGitHubToken = '';

  // Migration: wipe any token left over from the old persistent-storage
  // implementation. Without this, users upgrading from a previous version
  // would still have their PAT sitting in localStorage forever, defeating
  // the purpose of the switch. Runs once at module load.
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('woodmont_github_token');
    }
  } catch (_) { /* localStorage unavailable (e.g., private mode) */ }

  function getGitHubToken() {
    return _sessionGitHubToken || '';
  }

  function setGitHubToken(token) {
    _sessionGitHubToken = (token || '').trim();
    return _sessionGitHubToken;
  }

  async function syncExcludeToGitHub(articleId, articleUrl, articleTitle) {
    var token = getGitHubToken();
    if (!token) return { ok: false, reason: 'no_token' };

    // Retry up to 3 times on SHA mismatch (409 conflict)
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + EXCLUDE_FILE_PATH;
        var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

        // GET current file (fresh SHA each attempt)
        var getResp = await fetch(apiBase, { headers: headers });
        if (!getResp.ok) return { ok: false, reason: 'fetch_failed (' + getResp.status + ')' };
        var fileData = await getResp.json();
        var content = JSON.parse(atob(fileData.content));

        // Check if already excluded
        var ids = content.excludedIds || [];
        var urls = content.excludedUrls || [];
        var alreadyExcluded = ids.indexOf(articleId) !== -1;
        if (alreadyExcluded) return { ok: true, reason: 'already_excluded' };

        // Add article (ID, URL, and normalized title for cross-source matching)
        ids.push(articleId);
        if (articleUrl && urls.indexOf(articleUrl) === -1) urls.push(articleUrl);
        var titles = content.excludedTitles || [];
        if (articleTitle) {
          var normTitle = articleTitle.toLowerCase()
            .replace(/\s*[-\u2013\u2014|]\s*(costar|globest|msn|yahoo|bisnow|commercialsearch|rebusinessonline|connect cre|the business journals|commercial observer|supply chain dive|freightwaves|real estate nj|wsj|loopnet).*$/i, '')
            .replace(/^news\s*\|\s*/i, '')
            .replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
          if (normTitle && titles.indexOf(normTitle) === -1) titles.push(normTitle);
        }
        content.excludedIds = ids;
        content.excludedUrls = urls;
        content.excludedTitles = titles;

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

        if (putResp.ok) return { ok: true, reason: 'synced' };

        // SHA mismatch (409) — retry with fresh SHA
        if (putResp.status === 409 && attempt < 2) {
          console.warn('SHA conflict on exclude, retrying (attempt ' + (attempt + 2) + '/3)...');
          await new Promise(function(r) { setTimeout(r, 1000); });
          continue;
        }

        var errBody = await putResp.text().catch(function() { return ''; });
        return { ok: false, reason: 'put_failed (' + putResp.status + '): ' + errBody.substring(0, 100) };
      } catch (e) {
        console.error('GitHub sync error:', e);
        return { ok: false, reason: 'error: ' + (e.message || '').substring(0, 80) };
      }
    }
    return { ok: false, reason: 'max_retries_exceeded' };
  }

  var FEEDBACK_FILE_PATH = 'docs/newsletter-feedback.json';

  /**
   * Sync article feedback (approve/reject) to GitHub.
   * Creates or appends to docs/newsletter-feedback.json.
   * feedbackEntry should be: { articleId, title, normalizedTitle, action, reason, section, source, date, user }
   */
  async function syncFeedbackToGitHub(feedbackEntry) {
    var token = getGitHubToken();
    if (!token) return { ok: false, reason: 'no_token' };

    // Retry up to 3 times on SHA mismatch (409 conflict)
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var apiBase = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + FEEDBACK_FILE_PATH;
        var headers = { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github.v3+json' };

        // GET current file
        var sha = null;
        var content = { feedback: [] };
        var getResp = await fetch(apiBase, { headers: headers });
        if (getResp.ok) {
          var fileData = await getResp.json();
          sha = fileData.sha;
          try {
            content = JSON.parse(atob(fileData.content));
            if (!Array.isArray(content.feedback)) content.feedback = [];
          } catch (parseErr) {
            content = { feedback: [] };
          }
        } else if (getResp.status !== 404) {
          return { ok: false, reason: 'fetch_failed (' + getResp.status + ')' };
        }

        // Append the feedback entry with timestamp
        feedbackEntry.timestamp = new Date().toISOString();
        content.feedback.push(feedbackEntry);

        // PUT updated file
        var body = {
          message: 'Feedback: ' + feedbackEntry.action + ' - ' + (feedbackEntry.title || '').substring(0, 50),
          content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2) + '\n')))
        };
        if (sha) body.sha = sha;

        var putResp = await fetch(apiBase, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify(body)
        });

        if (putResp.ok) return { ok: true, reason: 'synced' };

        // SHA mismatch (409) — retry with fresh SHA
        if (putResp.status === 409 && attempt < 2) {
          console.warn('SHA conflict on feedback, retrying (attempt ' + (attempt + 2) + '/3)...');
          await new Promise(function(r) { setTimeout(r, 1000); });
          continue;
        }

        var errBody = await putResp.text().catch(function() { return ''; });
        return { ok: false, reason: 'put_failed (' + putResp.status + '): ' + errBody.substring(0, 100) };
      } catch (e) {
        console.error('Feedback sync error:', e);
        return { ok: false, reason: 'error: ' + (e.message || '').substring(0, 80) };
      }
    }
    return { ok: false, reason: 'max_retries_exceeded' };
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
    getGitHubToken: getGitHubToken,
    setGitHubToken: setGitHubToken,
    syncExcludeToGitHub: syncExcludeToGitHub,
    syncFeedbackToGitHub: syncFeedbackToGitHub,
    removeExcludeFromGitHub: removeExcludeFromGitHub,
    syncIncludeToGitHub: syncIncludeToGitHub,
    removeIncludeFromGitHub: removeIncludeFromGitHub,
    clearIncludesOnGitHub: clearIncludesOnGitHub,
    syncMultipleIncludesToGitHub: syncMultipleIncludesToGitHub,
    // Server preferences
    getUserId: getUserId,
    setUserId: setUserId,
    getServerPrefs: getServerPrefs,
    loadServerPreferences: loadServerPreferences,
    saveServerPreferences: saveServerPreferences,
    getRawPicks: getRawPicks,
    setRawPick: setRawPick,
    removeRawPick: removeRawPick,
    clearRawPicks: clearRawPicks,
    setAllRawPicks: setAllRawPicks,
    clearAllIgnored: clearAllIgnored,
    migrateAndClearLocalStorage: migrateAndClearLocalStorage
  };
})();
