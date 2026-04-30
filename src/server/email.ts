import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NormalizedItem } from '../types/index.js';
import { buildBriefing } from './newsletter.js';
import { buildGothBriefing } from './newsletter-goth.js';
import { buildWorkBriefing } from './newsletter-work.js';
import { generateDescriptions } from '../filter/description-generator.js';
import { RELEVANT_KEYWORDS, INTERNATIONAL_EXCLUDE, EXCLUDE_NON_INDUSTRIAL, isStrictlyIndustrial } from '../shared/region-data.js';
import { cleanArticleUrl, extractDealSignature, extractDealSignatures } from '../shared/url-utils.js';
import {
    getText, containsAny, isPolitical, isTargetRegion, isNotExcludedRegion,
    applyStrictFilter, applyTransactionFilter, applyAvailabilityFilter, applyPeopleFilter,
    reCategorizeRelevantAsPeople,
    postDescriptionRegionCheck, loadArticlesFromFeed, filterArticlesByTimeRange,
    sortByDealThenDate, getValidDate, mapFeedItemsToArticles,
    loadIncludedArticles, clearIncludedArticles,
    loadSentArticles, loadSentSignatures, saveSentArticles
} from './newsletter-filters.js';

// ---------------------------------------------------------------------------
// Scoring Weights — loaded from docs/scoring-weights.json (falls back to defaults)
// ---------------------------------------------------------------------------

interface ScoringWeights {
    updatedAt?: string;
    regionWeights: Record<string, number>;
    sourceWeights: Record<string, number>;
    dealSizeThresholds: { highValue_SF: number; highValue_dollars: number };
    companyBonus: Record<string, number>;
    topicPreferences: Record<string, number>;
    learnedExclusions: string[];
}

const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
    regionWeights: { NJ: 30, PA: 25, FL: 20, National: 5 },
    sourceWeights: { 'news.google.com': 0 },
    dealSizeThresholds: { highValue_SF: 100000, highValue_dollars: 50000000 },
    companyBonus: {
        prologis: 15, amazon: 15, blackstone: 15, ares: 15, eqt: 15,
        'link logistics': 15, 'bridge industrial': 15, sagard: 15, woodmont: 15,
    },
    topicPreferences: {},
    learnedExclusions: [],
};

let _cachedWeights: ScoringWeights | null = null;

function loadScoringWeights(): ScoringWeights {
    if (_cachedWeights) return _cachedWeights;

    const __filename_email = fileURLToPath(import.meta.url);
    const __dirname_email = path.dirname(__filename_email);
    const weightsPath = path.resolve(__dirname_email, '..', '..', 'docs', 'scoring-weights.json');
    try {
        if (fs.existsSync(weightsPath)) {
            const raw = fs.readFileSync(weightsPath, 'utf-8');
            const weights: ScoringWeights = JSON.parse(raw);
            console.log(`📊 Loaded scoring weights (updated: ${weights.updatedAt || 'unknown'})`);
            _cachedWeights = weights;
            return weights;
        }
    } catch (err) {
        console.warn('⚠️ Failed to load scoring-weights.json, using defaults:', (err as Error).message);
    }

    _cachedWeights = DEFAULT_SCORING_WEIGHTS;
    return _cachedWeights;
}

// =============================================================================
// EMAIL SENDING - Power Automate Webhook (Primary) or SMTP (Fallback)
// =============================================================================

async function sendViaWebhook(to: string[], subject: string, html: string): Promise<boolean> {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
        console.log('⚠️ WEBHOOK_URL not configured');
        return false;
    }
    try {
        console.log('📤 Sending email via Power Automate webhook...');
        console.log('   To:', to.join(', '));
        console.log('   Subject:', subject);
        console.log('   Body length:', html.length, 'characters');

        const payload = {
            to: to.join(', '),
            subject: subject,
            body: html,
            apiKey: process.env.WEBHOOK_SECRET || ''
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('✅ Webhook triggered successfully!');
            return true;
        } else {
            console.error('❌ Webhook failed with status:', response.status);
            const errorText = await response.text();
            console.error('   Response:', errorText);
            return false;
        }
    } catch (error) {
        console.error('❌ Failed to call webhook:', error);
        return false;
    }
}

async function sendViaSMTP(to: string[], subject: string, html: string): Promise<boolean> {
    try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || '',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_PORT === '465',
            auth: { user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '' },
        });

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'Woodmont Daily Briefing <operationssupport@woodmontproperties.com>',
            to: to.join(', '),
            subject,
            html,
        };

        console.log('📤 Sending email via SMTP...');
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully via SMTP');
        console.log('   Message ID:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ SMTP send failed:', error);
        return false;
    }
}

export async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📧 EMAIL SENDING');
    console.log('═══════════════════════════════════════════════════════════');

    if (process.env.WEBHOOK_URL) {
        console.log('📌 Using Power Automate Webhook (corporate O365)');
        const webhookSuccess = await sendViaWebhook(to, subject, html);
        if (webhookSuccess) return true;
        console.log('⚠️ Webhook failed, trying SMTP fallback...');
    }

    if (process.env.SMTP_HOST) {
        console.log('📌 Using SMTP fallback');
        return await sendViaSMTP(to, subject, html);
    }

    console.error('❌ No email method configured!');
    console.error('   Set WEBHOOK_URL for Power Automate or SMTP_HOST for SMTP');
    return false;
}

// =============================================================================
// HELPERS
// =============================================================================

function getRecipients(): string[] {
    const emailTo = process.env.EMAIL_TO || '';
    if (!emailTo) throw new Error('No EMAIL_TO configured in environment');
    return emailTo.split(',').map(e => e.trim()).filter(e => e);
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
}

// =============================================================================
// STANDARD NEWSLETTER (daily + weekly) — simple region filter, buildBriefing
// =============================================================================

type StandardPeriod = 'daily' | 'weekly';

async function sendStandardNewsletter(period: StandardPeriod): Promise<boolean> {
    const isWeekly = period === 'weekly';
    const label = isWeekly ? 'weekly' : 'daily';

    try {
        console.log(`📧 Preparing ${label} newsletter...`);
        const { articles: allArticles } = loadArticlesFromFeed();
        console.log(`📊 Total articles loaded: ${allArticles.length}`);

        let periodLabel: string;
        let recentArticles: NormalizedItem[];

        if (isWeekly) {
            periodLabel = '5 days';
            recentArticles = filterArticlesByTimeRange(allArticles, 5 * 24);
        } else {
            const isMonday = new Date().getDay() === 1;
            if (isMonday) {
                // Monday: look back 72 hours to cover the full weekend (Friday 9 AM → Monday 9 AM)
                console.log('📅 Monday detected — expanding lookback to 72 hours to cover the weekend');
                recentArticles = filterArticlesByTimeRange(allArticles, 72);
                periodLabel = '72 hours (weekend recap)';
            } else {
                // Adaptive time range: 24h or 48h
                const articles24h = filterArticlesByTimeRange(allArticles, 24);
                const relevant24h = articles24h.filter(a => a.category === 'relevant');
                const needsMoreContent = relevant24h.length <= 3;
                const hoursBack = needsMoreContent ? 48 : 24;
                periodLabel = needsMoreContent ? '48 hours' : '24 hours';

                if (needsMoreContent) {
                    console.log(`📈 Only ${relevant24h.length} relevant articles in 24h - expanding to 48 hours`);
                }
                recentArticles = filterArticlesByTimeRange(allArticles, hoursBack);
            }
        }
        console.log(`📅 Articles from last ${periodLabel}: ${recentArticles.length}`);

        let transactions: NormalizedItem[];
        let availabilities: NormalizedItem[];
        let relevant: NormalizedItem[];
        let people: NormalizedItem[];

        {
            // Apply strict regional + industrial filters (same as Goth/Work newsletters)
            const regionalArticles = recentArticles.filter(isTargetRegion);
            console.log(`🎯 Regional filter (NJ, PA, FL): ${recentArticles.length} → ${regionalArticles.length}`);

            relevant = applyStrictFilter(recentArticles.filter(a => a.category === 'relevant').filter(isNotExcludedRegion), RELEVANT_KEYWORDS, 'Relevant');
            transactions = applyTransactionFilter(regionalArticles.filter(a => a.category === 'transactions'));
            availabilities = applyAvailabilityFilter(regionalArticles.filter(a => a.category === 'availabilities'));
            people = applyPeopleFilter(regionalArticles.filter(a => a.category === 'people'));

            // Re-categorize: move people articles out of "relevant"/"transactions" into "people"
            const reCatStd = reCategorizeRelevantAsPeople(relevant, people, transactions);
            relevant = reCatStd.relevant;
            transactions = reCatStd.transactions;
            people = reCatStd.people;
        }

        console.log('📋 Article breakdown:');
        console.log(`  - Transactions: ${transactions.length}`);
        console.log(`  - Availabilities: ${availabilities.length}`);
        console.log(`  - Relevant: ${relevant.length}`);
        console.log(`  - People: ${people.length}`);

        const html = buildBriefing({ transactions, availabilities, relevant, people }, periodLabel);
        const recipients = getRecipients();
        const subject = isWeekly
            ? `📊 Woodmont Weekly Recap - ${formatDate(new Date())}`
            : `🏭 Woodmont Industrial News Briefing - ${formatDate(new Date())}`;
        const success = await sendEmail(recipients, subject, html);
        console.log(success ? `✅ ${label} newsletter sent successfully!` : `❌ Failed to send ${label} newsletter`);
        return success;
    } catch (error) {
        console.error(`❌ Error in send${isWeekly ? 'Weekly' : 'Daily'}Newsletter:`, error);
        return false;
    }
}

export async function sendDailyNewsletter(): Promise<boolean> {
    return sendStandardNewsletter('daily');
}

export async function sendWeeklyNewsletter(): Promise<boolean> {
    return sendStandardNewsletter('weekly');
}

// =============================================================================
// GOTH NEWSLETTER (daily + weekly) — strict filters, buildGothBriefing
// =============================================================================

type GothPeriod = 'daily' | 'weekly';

async function sendGothNewsletter(period: GothPeriod): Promise<boolean> {
    const isWeekly = period === 'weekly';
    const label = isWeekly ? 'Goth weekly' : 'Goth daily';

    try {
        console.log(`📧 Preparing ${label} briefing...`);
        const { articles: allArticles } = loadArticlesFromFeed();
        console.log(`📊 Total articles loaded: ${allArticles.length}`);

        let periodLabel: string;
        let recentArticles: NormalizedItem[];

        if (isWeekly) {
            periodLabel = '5 days';
            recentArticles = filterArticlesByTimeRange(allArticles, 5 * 24);
        } else {
            // Adaptive time range: 24h or 48h
            const now = new Date();
            const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            recentArticles = allArticles.filter(article => {
                const pubDate = getValidDate(article);
                if (!pubDate) return false;
                return pubDate >= cutoff24h;
            });
            const relevant24h = recentArticles.filter(a => a.category === 'relevant');
            periodLabel = '24 hours';

            if (relevant24h.length <= 3) {
                console.log(`📈 Only ${relevant24h.length} relevant articles in 24h - expanding to 48 hours`);
                recentArticles = filterArticlesByTimeRange(allArticles, 48);
                periodLabel = '48 hours';
            }
        }
        console.log(`📅 Articles from last ${periodLabel}: ${recentArticles.length}`);

        // Apply strict regional filter
        const regionalArticles = recentArticles.filter(isTargetRegion);
        console.log(`🎯 Regional filter (NJ, PA, FL): ${recentArticles.length} → ${regionalArticles.length}`);

        // Apply section-specific filters
        let relevant = applyStrictFilter(regionalArticles.filter(a => a.category === 'relevant'), RELEVANT_KEYWORDS, 'Relevant');
        let transactions = applyTransactionFilter(regionalArticles.filter(a => a.category === 'transactions'));
        let availabilities = applyAvailabilityFilter(regionalArticles.filter(a => a.category === 'availabilities'));
        let people = applyPeopleFilter(regionalArticles.filter(a => a.category === 'people'));

        // Re-categorize: move people articles out of "relevant"/"transactions" into "people"
        const reCatGoth = reCategorizeRelevantAsPeople(relevant, people, transactions);
        relevant = reCatGoth.relevant;
        transactions = reCatGoth.transactions;
        people = reCatGoth.people;

        // Post-description region check (catch wrong-region revealed by AI descriptions)
        relevant = relevant.filter(postDescriptionRegionCheck);
        transactions = transactions.filter(postDescriptionRegionCheck);
        availabilities = availabilities.filter(postDescriptionRegionCheck);
        people = people.filter(postDescriptionRegionCheck);

        console.log(`📋 Final article breakdown (NJ, PA, FL + industrial content):`);
        console.log(`  - Relevant: ${relevant.length}`);
        console.log(`  - Transactions: ${transactions.length}`);
        console.log(`  - Availabilities: ${availabilities.length}`);
        console.log(`  - People: ${people.length}`);

        const html = buildGothBriefing({ transactions, availabilities, relevant, people }, periodLabel, isWeekly);
        const recipients = getRecipients();
        const subject = isWeekly
            ? `📊 Woodmont Industrial News Briefing (Weekly) - ${formatDate(new Date())}`
            : `📊 Woodmont Industrial News Briefing - ${formatDate(new Date())}`;
        const success = await sendEmail(recipients, subject, html);
        console.log(success ? `✅ ${label} briefing sent successfully!` : `❌ Failed to send ${label} briefing`);
        return success;
    } catch (error) {
        console.error(`❌ Error in send${isWeekly ? 'Weekly' : 'Daily'}NewsletterGoth:`, error);
        return false;
    }
}

export async function sendDailyNewsletterGoth(): Promise<boolean> {
    return sendGothNewsletter('daily');
}

export async function sendWeeklyNewsletterGoth(): Promise<boolean> {
    return sendGothNewsletter('weekly');
}

// =============================================================================
// WORK NEWSLETTER — Boss's preferred style, distinct logic, kept separate
// =============================================================================

/**
 * Send "Work" daily newsletter - Boss's preferred clean, minimal style
 * STRICT FILTERS: Regional (NJ, PA, FL), Industrial, Political, Deal Thresholds
 * On Fridays, includes a Week-in-Review section (top 5 from last 5 days)
 */
export async function sendDailyNewsletterWork(): Promise<boolean> {
    try {
        console.log('📧 Preparing Work daily briefing (boss preferred style + strict filters)...');
        const { articles: allLoadedArticles, docsDir } = loadArticlesFromFeed();
        console.log(`📰 Loaded ${allLoadedArticles.length} articles from feed`);

        // Filter out previously sent articles to prevent day-to-day repeats.
        // ID match catches exact duplicates; signature match catches the same deal
        // reported by a different source on a later day (the Metuchen / Middlesex County /
        // N.J. area $3.5M case from 2026-04-27 and 2026-04-30).
        const sentArticleIds = loadSentArticles(docsDir);
        const sentSigSet = loadSentSignatures(docsDir);
        const articles = allLoadedArticles.filter(a => {
            const id = a.id || a.link || '';
            if (sentArticleIds.has(id)) return false;
            if (sentSigSet.size > 0) {
                const sigs = extractDealSignatures(a.title || '', (a as any).description || (a as any).summary || '');
                if (sigs.some(s => sentSigSet.has(s))) {
                    console.log(`🔁 Cross-day dedup: "${(a.title||'').substring(0,60)}" matches sent signature`);
                    return false;
                }
            }
            return true;
        });
        const dedupRemoved = allLoadedArticles.length - articles.length;
        if (dedupRemoved > 0) console.log(`🔁 Dedup: removed ${dedupRemoved} previously sent article(s)`);

        const now = new Date();
        const today = new Date();
        const isFriday = today.getDay() === 5;
        const isMonday = today.getDay() === 1;

        // Constants for section minimums and caps
        const MIN_RELEVANT = 4;       // 4-6 relevant articles
        const MIN_TRANSACTIONS = 4;   // 4-6 transactions
        const MIN_AVAILABILITIES = 1; // 1-3 availabilities (fewer listing-type articles exist)
        const MIN_PEOPLE = 2;         // 2-4 people articles
        const MAX_PER_SECTION = 6;
        const MAX_AVAILABILITIES = 3;

        // Monday: expand to 72h to catch weekend articles; otherwise 48h max
        const maxRange = isMonday ? 72 : 48;
        let timeRange = maxRange;
        let recentArticles = filterArticlesByTimeRange(articles, maxRange);
        let regionalArticles = recentArticles.filter(isTargetRegion);
        if (isMonday) console.log('📅 Monday detected — using 72h window to capture weekend articles');

        // If plenty of articles, try narrowing to 24h
        const recent24 = filterArticlesByTimeRange(articles, 24);
        const regional24 = recent24.filter(isTargetRegion);
        const sections24 = {
            relevant: applyStrictFilter(regional24.filter(a => a.category === 'relevant'), RELEVANT_KEYWORDS, 'Relevant'),
            transactions: applyTransactionFilter(regional24.filter(a => a.category === 'transactions')),
        };

        if (sections24.relevant.length >= MIN_RELEVANT && sections24.transactions.length >= MIN_TRANSACTIONS) {
            timeRange = 24;
            recentArticles = recent24;
            regionalArticles = regional24;
            console.log('📊 Enough articles in 24h, using narrower range');
        }
        console.log(`🎯 Regional filter (NJ, PA, FL): ${recentArticles.length} → ${regionalArticles.length}`);

        // "Relevant" = macro/national trends (interest rates, freight, supply chain) —
        // these don't need NJ/PA/FL geography, but MUST NOT be about excluded regions.
        // Transactions/Availabilities/People must be regionally focused.
        let relevant = applyStrictFilter(recentArticles.filter(a => a.category === 'relevant').filter(isNotExcludedRegion), RELEVANT_KEYWORDS, 'Relevant');
        let transactions = applyTransactionFilter(regionalArticles.filter(a => a.category === 'transactions'));
        let availabilities = applyAvailabilityFilter(regionalArticles.filter(a => a.category === 'availabilities'));
        let people = applyPeopleFilter(regionalArticles.filter(a => a.category === 'people'));

        // Re-categorize: move people articles out of "relevant"/"transactions" into "people"
        const reCat = reCategorizeRelevantAsPeople(relevant, people, transactions);
        relevant = reCat.relevant;
        transactions = reCat.transactions;
        people = reCat.people;

        // Fill empty sections from ALL regional articles, restricted to the section's own
        // category so a transactions article doesn't get pushed into availabilities (or vice
        // versa) just because it matches the keyword filter.
        const usedIds = new Set([...relevant, ...transactions, ...availabilities, ...people].map(a => a.id || a.link));
        const addFromAllSources = (
            section: NormalizedItem[], min: number,
            filterFn: (items: NormalizedItem[]) => NormalizedItem[], label: string,
            requireCategory: string
        ) => {
            if (section.length >= min) return;
            const candidates = filterFn(regionalArticles.filter(a => !usedIds.has(a.id || a.link) && a.category === requireCategory));
            console.log(`⚠️ Only ${section.length} ${label} — found ${candidates.length} from all sources`);
            for (const a of candidates) {
                if (section.length >= min) break;
                section.push(a);
                usedIds.add(a.id || a.link);
            }
        };

        // Relevant backfill from recent articles (macro/national OK, but no excluded regions).
        // Must restrict to a.category === 'relevant' so transactions/availabilities articles
        // don't get force-pushed into Relevant just because they match RELEVANT_KEYWORDS.
        if (relevant.length < MIN_RELEVANT) {
            const relevantCandidates = applyStrictFilter(
                recentArticles.filter(a => !usedIds.has(a.id || a.link) && a.category === 'relevant').filter(isNotExcludedRegion),
                RELEVANT_KEYWORDS, 'Relevant (backfill)'
            );
            console.log(`⚠️ Only ${relevant.length} relevant — found ${relevantCandidates.length} from all sources`);
            for (const a of relevantCandidates) {
                if (relevant.length >= MIN_RELEVANT) break;
                relevant.push(a);
                usedIds.add(a.id || a.link);
            }
        }
        addFromAllSources(transactions, MIN_TRANSACTIONS, applyTransactionFilter, 'transactions', 'transactions');
        addFromAllSources(availabilities, MIN_AVAILABILITIES, applyAvailabilityFilter, 'availabilities', 'availabilities');
        addFromAllSources(people, MIN_PEOPLE, applyPeopleFilter, 'people', 'people');

        // Deep backfill: if any section is still below minimum, expand to 30-day window
        const needsDeepBackfill = relevant.length < MIN_RELEVANT || transactions.length < MIN_TRANSACTIONS || availabilities.length < MIN_AVAILABILITIES || people.length < MIN_PEOPLE;
        if (needsDeepBackfill) {
            const deepArticles = filterArticlesByTimeRange(articles, 30 * 24);
            const deepRegional = deepArticles.filter(isTargetRegion).filter(a => !usedIds.has(a.id || a.link) && a.category !== 'exclude');
            // Broader pool for relevant: not excluded region (national OK, but no Alabama/Texas/etc.)
            const deepNotExcluded = deepArticles.filter(a => !usedIds.has(a.id || a.link) && a.category !== 'exclude').filter(isNotExcludedRegion);
            console.log(`📅 Deep backfill (30-day window): ${deepRegional.length} regional, ${deepNotExcluded.length} not-excluded`);

            const deepFill = (section: NormalizedItem[], min: number,
                filterFn: (items: NormalizedItem[]) => NormalizedItem[], label: string,
                pool: NormalizedItem[]) => {
                if (section.length >= min) return;
                const candidates = filterFn(pool.filter(a => !usedIds.has(a.id || a.link)));
                console.log(`🔎 Deep backfill ${label}: ${section.length} < ${min}, found ${candidates.length} in 30-day pool`);
                for (const a of candidates) {
                    if (section.length >= min) break;
                    section.push(a);
                    usedIds.add(a.id || a.link);
                }
            };

            // Each deep backfill must restrict to its own category — otherwise an article
            // tagged as 'transactions' could be pulled into 'relevant' (or vice versa) just
            // because it matches the section's keyword filter.
            deepFill(relevant, MIN_RELEVANT,
                (items) => applyStrictFilter(items.filter(a => a.category === 'relevant'), RELEVANT_KEYWORDS, 'Relevant (deep)'), 'relevant', deepNotExcluded);
            deepFill(transactions, MIN_TRANSACTIONS,
                (items) => applyTransactionFilter(items.filter(a => a.category === 'transactions')), 'transactions', deepRegional);
            deepFill(availabilities, MIN_AVAILABILITIES,
                (items) => applyAvailabilityFilter(items.filter(a => a.category === 'availabilities')), 'availabilities', deepRegional);
            deepFill(people, MIN_PEOPLE,
                (items) => applyPeopleFilter(items.filter(a => a.category === 'people')), 'people', deepRegional);
        }

        // ============================================================================
        // TIER 4: RESERVE POOL FALLBACK
        // ============================================================================
        // If a section is STILL below minimum after the 30-day deep backfill, pull from
        // docs/preferences/reserve-pool.json — a nightly-curated stockpile of vetted
        // candidates. Items there are pre-filtered (region/industrial/category/dedup)
        // and pre-scored, so we just push them in as-is. This guarantees no section
        // ships empty even when 30 days of fresh content is exhausted (rare, but happens
        // around holidays / slow news weeks).
        const stillNeedsBackfill =
            relevant.length < MIN_RELEVANT ||
            transactions.length < MIN_TRANSACTIONS ||
            availabilities.length < MIN_AVAILABILITIES ||
            people.length < MIN_PEOPLE;
        if (stillNeedsBackfill) {
            try {
                const reservePath = path.join(docsDir, 'preferences', 'reserve-pool.json');
                if (fs.existsSync(reservePath)) {
                    const reserve = JSON.parse(fs.readFileSync(reservePath, 'utf-8'));
                    console.log(`🏪 Tier 4 reserve pool fallback (generated ${reserve.generatedAt})`);
                    const reserveFill = (
                        section: NormalizedItem[],
                        min: number,
                        pool: any[],
                        label: string,
                    ) => {
                        if (section.length >= min || !Array.isArray(pool)) return;
                        const before = section.length;
                        for (const r of pool) {
                            if (section.length >= min) break;
                            const key = r.id || r.url;
                            if (usedIds.has(key)) continue;
                            // Reserve items are NormalizedItem-compatible after this mapping
                            const item: NormalizedItem = {
                                id: r.id,
                                title: r.title,
                                link: r.url,
                                description: '',
                                category: r.category,
                                source: r.source,
                                pubDate: r.date_published,
                                ...(r as any),
                            } as NormalizedItem;
                            section.push(item);
                            usedIds.add(key);
                        }
                        const added = section.length - before;
                        if (added > 0) console.log(`  🏪 Reserve filled ${label}: +${added} (now ${section.length}/${min})`);
                    };
                    reserveFill(relevant, MIN_RELEVANT, reserve.sections?.relevant || [], 'relevant');
                    reserveFill(transactions, MIN_TRANSACTIONS, reserve.sections?.transactions || [], 'transactions');
                    reserveFill(availabilities, MIN_AVAILABILITIES, reserve.sections?.availabilities || [], 'availabilities');
                    reserveFill(people, MIN_PEOPLE, reserve.sections?.people || [], 'people');
                } else {
                    console.log('🏪 Reserve pool not found at', reservePath, '— skipping tier 4');
                }
            } catch (e) {
                console.warn('⚠️ Reserve pool fallback failed:', (e as Error).message);
            }
        }

        // Merge manually included articles from raw picks — but validate region/industrial first
        const includedArticles = loadIncludedArticles(docsDir);
        let includedCount = 0;
        for (const article of includedArticles) {
            const articleKey = article.id || article.link;
            if (usedIds.has(articleKey)) continue;
            // Validate: must be target region or not-excluded, and must be industrial
            const articleText = getText(article);
            if (!isTargetRegion(article) && !isNotExcludedRegion(article)) {
                console.log(`🚫 Included article skipped (wrong region): "${article.title?.substring(0, 60)}"`);
                continue;
            }
            if (isPolitical(articleText)) {
                console.log(`🚫 Included article skipped (political): "${article.title?.substring(0, 60)}"`);
                continue;
            }
            usedIds.add(articleKey);
            const cat = article.category || 'relevant';
            if (cat === 'transactions') transactions.push(article);
            else if (cat === 'availabilities') availabilities.push(article);
            else if (cat === 'people') people.push(article);
            else relevant.push(article);
            includedCount++;
        }
        if (includedArticles.length > 0) {
            console.log(`📌 Merged ${includedCount}/${includedArticles.length} manually included article(s) (${includedArticles.length - includedCount} filtered out)`);
        }

        // Fuzzy dedup: remove articles about the same deal. Uses MULTI-SIGNATURE matching
        // (granular city/county + state-level) so cross-source variants for the same deal
        // collapse — e.g., "Middlesex County" + "Metuchen" + "N.J." all dedup on shared
        // state-nj signature even when their granular codes differ. Without this, the same
        // deal can ship multiple times across days (2026-04-27 and 2026-04-30 incidents).
        const dedupeByDealSignature = (articles: NormalizedItem[], seenSigs: Set<string>): NormalizedItem[] => {
            return articles.filter(a => {
                const sigs = extractDealSignatures(a.title || '', a.description || '');
                if (sigs.length === 0) return true; // no deal signature, keep
                const matched = sigs.find(s => seenSigs.has(s));
                if (matched) {
                    console.log(`🔁 Fuzzy dedup removed: "${a.title?.substring(0, 60)}" (same deal: ${matched})`);
                    return false;
                }
                sigs.forEach(s => seenSigs.add(s));
                return true;
            });
        };
        const dealSigs = new Set<string>();
        // Dedup transactions first (highest priority for deal articles), then others
        transactions = dedupeByDealSignature(transactions, dealSigs);
        availabilities = dedupeByDealSignature(availabilities, dealSigs);
        relevant = dedupeByDealSignature(relevant, dealSigs);

        // Title-based dedup: catch same article from different sources (e.g. GlobeSt direct + Google News)
        const dedupeByTitle = (allSections: NormalizedItem[][]): void => {
            const seenTitles: string[] = [];
            const normalize = (t: string) => t.toLowerCase().replace(/\s*[-–—|]\s*(globest|costar|msn|yahoo|bisnow|commercialsearch|rebusinessonline|connect cre|the business journals|commercial observer|ad hoc news|law360|investing\.com|finimize|nareit|loopnet|tapinto).*$/i, '').replace(/^news\s*\|\s*/i, '').trim();

            for (const section of allSections) {
                for (let i = section.length - 1; i >= 0; i--) {
                    const norm = normalize(section[i].title || '');
                    const isDupe = seenTitles.some(prev => {
                        if (norm === prev) return true;
                        // Check if one title contains the other (catches partial matches)
                        if (norm.length > 20 && prev.length > 20) {
                            const shorter = norm.length < prev.length ? norm : prev;
                            const longer = norm.length < prev.length ? prev : norm;
                            if (longer.includes(shorter)) return true;
                        }
                        return false;
                    });
                    if (isDupe) {
                        console.log(`🔁 Title dedup removed: "${section[i].title?.substring(0, 60)}" (duplicate title)`);
                        section.splice(i, 1);
                    } else {
                        seenTitles.push(norm);
                    }
                }
            }
        };
        dedupeByTitle([transactions, relevant, availabilities, people]);

        // Quality scoring: rank articles so the best survive the cap
        // Weights are loaded from docs/scoring-weights.json (updated by Groq learning loop)
        const weights = loadScoringWeights();

        const scoreArticle = (a: NormalizedItem): number => {
            let score = 0;
            const text = `${a.title || ''} ${a.description || ''}`.toLowerCase();
            const url = (a.link || a.url || '').toLowerCase();

            // Region bonus (dynamic weights from scoring-weights.json)
            const njWeight = weights.regionWeights['NJ'] ?? 30;
            const paWeight = weights.regionWeights['PA'] ?? 25;
            const flWeight = weights.regionWeights['FL'] ?? 20;
            if (/new jersey|nj |newark|edison|rahway|carlstadt|piscataway|meadowlands|exit \d/i.test(text)) score += njWeight;
            if (/pennsylvania|philadelphia|philly|allentown|lehigh/i.test(text)) score += paWeight;
            if (/florida|miami|orlando|doral|jacksonville|tampa|broward/i.test(text)) score += flWeight;

            // Deal size bonus (dynamic thresholds)
            const highSF = weights.dealSizeThresholds?.highValue_SF ?? 100000;
            const highDollars = weights.dealSizeThresholds?.highValue_dollars ?? 50000000;
            const sfMatch = text.match(/([\d,.]+)\s*(?:million\s*)?(?:sf|sq\.?\s*f|square\s*f)/i);
            if (sfMatch) {
                const sf = parseFloat(sfMatch[1].replace(/,/g, ''));
                if (sf >= highSF * 5) score += 25;
                else if (sf >= highSF) score += 15;
                else if (sf >= highSF * 0.5) score += 5;
            }
            const dollarMatch = text.match(/\$([\d,.]+)\s*(?:million|m(?:il|ln)?|billion|b(?:il|ln)?)\b/i);
            if (dollarMatch) {
                const amt = parseFloat(dollarMatch[1].replace(/,/g, ''));
                const mult = /billion|b(?:il|ln)?\b/i.test(dollarMatch[2]) ? 1000 : 1;
                const millions = amt * mult;
                const highM = highDollars / 1000000;
                if (millions >= highM * 2) score += 25;
                else if (millions >= highM * 0.5) score += 15;
                else if (millions >= highM * 0.2) score += 5;
            }

            // Key company bonus (dynamic from weights)
            const companies = weights.companyBonus ?? {};
            for (const [company, bonus] of Object.entries(companies)) {
                if (text.includes(company.toLowerCase())) {
                    score += bonus;
                    break; // Only count best company match
                }
            }

            // Source bonus (dynamic from weights)
            const sourceWeights = weights.sourceWeights ?? {};
            let sourceMatched = false;
            for (const [domain, bonus] of Object.entries(sourceWeights)) {
                if (url.includes(domain)) {
                    score += bonus;
                    sourceMatched = true;
                    break;
                }
            }
            // Default: non-Google-News sources get a bonus
            if (!sourceMatched && !url.includes('news.google.com')) score += 10;

            // Has description bonus (richer content)
            if ((a.description || '').length > 50) score += 5;

            // Recency bonus (newer articles score slightly higher)
            const pub = a.pubDate || a.date_published || '';
            if (pub) {
                const hoursAgo = (Date.now() - new Date(pub).getTime()) / (1000 * 60 * 60);
                if (hoursAgo < 12) score += 10;
                else if (hoursAgo < 24) score += 5;
            }

            // Learned exclusions penalty
            const exclusions = weights.learnedExclusions ?? [];
            for (const exclusion of exclusions) {
                if (text.includes(exclusion.toLowerCase())) {
                    score -= 20;
                    break;
                }
            }

            return score;
        };

        // Sort each section by quality score (highest first)
        const sortByScore = (articles: NormalizedItem[]) => {
            return articles.sort((a, b) => scoreArticle(b) - scoreArticle(a));
        };
        relevant = sortByScore(relevant);
        transactions = sortByScore(transactions);
        availabilities = sortByScore(availabilities);
        people = sortByScore(people);

        // Log top scores for debugging
        if (relevant.length > 0) console.log(`🏆 Top relevant: "${relevant[0].title?.substring(0, 50)}" (score: ${scoreArticle(relevant[0])})`);
        if (transactions.length > 0) console.log(`🏆 Top transaction: "${transactions[0].title?.substring(0, 50)}" (score: ${scoreArticle(transactions[0])})`);

        // Cap each section (best articles survive)
        relevant = relevant.slice(0, MAX_PER_SECTION);
        transactions = transactions.slice(0, MAX_PER_SECTION);
        availabilities = availabilities.slice(0, MAX_AVAILABILITIES);
        people = people.slice(0, MAX_PER_SECTION);

        // === FINAL GATE: ALLOWLIST approach — articles must PROVE they belong ===
        // Instead of trying to block every bad region (whack-a-mole), we require articles to match
        // at least one of: target region, trusted source, or national macro topic.
        const TRUSTED_DIRECT_SOURCES = new Set([
            're-nj.com', 'roi-nj.com', 'bisnow.com', 'globest.com', 'commercialsearch.com',
            'commercialobserver.com', 'connectcre.com', 'credaily.com', 'supplychaindive.com',
            'supplychainbrain.com', 'freightwaves.com', 'blog.naiop.org', 'commercialcafe.com',
            'areadevelopment.com', 'rejournals.com', 'ir.prologis.com', 'lvb.com', 'njbiz.com',
            'dcvelocity.com', 'logisticsmgmt.com', 'cpexecutive.com',
        ]);

        const TARGET_REGION_PATTERN = /\b(new jersey|nj|newark|edison|carlstadt|rahway|piscataway|parsippany|robbinsville|hamilton|monmouth|somerset|harrison|wall twp|north bergen|garwood|linden|moonachie|cranbury|green brook|clark|freehold|exit \d|meadowlands|turnpike|route 1|i-95|i-78|i-287|pennsylvania|philadelphia|philly|allentown|lehigh|morrisville|bucks county|montgomery county|chester county|delaware county|pittsburgh|florida|miami|orlando|doral|jacksonville|tampa|broward|pompano|hialeah|medley|fort lauderdale|palm beach|miami-dade|duval|hillsborough|orange county, fl)\b/i;

        const NATIONAL_MACRO_PATTERN = /\b(interest rates?|cap rates?|vacancy rates?|absorption|industrial market|warehouse market|warehouse demand|logistics market|reit|industrial reit|supply chain|freight market|e-commerce|automation|robotics|build-to-suit|spec development|industrial outlook|market report|quarterly report|national industrial|us industrial|u\.s\. industrial|industrial sector|logistics sector|warehouse sector|industrial fund|industrial portfolio|industrial real estate|warehouse real estate|big.?box|shallow.?bay|last.?mile|cold storage market)\b/i;

        const finalGate = (articles: NormalizedItem[], sectionName: string): NormalizedItem[] => {
            return articles.filter(a => {
                const text = `${a.title || ''} ${a.description || ''} ${(a as any).content_text || ''}`;
                const url = (a.link || a.url || '').toLowerCase();
                const source = (a.source || (a as any)._source?.website || '').toLowerCase();

                // Re-run the industrial content check (catches pharma, residential, restaurants)
                if (!isStrictlyIndustrial(text)) {
                    console.log(`🚫 FINAL GATE blocked (not industrial): "${a.title?.substring(0, 60)}" [${sectionName}]`);
                    return false;
                }

                // ALLOWLIST CHECK: article must prove it belongs via one of 3 paths
                const hasTargetRegion = TARGET_REGION_PATTERN.test(text);
                const isTrustedSource = TRUSTED_DIRECT_SOURCES.has(source) ||
                    [...TRUSTED_DIRECT_SOURCES].some(d => url.includes(d));
                const isNationalMacro = NATIONAL_MACRO_PATTERN.test(text);

                if (!hasTargetRegion && !isTrustedSource && !isNationalMacro) {
                    console.log(`🚫 FINAL GATE blocked (no target region, not trusted source, not macro): "${a.title?.substring(0, 60)}" [${sectionName}]`);
                    return false;
                }

                // LoopNet listings: must be NJ/PA/FL explicitly (not just passing the general allowlist)
                const titleText = (a.title || '');
                if (/loopnet/i.test(titleText)) {
                    if (!hasTargetRegion) {
                        console.log(`🚫 FINAL GATE blocked (LoopNet non-target): "${titleText.substring(0, 60)}" [${sectionName}]`);
                        return false;
                    }
                }

                // Fix Google News articles with no real description (title repeated as desc)
                // Instead of blocking, clean up the description so the article can still be sent
                if (url.includes('news.google.com')) {
                    const title = (a.title || '').trim();
                    const desc = (a.description || (a as any).content_text || '').trim();
                    const titleNorm = title.toLowerCase().replace(/[^\w\s]/g, '').trim();
                    const descNorm = desc.toLowerCase().replace(/[^\w\s]/g, '').trim();
                    if (descNorm.startsWith(titleNorm.substring(0, 30)) && descNorm.length < titleNorm.length + 40) {
                        // Clean up: strip source suffix from title to make a passable description
                        const cleaned = title.replace(/\s*[-–—|]\s*(CoStar|GlobeSt|MSN|Yahoo|Bisnow|CommercialSearch|REBusinessOnline|Connect CRE|The Business Journals|Commercial Observer|Supply Chain Dive|FreightWaves|Real Estate NJ|WSJ|Law360|LoopNet|AD HOC NEWS).*$/i, '').trim();
                        a.description = cleaned;
                        (a as any).content_text = cleaned;
                        console.log(`📝 FINAL GATE cleaned description: "${title.substring(0, 60)}" [${sectionName}]`);
                    }
                }

                return true;
            });
        };

        relevant = finalGate(relevant, 'Relevant');
        transactions = finalGate(transactions, 'Transactions');
        availabilities = finalGate(availabilities, 'Availabilities');
        people = finalGate(people, 'People');

        console.log(`📋 Work newsletter (${timeRange}h range, max ${MAX_PER_SECTION}/section):`);
        console.log(`  - Relevant News: ${relevant.length} (min ${MIN_RELEVANT})`);
        console.log(`  - Transactions: ${transactions.length} (min ${MIN_TRANSACTIONS})`);
        console.log(`  - Availabilities: ${availabilities.length} (min ${MIN_AVAILABILITIES})`);
        console.log(`  - People: ${people.length} (min ${MIN_PEOPLE})`);

        const totalArticles = relevant.length + transactions.length + availabilities.length + people.length;
        if (totalArticles === 0) {
            console.log('⚠️ No articles to send - skipping Work newsletter');
            return true;
        }

        // Friday Week-in-Review: TOP articles from each day this week (Mon-Fri)
        // Reads from docs/weekly-top-articles.json which stores each day's sent articles
        let weekInReview: NormalizedItem[] | undefined;
        if (isFriday) {
            console.log('📅 Friday detected — building Week-in-Review from daily top articles');
            // Load excluded-articles.json so leaks that shipped earlier in the week (and
            // were retroactively cleaned up) don't resurface in the Week-in-Review pick.
            // Without this filter, an article we removed from feed.json + feed UI but
            // already recorded in weekly-top-articles.json would still be a candidate.
            const excludedIds = new Set<string>();
            try {
                const excludedPath = path.resolve(__dirname, '..', '..', 'docs', 'excluded-articles.json');
                const excluded = JSON.parse(fs.readFileSync(excludedPath, 'utf-8'));
                (excluded.excludedIds || []).forEach((id: string) => excludedIds.add(id));
            } catch { /* file optional */ }
            try {
                const weeklyPath = path.resolve(__dirname, '..', '..', 'docs', 'weekly-top-articles.json');
                const weeklyData = JSON.parse(fs.readFileSync(weeklyPath, 'utf-8'));
                const allWeekArticles: NormalizedItem[] = [];

                // Collect articles from each day this week
                const days = Object.keys(weeklyData.week || {}).sort();
                for (const day of days) {
                    const dayArticles = (weeklyData.week[day] || [])
                        .filter((a: any) => !excludedIds.has(a.id));
                    console.log(`📊 ${day}: ${dayArticles.length} articles${excludedIds.size > 0 ? ` (after excluded-IDs filter)` : ''}`);
                    for (const a of dayArticles) {
                        allWeekArticles.push({
                            id: a.id,
                            title: a.title,
                            link: a.link || a.url,
                            url: a.link || a.url,
                            category: a.category,
                            description: a.description || '',
                            source: a.source,
                            tags: a.region ? [a.region] : [],
                            date_published: a.date_published || day,
                            pubDate: a.date_published || day,
                        } as NormalizedItem);
                    }
                }

                // Score all week's articles and pick top 5
                allWeekArticles.sort((a, b) => scoreArticle(b) - scoreArticle(a));
                weekInReview = allWeekArticles.slice(0, 5);

                weekInReview.forEach((a, i) => {
                    console.log(`📊 Week #${i + 1}: score=${scoreArticle(a)} | "${(a.title || '').substring(0, 55)}"`);
                });
                console.log(`📊 Week-in-Review: ${weekInReview.length} top from ${allWeekArticles.length} total across ${days.length} days`);
            } catch (e) {
                console.warn('⚠️ Could not load weekly-top-articles.json, falling back to feed scan');
                // Fallback: scan feed for last 5 days
                const fiveDayArticles = filterArticlesByTimeRange(articles, 5 * 24);
                weekInReview = fiveDayArticles
                    .filter(isNotExcludedRegion)
                    .filter(a => !isPolitical(getText(a)))
                    .sort((a, b) => scoreArticle(b) - scoreArticle(a))
                    .slice(0, 5);
                console.log(`📊 Week-in-Review (fallback): ${weekInReview.length} articles from feed`);
            }
        }

        const dateRange = formatDate(today);

        // Clean URLs + generate AI descriptions
        const allNewsletterArticles = [...relevant, ...transactions, ...availabilities, ...people];
        allNewsletterArticles.forEach(cleanArticleUrl);
        await generateDescriptions(allNewsletterArticles);

        // Post-description regional re-check
        relevant = relevant.filter(postDescriptionRegionCheck);
        transactions = transactions.filter(postDescriptionRegionCheck);
        availabilities = availabilities.filter(postDescriptionRegionCheck);
        people = people.filter(postDescriptionRegionCheck);

        // Second backfill: post-desc filtering can drop sections below minimum,
        // so refill from unused articles that also pass post-desc check
        const usedIdsPostDesc = new Set([...relevant, ...transactions, ...availabilities, ...people].map(a => a.id || a.link));
        const regionalPostDescPool = regionalArticles
            .filter(a => !usedIdsPostDesc.has(a.id || a.link) && a.category !== 'exclude')
            .filter(postDescriptionRegionCheck);
        // Broader pool for relevant (macro/national OK, but no excluded regions)
        const allPostDescPool = recentArticles
            .filter(a => !usedIdsPostDesc.has(a.id || a.link) && a.category !== 'exclude')
            .filter(isNotExcludedRegion)
            .filter(postDescriptionRegionCheck);

        const refillSection = (
            section: NormalizedItem[], min: number,
            filterFn: (items: NormalizedItem[]) => NormalizedItem[], label: string,
            pool: NormalizedItem[]
        ) => {
            if (section.length >= min) return;
            const candidates = filterFn(pool.filter(a => !usedIdsPostDesc.has(a.id || a.link)));
            if (candidates.length > 0) {
                console.log(`🔄 Post-desc refill ${label}: ${section.length} < ${min}, found ${candidates.length} candidates`);
            }
            for (const a of candidates) {
                if (section.length >= min) break;
                section.push(a);
                usedIdsPostDesc.add(a.id || a.link);
            }
        };

        refillSection(relevant, MIN_RELEVANT,
            (items) => applyStrictFilter(items, RELEVANT_KEYWORDS, 'Relevant (refill)'), 'relevant', allPostDescPool);
        refillSection(transactions, MIN_TRANSACTIONS, applyTransactionFilter, 'transactions', regionalPostDescPool);
        refillSection(availabilities, MIN_AVAILABILITIES, applyAvailabilityFilter, 'availabilities', regionalPostDescPool);
        refillSection(people, MIN_PEOPLE, applyPeopleFilter, 'people', regionalPostDescPool);

        // Deep post-desc refill: if sections still below minimum, try 30-day pool with descriptions
        const stillNeedsDeep = relevant.length < MIN_RELEVANT || transactions.length < MIN_TRANSACTIONS || availabilities.length < MIN_AVAILABILITIES || people.length < MIN_PEOPLE;
        if (stillNeedsDeep) {
            const deepArticles7d = filterArticlesByTimeRange(articles, 30 * 24);
            const deepUnused = deepArticles7d.filter(a => !usedIdsPostDesc.has(a.id || a.link) && a.category !== 'exclude');
            const deepRegional7d = deepUnused.filter(isTargetRegion);
            if (deepUnused.length > 0) {
                console.log(`📅 Deep post-desc refill: ${deepRegional7d.length} regional, ${deepUnused.length} total from 30-day pool`);
                // Generate descriptions for deep candidates before post-desc check
                const deepCandidates = [
                    ...applyStrictFilter(deepUnused.filter(isNotExcludedRegion), RELEVANT_KEYWORDS, 'Relevant (deep-pd)'),
                    ...applyTransactionFilter(deepRegional7d),
                    ...applyAvailabilityFilter(deepRegional7d),
                    ...applyPeopleFilter(deepRegional7d),
                ].filter(a => !usedIdsPostDesc.has(a.id || a.link));
                if (deepCandidates.length > 0) {
                    deepCandidates.forEach(cleanArticleUrl);
                    await generateDescriptions(deepCandidates);
                    const deepPostDescPool = deepCandidates.filter(postDescriptionRegionCheck);
                    const deepPostDescRegional = deepPostDescPool.filter(isTargetRegion);

                    refillSection(relevant, MIN_RELEVANT,
                        (items) => applyStrictFilter(items, RELEVANT_KEYWORDS, 'Relevant (deep-pd)'), 'relevant', deepPostDescPool);
                    refillSection(transactions, MIN_TRANSACTIONS, applyTransactionFilter, 'transactions', deepPostDescRegional);
                    refillSection(availabilities, MIN_AVAILABILITIES, applyAvailabilityFilter, 'availabilities', deepPostDescRegional);
                    refillSection(people, MIN_PEOPLE, applyPeopleFilter, 'people', deepPostDescRegional);
                }
            }
        }

        const postFilterTotal = relevant.length + transactions.length + availabilities.length + people.length;
        if (postFilterTotal === 0) {
            console.log('⚠️ All articles removed by post-description region check — skipping Work newsletter');
            return true;
        }

        // Sort by deal size then date
        relevant.sort(sortByDealThenDate);
        transactions.sort(sortByDealThenDate);
        availabilities.sort(sortByDealThenDate);

        const html = buildWorkBriefing(relevant, transactions, availabilities, people, dateRange, weekInReview);
        const recipients = getRecipients();
        const subject = isFriday
            ? `Woodmont Industrial Partners — Weekly Industrial News Briefing`
            : `Woodmont Industrial Partners — Daily Industrial News Briefing`;

        console.log(`📤 Sending Work newsletter to ${recipients.length} recipient(s)...`);
        const success = await sendEmail(recipients, subject, html);
        if (success) {
            // Save sent article IDs + their deal signatures to prevent repeats in future
            // newsletters. The signatures enable cross-day fuzzy dedup so the same deal
            // reported by a different source on a later day won't slip through.
            const allSentArticles = [...relevant, ...transactions, ...availabilities, ...people];
            const sentItems = allSentArticles
                .map(a => ({
                    id: a.id || a.link || '',
                    sigs: extractDealSignatures(a.title || '', (a as any).description || (a as any).summary || ''),
                }))
                .filter(item => item.id);
            saveSentArticles(docsDir, sentItems);

            if (includedArticles.length > 0) {
                clearIncludedArticles(docsDir);
            }
        }
        console.log(success ? `✅ Work ${isFriday ? 'weekly' : 'daily'} newsletter sent!` : '❌ Failed to send Work newsletter');
        return success;
    } catch (error) {
        console.error('❌ Error in sendDailyNewsletterWork:', error);
        return false;
    }
}
