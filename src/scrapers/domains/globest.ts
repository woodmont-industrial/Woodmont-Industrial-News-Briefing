/**
 * GlobeSt Scraper (Primary)
 *
 * Scrapes GlobeSt industrial and logistics sections.
 * FeedBlitz RSS returns HTML instead of RSS, so this scraper is the primary source.
 * Target: https://www.globest.com/sectors/industrial/
 * Article URL pattern: /YYYY/MM/DD/{slug}
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

// GlobeSt article URLs follow /YYYY/MM/DD/slug pattern
const ARTICLE_URL_PATTERN = /\/\d{4}\/\d{2}\/\d{2}\/[^\/]+/;

// Keywords to filter articles from the home page (not needed for /sectors/industrial/)
const INDUSTRIAL_KEYWORDS = /industrial|warehouse|logistics|distribution|manufacturing|cold storage|fulfillment|last.?mile|supply chain|freight|3pl|flex.?space|port|cargo|intermodal|e-?commerce|tenant|lease|vacancy|availab/i;

export class GlobeStScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (page) {
            return this.extractFromPage(page, target);
        }
        if (html) {
            return this.extractFromHTML(html, target);
        }
        return [];
    }

    private async extractFromPage(page: Page, target: ScraperTarget): Promise<NormalizedItem[]> {
        const articles: NormalizedItem[] = [];

        try {
            // Wait for article content to appear
            await page.waitForSelector('a[href*="/20"]', {
                timeout: 15000
            }).catch(() => {});

            // Scroll to load lazy content — 3 scrolls to get more articles
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await new Promise(r => setTimeout(r, 1200));
            }

            const items = await page.evaluate((articlePattern: string) => {
                const results: { title: string; link: string; description: string; date: string; author: string }[] = [];
                const seen = new Set<string>();
                const urlRegex = new RegExp(articlePattern);

                // Get all links on the page
                const allLinks = document.querySelectorAll('a[href]');
                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    // Must be a globest.com article with date-based URL pattern
                    if (!link.includes('globest.com')) return;
                    if (!urlRegex.test(link)) return;
                    if (seen.has(link)) return;

                    // Try to find the title — check the anchor itself and heading children
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="heading"]') || anchor;
                    const title = titleEl.textContent?.trim() || '';
                    if (!title || title.length < 15) return;
                    if (/^(read more|learn more|view all|see all|load more|subscribe|sign up|log in)/i.test(title)) return;

                    seen.add(link);

                    // Extract metadata from surrounding elements
                    const parent = anchor.closest('article, [class*="card"], [class*="story"], [class*="item"], li, div') || anchor.parentElement;
                    const descEl = parent?.querySelector('p, [class*="description"], [class*="teaser"], [class*="excerpt"], [class*="summary"], [class*="dek"]');
                    const dateEl = parent?.querySelector('time, [class*="date"], [datetime]');
                    const authorEl = parent?.querySelector('[class*="author"], [class*="byline"]');

                    // Extract date from URL as fallback (/YYYY/MM/DD/)
                    const urlDateMatch = link.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
                    const urlDate = urlDateMatch ? `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}` : '';

                    results.push({
                        title,
                        link,
                        description: descEl?.textContent?.trim() || '',
                        date: (dateEl as HTMLTimeElement)?.dateTime || dateEl?.textContent?.trim() || urlDate,
                        author: authorEl?.textContent?.trim() || ''
                    });
                });

                return results.slice(0, 20);
            }, ARTICLE_URL_PATTERN.source);

            const isFromIndustrialPage = target.url.includes('/industrial');

            for (const item of items) {
                // From the industrial section page, keep everything
                // From home page, filter to industrial/logistics content
                if (isFromIndustrialPage || INDUSTRIAL_KEYWORDS.test(item.title) || INDUSTRIAL_KEYWORDS.test(item.description)) {
                    articles.push(this.buildArticle({
                        title: item.title,
                        link: item.link,
                        description: item.description,
                        pubDate: item.date || undefined,
                        author: item.author || undefined
                    }));
                }
            }
        } catch (error) {
            console.error(`[GlobeSt] Extraction error:`, (error as Error).message);
        }

        return articles.slice(0, 20);
    }

    private extractFromHTML(html: string, target: ScraperTarget): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        // Match GlobeSt article links with /YYYY/MM/DD/ date pattern in URL
        const linkPattern = /href="(https?:\/\/(?:www\.)?globest\.com\/\d{4}\/\d{2}\/\d{2}\/[^"]+)"/g;
        const seen = new Set<string>();
        const isFromIndustrialPage = target.url.includes('/industrial');

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1].replace(/\/$/, ''); // Normalize trailing slash
            if (seen.has(link)) continue;
            seen.add(link);

            // Extract date from URL
            const urlDateMatch = link.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
            const pubDate = urlDateMatch ? `${urlDateMatch[1]}-${urlDateMatch[2]}-${urlDateMatch[3]}` : '';

            // Look for title in nearby HTML context
            const searchStart = Math.max(0, match.index - 1000);
            const searchEnd = Math.min(html.length, match.index + 1000);
            const nearbyHTML = html.substring(searchStart, searchEnd);

            const titleMatch =
                /<h[2345][^>]*>([^<]+)<\/h[2345]>/.exec(nearbyHTML) ||
                /class="[^"]*title[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML) ||
                /class="[^"]*heading[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML) ||
                /aria-label="([^"]+)"/.exec(nearbyHTML);

            // Also try to extract title from the slug as a last resort
            let title = titleMatch ? titleMatch[1].trim() : '';
            if (!title || title.length < 10) {
                // Derive title from URL slug: /2026/03/30/industrial-availability-in-nyc → "Industrial Availability In Nyc"
                const slugMatch = link.match(/\/\d{4}\/\d{2}\/\d{2}\/(.+?)(?:\/|$)/);
                if (slugMatch) {
                    title = slugMatch[1]
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase());
                }
            }

            if (!title || title.length < 10) continue;

            // Look for description
            const descMatch = /<p[^>]*>([^<]{30,})<\/p>/.exec(nearbyHTML) ||
                              /class="[^"]*(?:desc|teaser|excerpt|summary|dek)[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML);
            const description = descMatch ? descMatch[1].trim() : '';

            // Filter: industrial page = keep all, home page = keyword filter
            if (isFromIndustrialPage || INDUSTRIAL_KEYWORDS.test(title) || INDUSTRIAL_KEYWORDS.test(description)) {
                articles.push(this.buildArticle({
                    title,
                    link,
                    description,
                    pubDate: pubDate || undefined
                }));
            }

            if (articles.length >= 20) break;
        }

        return articles;
    }
}
