/**
 * Script to fix missing article descriptions
 *
 * 1. Loads feed.json
 * 2. Identifies articles with missing/empty descriptions
 * 3. Fetches article URLs and extracts meta description or first sentences
 * 4. Updates feed.json with extracted descriptions
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const FEED_PATH = path.join(process.cwd(), 'docs', 'feed.json');

// User agent for fetching
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface FeedItem {
    id: string;
    url: string;
    title: string;
    content_html: string;
    content_text: string;
    summary: string;
    [key: string]: any;
}

interface Feed {
    items: FeedItem[];
    [key: string]: any;
}

/**
 * Check if description is missing or just repeats the title
 */
function needsDescription(item: FeedItem): boolean {
    const contentText = item.content_text?.trim() || '';
    const summary = item.summary?.trim() || '';
    const title = item.title?.trim() || '';

    // Empty or very short content
    if (!contentText && !summary) return true;
    if (contentText.length < 20 && summary.length < 20) return true;

    // Content just repeats the title (with minor variations)
    const normalizedContent = contentText.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedContent === normalizedTitle) return true;

    return false;
}

/**
 * Extract meta description or first sentences from HTML
 */
function extractDescription(html: string, title: string): string {
    // Try meta description first
    const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (metaMatch && metaMatch[1] && metaMatch[1].length > 30) {
        const metaDesc = metaMatch[1].trim();
        // Make sure it's not just the title
        if (metaDesc.toLowerCase() !== title.toLowerCase()) {
            return cleanText(metaDesc);
        }
    }

    // Try og:description
    const ogMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1] && ogMatch[1].length > 30) {
        const ogDesc = ogMatch[1].trim();
        if (ogDesc.toLowerCase() !== title.toLowerCase()) {
            return cleanText(ogDesc);
        }
    }

    // Try twitter:description
    const twitterMatch = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i);
    if (twitterMatch && twitterMatch[1] && twitterMatch[1].length > 30) {
        const twitterDesc = twitterMatch[1].trim();
        if (twitterDesc.toLowerCase() !== title.toLowerCase()) {
            return cleanText(twitterDesc);
        }
    }

    // Try to find article content
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
        return extractFirstSentences(articleMatch[1], title);
    }

    // Try main content area
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
        return extractFirstSentences(mainMatch[1], title);
    }

    // Try common content div classes
    const contentPatterns = [
        /<div[^>]*class=["'][^"']*(?:article-body|entry-content|post-content|content-body|story-body)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class=["'][^"']*content["'][^>]*>([\s\S]*?)<\/div>/i
    ];

    for (const pattern of contentPatterns) {
        const match = html.match(pattern);
        if (match) {
            return extractFirstSentences(match[1], title);
        }
    }

    // Last resort: find first paragraph
    const pMatch = html.match(/<p[^>]*>([^<]{50,})<\/p>/i);
    if (pMatch) {
        return cleanText(pMatch[1]);
    }

    return '';
}

/**
 * Extract first 2-3 sentences from HTML content
 */
function extractFirstSentences(html: string, title: string): string {
    // Remove scripts, styles, and HTML tags
    let text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

    // Get first 2-3 sentences (up to 300 chars)
    let result = '';
    for (const sentence of sentences) {
        const cleaned = sentence.trim();
        // Skip if it's just the title or very short
        if (cleaned.toLowerCase().includes(title.toLowerCase().substring(0, 30))) continue;
        if (cleaned.length < 20) continue;

        if ((result + ' ' + cleaned).length <= 300) {
            result += (result ? ' ' : '') + cleaned;
        } else {
            break;
        }
    }

    return cleanText(result) || '';
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
    return text
        .replace(/\s+/g, ' ')
        .replace(/^\s*[•\-–—]\s*/, '')
        .trim()
        .substring(0, 500); // Max 500 chars
}

/**
 * Fetch article and extract description
 */
async function fetchAndExtractDescription(url: string, title: string): Promise<string> {
    try {
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
            },
            maxRedirects: 3,
            validateStatus: (status) => status < 400
        });

        return extractDescription(response.data, title);
    } catch (error) {
        console.log(`  Failed to fetch ${url}: ${(error as Error).message}`);
        return '';
    }
}

/**
 * Main function
 */
async function main() {
    console.log('Loading feed.json...');
    const feedData = JSON.parse(fs.readFileSync(FEED_PATH, 'utf-8')) as Feed;

    // Find articles needing descriptions
    const needsUpdate = feedData.items.filter(needsDescription);
    console.log(`Found ${needsUpdate.length} articles needing descriptions out of ${feedData.items.length} total`);

    if (needsUpdate.length === 0) {
        console.log('All articles have descriptions!');
        return;
    }

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < needsUpdate.length; i++) {
        const item = needsUpdate[i];
        console.log(`\n[${i + 1}/${needsUpdate.length}] Processing: ${item.title.substring(0, 60)}...`);
        console.log(`  URL: ${item.url}`);

        const description = await fetchAndExtractDescription(item.url, item.title);

        if (description && description.length >= 30) {
            // Find and update in the original array
            const index = feedData.items.findIndex(i => i.id === item.id);
            if (index !== -1) {
                feedData.items[index].content_text = description;
                feedData.items[index].content_html = description;
                feedData.items[index].summary = description.length > 200
                    ? description.substring(0, 197) + '...'
                    : description;
                console.log(`  SUCCESS: "${description.substring(0, 80)}..."`);
                updated++;
            }
        } else {
            console.log(`  FAILED: Could not extract description`);

            // Set a default description based on the title
            const index = feedData.items.findIndex(i => i.id === item.id);
            if (index !== -1 && !feedData.items[index].content_text) {
                const defaultDesc = `Read the full article: "${item.title}"`;
                feedData.items[index].content_text = defaultDesc;
                feedData.items[index].content_html = defaultDesc;
                feedData.items[index].summary = defaultDesc;
            }
            failed++;
        }

        // Rate limiting - wait between requests
        if (i < needsUpdate.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Save updated feed
    console.log('\n\nSaving updated feed.json...');
    fs.writeFileSync(FEED_PATH, JSON.stringify(feedData, null, 2));

    console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
}

main().catch(console.error);
