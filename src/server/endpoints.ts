import * as fs from 'fs';
import * as path from 'path';
import { IncomingMessage, ServerResponse } from 'http';
import { itemStore, feedStats, manualArticles, saveArticlesToFile } from '../store/storage.js';
import { buildBriefing, createBriefingEmailPayload } from './newsletter.js';
import { sendEmail } from './email.js';

// Security Configuration
const API_KEY = process.env.API_KEY || "";
const REQUIRE_API_KEY = process.env.REQUIRE_API_KEY === "true"; // Set to true in production
const windowDefaultHours = 2160; // default articles window if not specified (90 days)
const FRONTEND_FILE = path.join(process.cwd(), "frontend", "index.html");

// CORS Configuration - Restrict to allowed origins in production
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);
const CORS_ALLOW_ALL = process.env.CORS_ALLOW_ALL === "true"; // Only for development

// Rate limiting configuration
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || "100", 10);

// Input validation constants
const MAX_LIMIT = 1000; // Maximum articles per request
const MIN_LIMIT = 1;
const MAX_DAYS = 365; // Maximum newsletter lookback

function getClientIP(req: IncomingMessage): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

function checkRateLimit(clientIP: string): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(clientIP);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }

    if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }

    record.count++;
    return true;
}

function validateApiKey(req: IncomingMessage): boolean {
    if (!REQUIRE_API_KEY || !API_KEY) return true;
    const providedKey = req.headers["x-api-key"];
    return providedKey === API_KEY;
}

function validateLimit(value: string | null, defaultVal: number = 200): number {
    if (!value) return defaultVal;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return defaultVal;
    return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, parsed));
}

function validateDays(value: string | null, defaultVal: number = 1): number {
    if (!value) return defaultVal;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 1) return defaultVal;
    return Math.min(MAX_DAYS, parsed);
}

function validateDateParam(value: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || "/";
    const urlObj = new URL(url, `http://localhost:8080`);
    const method = req.method || 'GET';
    const clientIP = getClientIP(req);

    console.log(`🌐 Incoming request: ${method} ${urlObj.pathname}${urlObj.search} from ${clientIP}`);

    // Rate limiting check
    if (!checkRateLimit(clientIP)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Too many requests. Please try again later." }));
        return;
    }

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Set CORS headers - restricted in production
    const origin = req.headers.origin || '';
    if (CORS_ALLOW_ALL) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    } else if (ALLOWED_ORIGINS.length === 0) {
        // No origins configured - allow same-origin only (no header set)
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API Key validation for protected endpoints
    const protectedEndpoints = ['/api/manual', '/api/approve-article', '/api/blacklist-article', '/api/send-newsletter'];
    if (protectedEndpoints.some(ep => urlObj.pathname === ep)) {
        if (!validateApiKey(req)) {
            console.warn(`⚠️ Unauthorized access attempt to ${urlObj.pathname} from ${clientIP}`);
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized. Valid API key required." }));
            return;
        }
    }

    try {
        // API endpoints
        if (urlObj.pathname === "/api/articles") {
            await handleArticlesEndpoint(req, res, urlObj);
        } else if (urlObj.pathname === "/api/brief") {
            await handleBriefEndpoint(req, res, urlObj);
        } else if (urlObj.pathname === "/api/newsletter") {
            await handleNewsletterEndpoint(req, res, urlObj);
        } else if (urlObj.pathname === "/api/refresh") {
            await handleRefreshEndpoint(req, res);
        } else if (urlObj.pathname === "/api/last-fetch") {
            await handleLastFetchEndpoint(res);
        } else if (urlObj.pathname === "/api/feed-health") {
            await handleFeedHealthEndpoint(res);
        } else if (urlObj.pathname === "/api/health") {
            await handleHealthEndpoint(res);
        } else if (urlObj.pathname === "/api/manual" && method === "POST") {
            await handleManualArticleEndpoint(req, res);
        } else if (urlObj.pathname === "/api/approve-article" && method === "POST") {
            await handleApproveArticleEndpoint(req, res);
        } else if (urlObj.pathname === "/api/blacklist-article" && method === "POST") {
            await handleBlacklistArticleEndpoint(req, res);
        } else if (urlObj.pathname === "/api/send-newsletter" && method === "POST") {
            await handleSendNewsletterEndpoint(req, res);
        } else {
            // Serve React frontend
            await serveFrontend(res);
        }
    } catch (error) {
        console.error('Request handling error:', error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
    }
}

async function handleArticlesEndpoint(req: IncomingMessage, res: ServerResponse, urlObj: URL) {
    // Validate and sanitize input parameters
    const params = {
        since: validateDateParam(urlObj.searchParams.get("since")),
        until: validateDateParam(urlObj.searchParams.get("until")),
        region: urlObj.searchParams.get("region")?.slice(0, 50) || null, // Limit length
        source: urlObj.searchParams.get("source")?.slice(0, 100) || null, // Limit length
        limit: validateLimit(urlObj.searchParams.get("limit"), 200)
    };

    const items = getItemsFiltered(params);
    const now = new Date().toISOString();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
        generatedAt: now,
        window: { since: params.since || new Date(Date.now() - windowDefaultHours * 3600 * 1000).toISOString(), until: params.until || now },
        items
    }));
}

async function handleBriefEndpoint(req: IncomingMessage, res: ServerResponse, urlObj: URL) {
    // Validate and sanitize input parameters
    const params = {
        since: validateDateParam(urlObj.searchParams.get("since")),
        until: validateDateParam(urlObj.searchParams.get("until")),
        region: urlObj.searchParams.get("region")?.slice(0, 50) || null,
        source: urlObj.searchParams.get("source")?.slice(0, 100) || null,
        limit: validateLimit(urlObj.searchParams.get("limit"), 200)
    };

    const grouped = getBriefByRegion(params);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
        generatedAt: new Date().toISOString(),
        window: { since: params.since, until: params.until },
        regions: grouped
    }));
}

async function handleNewsletterEndpoint(req: IncomingMessage, res: ServerResponse, urlObj: URL) {
    // Get days parameter with validation (default to 1, max 365)
    const days = validateDays(urlObj.searchParams.get("days"), 1);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    console.log(`📅 Newsletter request: days=${days}, since=${since}`);

    const allItems = getItemsFiltered({
        since: since,
        until: null,
        region: null,
        source: null,
        limit: 200
    });

    console.log(`📊 Found ${allItems.length} articles for ${days}-day period`);

    // SOURCE VALIDATION - Only allow approved domains (Boss's priority sources first)
    const approvedDomains = [
      // Boss's Mandatory Sources
      're-nj.com', 'commercialsearch.com', 'wsj.com', 'bisnow.com', 'globest.com',
      'naiop.org', 'cpexecutive.com', 'bizjournals.com', 'loopnet.com', 'costar.com',
      'lvb.com', 'dailyrecord.com', 'njbiz.com',
      // Additional Quality Sources
      'connectcre.com', 'credaily.com', 'therealdeal.com', 'freightwaves.com',
      'supplychaindive.com', 'bloomberg.com', 'reuters.com', 'apnews.com',
      'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com', 'traded.co',
      // Industry-Specific Sources
      'dcvelocity.com', 'supplychainbrain.com', 'logisticsmgmt.com', 'inboundlogistics.com',
      'manufacturing.net', 'industryweek.com', 'mbtmag.com', 'modernmaterialshandling.com',
      'commercialcafe.com', 'commercialobserver.com', 'rejournals.com',
      // Logistics & Warehousing
      'logisticsmanagement.com', 'warehouseiq.com', 'supplychain247.com',
      // Local/Regional CRE Markets
      'njcre.com', 'philadelphiacre.com', 'southfloridacre.com', 'sfbj.com',
      // Brokerage & Research
      'newmarkkf.com', 'avisonyoung.com', 'leecorrentals.com', 'naimertz.com',
      'naikeystone.com', 'naiplatform.com', 'sior.com', 'ccim.com',
      // Wire Services & Aggregators
      'prnewswire.com', 'globenewswire.com', 'businesswire.com',
      // Industrial REIT Sources
      'prologis.com', 'dfreit.com', 'rfreit.com', 'firstindustrial.com',
      'stagindustrial.com', 'terreno.com', 'eastgroup.net'
    ];

    const validatedItems = allItems.filter(item => {
        const link = item.link || '';
        return approvedDomains.some(domain => link.includes(domain)) || !link; // Allow items without links
    });

    console.log(`📊 After source validation: ${validatedItems.length} articles`);

    // Filter articles by category (using the category field set by classification)
    let relevant = validatedItems.filter(i => (i.category || '') === 'relevant');
    const transactions = validatedItems.filter(i => (i.category || '') === 'transaction');
    let availabilities = validatedItems.filter(i => (i.category || '') === 'availabilities');
    const people = validatedItems.filter(i => (i.category || '') === 'people');

    // Pre-filter transactions to focus on major deals (≥100K SF or ≥$25M)
    const majorTransactions = transactions.filter(item => {
        const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
        return hasSizeSignals(titleAndDesc) || hasPriceSignals(titleAndDesc);
    });

    // Refine Market Intelligence section: focus on industrial real estate
    relevant = relevant.filter(item => {
        const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
        // Much broader industrial focus for better coverage
        const hasIndustrialFocus = /industrial|warehouse|logistics|distribution|manufacturing|cold storage|data center|fulfillment|cross-dock|spec|flex space|3pl|supply chain|material handling|ecommerce|transportation|freight|port|rail|outdoor storage|ios|manufacturing plant|processing plant|trade hub|distribution hub|logistics hub|fulfillment hub|automotive|aerospace|life sciences|biotech|chemical|food processing|brewery|r&d|research and development/i.test(titleAndDesc);

        // Commercial real estate context - broader terms
        const hasCommercialRealEstate = /commercial real estate|cre|real estate|industrial real estate|prologis|dltr|dre|equity|invest|development|reit|lease|leasing|tenant|landlord|broker|brokerage|sale|sold|acquisition|property|asset|building|facility|construction|development|industrial park|distribution center|fulfillment center|warehouse|logistics|speculative|build-to-suit|bts|net lease|cap rate|noi|financing|mortgage|loan|cbre|jll|cushman|colliers|newmark|industrial landlord|industrial developer|logistics developer/i.test(titleAndDesc);

        // Must have industrial focus (primary requirement) - commercial real estate is optional but preferred
        return hasIndustrialFocus;
    });

    // Increase limit to show more articles (was 4, now 15)
    relevant = relevant.slice(0, 15);

    // Refine Availabilities section: focus on NJ/PA/Upstate NY/South FL
    availabilities = availabilities.filter(item => {
        const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
        const targetRegions = ['NJ', 'PA', 'NY', 'FL'];
        const isInTargetRegion = item.regions?.some(r => targetRegions.includes(r));

        // Enhanced geographic validation - check for specific cities/areas
        const hasTargetGeography = /new jersey|nj|pennsylvania|pa|upstate ny|south florida|fl|miami-dade|broward|palm beach|north jersey|central jersey|south jersey|lehigh valley|philadelphia|pittsburgh|albany|buffalo|rochester/i.test(titleAndDesc);

        // Must be in target region OR have target geography mentioned
        return isInTargetRegion || hasTargetGeography;
    });

    // Limit to top availabilities to show more opportunities (was 3, now 8)
    availabilities = availabilities.slice(0, 8);

    // Increase limits to show more articles (was 2 each, now 5 each)
    const finalTransactions = majorTransactions.slice(0, 5);
    const finalPeople = people.slice(0, 5);

    console.log(`📊 Final counts: Market Intelligence: ${relevant.length}, Transactions: ${finalTransactions.length}, Availabilities: ${availabilities.length}, People: ${finalPeople.length}`);

    const period = `${days} day${days > 1 ? 's' : ''}`;
    const html = buildBriefing({ relevant, transactions: finalTransactions, availabilities, people: finalPeople }, period);
    console.log('Generated newsletter HTML length:', html.length, 'first 100 chars:', html.substring(0, 100));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ html }));
}

async function handleRefreshEndpoint(req: IncomingMessage, res: ServerResponse) {
    console.log('🔄 Manual refresh triggered');
    // Import and call fetchAllRSSArticles here to avoid circular dependencies
    const { fetchAllRSSArticles } = await import('../feeds/fetcher.js');
    const results = await fetchAllRSSArticles();

    const totalFetched = results.reduce((sum, r) => sum + r.meta.fetchedRaw, 0);
    const totalKept = results.reduce((sum, r) => sum + r.meta.kept, 0);
    console.log(`✅ Refresh completed: ${totalFetched} fetched, ${totalKept} kept from ${results.length} sources`);

    // Save articles after refresh for persistence
    saveArticlesToFile();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sources: results, totalFetched, totalKept }));
}

async function handleLastFetchEndpoint(res: ServerResponse) {
    // Import lastFetchInfo from fetcher.js
    const { getLastFetchInfo } = await import('../feeds/fetcher.js');
    const lastFetchInfo = getLastFetchInfo();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(lastFetchInfo));
}

async function handleFeedHealthEndpoint(res: ServerResponse) {
    const health = Array.from(feedStats.entries()).map(([url, stats]) => {
        // Import RSS_FEEDS to get feed config
        const { RSS_FEEDS } = require('../feeds/config.js');
        const feedConfig = RSS_FEEDS.find(f => f.url === url);
        return {
            url,
            name: feedConfig?.name || 'Unknown',
            region: feedConfig?.region || 'US',
            type: feedConfig?.type || 'news',
            status: stats.lastError ? 'failing' : 'working',
            lastFetch: stats.lastFetch,
            lastSuccess: stats.lastSuccess,
            lastError: stats.lastError,
            itemsFetched: stats.itemsFetched,
            blockedUntil: 0 // TODO: Add circuit breaker info
        };
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(health));
}

async function handleHealthEndpoint(res: ServerResponse) {
    const totalArticles = itemStore.size;
    const articlesByCategory = {
        relevant: 0,
        transaction: 0,
        availabilities: 0,
        people: 0,
        'not relevant': 0,
        excluded: 0,
        'unapproved source': 0,
        blacklisted: 0
    };

    for (const item of itemStore.values()) {
        const category = item.category || 'not relevant';
        if (articlesByCategory[category as keyof typeof articlesByCategory] !== undefined) {
            articlesByCategory[category as keyof typeof articlesByCategory]++;
        }
    }

    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        articles: {
            total: totalArticles,
            byCategory: articlesByCategory
        },
        feeds: {
            total: feedStats.size,
            failing: Array.from(feedStats.values()).filter(s => s.lastError).length,
            working: Array.from(feedStats.values()).filter(s => !s.lastError).length
        },
        lastFetch: null as any // Will be populated by fetcher
    };

    // Get last fetch info
    const { getLastFetchInfo } = await import('../feeds/fetcher.js');
    const lastFetchInfo = getLastFetchInfo();
    health.lastFetch = lastFetchInfo;

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(health));
}

async function handleManualArticleEndpoint(req: IncomingMessage, res: ServerResponse) {
    if (API_KEY) {
        const key = req.headers["x-api-key"];
        if (!key || key !== API_KEY) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
        }
    }

    let body = "";
    req.on("data", (chunk: any) => body += chunk.toString());
    req.on("end", async () => {
        try {
            const payload = JSON.parse(body || "{}");
            if (!payload.link) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "link is required" }));
                return;
            }

            const canonicalUrl = stripTrackingParams(payload.link);
            const guid = payload.guid || "";
            const id = computeId({ guid, canonicalUrl });
            const validation = await validateLink(canonicalUrl);
            let thumb = payload.image || "";
            if (!thumb) {
                thumb = await fetchOgImage(canonicalUrl);
            }
            if (!thumb) {
                thumb = fallbackThumbnail(id);
            }

            const item: NormalizedItem = {
                id,
                guid: guid || undefined,
                canonicalUrl,
                title: payload.title || payload.url || "Untitled",
                link: canonicalUrl,
                pubDate: payload.publishedAt || payload.pubDate || new Date().toISOString(),
                description: payload.summary || payload.description || "",
                author: payload.author || "",
                publisher: payload.source || payload.publisher || "Manual",
                image: thumb,
                thumbnailUrl: thumb,
                access: validation.access,
                status: validation.status,
                fetchedAt: new Date().toISOString(),
                source: payload.source || payload.publisher || "Manual",
                regions: Array.isArray(payload.regions) ? payload.regions : [],
                topics: Array.isArray(payload.topics) ? payload.topics : [],
                category: payload.category || (Array.isArray(payload.topics) && payload.topics.length > 0 ? payload.topics[0] : "relevant"),
                tier: 'A' // Manual articles are high-quality, user-curated
            };

            itemStore.set(id, item);
            manualArticles.unshift(item);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, count: manualArticles.length, id }));
        } catch (err: any) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
        }
    });
}

async function handleApproveArticleEndpoint(req: IncomingMessage, res: ServerResponse) {
    let body = "";
    req.on("data", (chunk: any) => body += chunk.toString());
    req.on("end", async () => {
        try {
            const { articleId, newCategory } = JSON.parse(body || "{}");

            if (!articleId || !newCategory) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing articleId or newCategory" }));
                return;
            }

            // Find and update the article
            const article = itemStore.get(articleId);
            if (!article) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Article not found" }));
                return;
            }

            // Update article category
            article.category = newCategory;
            itemStore.set(articleId, article);

            // Save to file
            saveArticlesToFile();

            console.log(`✓ Article ${articleId} approved as ${newCategory}`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, message: "Article approved successfully" }));
        } catch (err: any) {
            console.error('Error approving article:', err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
        }
    });
}

async function handleBlacklistArticleEndpoint(req: IncomingMessage, res: ServerResponse) {
    let body = "";
    req.on("data", (chunk: any) => body += chunk.toString());
    req.on("end", async () => {
        try {
            const { articleId } = JSON.parse(body || "{}");

            if (!articleId) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing articleId" }));
                return;
            }

            // Find and update the article
            const article = itemStore.get(articleId);
            if (!article) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Article not found" }));
                return;
            }

            // Mark as blacklisted
            article.category = "blacklisted";
            itemStore.set(articleId, article);

            // Save to file
            saveArticlesToFile();

            console.log(`✓ Article ${articleId} blacklisted`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, message: "Article blacklisted successfully" }));
        } catch (err: any) {
            console.error('Error blacklisting article:', err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
        }
    });
}

async function handleSendNewsletterEndpoint(req: IncomingMessage, res: ServerResponse) {
    let body = "";
    req.on("data", (chunk: any) => body += chunk.toString());
    req.on("end", async () => {
        try {
            const payload = JSON.parse(body || "{}");
            // Validate recipients - sanitize email addresses
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const recipients = Array.isArray(payload.recipients)
                ? payload.recipients.filter((r: string) => typeof r === 'string' && emailRegex.test(r.trim())).slice(0, 100) // Max 100 recipients
                : [];

            if (recipients.length === 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "At least one valid email recipient is required" }));
                return;
            }

            const days = validateDays(String(payload.days), 1);
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

            const items = getItemsFiltered({
                since: since,
                until: null,
                region: null,
                source: null,
                limit: 200
            });

            // Filter articles by category
            let relevant = items.filter(i => (i.category || '') === 'relevant');
            const transactions = items.filter(i => (i.category || '') === 'transaction');
            let availabilities = items.filter(i => (i.category || '') === 'availabilities');
            const people = items.filter(i => (i.category || '') === 'people');

            // Apply same filtering logic as newsletter endpoint
            const majorTransactions = transactions.filter(item => {
                const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                return hasSizeSignals(titleAndDesc) || hasPriceSignals(titleAndDesc);
            });

            relevant = relevant.filter(item => {
                const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                const hasIndustrialFocus = /industrial|warehouse|logistics|distribution|manufacturing|cold storage|data center|fulfillment|cross-dock|spec|flex space|3pl|supply chain|material handling|ecommerce|transportation|freight|port|rail|outdoor storage|ios|manufacturing plant|processing plant|trade hub|distribution hub|logistics hub|fulfillment hub|automotive|aerospace|life sciences|biotech|chemical|food processing|brewery|r&d|research and development/i.test(titleAndDesc);
                return hasIndustrialFocus;
            }).slice(0, 15);

            availabilities = availabilities.filter(item => {
                const titleAndDesc = (item.title || '') + ' ' + (item.description || '');
                const targetRegions = ['NJ', 'PA', 'NY', 'FL'];
                const isInTargetRegion = item.regions?.some(r => targetRegions.includes(r));
                const hasTargetGeography = /new jersey|nj|pennsylvania|pa|upstate ny|south florida|fl|miami-dade|broward|palm beach|north jersey|central jersey|south jersey|lehigh valley|philadelphia|pittsburgh|albany|buffalo|rochester/i.test(titleAndDesc);
                return isInTargetRegion || hasTargetGeography;
            }).slice(0, 8);

            const finalTransactions = majorTransactions.slice(0, 5);
            const finalPeople = people.slice(0, 5);

            console.log(`📊 Newsletter counts: Market Intelligence: ${relevant.length}, Transactions: ${finalTransactions.length}, Availabilities: ${availabilities.length}, People: ${finalPeople.length}`);

            const formatDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            const sinceDate = new Date(since);
            const untilDate = new Date();
            const period = `${formatDate(sinceDate)} – ${formatDate(untilDate)} (ET)`;
            const html = buildBriefing({ relevant, transactions: finalTransactions, availabilities, people: finalPeople }, period);

            const subject = `Woodmont Daily Industrial News Briefing - ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;

            console.log(`📧 Sending newsletter to ${recipients.length} recipients: ${recipients.join(', ')}`);
            const success = await sendEmail(recipients, subject, html);

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success, recipients: recipients.length, articles: items.length }));
        } catch (err: any) {
            console.error('❌ Newsletter send failed:', err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err && err.message ? err.message : String(err) }));
        }
    });
}

async function serveFrontend(res: ServerResponse) {
    try {
        const content = fs.readFileSync(FRONTEND_FILE, "utf8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
    } catch {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("frontend missing");
    }
}

// Import helper functions from classifier
import { hasSizeSignals, hasPriceSignals } from '../filter/classifier.js';

// Import utility functions that were in the original file
function stripTrackingParams(urlStr: string): string {
    try {
        const u = new URL(urlStr);
        const toDelete: string[] = [];
        u.searchParams.forEach((_, key) => {
            if (key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid", "mc_cid", "mc_eid"].includes(key.toLowerCase())) {
                toDelete.push(key);
            }
        });
        toDelete.forEach(k => u.searchParams.delete(k));
        u.hash = "";
        return u.toString();
    } catch {
        return urlStr;
    }
}

function computeId({ guid, canonicalUrl }: { guid?: string; canonicalUrl?: string }): string {
    let basis = guid || canonicalUrl || '';
    // Handle case where guid/canonicalUrl might be an object
    if (typeof basis !== 'string') {
        basis = String(basis);
    }
    return nodeCrypto.createHash('sha1').update(basis).digest('hex');
}

async function validateLink(link: string) {
    if (!link) return { ok: false, status: 0, access: "unknown" };
    try {
        const resp = await axios.get(link, {
            maxRedirects: 3,
            timeout: 5000,
            responseType: 'arraybuffer',
            maxContentLength: 32768,
            validateStatus: (s: number) => s >= 200 && s < 500
        });
        const contentType = resp.headers['content-type'] || "";
        const bodySample = resp.data ? resp.data.toString('utf8', 0, Math.min(resp.data.length, 2048)) : "";
        const access = classifyAccess(resp.status, contentType, bodySample);
        const ok = resp.status >= 200 && resp.status < 400 && access !== "paywalled" && access !== "blocked";
        return { ok, status: resp.status, access, bodySample, contentType };
    } catch (err: any) {
        const status = err && err.response ? err.response.status : 0;
        return { ok: false, status, access: "blocked" };
    }
}

async function fetchOgImage(url: string): Promise<string> {
    try {
        const resp = await axios.get(url, {
            maxRedirects: 3,
            timeout: 5000,
            responseType: 'arraybuffer',
            maxContentLength: 32768,
            validateStatus: (s: number) => s >= 200 && s < 500
        });
        const html = resp.data ? resp.data.toString('utf8', 0, Math.min(resp.data.length, 2048)) : "";
        const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
        if (match && match[1]) return match[1];
        return "";
    } catch {
        return "";
    }
}

function fallbackThumbnail(id: string): string {
    return `https://picsum.photos/seed/${id}/640/360`;
}

function classifyAccess(status: number, contentType?: string, bodySample = ""): string {
    if (!status) return "unknown";
    if (status === 401 || status === 402 || status === 403) return "blocked";
    if (status === 404) return "blocked";
    if (contentType && !contentType.includes("text/html")) return "unknown";
    const lower = bodySample.toLowerCase();
    if (lower.includes("subscribe") || lower.includes("paywall")) return "paywalled";
    return "ok";
}

// Import axios and crypto
import axios from 'axios';
import * as nodeCrypto from 'crypto';

// Import filtering functions
function getItemsFiltered({ since, until, region, source, limit = 200 }: { since: string | null; until: string | null; region: string | null; source: string | null; limit?: number }): any[] {
    const sinceTs = since ? Date.parse(since) : Date.now() - windowDefaultHours * 60 * 60 * 1000;
    const untilTs = until ? Date.parse(until) : Date.now();
    const out: any[] = [];
    for (const item of itemStore.values()) {
        const ts = new Date(item.pubDate || item.fetchedAt || Date.now()).getTime();
        if (isFinite(sinceTs) && ts < sinceTs) continue;
        if (isFinite(untilTs) && ts > untilTs) continue;
        if (region && item.regions && item.regions.length && !item.regions.includes(region)) continue;
        if (source && item.source && item.source !== source) continue;
        out.push(item);
        if (out.length >= limit) break;
    }
    return out.sort((a, b) => new Date(b.pubDate || b.fetchedAt || 0).getTime() - new Date(a.pubDate || a.fetchedAt || 0).getTime());
}

function getBriefByRegion({ since, until, region, source, limit = 200 }: { since: string | null; until: string | null; region: string | null; source: string | null; limit?: number }) {
    const items = getItemsFiltered({ since, until, region, source, limit });
    const grouped: Record<string, any[]> = {};
    items.forEach(it => {
        const regs = (it.regions && it.regions.length) ? it.regions : ["Unspecified"];
        regs.forEach(r => {
            grouped[r] = grouped[r] || [];
            grouped[r].push(it);
        });
    });
    return grouped;
}
