import { NormalizedItem } from '../types/index.js';

// Build HTML briefing in required format. Expects sections with arrays of items: { title, link, publisher, author, pubDate, description }
export function buildBriefing({ relevant = [], transactions = [], availabilities = [], people = [] }: { relevant?: NormalizedItem[]; transactions?: NormalizedItem[]; availabilities?: NormalizedItem[]; people?: NormalizedItem[] }, period: string = "Current Period") {
    // Calculate date range for the header
    const now = new Date();
    const daysAgo = period.includes('day') ? parseInt(period.split(' ')[0]) : 7;
    const startDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
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
            const publisher = it.publisher || 'Unknown';
            const link = it.link || '#';
            const description = it.description || 'No description available.';

            // Create brief summary (first 150 characters)
            const briefSummary = description.length > 150
                ? description.substring(0, 150).replace(/\s+\S*$/, '') + '...'
                : description;

            // Get state/region from regions array
            const state = it.regions && it.regions.length > 0 ? it.regions[0] : 'US';

            // Get category from category field (set by classification)
            const category = it.category || 'relevant';

            // Clean up category names for display
            const categoryLabels: Record<string, string> = {
                relevant: 'RELEVANT ARTICLES',
                transaction: 'TRANSACTIONS',
                availabilities: 'AVAILABILITIES',
                people: 'PEOPLE NEWS',
                corporate: 'Corporate'
            };

            const categoryDisplay = categoryLabels[category] || 'RELEVANT ARTICLES';

            // Create exactly 3 tags: state, category, source
            const tags = [
                `<span class="badge badge-location">${state}</span>`,
                `<span class="badge badge-category">${categoryDisplay}</span>`,
                `<span class="badge badge-source">${publisher}</span>`
            ].join(' ');

            return `<div class="article-card">
                <div class="article-header">
                    ${tags}
                </div>
                <div class="article-content">${briefSummary}</div>
                <div class="article-source">
                    <a href="${link}" class="source-link" target="_blank">📖 Read Full Article – ${publisher}</a>
                    <div class="action-buttons">
                        <a href="#" class="action-btn">Track</a>
                        <a href="#" class="action-btn">Share</a>
                    </div>
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
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }

        .header .subtitle {
            font-size: 16px;
            opacity: 0.9;
            margin-bottom: 8px;
        }

        .header .date-range {
            font-size: 14px;
            opacity: 0.8;
            font-style: italic;
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
            margin-bottom: 15px;
            border-radius: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .article-card:hover {
            transform: translateX(5px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }

        .article-header {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 12px;
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

        .article-content {
            color: #333;
            line-height: 1.6;
            margin-bottom: 10px;
        }

        .article-source {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid #dee2e6;
        }

        .source-link {
            color: #667eea;
            text-decoration: none;
            font-weight: 500;
            font-size: 14px;
        }

        .source-link:hover {
            text-decoration: underline;
        }

        .action-buttons {
            display: flex;
            gap: 8px;
        }

        .action-btn {
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            text-decoration: none;
            border: 1px solid #dee2e6;
            color: #666;
            transition: all 0.2s;
        }

        .action-btn:hover {
            background: #667eea;
            color: white;
            border-color: #667eea;
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
