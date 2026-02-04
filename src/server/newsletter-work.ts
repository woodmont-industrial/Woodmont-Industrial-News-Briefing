/**
 * Work Newsletter Template - Boss's Preferred Clean Style
 * Simple, professional format with minimal styling
 */

import { NormalizedItem } from '../types/index.js';

// Known paywalled sources
const PAYWALLED_SOURCES = [
    'wsj', 'wall street journal', 'bloomberg', 'costar', 'bisnow',
    'globest', 'commercial observer', 'therealdeal', 'the real deal',
    'bizjournals', 'business journal', 'njbiz', 'lvb'
];

function isPaywalled(source: string, url: string): boolean {
    const check = (source + ' ' + url).toLowerCase();
    return PAYWALLED_SOURCES.some(pw => check.includes(pw));
}

// Extract a readable source name from source field or URL
function getSourceName(source: string, url: string): string {
    if (source && source.length > 0 && source !== 'Unknown') {
        // Clean up common source name patterns
        return source
            .replace(/^https?:\/\/(www\.)?/, '')
            .replace(/\.com.*$/, '')
            .replace(/\.(org|net|io).*$/, '')
            .replace(/\//g, '')
            .trim() || 'Source';
    }
    // Fall back to domain from URL
    try {
        const domain = new URL(url).hostname.replace('www.', '').replace('.com', '').replace('.org', '');
        return domain || 'Source';
    } catch {
        return 'Source';
    }
}

export function buildWorkBriefing(
    relevant: NormalizedItem[],
    transactions: NormalizedItem[],
    availabilities: NormalizedItem[],
    people: NormalizedItem[],
    dateRange: string,
    weekInReview?: NormalizedItem[]
): string {
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const isFriday = today.getDay() === 5;

    const actionUrl = 'https://woodmont-industrial.github.io/Woodmont-Industrial-News-Briefing/action.html';

    const extractTrackKeyword = (title: string): string => {
        const companyMatch = title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/);
        if (companyMatch) return companyMatch[0];
        const locationMatch = title.match(/(New\s+Jersey|South\s+Florida|Pennsylvania|Miami-Dade|Broward|Philadelphia|Newark)/i);
        if (locationMatch) return locationMatch[0];
        const words = title.split(' ').slice(0, 3).join(' ');
        return words.length > 5 ? words : title.substring(0, 30);
    };

    // Format a single article bullet - max ~2 lines
    const formatBullet = (item: NormalizedItem): string => {
        const title = item.title || 'Untitled';
        const url = (item as any).url || item.link || '#';
        const source = item.source || '';
        const sourceName = getSourceName(source, url);
        const paywalled = isPaywalled(source, url) ? ' <span style="color: #999; font-size: 11px;">(paywalled)</span>' : '';

        // Keep display text short - title only, truncate at 120 chars for ~2 lines
        let displayText = title;
        if (displayText.length > 120) {
            displayText = displayText.substring(0, 117).replace(/\s+\S*$/, '') + '...';
        }

        // Action links
        const trackKeyword = extractTrackKeyword(title);
        const trackUrl = `${actionUrl}?action=track&keyword=${encodeURIComponent(trackKeyword)}`;
        const articleId = encodeURIComponent(url);
        const titleParam = encodeURIComponent(title.substring(0, 80));
        const ignoreUrl = `${actionUrl}?action=ignore&articleId=${articleId}&title=${titleParam}`;
        const shareSubject = encodeURIComponent(`FW: ${title}`);
        const shareBody = encodeURIComponent(`Thought you'd find this relevant:\n\n${title}\n${url}`);
        const shareUrl = `mailto:?subject=${shareSubject}&body=${shareBody}`;

        return `<li style="margin-bottom: 12px; line-height: 1.5; color: #333;">
            ${displayText} — <a href="${url}" style="color: #2563eb; text-decoration: underline;">${sourceName}</a>${paywalled} <a href="${trackUrl}" style="color: #10b981; text-decoration: none; font-size: 11px;">[Track]</a> <a href="${shareUrl}" style="color: #6366f1; text-decoration: none; font-size: 11px;">[Share]</a> <a href="${ignoreUrl}" style="color: #dc2626; text-decoration: none; font-size: 11px;">[Ignore]</a>
        </li>`;
    };

    const renderSection = (items: NormalizedItem[], maxItems: number = 6): string => {
        if (!items || items.length === 0) {
            return '<p style="color: #666; font-style: italic; margin: 10px 0 20px 0;">No updated information provided for this section.</p>';
        }
        const bullets = items.slice(0, maxItems).map(formatBullet);
        return `<ul style="margin: 10px 0 20px 0; padding-left: 25px; list-style-type: disc;">${bullets.join('')}</ul>`;
    };

    // Week-in-Review section (Fridays only)
    let weekInReviewHtml = '';
    if (isFriday && weekInReview && weekInReview.length > 0) {
        const top5 = weekInReview.slice(0, 5);
        weekInReviewHtml = `
        <!-- Week-in-Review -->
        <h2 style="margin: 25px 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold; border-top: 2px solid #2563eb; padding-top: 15px;">
            Week-in-Review — Top 5 Developments
        </h2>
        ${renderSection(top5, 5)}
        `;
    }

    const headerTitle = isFriday
        ? 'Woodmont Industrial Partners — Weekly Industrial News Briefing'
        : 'Woodmont Industrial Partners — Daily Industrial News Briefing';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${headerTitle}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; margin: 0; padding: 30px 40px; color: #333; line-height: 1.5;">
    <div style="max-width: 800px; margin: 0 auto;">

        <!-- Header -->
        <h1 style="margin: 0 0 5px 0; font-size: 24px; color: #1e3a5f; font-weight: bold;">
            ${headerTitle}
        </h1>
        <p style="margin: 0 0 15px 0; font-size: 14px; color: #333;">
            <strong>Date:</strong> ${formattedDate}
        </p>
        <hr style="border: none; border-top: 2px solid #2563eb; margin: 0 0 25px 0;">

        <!-- Relevant News -->
        <h2 style="margin: 0 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold;">
            Relevant News
        </h2>
        ${renderSection(relevant, 6)}

        <!-- Transactions -->
        <h2 style="margin: 0 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold;">
            Transactions
        </h2>
        ${renderSection(transactions, 6)}

        <!-- Availabilities -->
        <h2 style="margin: 0 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold;">
            Availabilities
        </h2>
        ${renderSection(availabilities, 6)}

        <!-- People News -->
        <h2 style="margin: 0 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold;">
            People News
        </h2>
        ${renderSection(people, 6)}

        ${weekInReviewHtml}

        <!-- Footer -->
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 15px 0;">
        <p style="font-size: 11px; color: #888; margin: 0;">
            This briefing is automatically generated for Woodmont Industrial Partners.<br>
            Focus regions: New Jersey, Pennsylvania, South Florida | Deals ≥100K SF or ≥$25M
        </p>

    </div>
</body>
</html>`;

    return html;
}
