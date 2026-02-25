import { NormalizedItem } from '../types/index.js';
import { buildBriefing } from './newsletter.js';
import { buildGothBriefing } from './newsletter-goth.js';
import { buildWorkBriefing } from './newsletter-work.js';
import { generateDescriptions } from '../filter/description-generator.js';
import { RELEVANT_KEYWORDS } from '../shared/region-data.js';
import { cleanArticleUrl } from '../shared/url-utils.js';
import {
    getText, containsAny, isPolitical, isTargetRegion,
    applyStrictFilter, applyTransactionFilter, applyAvailabilityFilter, applyPeopleFilter,
    reCategorizeRelevantAsPeople,
    postDescriptionRegionCheck, loadArticlesFromFeed, filterArticlesByTimeRange,
    sortByDealThenDate, getValidDate, mapFeedItemsToArticles,
    loadIncludedArticles, clearIncludedArticles,
    loadSentArticles, saveSentArticles
} from './newsletter-filters.js';
import { meetsDealThreshold } from '../shared/deal-threshold.js';

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
            const isMonday = now.getDay() === 1;
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

        if (isWeekly) {
            // Weekly: no region filter, just categorize
            transactions = recentArticles.filter(a => a.category === 'transactions');
            availabilities = recentArticles.filter(a => a.category === 'availabilities');
            relevant = recentArticles.filter(a => a.category === 'relevant');
            people = recentArticles.filter(a => a.category === 'people');
        } else {
            // Daily: simple region filter + industrial filter
            const targetRegionsSimple = ['NJ', 'PA', 'FL', 'New Jersey', 'Pennsylvania', 'Florida'];
            const isSimpleTargetRegion = (article: NormalizedItem): boolean => {
                if (article.regions && article.regions.length > 0) {
                    return article.regions.some(r => targetRegionsSimple.some(tr => r.toUpperCase().includes(tr.toUpperCase())));
                }
                const text = `${article.title || ''} ${article.description || ''} ${(article as any).summary || ''}`.toUpperCase();
                return targetRegionsSimple.some(r => text.includes(r.toUpperCase()));
            };

            const regionalArticles = recentArticles.filter(isSimpleTargetRegion);
            console.log(`🎯 Regional filter (NJ, PA, FL): ${recentArticles.length} → ${regionalArticles.length}`);

            const excludeNonIndustrial = ['office lease', 'office building', 'multifamily', 'apartment', 'residential', 'retail', 'hotel', 'hospitality', 'self-storage'];
            const industrialKw = ['warehouse', 'logistics', 'distribution', 'manufacturing', 'cold storage', 'fulfillment', 'industrial'];
            const getTextSimple = (a: NormalizedItem) => `${a.title || ''} ${a.description || ''}`.toLowerCase();
            const containsAnySimple = (text: string, kw: string[]) => kw.some(k => text.includes(k));
            const isIndustrialSimple = (text: string) => containsAnySimple(text, industrialKw) || !containsAnySimple(text, excludeNonIndustrial);

            transactions = regionalArticles.filter(a => a.category === 'transactions').filter(a => {
                const text = getTextSimple(a);
                if (!isIndustrialSimple(text)) return false;
                const threshold = meetsDealThreshold(text);
                return threshold.meetsSF || threshold.meetsDollar || (threshold.sizeSF !== null && threshold.sizeSF > 0);
            });

            availabilities = regionalArticles.filter(a => a.category === 'availabilities').filter(a => {
                const text = getTextSimple(a);
                if (!isIndustrialSimple(text)) return false;
                const threshold = meetsDealThreshold(text);
                return threshold.meetsSF || (threshold.sizeSF !== null && threshold.sizeSF > 0);
            });

            relevant = regionalArticles.filter(a => a.category === 'relevant');
            people = regionalArticles.filter(a => a.category === 'people');
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

        // Re-categorize: move people articles out of "relevant" into "people"
        const reCatGoth = reCategorizeRelevantAsPeople(relevant, people);
        relevant = reCatGoth.relevant;
        people = reCatGoth.people;

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

        // Filter out previously sent articles to prevent day-to-day repeats
        const sentArticleIds = loadSentArticles(docsDir);
        const articles = allLoadedArticles.filter(a => {
            const id = a.id || a.link || '';
            return !sentArticleIds.has(id);
        });
        const dedupRemoved = allLoadedArticles.length - articles.length;
        if (dedupRemoved > 0) console.log(`🔁 Dedup: removed ${dedupRemoved} previously sent article(s)`);

        const now = new Date();
        const today = new Date();
        const isFriday = today.getDay() === 5;
        const isMonday = today.getDay() === 1;

        // Constants for section minimums and caps
        const MIN_RELEVANT = 4;
        const MIN_OTHER = 2;
        const MAX_PER_SECTION = 6;

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

        if (sections24.relevant.length >= MIN_RELEVANT && sections24.transactions.length >= MIN_OTHER) {
            timeRange = 24;
            recentArticles = recent24;
            regionalArticles = regional24;
            console.log('📊 Enough articles in 24h, using narrower range');
        }
        console.log(`🎯 Regional filter (NJ, PA, FL): ${recentArticles.length} → ${regionalArticles.length}`);

        // Apply strict section filters
        let relevant = applyStrictFilter(regionalArticles.filter(a => a.category === 'relevant'), RELEVANT_KEYWORDS, 'Relevant');
        let transactions = applyTransactionFilter(regionalArticles.filter(a => a.category === 'transactions'));
        let availabilities = applyAvailabilityFilter(regionalArticles.filter(a => a.category === 'availabilities'));
        let people = applyPeopleFilter(regionalArticles.filter(a => a.category === 'people'));

        // Re-categorize: move people articles out of "relevant" into "people"
        const reCat = reCategorizeRelevantAsPeople(relevant, people);
        relevant = reCat.relevant;
        people = reCat.people;

        // Fill empty sections from ALL regional articles
        const usedIds = new Set([...relevant, ...transactions, ...availabilities, ...people].map(a => a.id || a.link));
        const addFromAllSources = (
            section: NormalizedItem[], min: number,
            filterFn: (items: NormalizedItem[]) => NormalizedItem[], label: string
        ) => {
            if (section.length >= min) return;
            const candidates = filterFn(regionalArticles.filter(a => !usedIds.has(a.id || a.link)));
            console.log(`⚠️ Only ${section.length} ${label} — found ${candidates.length} from all sources`);
            for (const a of candidates) {
                if (section.length >= min) break;
                section.push(a);
                usedIds.add(a.id || a.link);
            }
        };

        addFromAllSources(relevant, MIN_RELEVANT,
            (items) => applyStrictFilter(items, RELEVANT_KEYWORDS, 'Relevant (backfill)'), 'relevant');
        addFromAllSources(transactions, MIN_OTHER, applyTransactionFilter, 'transactions');
        addFromAllSources(availabilities, MIN_OTHER, applyAvailabilityFilter, 'availabilities');
        addFromAllSources(people, MIN_OTHER, applyPeopleFilter, 'people');

        // Merge manually included articles from raw picks
        const includedArticles = loadIncludedArticles(docsDir);
        for (const article of includedArticles) {
            const articleKey = article.id || article.link;
            if (usedIds.has(articleKey)) continue;
            usedIds.add(articleKey);
            const cat = article.category || 'relevant';
            if (cat === 'transactions') transactions.push(article);
            else if (cat === 'availabilities') availabilities.push(article);
            else if (cat === 'people') people.push(article);
            else relevant.push(article);
        }
        if (includedArticles.length > 0) {
            console.log(`📌 Merged ${includedArticles.length} manually included article(s)`);
        }

        // Cap each section
        relevant = relevant.slice(0, MAX_PER_SECTION);
        transactions = transactions.slice(0, MAX_PER_SECTION);
        availabilities = availabilities.slice(0, MAX_PER_SECTION);
        people = people.slice(0, MAX_PER_SECTION);

        console.log(`📋 Work newsletter (${timeRange}h range, max ${MAX_PER_SECTION}/section):`);
        console.log(`  - Relevant News: ${relevant.length} (min ${MIN_RELEVANT})`);
        console.log(`  - Transactions: ${transactions.length} (min ${MIN_OTHER})`);
        console.log(`  - Availabilities: ${availabilities.length} (min ${MIN_OTHER})`);
        console.log(`  - People: ${people.length} (min ${MIN_OTHER})`);

        const totalArticles = relevant.length + transactions.length + availabilities.length + people.length;
        if (totalArticles === 0) {
            console.log('⚠️ No articles to send - skipping Work newsletter');
            return true;
        }

        // Friday Week-in-Review: pull top 5 from the past 5 days
        let weekInReview: NormalizedItem[] | undefined;
        if (isFriday) {
            console.log('📅 Friday detected — building Week-in-Review (top 5 from last 5 days)');
            const fiveDayArticles = filterArticlesByTimeRange(articles, 5 * 24);
            const weekRegional = fiveDayArticles.filter(isTargetRegion).filter(a => !isPolitical(getText(a)));
            const weekTransactions = weekRegional.filter(a => a.category === 'transactions');
            const weekRelevant = weekRegional.filter(a => a.category === 'relevant');
            const weekOther = weekRegional.filter(a => a.category !== 'transactions' && a.category !== 'relevant');
            weekInReview = [...weekTransactions, ...weekRelevant, ...weekOther].slice(0, 5);
            console.log(`📊 Week-in-Review: ${weekInReview.length} top developments`);
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
            // Save sent article IDs to prevent repeats in future newsletters
            const allSentArticles = [...relevant, ...transactions, ...availabilities, ...people];
            const sentIds = allSentArticles.map(a => a.id || a.link || '').filter(id => id);
            saveSentArticles(docsDir, sentIds);

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
