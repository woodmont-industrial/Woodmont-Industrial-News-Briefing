import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NormalizedItem } from '../types/index.js';
import { buildBriefing } from './newsletter.js';
import { buildGothBriefing } from './newsletter-goth.js';

// Send email using NodeMailer
export async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
    try {
        // Dynamic import to avoid requiring it if not used
        const nodemailer = require('nodemailer');

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || '',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || '',
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'Woodmont Daily Briefing <operationssupport@woodmontproperties.com>',
            to: to.join(', '),
            subject: subject,
            html: html,
        };

        console.log('SMTP Config:', {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            user: process.env.SMTP_USER,
            from: process.env.EMAIL_FROM,
            to: to.join(', ')
        });
        console.log('Mail Options:', { subject, to: to.join(', '), htmlLength: html.length });

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        console.log('Full email info:', info);
        return true;
    } catch (error) {
        console.error('Failed to send email:', error);
        return false;
    }
}

/**
 * Send daily newsletter with categorized articles
 * - Monday-Thursday: 48 hours coverage
 * - Friday: 7 days (weekly recap)
 */
export async function sendDailyNewsletter(): Promise<boolean> {
    try {
        console.log('📧 Preparing daily newsletter...');

        // Get the directory of this file
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        // Load articles from feed.json
        const feedPath = path.join(__dirname, '../../docs/feed.json');
        console.log('📂 Loading articles from:', feedPath);

        if (!fs.existsSync(feedPath)) {
            console.error('❌ Feed file not found:', feedPath);
            return false;
        }

        const feedData = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
        const allArticles: NormalizedItem[] = feedData.items || [];

        console.log(`📊 Total articles loaded: ${allArticles.length}`);

        const today = new Date();
        const dayOfWeek = today.getDay();
        console.log(`📅 Today is ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek]}`);

        // First, try 24 hours coverage
        const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const articles24h = allArticles.filter(article => {
            const pubDate = new Date(article.pubDate || article.date_published || 0);
            return pubDate >= cutoff24h;
        });

        // Count relevant articles in last 24 hours
        const relevant24h = articles24h.filter(a => a.category === 'relevant');
        console.log(`📊 Relevant articles in last 24 hours: ${relevant24h.length}`);

        // If 3 or fewer relevant articles, expand to 48 hours
        const needsMoreContent = relevant24h.length <= 3;
        const hoursBack = needsMoreContent ? 48 : 24;
        const periodLabel = needsMoreContent ? '48 hours' : '24 hours';

        if (needsMoreContent) {
            console.log(`📈 Only ${relevant24h.length} relevant articles in 24h - expanding to 48 hours`);
        } else {
            console.log(`✅ ${relevant24h.length} relevant articles in 24h - using 24 hour coverage`);
        }

        // Filter for recent articles based on determined coverage period
        const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        const recentArticles = allArticles.filter(article => {
            const pubDate = new Date(article.pubDate || article.date_published || 0);
            return pubDate >= cutoffDate;
        });

        console.log(`📅 Articles from last ${periodLabel}: ${recentArticles.length}`);

        // Categorize articles
        const transactions = recentArticles.filter(a => a.category === 'transactions');
        const availabilities = recentArticles.filter(a => a.category === 'availabilities');
        let relevant = recentArticles.filter(a => a.category === 'relevant');
        const people = recentArticles.filter(a => a.category === 'people');

        // Target regions for strict filtering
        const targetRegions = ['NJ', 'PA', 'FL', 'New Jersey', 'Pennsylvania', 'Florida'];

        // Helper to check if article is in target regions
        const isTargetRegion = (article: NormalizedItem): boolean => {
            // Check regions array
            if (article.regions && article.regions.length > 0) {
                return article.regions.some(r =>
                    targetRegions.some(tr => r.toUpperCase().includes(tr.toUpperCase()))
                );
            }
            // Check title and description for region mentions
            const text = `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toUpperCase();
            return targetRegions.some(r => text.includes(r.toUpperCase()));
        };

        // If 5+ relevant articles, apply strict regional filter for industrial news
        if (relevant.length >= 5) {
            const filteredRelevant = relevant.filter(isTargetRegion);
            console.log(`🎯 5+ relevant articles (${relevant.length}) - applying regional filter (NJ, NY, PA, TX, FL)`);
            console.log(`   Filtered from ${relevant.length} to ${filteredRelevant.length} regional articles`);
            // Only apply filter if we still have at least 3 articles after filtering
            if (filteredRelevant.length >= 3) {
                relevant = filteredRelevant;
            } else {
                console.log(`   ⚠️ Too few regional articles (${filteredRelevant.length}), keeping all ${relevant.length}`);
            }
        } else {
            console.log(`📰 Fewer than 5 relevant articles (${relevant.length}) - keeping all without regional filter`);
        }

        console.log('📋 Article breakdown:');
        console.log(`  - Transactions: ${transactions.length}`);
        console.log(`  - Availabilities: ${availabilities.length}`);
        console.log(`  - Relevant: ${relevant.length}`);
        console.log(`  - People: ${people.length}`);

        // Generate HTML newsletter
        const html = buildBriefing({
            transactions,
            availabilities,
            relevant,
            people
        }, periodLabel);

        // Get recipient email addresses
        const emailTo = process.env.EMAIL_TO || '';
        if (!emailTo) {
            console.error('❌ No EMAIL_TO configured in environment');
            return false;
        }

        const recipients = emailTo.split(',').map(e => e.trim());
        console.log(`📬 Sending to ${recipients.length} recipient(s):`, recipients);

        // Generate subject with date
        const todayFormatted = today.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const subject = `🏭 Woodmont Industrial News Briefing - ${todayFormatted}`;

        // Send the email
        const success = await sendEmail(recipients, subject, html);

        if (success) {
            console.log('✅ Daily newsletter sent successfully!');
        } else {
            console.log('❌ Failed to send daily newsletter');
        }

        return success;
    } catch (error) {
        console.error('❌ Error in sendDailyNewsletter:', error);
        return false;
    }
}

/**
 * Send weekly newsletter recap every Friday at noon
 * Covers the last 5 days (Monday - Friday)
 */
export async function sendWeeklyNewsletter(): Promise<boolean> {
    try {
        console.log('📧 Preparing weekly newsletter recap...');

        // Get the directory of this file
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        // Load articles from feed.json
        const feedPath = path.join(__dirname, '../../docs/feed.json');
        console.log('📂 Loading articles from:', feedPath);

        if (!fs.existsSync(feedPath)) {
            console.error('❌ Feed file not found:', feedPath);
            return false;
        }

        const feedData = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
        const allArticles: NormalizedItem[] = feedData.items || [];

        console.log(`📊 Total articles loaded: ${allArticles.length}`);

        // Weekly recap covers last 5 days
        const hoursBack = 5 * 24; // 5 days
        const periodLabel = '5 days';

        console.log(`📅 Weekly recap - covering last ${periodLabel}`);

        // Filter for recent articles based on coverage period
        const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        const recentArticles = allArticles.filter(article => {
            const pubDate = new Date(article.pubDate || article.date_published || 0);
            return pubDate >= cutoffDate;
        });

        console.log(`📅 Articles from last ${periodLabel}: ${recentArticles.length}`);

        // Categorize articles
        const transactions = recentArticles.filter(a => a.category === 'transactions');
        const availabilities = recentArticles.filter(a => a.category === 'availabilities');
        const relevant = recentArticles.filter(a => a.category === 'relevant');
        const people = recentArticles.filter(a => a.category === 'people');

        console.log('📋 Article breakdown:');
        console.log(`  - Transactions: ${transactions.length}`);
        console.log(`  - Availabilities: ${availabilities.length}`);
        console.log(`  - Relevant: ${relevant.length}`);
        console.log(`  - People: ${people.length}`);

        // Generate HTML newsletter
        const html = buildBriefing({
            transactions,
            availabilities,
            relevant,
            people
        }, periodLabel);

        // Get recipient email addresses
        const emailTo = process.env.EMAIL_TO || '';
        if (!emailTo) {
            console.error('❌ No EMAIL_TO configured in environment');
            return false;
        }

        const recipients = emailTo.split(',').map(e => e.trim());
        console.log(`📬 Sending to ${recipients.length} recipient(s):`, recipients);

        // Generate subject with date range
        const today = new Date();
        const todayFormatted = today.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const subject = `📊 Woodmont Weekly Recap - ${todayFormatted}`;

        // Send the email
        const success = await sendEmail(recipients, subject, html);

        if (success) {
            console.log('✅ Weekly newsletter sent successfully!');
        } else {
            console.log('❌ Failed to send weekly newsletter');
        }

        return success;
    } catch (error) {
        console.error('❌ Error in sendWeeklyNewsletter:', error);
        return false;
    }
}

/**
 * Send "Goth" daily newsletter - stripped down, boss-approved format
 * Clean, scannable, bullet-point focused
 */
export async function sendDailyNewsletterGoth(): Promise<boolean> {
    try {
        console.log('📧 Preparing Goth daily briefing (stripped-down format)...');

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const feedPath = path.join(__dirname, '../../docs/feed.json');
        console.log('📂 Loading articles from:', feedPath);

        if (!fs.existsSync(feedPath)) {
            console.error('❌ Feed file not found:', feedPath);
            return false;
        }

        const feedData = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
        const allArticles: NormalizedItem[] = feedData.items || [];

        console.log(`📊 Total articles loaded: ${allArticles.length}`);

        const today = new Date();
        const dayOfWeek = today.getDay();
        const isFriday = dayOfWeek === 5;

        console.log(`📅 Today is ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek]}`);

        // Target regions - strict focus on NJ, PA, TX, FL
        const targetRegions = ['NJ', 'PA', 'FL', 'New Jersey', 'Pennsylvania', 'Florida'];

        const isTargetRegion = (article: NormalizedItem): boolean => {
            if (article.regions && article.regions.length > 0) {
                return article.regions.some(r =>
                    targetRegions.some(tr => r.toUpperCase().includes(tr.toUpperCase()))
                );
            }
            const text = `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toUpperCase();
            return targetRegions.some(r => text.includes(r.toUpperCase()));
        };

        // FILTER 1: Smart time period - 24h default, expand to 48h if low content
        const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        let recentArticles = allArticles.filter(article => {
            const pubDate = new Date(article.pubDate || article.date_published || 0);
            return pubDate >= cutoff24h;
        });

        // Check relevant count in 24h
        const relevant24h = recentArticles.filter(a => a.category === 'relevant');
        let periodLabel = '24 hours';

        if (relevant24h.length <= 3) {
            console.log(`📈 Only ${relevant24h.length} relevant articles in 24h - expanding to 48 hours`);
            const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
            recentArticles = allArticles.filter(article => {
                const pubDate = new Date(article.pubDate || article.date_published || 0);
                return pubDate >= cutoff48h;
            });
            periodLabel = '48 hours';
        } else {
            console.log(`✅ ${relevant24h.length} relevant articles in 24h - using 24 hour coverage`);
        }

        console.log(`📅 Articles from last ${periodLabel}: ${recentArticles.length}`);

        // ===== STRICT CONTENT FILTERS (no fallback - empty is OK) =====

        // Political exclusion - applies to ALL sections
        const excludePolitical = ['trump', 'biden', 'president elect', 'congress', 'senate', 'election', 'political', 'white house', 'democrat', 'republican', 'governor', 'legislation', 'tariff', 'border', 'immigration'];

        // Section-specific keywords based on boss criteria:

        // RELEVANT ARTICLES: macro trends (rates, inflation, freight, construction inputs, labor) + industrial RE news
        const relevantKeywords = [
            // Macro trends
            'interest rate', 'fed ', 'federal reserve', 'inflation', 'cpi', 'lending', 'financing', 'capital markets',
            'freight', 'shipping', 'trucking', 'supply chain', 'port', 'cargo', 'container',
            'construction cost', 'material cost', 'steel', 'concrete', 'lumber', 'labor cost', 'labor market',
            // Industrial RE
            'industrial', 'warehouse', 'distribution', 'fulfillment', 'cold storage', 'logistics', 'flex space',
            'manufacturing', 'last mile', 'e-commerce', 'spec development', 'industrial park',
            // CRE general
            'commercial real estate', 'cre', 'vacancy', 'absorption', 'rent growth', 'cap rate'
        ];

        // TRANSACTIONS: industrial land/building sales or leases
        const transactionKeywords = [
            'sale', 'sold', 'lease', 'leased', 'acquired', 'acquisition', 'purchase', 'bought',
            'deal', 'transaction', 'tenant', 'signed', 'closed', 'sf', 'square feet', 'acre',
            'industrial', 'warehouse', 'distribution', 'logistics', 'manufacturing', 'flex'
        ];

        // AVAILABILITIES: industrial land/building for sale or lease
        const availabilityKeywords = [
            'available', 'for sale', 'for lease', 'listing', 'marketed', 'offering', 'development site',
            'spec', 'speculative', 'proposed', 'planned', 'under construction', 'delivering',
            'industrial', 'warehouse', 'distribution', 'logistics', 'manufacturing', 'flex', 'land'
        ];

        // PEOPLE NEWS: personnel moves in industrial brokerage, development, investment
        const peopleKeywords = [
            // Actions
            'hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped', 'recruit',
            // Titles
            'broker', 'director', 'vp', 'vice president', 'president', 'ceo', 'coo', 'cfo', 'partner',
            'managing director', 'principal', 'executive', 'head of', 'leader',
            // Companies
            'nai', 'sior', 'ccim', 'cbre', 'jll', 'cushman', 'colliers', 'newmark', 'marcus', 'millichap',
            'prologis', 'duke', 'link', 'rexford', 'first industrial', 'stag', 'terreno',
            // Industrial focus
            'industrial', 'logistics', 'warehouse', 'distribution', 'development', 'investment sales', 'capital markets'
        ];

        const getText = (article: NormalizedItem): string =>
            `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toLowerCase();

        const containsAny = (text: string, keywords: string[]): boolean =>
            keywords.some(kw => text.includes(kw));

        const isPolitical = (text: string): boolean => containsAny(text, excludePolitical);

        // Strict filter helper - no fallback, empty sections are OK
        const applyStrictFilter = (items: NormalizedItem[], keywords: string[], sectionName: string): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                return containsAny(text, keywords);
            });
            console.log(`🔍 ${sectionName}: ${items.length} → ${filtered.length} (strict industrial filter)`);
            return filtered;
        };

        // Categorize and apply section-specific filters
        let relevant = recentArticles.filter(a => a.category === 'relevant');
        relevant = applyStrictFilter(relevant, relevantKeywords, 'Relevant');

        let transactions = recentArticles.filter(a => a.category === 'transactions');
        transactions = applyStrictFilter(transactions, transactionKeywords, 'Transactions');

        let availabilities = recentArticles.filter(a => a.category === 'availabilities');
        availabilities = applyStrictFilter(availabilities, availabilityKeywords, 'Availabilities');

        let people = recentArticles.filter(a => a.category === 'people');
        people = applyStrictFilter(people, peopleKeywords, 'People News');

        // FILTER 2: Regional filter - only apply if 5+ relevant articles
        if (relevant.length >= 5) {
            const filteredRelevant = relevant.filter(isTargetRegion);
            console.log(`🎯 5+ relevant articles (${relevant.length}) - applying regional filter (NJ, PA, FL)`);
            console.log(`   Filtered from ${relevant.length} to ${filteredRelevant.length} regional articles`);

            // Only apply filter if we still have at least 3 articles after filtering
            if (filteredRelevant.length >= 3) {
                relevant = filteredRelevant;
            } else {
                console.log(`   ⚠️ Too few regional articles (${filteredRelevant.length}), keeping all ${relevant.length}`);
            }
        } else {
            console.log(`📰 Fewer than 5 relevant articles (${relevant.length}) - keeping all without regional filter`);
        }

        console.log('📋 Article breakdown:');
        console.log(`  - Relevant: ${relevant.length}`);
        console.log(`  - Transactions: ${transactions.length}`);
        console.log(`  - Availabilities: ${availabilities.length}`);
        console.log(`  - People: ${people.length}`);

        // Generate Goth HTML newsletter (no week-in-review for daily)
        const html = buildGothBriefing({
            transactions,
            availabilities,
            relevant,
            people
        }, periodLabel, false);

        const emailTo = process.env.EMAIL_TO || '';
        if (!emailTo) {
            console.error('❌ No EMAIL_TO configured in environment');
            return false;
        }

        const recipients = emailTo.split(',').map(e => e.trim());
        console.log(`📬 Sending to ${recipients.length} recipient(s):`, recipients);

        const todayFormatted = today.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const subject = `📊 Woodmont Industrial News Briefing - ${todayFormatted}`;

        const success = await sendEmail(recipients, subject, html);

        if (success) {
            console.log('✅ Goth daily briefing sent successfully!');
        } else {
            console.log('❌ Failed to send Goth daily briefing');
        }

        return success;
    } catch (error) {
        console.error('❌ Error in sendDailyNewsletterGoth:', error);
        return false;
    }
}

/**
 * Send "Goth" weekly newsletter - dark executive theme, 5 days coverage
 */
export async function sendWeeklyNewsletterGoth(): Promise<boolean> {
    try {
        console.log('📧 Preparing Goth weekly briefing (5-day recap)...');

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const feedPath = path.join(__dirname, '../../docs/feed.json');
        console.log('📂 Loading articles from:', feedPath);

        if (!fs.existsSync(feedPath)) {
            console.error('❌ Feed file not found:', feedPath);
            return false;
        }

        const feedData = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
        const allArticles: NormalizedItem[] = feedData.items || [];

        console.log(`📊 Total articles loaded: ${allArticles.length}`);

        // Target regions - strict focus on NJ, PA, TX, FL
        const targetRegions = ['NJ', 'PA', 'FL', 'New Jersey', 'Pennsylvania', 'Florida'];

        const isTargetRegion = (article: NormalizedItem): boolean => {
            if (article.regions && article.regions.length > 0) {
                return article.regions.some(r =>
                    targetRegions.some(tr => r.toUpperCase().includes(tr.toUpperCase()))
                );
            }
            const text = `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toUpperCase();
            return targetRegions.some(r => text.includes(r.toUpperCase()));
        };

        // Weekly recap covers last 5 days
        const hoursBack = 5 * 24;
        const periodLabel = '5 days';

        const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        const recentArticles = allArticles.filter(article => {
            const pubDate = new Date(article.pubDate || article.date_published || 0);
            return pubDate >= cutoffDate;
        });

        // Filter to target regions
        const filteredArticles = recentArticles.filter(isTargetRegion);

        console.log(`📅 Regional articles from last ${periodLabel}: ${filteredArticles.length}`);

        // ===== STRICT CONTENT FILTERS (no fallback - empty is OK) =====

        // Political exclusion - applies to ALL sections
        const excludePolitical = ['trump', 'biden', 'president elect', 'congress', 'senate', 'election', 'political', 'white house', 'democrat', 'republican', 'governor', 'legislation', 'tariff', 'border', 'immigration'];

        // Section-specific keywords based on boss criteria:

        // RELEVANT ARTICLES: macro trends (rates, inflation, freight, construction inputs, labor) + industrial RE news
        const relevantKeywords = [
            // Macro trends
            'interest rate', 'fed ', 'federal reserve', 'inflation', 'cpi', 'lending', 'financing', 'capital markets',
            'freight', 'shipping', 'trucking', 'supply chain', 'port', 'cargo', 'container',
            'construction cost', 'material cost', 'steel', 'concrete', 'lumber', 'labor cost', 'labor market',
            // Industrial RE
            'industrial', 'warehouse', 'distribution', 'fulfillment', 'cold storage', 'logistics', 'flex space',
            'manufacturing', 'last mile', 'e-commerce', 'spec development', 'industrial park',
            // CRE general
            'commercial real estate', 'cre', 'vacancy', 'absorption', 'rent growth', 'cap rate'
        ];

        // TRANSACTIONS: industrial land/building sales or leases
        const transactionKeywords = [
            'sale', 'sold', 'lease', 'leased', 'acquired', 'acquisition', 'purchase', 'bought',
            'deal', 'transaction', 'tenant', 'signed', 'closed', 'sf', 'square feet', 'acre',
            'industrial', 'warehouse', 'distribution', 'logistics', 'manufacturing', 'flex'
        ];

        // AVAILABILITIES: industrial land/building for sale or lease
        const availabilityKeywords = [
            'available', 'for sale', 'for lease', 'listing', 'marketed', 'offering', 'development site',
            'spec', 'speculative', 'proposed', 'planned', 'under construction', 'delivering',
            'industrial', 'warehouse', 'distribution', 'logistics', 'manufacturing', 'flex', 'land'
        ];

        // PEOPLE NEWS: personnel moves in industrial brokerage, development, investment
        const peopleKeywords = [
            // Actions
            'hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped', 'recruit',
            // Titles
            'broker', 'director', 'vp', 'vice president', 'president', 'ceo', 'coo', 'cfo', 'partner',
            'managing director', 'principal', 'executive', 'head of', 'leader',
            // Companies
            'nai', 'sior', 'ccim', 'cbre', 'jll', 'cushman', 'colliers', 'newmark', 'marcus', 'millichap',
            'prologis', 'duke', 'link', 'rexford', 'first industrial', 'stag', 'terreno',
            // Industrial focus
            'industrial', 'logistics', 'warehouse', 'distribution', 'development', 'investment sales', 'capital markets'
        ];

        const getText = (article: NormalizedItem): string =>
            `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toLowerCase();

        const containsAny = (text: string, keywords: string[]): boolean =>
            keywords.some(kw => text.includes(kw));

        const isPolitical = (text: string): boolean => containsAny(text, excludePolitical);

        // Strict filter helper - no fallback, empty sections are OK
        const applyStrictFilter = (items: NormalizedItem[], keywords: string[], sectionName: string): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                return containsAny(text, keywords);
            });
            console.log(`🔍 ${sectionName}: ${items.length} → ${filtered.length} (strict industrial filter)`);
            return filtered;
        };

        // Categorize and apply section-specific filters
        let relevant = filteredArticles.filter(a => a.category === 'relevant');
        relevant = applyStrictFilter(relevant, relevantKeywords, 'Relevant');

        let transactions = filteredArticles.filter(a => a.category === 'transactions');
        transactions = applyStrictFilter(transactions, transactionKeywords, 'Transactions');

        let availabilities = filteredArticles.filter(a => a.category === 'availabilities');
        availabilities = applyStrictFilter(availabilities, availabilityKeywords, 'Availabilities');

        let people = filteredArticles.filter(a => a.category === 'people');
        people = applyStrictFilter(people, peopleKeywords, 'People News');

        console.log('📋 Article breakdown (regional + industrial filter):');
        console.log(`  - Relevant: ${relevant.length}`);
        console.log(`  - Transactions: ${transactions.length}`);
        console.log(`  - Availabilities: ${availabilities.length}`);
        console.log(`  - People: ${people.length}`);

        // Generate Goth HTML newsletter with Friday flag for week-in-review
        const html = buildGothBriefing({
            transactions,
            availabilities,
            relevant,
            people
        }, periodLabel, true); // true = include week-in-review

        const emailTo = process.env.EMAIL_TO || '';
        if (!emailTo) {
            console.error('❌ No EMAIL_TO configured in environment');
            return false;
        }

        const recipients = emailTo.split(',').map(e => e.trim());
        console.log(`📬 Sending to ${recipients.length} recipient(s):`, recipients);

        const today = new Date();
        const todayFormatted = today.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const subject = `📊 Woodmont Industrial News Briefing (Weekly) - ${todayFormatted}`;

        const success = await sendEmail(recipients, subject, html);

        if (success) {
            console.log('✅ Goth weekly briefing sent successfully!');
        } else {
            console.log('❌ Failed to send Goth weekly briefing');
        }

        return success;
    } catch (error) {
        console.error('❌ Error in sendWeeklyNewsletterGoth:', error);
        return false;
    }
}
