import { NormalizedItem } from '../types/index.js';

/**
 * Build stripped-down "Goth" briefing - clean, scannable, boss-approved format
 *
 * Rules:
 * - Concise, scannable daily briefing
 * - Focus on NJ, PA, TX, FL; national only if it informs these markets
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

    // Helper to format a single bullet item - ultra clean (Option A/B/C combined)
    const formatBullet = (item: NormalizedItem): string => {
        const title = item.title || 'Untitled';
        const url = (item as any).url || item.link || '#';

        // Get source
        const sourceData = (item as any)._source || {};
        const source = sourceData.website || sourceData.name || '';

        // Truncate title to ~100 chars
        const shortTitle = title.length > 100 ? title.substring(0, 97).replace(/\s+\S*$/, '') + '...' : title;

        return `<li style="margin-bottom: 10px; line-height: 1.6; color: #333;">
            <strong>${shortTitle}</strong>
            <br>
            <span style="font-size: 13px;">→ <a href="${url}" style="color: #1e3c72; text-decoration: none;">Read at ${source || 'source'}</a></span>
            <span style="font-size: 11px; color: #999; margin-left: 10px;">[Track] [Share] [Ignore]</span>
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

    // Week-in-Review for Fridays (top 5 across all categories)
    const weekInReview = isFriday ? (() => {
        const allItems = [...relevant, ...transactions, ...availabilities, ...people];
        const top5 = allItems.slice(0, 5);
        if (top5.length === 0) return '';

        return `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #1e3c72;">
            <h2 style="color: #1e3c72; font-size: 18px; margin-bottom: 15px; font-weight: 600;">
                📊 WEEK-IN-REVIEW — Top 5 Developments
            </h2>
            <ol style="margin: 0; padding-left: 20px;">
                ${top5.map((item, i) => {
                    const title = item.title || 'Untitled';
                    const url = (item as any).url || item.link || '#';
                    return `<li style="margin-bottom: 10px; line-height: 1.5;">
                        <a href="${url}" style="color: #1e3c72; text-decoration: none;">${title.length > 100 ? title.substring(0, 97) + '...' : title}</a>
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
<body style="font-family: Arial, Helvetica, sans-serif; background-color: #ffffff; margin: 0; padding: 20px; color: #333;">
    <div style="max-width: 600px; margin: 0 auto;">

        <!-- Header - Simple text -->
        <div style="border-bottom: 2px solid #1e3c72; padding-bottom: 15px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 20px; color: #1e3c72; font-weight: 700;">WOODMONT INDUSTRIAL PARTNERS</h1>
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Daily Briefing | ${dateRange}</p>
            <p style="margin: 3px 0 0 0; font-size: 12px; color: #888;">Focus Markets: NJ, PA, TX, FL</p>
        </div>

        <!-- Section 1: Relevant Articles -->
        <div style="margin-bottom: 20px;">
            <h2 style="color: #1e3c72; font-size: 14px; margin: 0 0 10px 0; font-weight: 700; text-transform: uppercase;">
                Relevant Articles — Macro Trends & Industrial News
            </h2>
            ${renderSection(relevant, 6)}
        </div>

        <!-- Section 2: Transactions -->
        <div style="margin-bottom: 20px;">
            <h2 style="color: #1e3c72; font-size: 14px; margin: 0 0 10px 0; font-weight: 700; text-transform: uppercase;">
                Transactions — Sales & Leases (≥100K SF / ≥$25M)
            </h2>
            ${renderSection(transactions, 6)}
        </div>

        <!-- Section 3: Availabilities -->
        <div style="margin-bottom: 20px;">
            <h2 style="color: #1e3c72; font-size: 14px; margin: 0 0 10px 0; font-weight: 700; text-transform: uppercase;">
                Availabilities — Properties for Sale/Lease
            </h2>
            ${renderSection(availabilities, 6)}
        </div>

        <!-- Section 4: People News -->
        <div style="margin-bottom: 20px;">
            <h2 style="color: #1e3c72; font-size: 14px; margin: 0 0 10px 0; font-weight: 700; text-transform: uppercase;">
                People News — Personnel Moves
            </h2>
            ${renderSection(people, 6)}
        </div>

        ${weekInReview}

        <!-- Footer - Simple -->
        <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 20px; text-align: center;">
            <p style="margin: 0; font-size: 11px; color: #888;">
                Woodmont Industrial Partners | Confidential<br>
                © ${now.getFullYear()}
            </p>
        </div>

    </div>
</body>
</html>`;

    return html;
}
