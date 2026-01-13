import { NormalizedItem } from '../types/index.js';

// Build HTML briefing in required format. Expects sections with arrays of items: { title, link, publisher, author, pubDate, description }
export function buildBriefing({ relevant = [], transactions = [], availabilities = [], people = [] }: { relevant?: NormalizedItem[]; transactions?: NormalizedItem[]; availabilities?: NormalizedItem[]; people?: NormalizedItem[] }, period: string = "Current Period") {
    // Calculate date range for the header
    const now = new Date();

    // Parse period - supports "48 hours", "7 days", etc.
    let hoursBack = 48; // default 48 hours
    const periodNum = parseInt(period.split(' ')[0]) || 48;
    if (period.includes('day')) {
        hoursBack = periodNum * 24;
    } else if (period.includes('hour')) {
        hoursBack = periodNum;
    }

    const startDate = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
    const dateRange = `${startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} (ET)`;

    const sections = [
        { title: "RELEVANT ARTICLES — Macro Trends & Industrial Real Estate News", icon: "📰", items: relevant },
        { title: "TRANSACTIONS — Notable Sales/Leases (≥100K SF or ≥$25M)", icon: "💼", items: transactions },
        { title: "AVAILABILITIES — New Industrial Properties for Sale/Lease", icon: "🏢", items: availabilities },
        { title: "PEOPLE NEWS — Personnel Moves in Industrial Brokerage/Development", icon: "👥", items: people }
    ];

    const renderItems = (items: NormalizedItem[]) => {
        if (!items || !items.length) return '<div class="empty-section">No updated information provided for this section.</div>';
        const safe = items.slice(0, 6).map((it: NormalizedItem) => {
            const title = it.title || 'Untitled';

            // Get source from multiple possible fields - NEVER show "Unknown"
            const sourceData = (it as any)._source || {};
            const sourceWebsite = sourceData.website || '';
            const sourceName = sourceData.name && sourceData.name !== 'Unknown' ? sourceData.name : '';
            const sourceFeedName = sourceData.feedName || '';

            // Extract domain from URL as fallback
            const sourceUrl = it.link || '';
            let extractedDomain = '';
            try {
                if (sourceUrl) {
                    extractedDomain = new URL(sourceUrl).hostname.replace('www.', '');
                }
            } catch (e) {
                extractedDomain = '';
            }

            // Priority: website domain > feedName > sourceName > extracted domain
            const publisher = sourceWebsite || sourceFeedName || sourceName || it.publisher || it.source || extractedDomain || 'Industry News';

            const link = it.link || '#';

            // Get description from multiple possible fields - NEVER show "No description available"
            const rawDescription = (it.description && it.description.trim()) ||
                                   (it.summary && it.summary.trim()) ||
                                   ((it as any).content_text && (it as any).content_text.trim()) ||
                                   ((it as any).content_html && (it as any).content_html.replace(/<[^>]*>/g, '').trim()) ||
                                   '';
            const description = rawDescription || `Click to read the full story: "${title}"`;

            // Create fuller description (250 characters for better context)
            const fullSummary = description.length > 250
                ? description.substring(0, 250).replace(/\s+\S*$/, '') + '...'
                : description;

            // Get state/region from regions array
            const state = it.regions && it.regions.length > 0 ? it.regions[0] : 'US';

            // Get category from category field (set by classification)
            const category = it.category || 'relevant';

            // Generate "Why This Matters" context based on category
            const relevanceContext: Record<string, string> = {
                transactions: '💡 <strong>Impact:</strong> This transaction signals market activity and pricing trends in the industrial sector.',
                availabilities: '💡 <strong>Impact:</strong> New availability in the market - potential opportunity for expansion or investment.',
                people: '💡 <strong>Impact:</strong> Personnel moves can indicate market shifts and new business opportunities.',
                relevant: '💡 <strong>Impact:</strong> Macro trend affecting industrial real estate fundamentals and investment decisions.'
            };

            const whyItMatters = relevanceContext[category] || relevanceContext['relevant'];

            // Clean up category names for display
            const categoryLabels: Record<string, string> = {
                relevant: 'MACRO TRENDS',
                transactions: 'TRANSACTION',
                availabilities: 'AVAILABILITY',
                people: 'PEOPLE NEWS',
                corporate: 'Corporate'
            };

            const categoryDisplay = categoryLabels[category] || 'RELEVANT';

            // Create tags: state, category, source
            const tags = [
                `<span class="badge badge-location">${state}</span>`,
                `<span class="badge badge-category">${categoryDisplay}</span>`,
                `<span class="badge badge-source">${publisher}</span>`
            ].join(' ');

            return `<div class="article-card">
                <div class="article-title-header">
                    <h3 class="article-title">${title}</h3>
                </div>
                <div class="article-header">
                    ${tags}
                </div>
                <div class="article-description">
                    <p>${fullSummary}</p>
                </div>
                <div class="article-context">
                    ${whyItMatters}
                </div>
                <div class="article-source">
                    <div class="source-info">
                        <span class="source-label">📰 Source:</span>
                        <span class="source-name">${publisher}</span>
                    </div>
                    <a href="${link}" class="read-more-btn" target="_blank">Read Full Article →</a>
                </div>
            </div>`;
        });
        return safe.join('');
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Woodmont Industrial Partners - Daily Briefing</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }

        .header {
            background-color: #e8eef7;
            color: #1e3c72;
            padding: 40px 30px;
            text-align: center;
            border-bottom: 4px solid #1e3c72;
        }

        .header h1 {
            font-size: 32px;
            margin-bottom: 10px;
            color: #1e3c72;
            font-weight: 700;
        }

        .header .subtitle {
            font-size: 20px;
            margin-bottom: 8px;
            color: #1e3c72;
            font-weight: 600;
        }

        .header .date-range {
            font-size: 14px;
            font-style: italic;
            color: #2a5298;
        }

        .content {
            padding: 30px;
        }

        .section {
            margin-bottom: 35px;
        }

        .section-header {
            display: flex;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 3px solid #667eea;
        }

        .section-icon {
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 15px;
            font-size: 20px;
        }

        .section-title {
            font-size: 22px;
            color: #1e3c72;
            font-weight: 600;
        }

        .article-card {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .article-card:hover {
            transform: translateX(5px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }

        .article-title-header {
            background-color: #e8eef7;
            margin: -20px -20px 15px -20px;
            padding: 15px 20px;
            border-radius: 8px 8px 0 0;
            border-bottom: 2px solid #667eea;
        }

        .article-title {
            font-size: 17px;
            font-weight: 600;
            color: #1e3c72;
            margin: 0;
            line-height: 1.4;
        }

        .article-header {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 14px;
        }

        .article-description {
            color: #333;
            line-height: 1.7;
            margin-bottom: 14px;
            font-size: 15px;
        }

        .article-description p {
            margin: 0;
        }

        .article-context {
            background: #fff8e1;
            border-left: 3px solid #ffa726;
            padding: 10px 14px;
            margin-bottom: 14px;
            border-radius: 4px;
            font-size: 13px;
            color: #555;
        }

        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .badge-location {
            background: #e3f2fd;
            color: #1976d2;
        }

        .badge-category {
            background: #f3e5f5;
            color: #7b1fa2;
        }

        .badge-source {
            background: #e8f5e9;
            color: #388e3c;
        }

        .badge-type {
            background: #e8f5e9;
            color: #388e3c;
        }

        .article-source {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 14px;
            padding-top: 14px;
            border-top: 2px solid #e0e0e0;
        }

        .source-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .source-label {
            font-size: 13px;
            color: #666;
            font-weight: 500;
        }

        .source-name {
            font-size: 14px;
            color: #1e3c72;
            font-weight: 600;
        }

        .read-more-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 500;
            font-size: 13px;
            transition: transform 0.2s, box-shadow 0.2s;
            display: inline-block;
        }

        .read-more-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            text-decoration: none;
            color: white;
        }

        .highlight-box {
            background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 15px;
        }

        .highlight-label {
            font-weight: 600;
            color: #d84315;
            margin-bottom: 8px;
            text-transform: uppercase;
            font-size: 12px;
        }

        .highlight-text {
            color: #333;
            line-height: 1.6;
        }

        .footer {
            background: #f8f9fa;
            padding: 25px 30px;
            text-align: center;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #dee2e6;
        }

        .empty-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            color: #666;
            font-style: italic;
        }

        @media (max-width: 600px) {
            .header h1 {
                font-size: 22px;
            }

            .section-title {
                font-size: 18px;
            }

            .article-header {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏭 Woodmont Industrial Partners</h1>
            <div class="subtitle">Daily Industrial News Briefing</div>
            <div class="date-range">Coverage Period: ${dateRange}</div>
            <div class="date-range">Focus Markets: NJ, PA, FL, TX</div>
        </div>

        <div class="content">
            ${sections.map(section => `
            <div class="section">
                <div class="section-header">
                    <div class="section-icon">${section.icon}</div>
                    <div class="section-title">${section.title}</div>
                </div>
                ${renderItems(section.items)}
            </div>
            `).join('')}
        </div>

        <div class="footer">
            <strong>Woodmont Industrial Partners</strong><br>
            Daily Industrial News Briefing – Confidential & Proprietary<br>
            © 2025 All Rights Reserved
        </div>
    </div>
</body>
</html>`;
    return html;
}

// Placeholder to show how an email agent could be fed HTML.
// Integrate with your email service (SMTP/Graph/etc.) externally.
export function createBriefingEmailPayload(sections: { relevant?: NormalizedItem[]; transactions?: NormalizedItem[]; availabilities?: NormalizedItem[]; people?: NormalizedItem[] }) {
    const html = buildBriefing(sections, "Daily Briefing Period");
    return {
        subject: "Woodmont Industrial Partners Daily Industrial News Briefing",
        html
    };
}
