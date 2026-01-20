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
        // Helper to get valid date - prefers fetchedAt (when we first saw it), falls back to pubDate
        const getValidDate = (article: NormalizedItem): Date | null => {
            // Use date_modified (fetchedAt) first, then pubDate, then date_published
            const dateStr = (article as any).date_modified || article.pubDate || (article as any).date_published;
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
        // Must have BOTH: a personnel action AND an industrial context
        const peopleActionKeywords = [
            'hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped', 'recruit',
            'hires', 'appoints', 'promotes', 'names', 'adds', 'taps', 'leads', 'heads',
            'chair', 'nabs', 'welcomes', 'brings', 'expands', 'grows', 'bolsters', 'strengthens',
            'movers', 'shakers', 'leadership', 'executive', 'move'
        ];
        const industrialContextKeywords = [
            // Industrial CRE companies
            'nai', 'sior', 'ccim', 'cbre', 'jll', 'cushman', 'colliers', 'newmark', 'marcus', 'millichap',
            'prologis', 'duke', 'link logistics', 'rexford', 'first industrial', 'stag', 'terreno',
            'exeter', 'blackstone', 'brookfield', 'clarion', 'dermody', 'hillwood', 'idl', 'panattoni',
            // Industrial focus keywords
            'industrial', 'logistics', 'warehouse', 'distribution', 'fulfillment', 'cold storage',
            'commercial real estate', 'cre', 'investment sales', 'capital markets', 'brokerage',
            // Broader real estate / development terms (allow more people news)
            'real estate', 'development', 'developer', 'redevelopment', 'land use', 'zoning',
            'property', 'portfolio', 'asset', 'partner', 'principal', 'managing director', 'vice president',
            'broker', 'leasing', 'acquisition', 'construction', 'economic development', 'eda'
        ];
        // Exclude residential/non-industrial (be more specific to reduce false exclusions)
        const excludeFromPeople = ['residential broker', 'elliman', 'compass real', 'redfin', 'zillow', 'mortgage lender', 'retail broker', 'multifamily broker', 'apartment complex', 'hotel broker', 'hospitality'];

        const getText = (article: NormalizedItem): string =>
            `${article.title || ''} ${article.description || ''} ${article.summary || ''}`.toLowerCase();

        const containsAny = (text: string, keywords: string[]): boolean =>
            keywords.some(kw => text.includes(kw));

        const isPolitical = (text: string): boolean => containsAny(text, excludePolitical);

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

        // Special strict filter for People News - requires BOTH action keyword AND industrial context
        const applyPeopleFilter = (items: NormalizedItem[]): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                // Exclude non-industrial sectors
                if (containsAny(text, excludeFromPeople)) return false;
                // Must have personnel action AND industrial context
                const hasAction = containsAny(text, peopleActionKeywords);
                const hasIndustrial = containsAny(text, industrialContextKeywords);
                return hasAction && hasIndustrial;
            });
            console.log(`🔍 People News: ${items.length} → ${filtered.length} (strict industrial filter)`);
            return filtered;
        };

        // Categorize from REGIONAL articles only, then apply content filters
        let relevant = regionalArticles.filter(a => a.category === 'relevant');
        relevant = applyStrictFilter(relevant, relevantKeywords, 'Relevant');

        let transactions = regionalArticles.filter(a => a.category === 'transactions');
        transactions = applyStrictFilter(transactions, transactionKeywords, 'Transactions');

        let availabilities = regionalArticles.filter(a => a.category === 'availabilities');
        availabilities = applyStrictFilter(availabilities, availabilityKeywords, 'Availabilities');

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

        // Helper to get valid date - prefers date_modified (fetchedAt), falls back to pubDate
        const getValidDate = (article: NormalizedItem): Date | null => {
            const dateStr = (article as any).date_modified || article.pubDate || (article as any).date_published;
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
        // Must have BOTH: a personnel action AND an industrial context
        const peopleActionKeywords = [
            'hired', 'appointed', 'promoted', 'joined', 'named', 'elevated', 'tapped', 'recruit',
            'hires', 'appoints', 'promotes', 'names', 'adds', 'taps', 'leads', 'heads',
            'chair', 'nabs', 'welcomes', 'brings', 'expands', 'grows', 'bolsters', 'strengthens',
            'movers', 'shakers', 'leadership', 'executive', 'move'
        ];
        const industrialContextKeywords = [
            // Industrial CRE companies
            'nai', 'sior', 'ccim', 'cbre', 'jll', 'cushman', 'colliers', 'newmark', 'marcus', 'millichap',
            'prologis', 'duke', 'link logistics', 'rexford', 'first industrial', 'stag', 'terreno',
            'exeter', 'blackstone', 'brookfield', 'clarion', 'dermody', 'hillwood', 'idl', 'panattoni',
            // Industrial focus keywords
            'industrial', 'logistics', 'warehouse', 'distribution', 'fulfillment', 'cold storage',
            'commercial real estate', 'cre', 'investment sales', 'capital markets', 'brokerage',
            // Broader real estate / development terms (allow more people news)
            'real estate', 'development', 'developer', 'redevelopment', 'land use', 'zoning',
            'property', 'portfolio', 'asset', 'partner', 'principal', 'managing director', 'vice president',
            'broker', 'leasing', 'acquisition', 'construction', 'economic development', 'eda'
        ];
        // Exclude residential/non-industrial (be more specific to reduce false exclusions)
        const excludeFromPeople = ['residential broker', 'elliman', 'compass real', 'redfin', 'zillow', 'mortgage lender', 'retail broker', 'multifamily broker', 'apartment complex', 'hotel broker', 'hospitality'];

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

        // Special strict filter for People News - requires BOTH action keyword AND industrial context
        const applyPeopleFilter = (items: NormalizedItem[]): NormalizedItem[] => {
            const filtered = items.filter(article => {
                const text = getText(article);
                if (isPolitical(text)) return false;
                if (containsAny(text, excludeFromPeople)) return false;
                const hasAction = containsAny(text, peopleActionKeywords);
                const hasIndustrial = containsAny(text, industrialContextKeywords);
                return hasAction && hasIndustrial;
            });
            console.log(`🔍 People News: ${items.length} → ${filtered.length} (strict industrial filter)`);
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
