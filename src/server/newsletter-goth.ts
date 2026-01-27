import { NormalizedItem } from '../types/index.js';

/**
 * Build stripped-down "Goth" briefing - clean, scannable, boss-approved format
 *
 * Rules:
 * - Concise, scannable daily briefing
 * - Focus on NJ, PA, FL; national only if it informs these markets
 * - Deals ≥100K SF or ≥$25M highlighted
 * - Clear headings and bullets
 * - 2 lines or fewer per bullet, 4-6 bullets per section
 * - Include: location + size + key players + terms
 * - Action tags: [Track] [Share] [Ignore]
 * - Fridays: Week-in-Review top 5
 */
export function buildGothBriefing(
    { relevant = [], transactions = [], availabilities = [], people = [] }: {
        relevant?: NormalizedItem[];
        transactions?: NormalizedItem[];
        availabilities?: NormalizedItem[];
        people?: NormalizedItem[];
    },
    period: string = "24 hours",
    isFriday: boolean = false
) {
    const now = new Date();

    // Parse period for date range
    let hoursBack = 24;
    const periodNum = parseInt(period.split(' ')[0]) || 24;
    if (period.includes('day')) {
        hoursBack = periodNum * 24;
    } else if (period.includes('hour')) {
        hoursBack = periodNum;
    }

    const startDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    const dateRange = `${startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`;

    // Dashboard URL for tracking links
    const dashboardUrl = 'https://pratiyushc.github.io/Woodmont-Industrial-News-Briefing';

    // Extract a trackable keyword from title
    const extractTrackKeyword = (title: string): string => {
        const companyMatch = title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/);
        if (companyMatch) return companyMatch[0];
        const locationMatch = title.match(/(New\s+Jersey|New\s+York|South\s+Florida|Pennsylvania|Miami-Dade|Broward|Philadelphia|Newark)/i);
        if (locationMatch) return locationMatch[0];
        const words = title.split(' ').slice(0, 3).join(' ');
        return words.length > 5 ? words : title.substring(0, 30);
    };

    // Helper to format a single bullet item - executive light theme with full details
    const formatBullet = (item: NormalizedItem): string => {
        const title = item.title || 'Untitled';
        const url = (item as any).url || item.link || '#';

        // Get source
        const sourceData = (item as any)._source || {};
        const source = sourceData.website || sourceData.name || '';

        // Get description - full context for executive summary
        const rawDescription = (item.description && item.description.trim()) ||
                               (item.summary && item.summary.trim()) ||
                               ((item as any).content_text && (item as any).content_text.trim()) || '';

        // Show up to 180 chars of description for executive context
        const description = rawDescription.length > 180
            ? rawDescription.substring(0, 177).replace(/\s+\S*$/, '') + '...'
            : rawDescription;

        // Create tracking link
        const trackKeyword = extractTrackKeyword(title);
        const trackUrl = `${dashboardUrl}?track=${encodeURIComponent(trackKeyword)}`;

        return `<li style="margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #e8e8e8; list-style: none;">
            <a href="${url}" style="color: #1e3c72; text-decoration: none; font-weight: 600; font-size: 15px; line-height: 1.4; display: block;">${title}</a>
            ${description ? `<p style="margin: 8px 0 0 0; color: #555; font-size: 13px; line-height: 1.5;">${description}</p>` : ''}
            <div style="margin-top: 8px;">
                <a href="${url}" style="color: #2563eb; text-decoration: none; font-size: 12px;">Read at ${source || 'source'} →</a>
                <span style="font-size: 11px; margin-left: 12px;"><a href="${trackUrl}" style="color: #10b981; text-decoration: none;">[Track]</a> <span style="color: #999;">[Share] [Ignore]</span></span>
            </div>
        </li>`;
    };

    // Render section with 4-6 bullets max
    const renderSection = (items: NormalizedItem[], maxItems: number = 6): string => {
        if (!items || items.length === 0) {
            return '<p style="color: #888; font-style: italic; margin-left: 20px;">No updates for this section.</p>';
        }
        const bullets = items.slice(0, maxItems).map(formatBullet);
        return `<ul style="margin: 0; padding-left: 20px; list-style-type: disc;">${bullets.join('')}</ul>`;
    };

    // Week-in-Review for Fridays (top 5 across all categories) - Dark theme
    const weekInReview = isFriday ? (() => {
        const allItems = [...relevant, ...transactions, ...availabilities, ...people];
        const top5 = allItems.slice(0, 5);
        if (top5.length === 0) return '';

        return `
        <div style="margin-top: 30px; padding-top: 25px; border-top: 2px solid #1e3c72;">
            <h2 style="color: #1e3c72; font-size: 12px; margin: 0 0 15px 0; font-weight: 600; letter-spacing: 1px;">
                WEEK-IN-REVIEW — TOP 5 DEVELOPMENTS
            </h2>
            <ol style="margin: 0; padding-left: 20px; color: #475569;">
                ${top5.map((item, i) => {
                    const title = item.title || 'Untitled';
                    const url = (item as any).url || item.link || '#';
                    return `<li style="margin-bottom: 12px; line-height: 1.5;">
                        <a href="${url}" style="color: #1e3c72; text-decoration: none; font-weight: 600;">${title}</a>
                    </li>`;
                }).join('')}
            </ol>
        </div>`;
    })() : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Woodmont Industrial Daily Briefing</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 30px 20px; color: #333;">
    <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

        <!-- Header - Light Executive -->
        <div style="background-color: #1e3c72; padding: 30px; border-bottom: 3px solid #4a9eff;">
            <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 300; letter-spacing: 2px;">WOODMONT INDUSTRIAL</h1>
            <p style="margin: 8px 0 0 0; font-size: 13px; color: #a8c5ff; font-weight: 500; letter-spacing: 1px;">EXECUTIVE DAILY BRIEFING</p>
            <p style="margin: 12px 0 0 0; font-size: 12px; color: #d0e0ff;">${dateRange}</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #a0b8e0;">Focus: NJ • PA • FL</p>
        </div>

        <!-- Content -->
        <div style="padding: 25px 30px;">

            <!-- Section 1: Relevant Articles -->
            <div style="margin-bottom: 30px;">
                <h2 style="color: #1e3c72; font-size: 12px; margin: 0 0 15px 0; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
                    RELEVANT ARTICLES
                </h2>
                <p style="margin: 0 0 12px 0; font-size: 11px; color: #888;">Macro Trends & Industrial News</p>
                <ul style="margin: 0; padding: 0;">${renderSection(relevant, 10)}</ul>
            </div>

            <!-- Section 2: Transactions -->
            <div style="margin-bottom: 30px;">
                <h2 style="color: #1e3c72; font-size: 12px; margin: 0 0 15px 0; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
                    TRANSACTIONS
                </h2>
                <p style="margin: 0 0 12px 0; font-size: 11px; color: #888;">Sales & Leases ≥100K SF / ≥$25M</p>
                <ul style="margin: 0; padding: 0;">${renderSection(transactions, 8)}</ul>
            </div>

            <!-- Section 3: Availabilities -->
            <div style="margin-bottom: 30px;">
                <h2 style="color: #1e3c72; font-size: 12px; margin: 0 0 15px 0; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
                    AVAILABILITIES
                </h2>
                <p style="margin: 0 0 12px 0; font-size: 11px; color: #888;">Industrial Properties for Sale/Lease</p>
                <ul style="margin: 0; padding: 0;">${renderSection(availabilities, 8)}</ul>
            </div>

            <!-- Section 4: People News -->
            <div style="margin-bottom: 20px;">
                <h2 style="color: #1e3c72; font-size: 12px; margin: 0 0 15px 0; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;">
                    PEOPLE NEWS
                </h2>
                <p style="margin: 0 0 12px 0; font-size: 11px; color: #888;">Personnel Moves in Industrial</p>
                <ul style="margin: 0; padding: 0;">${renderSection(people, 6)}</ul>
            </div>

            ${weekInReview}

        </div>

        <!-- Footer - Light -->
        <div style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="margin: 0; font-size: 10px; color: #888; letter-spacing: 1px;">
                WOODMONT INDUSTRIAL PARTNERS<br>
                <span style="color: #aaa;">Confidential & Proprietary © ${now.getFullYear()}</span>
            </p>
        </div>

    </div>
</body>
</html>`;

    return html;
}
