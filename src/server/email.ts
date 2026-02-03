import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NormalizedItem } from '../types/index.js';
import { buildBriefing } from './newsletter.js';
import { buildGothBriefing } from './newsletter-goth.js';
import { buildWorkBriefing } from './newsletter-work.js';

// =============================================================================
// EMAIL SENDING - Power Automate Webhook (Primary) or SMTP (Fallback)
// =============================================================================

/**
 * Send email via Power Automate HTTP Webhook
 * This is the preferred method - sends from corporate O365 account
 */
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
            // Optional: Include API key for webhook security
            apiKey: process.env.WEBHOOK_SECRET || ''
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log('✅ Webhook triggered successfully!');
            console.log('   Response status:', response.status);
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

/**
 * Send email via SMTP (NodeMailer) - Fallback method
 */
async function sendViaSMTP(to: string[], subject: string, html: string): Promise<boolean> {
    try {
        // Dynamic import to avoid requiring it if not used
        const nodemailer = require('nodemailer');

        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || '',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_PORT === '465',
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

        console.log('📤 Sending email via SMTP...');
        console.log('   SMTP Host:', process.env.SMTP_HOST);
        console.log('   From:', process.env.EMAIL_FROM);
        console.log('   To:', to.join(', '));

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully via SMTP');
        console.log('   Message ID:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ SMTP send failed:', error);
        return false;
    }
}

/**
 * Send email - Uses webhook if configured, falls back to SMTP
 *
 * Priority:
 * 1. Power Automate Webhook (WEBHOOK_URL) - Corporate O365 email
 * 2. SMTP (SMTP_HOST) - Gmail or other SMTP fallback
 */
export async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📧 EMAIL SENDING');
    console.log('═══════════════════════════════════════════════════════════');

    // Try webhook first (preferred - corporate email)
    if (process.env.WEBHOOK_URL) {
        console.log('📌 Using Power Automate Webhook (corporate O365)');
        const webhookSuccess = await sendViaWebhook(to, subject, html);
        if (webhookSuccess) {
            return true;
        }
        console.log('⚠️ Webhook failed, trying SMTP fallback...');
    }

    // Fall back to SMTP if webhook not configured or failed
    if (process.env.SMTP_HOST) {
        console.log('📌 Using SMTP fallback');
        return await sendViaSMTP(to, subject, html);
    }

    console.error('❌ No email method configured!');
    console.error('   Set WEBHOOK_URL for Power Automate or SMTP_HOST for SMTP');
    return false;
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

        // Deal thresholds: ≥100,000 SF or ≥$25M
        const meetsDealThreshold = (text: string): { meetsSF: boolean; meetsDollar: boolean; sizeSF: number | null } => {
            const upperText = text.toUpperCase();
            const sfMatch = upperText.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:SF|SQ\.?\s*FT|SQUARE\s*FEET)/i);
            let sizeSF: number | null = null;
            if (sfMatch) sizeSF = parseInt(sfMatch[1].replace(/,/g, ''));
            const dollarMatch = upperText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:MILLION|M\b)/i);
            let priceMillion: number | null = null;
            if (dollarMatch) priceMillion = parseFloat(dollarMatch[1].replace(/,/g, ''));
            return { meetsSF: sizeSF !== null && sizeSF >= 100000, meetsDollar: priceMillion !== null && priceMillion >= 25, sizeSF };
        };

        // Property scope helpers
        const excludeNonIndustrial = ['office lease', 'office building', 'multifamily', 'apartment', 'residential', 'retail', 'hotel', 'hospitality', 'self-storage'];
        const industrialKeywords = ['warehouse', 'logistics', 'distribution', 'manufacturing', 'cold storage', 'fulfillment', 'industrial'];

        const getText = (a: NormalizedItem) => `${a.title || ''} ${a.description || ''}`.toLowerCase();
        const containsAny = (text: string, kw: string[]) => kw.some(k => text.includes(k));
        const isIndustrialProperty = (text: string) => containsAny(text, industrialKeywords) || !containsAny(text, excludeNonIndustrial);

        // Target regions for strict filtering
        const targetRegions = ['NJ', 'PA', 'FL', 'New Jersey', 'Pennsylvania', 'Florida'];

        // Helper to check if article is in target regions
        const isTargetRegion = (article: NormalizedItem): boolean => {
            if (article.regions && article.regions.length > 0) {
                return article.regions.some(r => targetRegions.some(tr => r.toUpperCase().includes(tr.toUpperCase())));
            }
            const text = `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toUpperCase();
            return targetRegions.some(r => text.includes(r.toUpperCase()));
        };

        // Filter all articles by region first
        const regionalArticles = recentArticles.filter(isTargetRegion);
        console.log(`🎯 Regional filter (NJ, PA, FL): ${recentArticles.length} → ${regionalArticles.length}`);

        // Categorize with threshold filters
        let transactions = regionalArticles.filter(a => a.category === 'transactions').filter(a => {
            const text = getText(a);
            if (!isIndustrialProperty(text)) return false;
            const threshold = meetsDealThreshold(text);
            return threshold.meetsSF || threshold.meetsDollar || (threshold.sizeSF !== null && threshold.sizeSF > 0);
        });

        let availabilities = regionalArticles.filter(a => a.category === 'availabilities').filter(a => {
            const text = getText(a);
            if (!isIndustrialProperty(text)) return false;
            const threshold = meetsDealThreshold(text);
            return threshold.meetsSF || (threshold.sizeSF !== null && threshold.sizeSF > 0);
        });

        let relevant = regionalArticles.filter(a => a.category === 'relevant');
        const people = regionalArticles.filter(a => a.category === 'people');

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

        // Target regions - STRICT focus on NJ, PA, FL ONLY
        const targetRegions = ['NJ', 'PA', 'FL', 'NEW JERSEY', 'PENNSYLVANIA', 'FLORIDA', 'PHILADELPHIA', 'NEWARK', 'JERSEY CITY', 'TRENTON', 'CAMDEN', 'MIAMI', 'ORLANDO', 'TAMPA', 'JACKSONVILLE', 'FORT LAUDERDALE'];

        // Exclude articles about ALL OTHER states (everything except NJ, PA, FL)
        const excludeRegions = [
            // States A-M
            'ALABAMA', 'AL,', 'ALASKA', 'AK,', 'ARIZONA', 'AZ,', 'ARKANSAS', 'AR,',
            'CALIFORNIA', 'CA,', 'COLORADO', 'CO,', 'CONNECTICUT', 'CT,',
            'DELAWARE', 'DE,', 'GEORGIA', 'GA,', 'HAWAII', 'HI,',
            'IDAHO', 'ID,', 'ILLINOIS', 'IL,', 'INDIANA', 'IN,', 'IOWA', 'IA,',
            'KANSAS', 'KS,', 'KENTUCKY', 'KY,', 'LOUISIANA', 'LA,',
            'MAINE', 'ME,', 'MARYLAND', 'MD,', 'MASSACHUSETTS', 'MA,',
            'MICHIGAN', 'MI,', 'MINNESOTA', 'MN,', 'MISSISSIPPI', 'MS,',
            'MISSOURI', 'MO,', 'MONTANA', 'MT,',
            // States N-W
            'NEBRASKA', 'NE,', 'NEVADA', 'NV,', 'NEW HAMPSHIRE', 'NH,',
            'NEW MEXICO', 'NM,', 'NEW YORK', 'NORTH CAROLINA', 'NC,',
            'NORTH DAKOTA', 'ND,', 'OHIO', 'OH,', 'OKLAHOMA', 'OK,', 'OREGON', 'OR,',
            'RHODE ISLAND', 'RI,', 'SOUTH CAROLINA', 'SC,', 'SOUTH DAKOTA', 'SD,',
            'TENNESSEE', 'TN,', 'TEXAS', 'TX,', 'UTAH', 'UT,', 'VERMONT', 'VT,',
            'VIRGINIA', 'VA,', 'WASHINGTON', 'WA,', 'WEST VIRGINIA', 'WV,',
            'WISCONSIN', 'WI,', 'WYOMING', 'WY,',
            // Major cities in other states
            'HOUSTON', 'DALLAS', 'AUSTIN', 'SAN ANTONIO', 'BALTIMORE', 'ATLANTA',
            'LOS ANGELES', 'SAN FRANCISCO', 'SAN DIEGO', 'SEATTLE', 'PORTLAND',
            'CHICAGO', 'DETROIT', 'CLEVELAND', 'CINCINNATI', 'COLUMBUS',
            'PHOENIX', 'LAS VEGAS', 'DENVER', 'SALT LAKE', 'BOISE',
            'NASHVILLE', 'MEMPHIS', 'CHARLOTTE', 'RALEIGH', 'CHARLESTON',
            'BOSTON', 'HARTFORD', 'PROVIDENCE', 'NEW HAVEN',
            'MINNEAPOLIS', 'MILWAUKEE', 'INDIANAPOLIS', 'LOUISVILLE', 'LEXINGTON',
            'KANSAS CITY', 'ST. LOUIS', 'OMAHA', 'DES MOINES',
            'ALBUQUERQUE', 'TUCSON', 'OKLAHOMA CITY', 'TULSA',
            'BIRMINGHAM', 'MOBILE', 'LITTLE ROCK', 'BATON ROUGE', 'NEW ORLEANS',
            'RICHMOND', 'NORFOLK', 'VIRGINIA BEACH',
            ', NY', ', TX', ', CA', ', GA', ', MD', ', VA', ', NC', ', SC',
            ', TN', ', OH', ', IL', ', MI', ', IN', ', WI', ', MN', ', MO',
            ', KY', ', AL', ', LA', ', AR', ', OK', ', KS', ', NE', ', IA',
            ', CO', ', AZ', ', NV', ', UT', ', NM', ', MT', ', WY', ', ID',
            ', WA', ', OR', ', MA', ', CT', ', NH', ', VT', ', ME', ', RI'
        ];

        const isTargetRegion = (article: NormalizedItem): boolean => {
            const text = `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toUpperCase();
            const url = (article.url || article.link || '').toLowerCase();

            // INCLUDE if from a NJ/PA/FL regional source (by URL)
            const regionalSources = ['re-nj.com', 'njbiz.com', 'lvb.com', 'bisnow.com/new-jersey', 'bisnow.com/philadelphia', 'bisnow.com/south-florida', 'therealdeal.com/miami'];
            const isFromRegionalSource = regionalSources.some(s => url.includes(s));

            // Check if article PRIMARILY mentions target regions (count occurrences)
            const targetCount = targetRegions.reduce((count, r) => count + (text.split(r).length - 1), 0);

            // Only check major out-of-state locations (not every state abbreviation which causes false positives)
            const majorExcludeRegions = ['HOUSTON', 'DALLAS', 'AUSTIN', 'ATLANTA', 'LOS ANGELES', 'SAN FRANCISCO', 'CHICAGO', 'BOSTON', 'SEATTLE', 'DENVER', 'PHOENIX', 'CHARLOTTE', 'NASHVILLE', 'BALTIMORE'];
            const excludeCount = majorExcludeRegions.reduce((count, r) => count + (text.split(r).length - 1), 0);

            // If from a regional source (re-nj.com, lvb.com, etc.), include unless PRIMARILY about another location
            if (isFromRegionalSource) {
                // Only exclude if more excluded regions than target regions AND multiple mentions
                if (excludeCount > targetCount && excludeCount >= 2) {
                    return false;
                }
                return true;
            }

            // For non-regional sources, require explicit target region mention
            if (article.regions && article.regions.length > 0) {
                const hasTarget = article.regions.some(r =>
                    targetRegions.some(tr => r.toUpperCase().includes(tr))
                );
                if (hasTarget) return true;
            }

            // Check text for target region mentions, allow if target count >= exclude count
            const hasTargetRegion = targetRegions.some(r => text.includes(r));
            if (hasTargetRegion && targetCount >= excludeCount) {
                return true;
            }

            return hasTargetRegion && excludeCount === 0;
        };

        // FILTER 1: STRICT time period - 24h default, expand to 48h if low content
        // Helper to get valid date - uses ACTUAL publication date, not fetch time
        const getValidDate = (article: NormalizedItem): Date | null => {
            // Use date_published (actual article date) first, NOT date_modified (fetch time)
            const dateStr = (article as any).date_published || article.pubDate || (article as any).date_modified;
            if (!dateStr) return null;
            const date = new Date(dateStr);
            // Check if date is valid and reasonable (not in future, not before 2020)
            if (isNaN(date.getTime())) return null;
            if (date > new Date()) return null; // Reject future dates
            if (date < new Date('2020-01-01')) return null; // Reject very old dates
            return date;
        };

        const now = new Date();
        const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        let recentArticles = allArticles.filter(article => {
            const pubDate = getValidDate(article);
            if (!pubDate) return false; // Reject articles with no valid date
            return pubDate >= cutoff24h;
        });

        // Check relevant count in 24h
        const relevant24h = recentArticles.filter(a => a.category === 'relevant');
        let periodLabel = '24 hours';

        if (relevant24h.length <= 3) {
            console.log(`📈 Only ${relevant24h.length} relevant articles in 24h - expanding to 48 hours`);
            const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
            recentArticles = allArticles.filter(article => {
                const pubDate = getValidDate(article);
                if (!pubDate) return false; // Reject articles with no valid date
                return pubDate >= cutoff48h;
            });
            periodLabel = '48 hours';
        } else {
            console.log(`✅ ${relevant24h.length} relevant articles in 24h - using 24 hour coverage`);
        }

        console.log(`📅 Articles from last ${periodLabel}: ${recentArticles.length}`);

        // ===== STRICT FILTERS: Regional (NJ, PA, FL) + Content + No Political =====

        // STEP 1: Apply regional filter FIRST to ALL articles (strict - NJ, PA, FL only)
        const regionalArticles = recentArticles.filter(isTargetRegion);
        console.log(`🎯 Regional filter (NJ, PA, FL): ${recentArticles.length} → ${regionalArticles.length}`);

        // Political exclusion - applies to ALL sections
        const excludePolitical = ['trump', 'biden', 'president elect', 'congress', 'senate', 'election', 'political', 'white house', 'democrat', 'republican', 'governor', 'legislation', 'tariff', 'border', 'immigration'];

        // Deal thresholds: ≥100,000 SF or ≥$25M (per boss rules)
        const meetsDealThreshold = (text: string): { meetsSF: boolean; meetsDollar: boolean; sizeSF: number | null; priceMillion: number | null } => {
            const upperText = text.toUpperCase();
            // Extract SF values
            const sfMatch = upperText.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:SF|SQ\.?\s*FT|SQUARE\s*FEET)/i);
            let sizeSF: number | null = null;
            if (sfMatch) {
                sizeSF = parseInt(sfMatch[1].replace(/,/g, ''));
            }

            // Extract dollar values (millions)
            const dollarMatch = upperText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:MILLION|M\b)/i);
            let priceMillion: number | null = null;
            if (dollarMatch) {
                priceMillion = parseFloat(dollarMatch[1].replace(/,/g, ''));
            }

            // Also check for plain dollar amounts (e.g., $25,000,000)
            const bigDollarMatch = upperText.match(/\$(\d{2,3}(?:,\d{3}){2,})/);
            if (!priceMillion && bigDollarMatch) {
                const rawAmount = parseInt(bigDollarMatch[1].replace(/,/g, ''));
                if (rawAmount >= 25000000) {
                    priceMillion = rawAmount / 1000000;
                }
            }

            return {
                meetsSF: sizeSF !== null && sizeSF >= 100000,
                meetsDollar: priceMillion !== null && priceMillion >= 25,
                sizeSF,
                priceMillion
            };
        };

        // Property scope: Industrial only (exclude office, multifamily, retail, hotels, self-storage, data centers unless industrial)
        const excludeNonIndustrial = [
            'office lease', 'office building', 'office tower', 'coworking',
            'multifamily', 'apartment', 'residential', 'condo',
            'retail', 'restaurant', 'shopping center', 'mall',
            'hotel', 'hospitality', 'resort',
            'self-storage', 'mini storage',
            'senior living', 'nursing home', 'medical office'
        ];

        // Industrial property keywords
        const industrialPropertyKeywords = [
            'warehouse', 'logistics', 'distribution', 'manufacturing', 'cold storage',
            'last-mile', 'last mile', 'industrial outdoor storage', 'ios', 'industrial land',
            'fulfillment', 'flex space', 'spec industrial', 'industrial park', 'loading dock'
        ];

        // Section-specific keywords based on boss criteria:

        // RELEVANT ARTICLES: macro trends (rates, inflation, freight, construction inputs, labor) + industrial RE news
        const relevantKeywords = [
            // Macro trends
            'interest rate', 'fed ', 'federal reserve', 'inflation', 'cpi', 'lending', 'financing', 'capital markets',
            'freight', 'shipping', 'trucking', 'supply chain', 'port', 'cargo', 'container',
            'construction cost', 'material cost', 'steel', 'concrete', 'lumber', 'labor cost', 'labor market',
            // Insurance (especially FL/TX)
            'insurance', 'insurance cost', 'property insurance',
            // Industrial RE
            'industrial', 'warehouse', 'distribution', 'fulfillment', 'cold storage', 'logistics', 'flex space',
            'manufacturing', 'last mile', 'e-commerce', 'spec development', 'industrial park',
            // Project approvals & development
            'approved', 'approves', 'approval', 'zoning', 'rezoning', 'entitlement', 'permits', 'planning board',
            'groundbreaking', 'under construction', 'development', 'project', 'proposed', 'planned',
            // Sustainability & ESG
            'sustainable industrial', 'esg property', 'net zero', 'green building', 'leed',
            // Automation & Technology
            'last mile delivery', 'automation', 'robotics', 'automated warehouse',
            // Workforce
            'workforce development', 'skilled trades', 'labor shortage',
            // Supply chain trends
            'reshoring', 'nearshoring', 'supply chain resilience', 'onshoring',
            // Property types
            'data center', 'flex warehouse', 'cross-dock', 'cross dock',
            'last-mile facility', 'micro-fulfillment', 'micro fulfillment',
            // Specialized industrial
            'agri-tech', 'agritech', 'food processing', 'food facility',
            'advanced manufacturing', 'contract manufacturing',
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
        // RELAXED: Accept action keywords OR industrial context OR brokerage firm mention
        const peopleActionKeywords = [
            'hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped', 'recruit',
            'hires', 'appoints', 'promotes', 'names', 'adds', 'taps', 'leads', 'heads',
            'chair', 'nabs', 'welcomes', 'brings', 'expands', 'grows', 'bolsters', 'strengthens',
            'movers', 'shakers', 'leadership', 'executive', 'move',
            // Additional action-like words
            'announces', 'announced', 'selected', 'recognized', 'award', 'honored', 'featured',
            'profile', 'spotlight', 'interview', 'q&a', 'power broker', 'rising star', 'top producer'
        ];
        const industrialContextKeywords = [
            // Industrial CRE companies - EXPANDED
            'nai', 'sior', 'ccim', 'cbre', 'jll', 'cushman', 'colliers', 'newmark', 'marcus', 'millichap',
            'prologis', 'duke', 'link logistics', 'rexford', 'first industrial', 'stag', 'terreno',
            'exeter', 'blackstone', 'brookfield', 'clarion', 'dermody', 'hillwood', 'idl', 'panattoni',
            'avison young', 'lee & associates', 'kidder mathews', 'transwestern', 'savills', 'ngkf',
            'eastdil', 'hff', 'walker & dunlop', 'berkadia', 'northmarq', 'keane', 'ware malcomb',
            // Industrial focus keywords
            'industrial', 'logistics', 'warehouse', 'distribution', 'fulfillment', 'cold storage',
            'commercial real estate', 'cre', 'investment sales', 'capital markets', 'brokerage',
            // Broader real estate / development terms (allow more people news)
            'real estate', 'development', 'developer', 'redevelopment', 'land use', 'zoning',
            'property', 'portfolio', 'asset', 'partner', 'principal', 'managing director', 'vice president',
            'broker', 'leasing', 'acquisition', 'construction', 'economic development', 'eda',
            // Industry associations - NEW
            'naiop', 'icsc', 'uli', 'boma', 'cbre institute', 'sior', 'ccim institute',
            // Investor profile keywords - NEW
            'investor', 'fund manager', 'private equity', 'institutional', 'family office', 'reit',
            'investment firm', 'investment manager', 'allocation', 'fundraising', 'capital raise'
        ];
        // Exclude residential/non-industrial (be more specific to reduce false exclusions)
        const excludeFromPeople = ['residential broker', 'elliman', 'compass real', 'redfin', 'zillow', 'mortgage lender', 'retail broker', 'multifamily broker', 'apartment complex', 'hotel broker', 'hospitality'];

        const getText = (article: NormalizedItem): string =>
            `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toLowerCase();

        const containsAny = (text: string, keywords: string[]): boolean =>
            keywords.some(kw => text.includes(kw));

        const isPolitical = (text: string): boolean => containsAny(text, excludePolitical);

        // Helper to check if article is industrial property-focused
        const isIndustrialProperty = (text: string): boolean => {
            // Has industrial keywords
            if (containsAny(text, industrialPropertyKeywords)) return true;
            // Does NOT have non-industrial keywords
            return !containsAny(text, excludeNonIndustrial);
        };

        // STEP 2: Apply content filter to each section (strict - no fallback, empty OK)
        const applyStrictFilter = (items: NormalizedItem[], keywords: string[], sectionName: string): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                return containsAny(text, keywords);
            });
            console.log(`🔍 ${sectionName}: ${items.length} → ${filtered.length} (content filter)`);
            return filtered;
        };

        // Transaction filter - must meet threshold (≥100K SF OR ≥$25M) and be industrial
        // EXCEPTION: Project approvals, zoning decisions are always relevant
        const approvalKeywords = ['approved', 'approves', 'approval', 'zoning', 'rezoning', 'entitlement', 'permits', 'planning board', 'commission'];

        const applyTransactionFilter = (items: NormalizedItem[]): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                if (!isIndustrialProperty(text)) return false;

                // Project approvals/zoning are ALWAYS relevant (no threshold needed)
                const isApproval = containsAny(text, approvalKeywords);
                if (isApproval) return true;

                const threshold = meetsDealThreshold(text);
                // Include if meets threshold OR has clear transaction indicators with any size
                const meetsThreshold = threshold.meetsSF || threshold.meetsDollar;
                const hasAnySizeMentioned = threshold.sizeSF !== null && threshold.sizeSF > 0;

                // Accept if meets threshold, or has size mentioned (smaller deals still relevant)
                return meetsThreshold || hasAnySizeMentioned;
            });
            console.log(`🔍 Transactions: ${items.length} → ${filtered.length} (threshold filter: ≥100K SF or ≥$25M, approvals always included)`);
            return filtered;
        };

        // Availability filter - prefer ≥100K SF but include notable smaller listings
        const applyAvailabilityFilter = (items: NormalizedItem[]): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                if (!isIndustrialProperty(text)) return false;

                const threshold = meetsDealThreshold(text);
                // Prefer ≥100K SF, but include any with size mentioned
                return threshold.meetsSF || (threshold.sizeSF !== null && threshold.sizeSF > 0);
            });
            console.log(`🔍 Availabilities: ${items.length} → ${filtered.length} (threshold filter: prefer ≥100K SF)`);
            return filtered;
        };

        // People News filter - RELAXED: trust classifier, only exclude clearly non-industrial
        const applyPeopleFilter = (items: NormalizedItem[]): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                const url = (article.url || article.link || '').toLowerCase();
                if (isPolitical(text)) return false;
                // Exclude clearly non-industrial sectors
                if (containsAny(text, excludeFromPeople)) return false;

                // RELAXED: Accept if ANY of these conditions are met
                const hasAction = containsAny(text, peopleActionKeywords);
                const hasIndustrial = containsAny(text, industrialContextKeywords);

                // Check if from a brokerage/industry source (trust the source)
                const brokerageSources = ['bisnow.com', 'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com',
                    'newmark', 'nai', 'sior.com', 'ccim.com', 'naiop.org', 're-nj.com', 'globest.com',
                    'commercialsearch.com', 'cpexecutive.com', 'therealdeal.com'];
                const isFromBrokerageSource = brokerageSources.some(s => url.includes(s));

                // Accept if: has action keywords OR industrial context OR from trusted brokerage source
                return hasAction || hasIndustrial || isFromBrokerageSource;
            });
            console.log(`🔍 People News: ${items.length} → ${filtered.length} (relaxed filter)`);
            return filtered;
        };

        // Categorize from REGIONAL articles only, then apply content filters
        let relevant = regionalArticles.filter(a => a.category === 'relevant');
        relevant = applyStrictFilter(relevant, relevantKeywords, 'Relevant');

        let transactions = regionalArticles.filter(a => a.category === 'transactions');
        transactions = applyTransactionFilter(transactions);

        let availabilities = regionalArticles.filter(a => a.category === 'availabilities');
        availabilities = applyAvailabilityFilter(availabilities);

        let people = regionalArticles.filter(a => a.category === 'people');
        people = applyPeopleFilter(people);

        console.log('📋 Final article breakdown (NJ, PA, FL + industrial content):');
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
 * Send "Work" daily newsletter - Boss's preferred clean, minimal style
 */
export async function sendDailyNewsletterWork(): Promise<boolean> {
    try {
        console.log('📧 Preparing Work daily briefing (boss preferred style)...');

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const feedPath = path.join(__dirname, '../../docs/feed.json');

        if (!fs.existsSync(feedPath)) {
            console.error('❌ Feed file not found at:', feedPath);
            return false;
        }

        const feedData = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));
        const articles: NormalizedItem[] = feedData.items || [];

        console.log(`📰 Loaded ${articles.length} articles from feed`);

        // Dynamic time range: start with 48 hours, reduce to 24 if too many articles
        // Goal: 3-5 articles per section
        const now = new Date();

        // Helper to filter by time range
        const getArticlesByTimeRange = (hours: number) => {
            const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
            return articles.filter(a => {
                const pubDate = new Date(a.pubDate || a.date_published || a.fetchedAt || 0);
                return pubDate >= cutoff;
            });
        };

        // Use same filtering logic as Goth newsletter
        const excludePolitical = ['trump', 'biden', 'congress', 'senate', 'election', 'political', 'republican', 'democrat', 'gop', 'white house'];

        const getText = (article: NormalizedItem): string =>
            `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toLowerCase();

        const containsAny = (text: string, keywords: string[]): boolean =>
            keywords.some(kw => text.includes(kw));

        const isPolitical = (text: string): boolean => containsAny(text, excludePolitical);

        // Categorize and count articles for a given time range
        const categorizeArticles = (recentArticles: NormalizedItem[]) => {
            const filtered = recentArticles.filter(article => {
                const text = getText(article);
                return !isPolitical(text);
            });
            return {
                relevant: filtered.filter(a => a.category === 'relevant'),
                transactions: filtered.filter(a => a.category === 'transactions'),
                availabilities: filtered.filter(a => a.category === 'availabilities'),
                people: filtered.filter(a => a.category === 'people')
            };
        };

        // Try 48 hours first
        let timeRange = 48;
        let recentArticles = getArticlesByTimeRange(48);
        let categorized = categorizeArticles(recentArticles);

        console.log(`📰 48-hour articles: relevant=${categorized.relevant.length}, transactions=${categorized.transactions.length}, availabilities=${categorized.availabilities.length}, people=${categorized.people.length}`);

        // If any section has more than 5, try 24 hours
        if (categorized.relevant.length > 5 || categorized.transactions.length > 5 ||
            categorized.availabilities.length > 5 || categorized.people.length > 5) {
            console.log('📊 Too many articles in 48h, trying 24 hours...');
            timeRange = 24;
            recentArticles = getArticlesByTimeRange(24);
            categorized = categorizeArticles(recentArticles);
            console.log(`📰 24-hour articles: relevant=${categorized.relevant.length}, transactions=${categorized.transactions.length}, availabilities=${categorized.availabilities.length}, people=${categorized.people.length}`);
        }

        // Cap each section at 5 articles (ideal: 3-5)
        const MAX_PER_SECTION = 5;
        let relevant = categorized.relevant.slice(0, MAX_PER_SECTION);
        let transactions = categorized.transactions.slice(0, MAX_PER_SECTION);
        let availabilities = categorized.availabilities.slice(0, MAX_PER_SECTION);
        let people = categorized.people.slice(0, MAX_PER_SECTION);

        console.log(`📋 Work newsletter (${timeRange}h range, max ${MAX_PER_SECTION}/section):`);
        console.log(`  - Relevant News: ${relevant.length}`);
        console.log(`  - Transactions: ${transactions.length}`);
        console.log(`  - Availabilities: ${availabilities.length}`);
        console.log(`  - People: ${people.length}`);

        const totalArticles = relevant.length + transactions.length + availabilities.length + people.length;

        if (totalArticles === 0) {
            console.log('⚠️ No articles to send - skipping Work newsletter');
            return true;
        }

        // Build the clean work newsletter
        const today = new Date();
        const dateRange = today.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const html = buildWorkBriefing(relevant, transactions, availabilities, people, dateRange);

        // Get recipients (same as other newsletters)
        const emailTo = process.env.EMAIL_TO || '';
        if (!emailTo) {
            console.error('❌ No EMAIL_TO configured in environment');
            return false;
        }
        const recipients = emailTo.split(',').map(e => e.trim()).filter(e => e);

        const subject = `Woodmont Industrial Partners — Daily Industrial News Briefing`;

        console.log(`📤 Sending Work newsletter to ${recipients.length} recipient(s)...`);

        const success = await sendEmail(recipients, subject, html);

        if (success) {
            console.log('✅ Work daily newsletter sent successfully!');
        } else {
            console.error('❌ Failed to send Work newsletter');
        }

        return success;
    } catch (error) {
        console.error('❌ Error in sendDailyNewsletterWork:', error);
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

        // Target regions - STRICT focus on NJ, PA, FL ONLY
        const targetRegions = ['NJ', 'PA', 'FL', 'NEW JERSEY', 'PENNSYLVANIA', 'FLORIDA', 'PHILADELPHIA', 'NEWARK', 'JERSEY CITY', 'TRENTON', 'CAMDEN', 'MIAMI', 'ORLANDO', 'TAMPA', 'JACKSONVILLE', 'FORT LAUDERDALE'];

        // Exclude articles about ALL OTHER states (everything except NJ, PA, FL)
        const excludeRegions = [
            // States A-M
            'ALABAMA', 'AL,', 'ALASKA', 'AK,', 'ARIZONA', 'AZ,', 'ARKANSAS', 'AR,',
            'CALIFORNIA', 'CA,', 'COLORADO', 'CO,', 'CONNECTICUT', 'CT,',
            'DELAWARE', 'DE,', 'GEORGIA', 'GA,', 'HAWAII', 'HI,',
            'IDAHO', 'ID,', 'ILLINOIS', 'IL,', 'INDIANA', 'IN,', 'IOWA', 'IA,',
            'KANSAS', 'KS,', 'KENTUCKY', 'KY,', 'LOUISIANA', 'LA,',
            'MAINE', 'ME,', 'MARYLAND', 'MD,', 'MASSACHUSETTS', 'MA,',
            'MICHIGAN', 'MI,', 'MINNESOTA', 'MN,', 'MISSISSIPPI', 'MS,',
            'MISSOURI', 'MO,', 'MONTANA', 'MT,',
            // States N-W
            'NEBRASKA', 'NE,', 'NEVADA', 'NV,', 'NEW HAMPSHIRE', 'NH,',
            'NEW MEXICO', 'NM,', 'NEW YORK', 'NORTH CAROLINA', 'NC,',
            'NORTH DAKOTA', 'ND,', 'OHIO', 'OH,', 'OKLAHOMA', 'OK,', 'OREGON', 'OR,',
            'RHODE ISLAND', 'RI,', 'SOUTH CAROLINA', 'SC,', 'SOUTH DAKOTA', 'SD,',
            'TENNESSEE', 'TN,', 'TEXAS', 'TX,', 'UTAH', 'UT,', 'VERMONT', 'VT,',
            'VIRGINIA', 'VA,', 'WASHINGTON', 'WA,', 'WEST VIRGINIA', 'WV,',
            'WISCONSIN', 'WI,', 'WYOMING', 'WY,',
            // Major cities in other states
            'HOUSTON', 'DALLAS', 'AUSTIN', 'SAN ANTONIO', 'BALTIMORE', 'ATLANTA',
            'LOS ANGELES', 'SAN FRANCISCO', 'SAN DIEGO', 'SEATTLE', 'PORTLAND',
            'CHICAGO', 'DETROIT', 'CLEVELAND', 'CINCINNATI', 'COLUMBUS',
            'PHOENIX', 'LAS VEGAS', 'DENVER', 'SALT LAKE', 'BOISE',
            'NASHVILLE', 'MEMPHIS', 'CHARLOTTE', 'RALEIGH', 'CHARLESTON',
            'BOSTON', 'HARTFORD', 'PROVIDENCE', 'NEW HAVEN',
            'MINNEAPOLIS', 'MILWAUKEE', 'INDIANAPOLIS', 'LOUISVILLE', 'LEXINGTON',
            'KANSAS CITY', 'ST. LOUIS', 'OMAHA', 'DES MOINES',
            'ALBUQUERQUE', 'TUCSON', 'OKLAHOMA CITY', 'TULSA',
            'BIRMINGHAM', 'MOBILE', 'LITTLE ROCK', 'BATON ROUGE', 'NEW ORLEANS',
            'RICHMOND', 'NORFOLK', 'VIRGINIA BEACH',
            ', NY', ', TX', ', CA', ', GA', ', MD', ', VA', ', NC', ', SC',
            ', TN', ', OH', ', IL', ', MI', ', IN', ', WI', ', MN', ', MO',
            ', KY', ', AL', ', LA', ', AR', ', OK', ', KS', ', NE', ', IA',
            ', CO', ', AZ', ', NV', ', UT', ', NM', ', MT', ', WY', ', ID',
            ', WA', ', OR', ', MA', ', CT', ', NH', ', VT', ', ME', ', RI'
        ];

        const isTargetRegion = (article: NormalizedItem): boolean => {
            const text = `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toUpperCase();
            const url = (article.url || article.link || '').toLowerCase();

            // INCLUDE if from a NJ/PA/FL regional source (by URL)
            const regionalSources = ['re-nj.com', 'njbiz.com', 'lvb.com', 'bisnow.com/new-jersey', 'bisnow.com/philadelphia', 'bisnow.com/south-florida', 'therealdeal.com/miami'];
            const isFromRegionalSource = regionalSources.some(s => url.includes(s));

            // Check if article PRIMARILY mentions target regions (count occurrences)
            const targetCount = targetRegions.reduce((count, r) => count + (text.split(r).length - 1), 0);

            // Only check major out-of-state locations (not every state abbreviation which causes false positives)
            const majorExcludeRegions = ['HOUSTON', 'DALLAS', 'AUSTIN', 'ATLANTA', 'LOS ANGELES', 'SAN FRANCISCO', 'CHICAGO', 'BOSTON', 'SEATTLE', 'DENVER', 'PHOENIX', 'CHARLOTTE', 'NASHVILLE', 'BALTIMORE'];
            const excludeCount = majorExcludeRegions.reduce((count, r) => count + (text.split(r).length - 1), 0);

            // If from a regional source (re-nj.com, lvb.com, etc.), include unless PRIMARILY about another location
            if (isFromRegionalSource) {
                // Only exclude if more excluded regions than target regions AND multiple mentions
                if (excludeCount > targetCount && excludeCount >= 2) {
                    return false;
                }
                return true;
            }

            // For non-regional sources, require explicit target region mention
            if (article.regions && article.regions.length > 0) {
                const hasTarget = article.regions.some(r =>
                    targetRegions.some(tr => r.toUpperCase().includes(tr))
                );
                if (hasTarget) return true;
            }

            // Check text for target region mentions, allow if target count >= exclude count
            const hasTargetRegion = targetRegions.some(r => text.includes(r));
            if (hasTargetRegion && targetCount >= excludeCount) {
                return true;
            }

            return hasTargetRegion && excludeCount === 0;
        };

        // Weekly recap covers last 5 days with STRICT date validation
        const hoursBack = 5 * 24;
        const periodLabel = '5 days';

        // Helper to get valid date - uses ACTUAL publication date, not fetch time
        const getValidDate = (article: NormalizedItem): Date | null => {
            const dateStr = (article as any).date_published || article.pubDate || (article as any).date_modified;
            if (!dateStr) return null;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            if (date > new Date()) return null;
            if (date < new Date('2020-01-01')) return null;
            return date;
        };

        const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
        const recentArticles = allArticles.filter(article => {
            const pubDate = getValidDate(article);
            if (!pubDate) return false; // Reject articles with no valid date
            return pubDate >= cutoffDate;
        });

        // Filter to target regions
        const filteredArticles = recentArticles.filter(isTargetRegion);

        console.log(`📅 Regional articles from last ${periodLabel}: ${filteredArticles.length}`);

        // ===== STRICT CONTENT FILTERS (no fallback - empty is OK) =====

        // Political exclusion - applies to ALL sections
        const excludePolitical = ['trump', 'biden', 'president elect', 'congress', 'senate', 'election', 'political', 'white house', 'democrat', 'republican', 'governor', 'legislation', 'tariff', 'border', 'immigration'];

        // Deal thresholds: ≥100,000 SF or ≥$25M (per boss rules)
        const meetsDealThreshold = (text: string): { meetsSF: boolean; meetsDollar: boolean; sizeSF: number | null; priceMillion: number | null } => {
            const upperText = text.toUpperCase();
            const sfMatch = upperText.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:SF|SQ\.?\s*FT|SQUARE\s*FEET)/i);
            let sizeSF: number | null = null;
            if (sfMatch) {
                sizeSF = parseInt(sfMatch[1].replace(/,/g, ''));
            }
            const dollarMatch = upperText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:MILLION|M\b)/i);
            let priceMillion: number | null = null;
            if (dollarMatch) {
                priceMillion = parseFloat(dollarMatch[1].replace(/,/g, ''));
            }
            const bigDollarMatch = upperText.match(/\$(\d{2,3}(?:,\d{3}){2,})/);
            if (!priceMillion && bigDollarMatch) {
                const rawAmount = parseInt(bigDollarMatch[1].replace(/,/g, ''));
                if (rawAmount >= 25000000) {
                    priceMillion = rawAmount / 1000000;
                }
            }
            return { meetsSF: sizeSF !== null && sizeSF >= 100000, meetsDollar: priceMillion !== null && priceMillion >= 25, sizeSF, priceMillion };
        };

        // Property scope: Industrial only
        const excludeNonIndustrial = ['office lease', 'office building', 'office tower', 'coworking', 'multifamily', 'apartment', 'residential', 'condo', 'retail', 'restaurant', 'shopping center', 'mall', 'hotel', 'hospitality', 'resort', 'self-storage', 'mini storage', 'senior living', 'nursing home', 'medical office'];
        const industrialPropertyKeywords = ['warehouse', 'logistics', 'distribution', 'manufacturing', 'cold storage', 'last-mile', 'last mile', 'industrial outdoor storage', 'ios', 'industrial land', 'fulfillment', 'flex space', 'spec industrial', 'industrial park', 'loading dock'];

        // Section-specific keywords based on boss criteria:

        // RELEVANT ARTICLES: macro trends (rates, inflation, freight, construction inputs, labor, insurance) + industrial RE news
        const relevantKeywords = [
            'interest rate', 'fed ', 'federal reserve', 'inflation', 'cpi', 'lending', 'financing', 'capital markets',
            'freight', 'shipping', 'trucking', 'supply chain', 'port', 'cargo', 'container',
            'construction cost', 'material cost', 'steel', 'concrete', 'lumber', 'labor cost', 'labor market',
            'insurance', 'insurance cost', 'property insurance',
            'industrial', 'warehouse', 'distribution', 'fulfillment', 'cold storage', 'logistics', 'flex space',
            'manufacturing', 'last mile', 'e-commerce', 'spec development', 'industrial park',
            // Project approvals & development
            'approved', 'approves', 'approval', 'zoning', 'rezoning', 'entitlement', 'permits', 'planning board',
            'groundbreaking', 'under construction', 'development', 'project', 'proposed', 'planned',
            // Sustainability & ESG
            'sustainable industrial', 'esg property', 'net zero', 'green building', 'leed',
            // Automation & Technology
            'last mile delivery', 'automation', 'robotics', 'automated warehouse',
            // Workforce
            'workforce development', 'skilled trades', 'labor shortage',
            // Supply chain trends
            'reshoring', 'nearshoring', 'supply chain resilience', 'onshoring',
            // Property types
            'data center', 'flex warehouse', 'cross-dock', 'cross dock',
            'last-mile facility', 'micro-fulfillment', 'micro fulfillment',
            // Specialized industrial
            'agri-tech', 'agritech', 'food processing', 'food facility',
            'advanced manufacturing', 'contract manufacturing',
            'commercial real estate', 'cre', 'vacancy', 'absorption', 'rent growth', 'cap rate'
        ];

        // TRANSACTIONS: industrial sales/leases meeting thresholds
        const transactionKeywords = [
            'sale', 'sold', 'lease', 'leased', 'acquired', 'acquisition', 'purchase', 'bought',
            'deal', 'transaction', 'tenant', 'signed', 'closed', 'sf', 'square feet', 'acre',
            'industrial', 'warehouse', 'distribution', 'logistics', 'manufacturing', 'flex'
        ];

        // AVAILABILITIES: industrial listings
        const availabilityKeywords = [
            'available', 'for sale', 'for lease', 'listing', 'marketed', 'offering', 'development site',
            'spec', 'speculative', 'proposed', 'planned', 'under construction', 'delivering',
            'industrial', 'warehouse', 'distribution', 'logistics', 'manufacturing', 'flex', 'land'
        ];

        // PEOPLE NEWS: personnel moves - RELAXED
        const peopleActionKeywords = [
            'hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped', 'recruit',
            'hires', 'appoints', 'promotes', 'names', 'adds', 'taps', 'leads', 'heads',
            'chair', 'nabs', 'welcomes', 'brings', 'expands', 'grows', 'bolsters', 'strengthens',
            'movers', 'shakers', 'leadership', 'executive', 'move',
            // Additional action-like words
            'announces', 'announced', 'selected', 'recognized', 'award', 'honored', 'featured',
            'profile', 'spotlight', 'interview', 'q&a', 'power broker', 'rising star', 'top producer'
        ];
        const industrialContextKeywords = [
            // Industrial CRE companies - EXPANDED
            'nai', 'sior', 'ccim', 'cbre', 'jll', 'cushman', 'colliers', 'newmark', 'marcus', 'millichap',
            'prologis', 'duke', 'link logistics', 'rexford', 'first industrial', 'stag', 'terreno',
            'exeter', 'blackstone', 'brookfield', 'clarion', 'dermody', 'hillwood', 'idl', 'panattoni',
            'avison young', 'lee & associates', 'kidder mathews', 'transwestern', 'savills', 'ngkf',
            'eastdil', 'hff', 'walker & dunlop', 'berkadia', 'northmarq', 'keane', 'ware malcomb',
            'industrial', 'logistics', 'warehouse', 'distribution', 'fulfillment', 'cold storage',
            'commercial real estate', 'cre', 'investment sales', 'capital markets', 'brokerage',
            'real estate', 'development', 'developer', 'redevelopment', 'land use', 'zoning',
            'property', 'portfolio', 'asset', 'partner', 'principal', 'managing director', 'vice president',
            'broker', 'leasing', 'acquisition', 'construction', 'economic development', 'eda',
            // Industry associations
            'naiop', 'icsc', 'uli', 'boma', 'cbre institute', 'sior', 'ccim institute',
            // Investor profile keywords
            'investor', 'fund manager', 'private equity', 'institutional', 'family office', 'reit',
            'investment firm', 'investment manager', 'allocation', 'fundraising', 'capital raise'
        ];
        const excludeFromPeople = ['residential broker', 'elliman', 'compass real', 'redfin', 'zillow', 'mortgage lender', 'retail broker', 'multifamily broker', 'apartment complex', 'hotel broker', 'hospitality'];

        const getText = (article: NormalizedItem): string =>
            `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toLowerCase();

        const containsAny = (text: string, keywords: string[]): boolean =>
            keywords.some(kw => text.includes(kw));

        const isPolitical = (text: string): boolean => containsAny(text, excludePolitical);

        const isIndustrialProperty = (text: string): boolean => {
            if (containsAny(text, industrialPropertyKeywords)) return true;
            return !containsAny(text, excludeNonIndustrial);
        };

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

        // Transaction filter with thresholds
        // EXCEPTION: Project approvals, zoning decisions are always relevant
        const approvalKeywords = ['approved', 'approves', 'approval', 'zoning', 'rezoning', 'entitlement', 'permits', 'planning board', 'commission'];

        const applyTransactionFilter = (items: NormalizedItem[]): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                if (!isIndustrialProperty(text)) return false;

                // Project approvals/zoning are ALWAYS relevant (no threshold needed)
                const isApproval = containsAny(text, approvalKeywords);
                if (isApproval) return true;

                const threshold = meetsDealThreshold(text);
                return threshold.meetsSF || threshold.meetsDollar || (threshold.sizeSF !== null && threshold.sizeSF > 0);
            });
            console.log(`🔍 Transactions: ${items.length} → ${filtered.length} (threshold filter, approvals always included)`);
            return filtered;
        };

        // Availability filter with thresholds
        const applyAvailabilityFilter = (items: NormalizedItem[]): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                if (!isIndustrialProperty(text)) return false;
                const threshold = meetsDealThreshold(text);
                return threshold.meetsSF || (threshold.sizeSF !== null && threshold.sizeSF > 0);
            });
            console.log(`🔍 Availabilities: ${items.length} → ${filtered.length} (threshold filter)`);
            return filtered;
        };

        // People News filter - RELAXED: trust classifier, only exclude clearly non-industrial
        const applyPeopleFilter = (items: NormalizedItem[]): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                const url = (article.url || article.link || '').toLowerCase();
                if (isPolitical(text)) return false;
                if (containsAny(text, excludeFromPeople)) return false;

                // RELAXED: Accept if ANY of these conditions are met
                const hasAction = containsAny(text, peopleActionKeywords);
                const hasIndustrial = containsAny(text, industrialContextKeywords);

                // Check if from a brokerage/industry source (trust the source)
                const brokerageSources = ['bisnow.com', 'cbre.com', 'jll.com', 'cushwake.com', 'colliers.com',
                    'newmark', 'nai', 'sior.com', 'ccim.com', 'naiop.org', 're-nj.com', 'globest.com',
                    'commercialsearch.com', 'cpexecutive.com', 'therealdeal.com'];
                const isFromBrokerageSource = brokerageSources.some(s => url.includes(s));

                // Accept if: has action keywords OR industrial context OR from trusted brokerage source
                return hasAction || hasIndustrial || isFromBrokerageSource;
            });
            console.log(`🔍 People News: ${items.length} → ${filtered.length} (relaxed filter)`);
            return filtered;
        };

        // Categorize and apply section-specific filters
        let relevant = filteredArticles.filter(a => a.category === 'relevant');
        relevant = applyStrictFilter(relevant, relevantKeywords, 'Relevant');

        let transactions = filteredArticles.filter(a => a.category === 'transactions');
        transactions = applyTransactionFilter(transactions);

        let availabilities = filteredArticles.filter(a => a.category === 'availabilities');
        availabilities = applyAvailabilityFilter(availabilities);

        let people = filteredArticles.filter(a => a.category === 'people');
        people = applyPeopleFilter(people);

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
