import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { NormalizedItem } from '../types/index.js';
import { loadArticlesFromFeed } from './newsletter-filters.js';
import { enrichCapitalMarketsCandidates, CapitalMarketsEnrichmentDiagnostics } from './capital-markets-enrichment.js';

const require_ = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

type WatchlistRow = Record<string, string>;

interface CapitalMarketsConfig {
    title: string;
    subject: string;
    dailyLookbackHours: number;
    maxFeedAgeHours: number;
    maxItemsPerSection: number;
    emptySendPolicy: 'HOLD';
    weekInReview: {
        enabled: boolean;
        deliveryDay: 'FRIDAY';
        lookbackHours: 168;
        maxItems: 5;
    };
    rollout: {
        productionEnabled: boolean;
        requiredShadowRuns: number;
        requiredCanaryApprovals: number;
    };
}

export interface CapitalMarketsPackage {
    previewHtml: string;
    deliveryHtml: string;
    summary: {
        generatedAt: string;
        asOfDate: string;
        subject: string;
        lookbackHours: number;
        sourceArticles: number;
        feedHealth: FeedHealth;
        selectedCore: number;
        sectionCounts: Record<string, number>;
        rejected: number;
        rejections: Record<string, number>;
        duplicatesRemoved: Record<string, number>;
        watchlist: {
            loaded: number;
            withDomains: number;
            matchedCompanies: number;
            acceptedItems: number;
        };
        enrichment: CapitalMarketsEnrichmentDiagnostics;
        weekInReviewIncluded: boolean;
        safetyChecks: string[];
    };
}

export interface FeedHealth {
    status: 'FRESH' | 'STALE' | 'EMPTY' | 'INVALID' | 'FUTURE';
    newestAt: string | null;
    ageHours: number | null;
    maxAgeHours: number;
}

export interface BuildCapitalMarketsOptions {
    articles?: NormalizedItem[];
    docsDir?: string;
    repoRoot?: string;
    asOfDate?: string;
    asOfTime?: string;
    lookbackHours?: number;
    includeWeekInReview?: boolean;
    testBanner?: boolean;
    watchlist?: WatchlistRow[] | null;
    enrichCandidates?: boolean;
    metadataLoader?: (url: string) => Promise<string | null>;
}

function loadConfig(repoRoot = REPO_ROOT): CapitalMarketsConfig {
    const configPath = path.join(repoRoot, 'config', 'capital-markets-newsletter.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')) as CapitalMarketsConfig;
    if (!cfg.title || typeof cfg.title !== 'string') throw new Error('Capital Markets config: title is required');
    if (!cfg.subject || typeof cfg.subject !== 'string' || cfg.subject.length > 120 || /[\r\n]/.test(cfg.subject)) {
        throw new Error('Capital Markets config: subject must be 1-120 characters with no line breaks');
    }
    if (![24, 72].includes(Number(cfg.dailyLookbackHours))) {
        throw new Error('Capital Markets config: dailyLookbackHours must be 24 or 72');
    }
    if (!Number.isFinite(cfg.maxFeedAgeHours) || cfg.maxFeedAgeHours < 1 || cfg.maxFeedAgeHours > 24) {
        throw new Error('Capital Markets config: maxFeedAgeHours must be from 1 through 24');
    }
    if (!Number.isInteger(cfg.maxItemsPerSection) || cfg.maxItemsPerSection < 1 || cfg.maxItemsPerSection > 6) {
        throw new Error('Capital Markets config: maxItemsPerSection must be an integer from 1 through 6');
    }
    if (cfg.emptySendPolicy !== 'HOLD') throw new Error('Capital Markets config: emptySendPolicy must be HOLD');
    if (!cfg.weekInReview || cfg.weekInReview.lookbackHours !== 168 || cfg.weekInReview.maxItems !== 5) {
        throw new Error('Capital Markets config: Week in Review must remain a five-item, seven-day window');
    }
    if (!cfg.rollout || cfg.rollout.productionEnabled !== false) {
        throw new Error('Capital Markets production activation is intentionally unavailable during shadow rollout');
    }
    return cfg;
}

function easternDate(date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const value = (type: string) => parts.find(p => p.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
}

function isFridayEastern(date = new Date()): boolean {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })
        .format(date) === 'Fri';
}

function runtimeFor(repoRoot: string, docsDir: string): Promise<any> {
    const runtimePath = path.join(repoRoot, 'src', 'server', 'capital-markets-runtime.cjs');
    const { loadCapitalMarketsRuntime } = require_(runtimePath);
    return loadCapitalMarketsRuntime({ repoRoot, docsDir });
}

function readWatchlistTextFromEnvironment(): string | null {
    const encoded = (process.env.CM_WATCHLIST_CSV_B64 || '').trim();
    const runtimePath = (process.env.WATCHLIST_CSV || '').trim();
    if (encoded && runtimePath) throw new Error('Set only one of CM_WATCHLIST_CSV_B64 or WATCHLIST_CSV');
    if (encoded) {
        if (encoded.length > 2_800_000) throw new Error('Encoded watchlist exceeds the runtime safety limit');
        return Buffer.from(encoded, 'base64').toString('utf8');
    }
    if (runtimePath) {
        const resolved = path.resolve(runtimePath);
        const stat = fs.statSync(resolved);
        if (!stat.isFile() || stat.size > 2_000_000) throw new Error('Watchlist path is not a file or exceeds 2 MB');
        return fs.readFileSync(resolved, 'utf8');
    }
    return null;
}

function validateWatchlist(rows: WatchlistRow[]): WatchlistRow[] {
    if (!rows.length) return [];
    if (!Object.prototype.hasOwnProperty.call(rows[0], 'Company Name')) {
        throw new Error('Watchlist is missing the Company Name column');
    }
    if (rows.length > 2_000) throw new Error('Watchlist exceeds the 2,000-row safety limit');
    return rows;
}

function countSections(buckets: Record<string, unknown[]>): Record<string, number> {
    return Object.fromEntries(Object.entries(buckets).map(([key, items]) => [key, items.length]));
}

function selectionBoundary(value: string): Date {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(dateOnly ? `${value}T23:59:59` : value);
    if (!Number.isFinite(date.getTime())) throw new Error('Capital Markets as-of time is invalid');
    return date;
}

function assessFeedHealth(articles: NormalizedItem[], asOfTime: string, maxAgeHours: number): FeedHealth {
    if (!articles.length) return { status: 'EMPTY', newestAt: null, ageHours: null, maxAgeHours };
    const stamps = articles.map(article => {
        const raw = article.fetchedAt || article.pubDate || (article as any).date_modified
            || (article as any).date_published;
        const value = raw ? new Date(raw).getTime() : NaN;
        return Number.isFinite(value) ? value : null;
    }).filter((value): value is number => value !== null);
    if (!stamps.length) return { status: 'INVALID', newestAt: null, ageHours: null, maxAgeHours };
    const newest = Math.max(...stamps);
    const ageHours = (selectionBoundary(asOfTime).getTime() - newest) / 3_600_000;
    const roundedAge = Math.round(ageHours * 10) / 10;
    if (ageHours < -1) {
        return { status: 'FUTURE', newestAt: new Date(newest).toISOString(), ageHours: roundedAge, maxAgeHours };
    }
    return {
        status: ageHours <= maxAgeHours ? 'FRESH' : 'STALE',
        newestAt: new Date(newest).toISOString(),
        ageHours: roundedAge,
        maxAgeHours,
    };
}

export function assertFreshFeedForSend(feedHealth: FeedHealth): void {
    if (feedHealth.status !== 'FRESH') {
        const age = feedHealth.ageHours === null ? 'unknown' : `${feedHealth.ageHours}h`;
        throw new Error(`Capital Markets send blocked: feed is ${feedHealth.status} (age ${age}; maximum ${feedHealth.maxAgeHours}h)`);
    }
}

function assertDeliverySafe(html: string, selectedCore: number, allowEmpty: boolean): string[] {
    const checks: string[] = [];
    const fail = (message: string): never => { throw new Error(`Capital Markets delivery safety check failed: ${message}`); };
    if (!/^<!DOCTYPE html>/i.test(html)) fail('not a complete HTML document');
    checks.push('complete-html-document');
    if (/PREVIEW ONLY|\bDiagnostics\b|\bsandbox\b/i.test(html)) fail('preview diagnostics leaked into delivery HTML');
    checks.push('no-preview-diagnostics');
    if (/undefined|\bNaN\b|\[object Object\]/.test(html)) fail('malformed placeholder value');
    checks.push('no-malformed-values');
    if (html.length > 250_000) fail('HTML exceeds 250 KB');
    checks.push('email-size-under-250kb');
    if (!allowEmpty && selectedCore === 0) fail('no qualifying daily items; HOLD policy applies');
    if (selectedCore > 0) checks.push('non-empty-daily-selection');
    return checks;
}

export async function buildCapitalMarketsPackage(options: BuildCapitalMarketsOptions = {}): Promise<CapitalMarketsPackage> {
    const repoRoot = options.repoRoot || REPO_ROOT;
    const docsDir = options.docsDir || process.env.WOODMONT_DOCS_DIR || path.join(repoRoot, 'docs');
    const cfg = loadConfig(repoRoot);
    const { CM } = await runtimeFor(repoRoot, docsDir);
    const loaded = options.articles ? { articles: options.articles } : loadArticlesFromFeed();
    let articles = loaded.articles;
    const now = new Date();
    const asOfDate = options.asOfDate || easternDate(now);
    // Tests and historical replays may intentionally provide a date-only
    // boundary. Live shadow/canary builds use the exact run instant so the
    // configured lookback is a true rolling window rather than "24 hours from
    // the end of today", which would be much wider during a morning send.
    const asOfTime = options.asOfTime || (options.asOfDate ? options.asOfDate : now.toISOString());
    const lookbackHours = options.lookbackHours || cfg.dailyLookbackHours;
    if (![24, 72, 168, 720].includes(lookbackHours)) throw new Error('Unsupported Capital Markets lookback');
    const includeWeekInReview = options.includeWeekInReview ?? (cfg.weekInReview.enabled && isFridayEastern());
    const feedHealth = assessFeedHealth(articles, asOfTime, cfg.maxFeedAgeHours);

    let enrichment: CapitalMarketsEnrichmentDiagnostics = {
        enabled: false, candidates: 0, attempted: 0, metadataFound: 0, promoted: 0, failed: 0
    };
    if (options.enrichCandidates || process.env.CM_ENRICH_CANDIDATES === '1') {
        const result = await enrichCapitalMarketsCandidates(articles, CM, {
            asOfDate: asOfTime, lookbackHours, metadataLoader: options.metadataLoader,
        });
        articles = result.articles;
        enrichment = result.diagnostics;
    }

    let watchlist = options.watchlist;
    if (watchlist === undefined) {
        const watchlistText = readWatchlistTextFromEnvironment();
        watchlist = watchlistText ? validateWatchlist(CM.cmParseCSV(watchlistText)) : null;
    }

    const built = CM.cmBuildSections(articles, asOfTime, lookbackHours);
    const competitor = CM.cmCompetitorWatch(built.inWindow, watchlist);
    const sectionCounts = countSections(built.buckets);
    const selectedCore = Object.values(sectionCounts).reduce((sum, n) => sum + n, 0) + competitor.items.length;
    const common = {
        asOfDate, asOfTime, lookbackHours, watchlist, feedHealth,
        maxItemsPerSection: cfg.maxItemsPerSection,
        newsletterTitle: cfg.title,
    };
    // The preview keeps Week in Review visible every day so editors can inspect
    // it. Delivery restores the Friday-only policy at the caller boundary.
    const previewHtml = CM.buildCapitalMarketsNewsletterHTML(articles, {
        ...common, includeWeekInReview: cfg.weekInReview.enabled,
    });
    const deliveryHtml = CM.buildCapitalMarketsNewsletterHTML(articles, {
        ...common, includeWeekInReview, renderMode: 'delivery', testBanner: !!options.testBanner,
    });
    const safetyChecks = assertDeliverySafe(deliveryHtml, selectedCore, true);

    return {
        previewHtml,
        deliveryHtml,
        summary: {
            generatedAt: new Date().toISOString(),
            asOfDate,
            subject: cfg.subject,
            lookbackHours,
            sourceArticles: articles.length,
            feedHealth,
            selectedCore,
            sectionCounts,
            rejected: built.rejected.length,
            rejections: { ...built.telemetry },
            duplicatesRemoved: { ...built.deduped },
            watchlist: {
                loaded: competitor.diag.companiesLoaded,
                withDomains: competitor.diag.withDomains,
                matchedCompanies: competitor.diag.companiesMatched,
                acceptedItems: competitor.diag.accepted,
            },
            enrichment,
            weekInReviewIncluded: includeWeekInReview,
            safetyChecks,
        },
    };
}

function writeAtomic(filePath: string, contents: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, contents, 'utf8');
    fs.renameSync(tmp, filePath);
}

export async function buildCapitalMarketsShadow(outputDir?: string): Promise<CapitalMarketsPackage> {
    const destination = outputDir || process.env.CM_SHADOW_DIR || path.join(REPO_ROOT, 'artifacts', 'capital-markets-shadow');
    const pkg = await buildCapitalMarketsPackage({ testBanner: true });
    writeAtomic(path.join(destination, 'preview.html'), pkg.previewHtml);
    writeAtomic(path.join(destination, 'delivery-canary.html'), pkg.deliveryHtml);
    writeAtomic(path.join(destination, 'summary.json'), JSON.stringify(pkg.summary, null, 2) + '\n');
    console.log(`Capital Markets shadow generated: ${pkg.summary.selectedCore} qualifying daily item(s), ${pkg.summary.rejected} rejected`);
    console.log(`Feed health: ${pkg.summary.feedHealth.status} (${pkg.summary.feedHealth.ageHours ?? 'unknown'}h old; maximum ${pkg.summary.feedHealth.maxAgeHours}h)`);
    console.log(`Shadow artifacts: ${destination}`);
    return pkg;
}

export function validateCanaryRecipients(raw: string, productionRaw = ''): string[] {
    const recipients = [...new Set(raw.split(',').map(v => v.trim().toLowerCase()).filter(Boolean))];
    if (!recipients.length) throw new Error('CM_CANARY_TO is required');
    if (recipients.length > 2) throw new Error('Capital Markets canary is limited to two recipients');
    const allowedDomains = (process.env.CM_CANARY_ALLOWED_DOMAINS || 'woodmontproperties.com')
        .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    for (const recipient of recipients) {
        const match = recipient.match(/^[^\s@]+@([^\s@]+)$/);
        if (!match || !allowedDomains.includes(match[1])) {
            throw new Error('Canary recipient is invalid or outside the allowed corporate domains');
        }
    }
    const production = [...new Set(productionRaw.split(',').map(v => v.trim().toLowerCase()).filter(Boolean))];
    if (production.length > 0 && production.length === recipients.length
        && production.every(v => recipients.includes(v))) {
        throw new Error('Canary recipients must not equal the production distribution list');
    }
    return recipients;
}

interface CanarySmtpConfig {
    host: string;
    port: 465 | 587;
    user: string;
    pass: string;
    from: string;
}

/**
 * Canary mail has a dedicated transport namespace. It must never inherit the
 * production webhook or generic SMTP variables from a developer's .env file.
 */
export function readCanarySmtpConfig(env: NodeJS.ProcessEnv = process.env): CanarySmtpConfig {
    const host = (env.CM_CANARY_SMTP_HOST || '').trim();
    const user = (env.CM_CANARY_SMTP_USER || '').trim();
    const pass = env.CM_CANARY_SMTP_PASS || '';
    const from = (env.CM_CANARY_EMAIL_FROM || '').trim();
    const portValue = Number(env.CM_CANARY_SMTP_PORT || '587');
    if (!host || !user || !pass || !from) {
        throw new Error('Canary blocked: dedicated CM_CANARY_SMTP_HOST, CM_CANARY_SMTP_USER, CM_CANARY_SMTP_PASS and CM_CANARY_EMAIL_FROM are required');
    }
    if (/[\r\n]/.test(from)) throw new Error('Canary blocked: sender contains a line break');
    if (portValue !== 465 && portValue !== 587) {
        throw new Error('Canary blocked: dedicated SMTP port must be 465 or 587');
    }
    const fromAddress = (from.match(/<([^<>]+)>\s*$/) || [null, from])[1] || '';
    const fromDomain = fromAddress.toLowerCase().match(/^[^\s@]+@([^\s@]+)$/)?.[1];
    const allowedDomains = (env.CM_CANARY_ALLOWED_DOMAINS || 'woodmontproperties.com')
        .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (!fromDomain || !allowedDomains.includes(fromDomain)) {
        throw new Error('Canary blocked: sender must use an approved corporate domain');
    }
    return { host, port: portValue, user, pass, from } as CanarySmtpConfig;
}

async function sendCanaryViaDedicatedSmtp(
    recipients: string[], subject: string, html: string, config: CanarySmtpConfig
): Promise<boolean> {
    const nodemailer = require_('nodemailer');
    const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass },
    });
    const info = await transporter.sendMail({
        from: config.from,
        to: recipients.join(', '),
        subject,
        html,
    });
    console.log(`Capital Markets canary accepted by dedicated SMTP (${info.messageId ? 'message ID returned' : 'no message ID returned'})`);
    return true;
}

export async function sendCapitalMarketsCanary(): Promise<boolean> {
    if (process.env.CM_CANARY_CONFIRM !== 'SEND_TEST_ONLY') {
        throw new Error('Canary blocked: CM_CANARY_CONFIRM must equal SEND_TEST_ONLY');
    }
    const recipients = validateCanaryRecipients(
        process.env.CM_CANARY_TO || '', process.env.CM_PRODUCTION_TO_COMPARE || ''
    );
    const smtp = readCanarySmtpConfig();
    const pkg = await buildCapitalMarketsPackage({ testBanner: true });
    assertFreshFeedForSend(pkg.summary.feedHealth);
    assertDeliverySafe(pkg.deliveryHtml, pkg.summary.selectedCore, process.env.CM_ALLOW_EMPTY_CANARY === '1');
    const subject = `[TEST ONLY — DO NOT FORWARD] ${pkg.summary.subject}`;
    console.log(`Capital Markets canary passed all gates; sending to ${recipients.length} test recipient(s)`);
    return sendCanaryViaDedicatedSmtp(recipients, subject, pkg.deliveryHtml, smtp);
}
