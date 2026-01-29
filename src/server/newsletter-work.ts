/**
 * Work Newsletter Template - Boss's Preferred Clean Style
 * Simple, professional format with minimal styling
 */

import { NormalizedItem } from '../types/index.js';

export function buildWorkBriefing(
    relevant: NormalizedItem[],
    transactions: NormalizedItem[],
    availabilities: NormalizedItem[],
    people: NormalizedItem[],
    dateRange: string
): string {
    // Format date nicely
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Action page URL for tracking/ignore links (instant feedback, no popup)
    const actionUrl = 'https://woodmont-industrial.github.io/Woodmont-Industrial-News-Briefing/action.html';

    // Extract a trackable keyword from title (company name, location, etc.)
    const extractTrackKeyword = (title: string): string => {
        // Try to extract company/organization names (multi-word capitalized)
        const companyMatch = title.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/);
        if (companyMatch) return companyMatch[0];

        // Try to extract location names
        const locationMatch = title.match(/(New\s+Jersey|New\s+York|South\s+Florida|Pennsylvania|Miami-Dade|Broward|Philadelphia|Newark)/i);
        if (locationMatch) return locationMatch[0];

        // Fall back to first few significant words
        const words = title.split(' ').slice(0, 3).join(' ');
        return words.length > 5 ? words : title.substring(0, 30);
    };

    // Format a single article bullet
    const formatBullet = (item: NormalizedItem): string => {
        const title = item.title || 'Untitled';
        const url = (item as any).url || item.link || '#';
        const source = item.source || 'Source';

        // Get description for context
        const rawDescription = (item.description && item.description.trim()) ||
                               (item.summary && item.summary.trim()) ||
                               ((item as any).content_text && (item as any).content_text.trim()) || '';

        // Use title + brief description if available
        let displayText = title;
        if (rawDescription && rawDescription.length > 20) {
            // Add context from description if title is short
            if (title.length < 80 && rawDescription.length > 0) {
                const briefDesc = rawDescription.length > 150
                    ? rawDescription.substring(0, 147).replace(/\s+\S*$/, '') + '...'
                    : rawDescription;
                // Only add if description adds new info
                if (!title.toLowerCase().includes(briefDesc.substring(0, 30).toLowerCase())) {
                    displayText = `${title}; ${briefDesc.charAt(0).toLowerCase()}${briefDesc.slice(1)}`;
                }
            }
        }

        // Create tracking link - goes to action page for instant feedback
        const trackKeyword = extractTrackKeyword(title);
        const trackUrl = `${actionUrl}?action=track&keyword=${encodeURIComponent(trackKeyword)}`;

        // Create ignore link - uses article URL as unique identifier
        const articleId = encodeURIComponent(url);
        const titleParam = encodeURIComponent(title.substring(0, 80));
        const ignoreUrl = `${actionUrl}?action=ignore&articleId=${articleId}&title=${titleParam}`;

        return `<li style="margin-bottom: 14px; line-height: 1.6; color: #333;">
            ${displayText} <a href="${url}" style="color: #2563eb; text-decoration: underline;">Source</a> <a href="${trackUrl}" style="color: #10b981; text-decoration: none; font-size: 12px;">[Track]</a> <a href="${ignoreUrl}" style="color: #dc2626; text-decoration: none; font-size: 12px;">[Ignore]</a>
        </li>`;
    };

    // Render section with bullets
    const renderSection = (items: NormalizedItem[], maxItems: number = 10): string => {
        if (!items || items.length === 0) {
            return '<p style="color: #666; font-style: italic; margin: 10px 0 20px 0;">No updated information provided for this section.</p>';
        }
        const bullets = items.slice(0, maxItems).map(formatBullet);
        return `<ul style="margin: 10px 0 20px 0; padding-left: 25px; list-style-type: disc;">${bullets.join('')}</ul>`;
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Woodmont Industrial Partners - Daily Industrial News Briefing</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; margin: 0; padding: 30px 40px; color: #333; line-height: 1.5;">
    <div style="max-width: 800px; margin: 0 auto;">

        <!-- Header -->
        <h1 style="margin: 0 0 5px 0; font-size: 24px; color: #1e3a5f; font-weight: bold;">
            Woodmont Industrial Partners — Daily Industrial News Briefing
        </h1>
        <p style="margin: 0 0 15px 0; font-size: 14px; color: #333;">
            <strong>Date:</strong> ${formattedDate}
        </p>
        <hr style="border: none; border-top: 2px solid #2563eb; margin: 0 0 25px 0;">

        <!-- Relevant News -->
        <h2 style="margin: 0 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold;">
            Relevant News
        </h2>
        ${renderSection(relevant, 5)}

        <!-- Transactions -->
        <h2 style="margin: 0 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold;">
            Transactions
        </h2>
        ${renderSection(transactions, 5)}

        <!-- Availabilities -->
        <h2 style="margin: 0 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold;">
            Availabilities
        </h2>
        ${renderSection(availabilities, 5)}

        <!-- People News -->
        <h2 style="margin: 0 0 10px 0; font-size: 16px; color: #1e3a5f; font-weight: bold;">
            People News
        </h2>
        ${renderSection(people, 5)}

        <!-- Footer -->
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0 15px 0;">
        <p style="font-size: 11px; color: #888; margin: 0;">
            This briefing is automatically generated for Woodmont Industrial Partners.<br>
            Focus regions: New Jersey, Pennsylvania, South Florida
        </p>

    </div>
</body>
</html>`;

    return html;
}
