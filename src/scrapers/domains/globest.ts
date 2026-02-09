/**
 * GlobeSt Scraper (Supplementary)
 *
 * Scrapes GlobeSt industrial and logistics sections.
 * Only runs if RSS returned < 3 articles.
 * Uses axios with Playwright fallback.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

// Keywords to filter GlobeSt articles to industrial/logistics content
const INDUSTRIAL_KEYWORDS = /industrial|warehouse|logistics|distribution|manufacturing|cold storage|fulfillment|last.?mile|supply chain|freight|3pl|flex.?space/i;

export class GlobeStScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (page) {
            return this.extractFromPage(page);
        }
        if (html) {
            return this.extractFromHTML(html);
        }
        return [];
    }

    private async extractFromPage(page: Page): Promise<NormalizedItem[]> {
        const articles: NormalizedItem[] = [];

        try {
            // Wait for content with broader selectors
            await page.waitForSelector('article, [class*="article"], [class*="story"], [class*="card"], main a', {
                timeout: 15000
            }).catch(() => {});

            // Scroll to load lazy content
            for (let i = 0; i < 2; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await new Promise(r => setTimeout(r, 1000));
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string; author: string }[] = [];
                const seen = new Set<string>();

                // Broad selector strategy - try many patterns
                const selectors = [
                    'article a',
                    '[class*="article-list"] a',
                    '[class*="story"] a',
                    '[class*="card"] a',
                    'main a[href]',
                    'section a[href]',
                    'h2 a, h3 a, h4 a'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;

                        // Must be a globest.com article link
                        if (!link.includes('globest.com')) return;
                        if (link.includes('/author/') || link.includes('/about/') ||
                            link.includes('/contact') || link.includes('/subscribe') ||
                            link.includes('/sectors/') && link.endsWith('/sectors/')) return;
                        // Skip non-article links (section pages, tags, etc)
                        if (link === window.location.href) return;

                        const titleEl = anchor.querySelector('h2, h3, h4, h5, [class*="title"], [class*="heading"]') || anchor;
                        const title = titleEl.textContent?.trim() || '';
                        if (!title || title.length < 15 || seen.has(link)) return;
                        if (/^(read more|learn more|view all|see all|load more|subscribe)/i.test(title)) return;

                        seen.add(link);
                        const parent = anchor.closest('article, [class*="card"], [class*="story"], li') || anchor.parentElement;
                        const descEl = parent?.querySelector('p, [class*="description"], [class*="teaser"], [class*="excerpt"], [class*="summary"]');
                        const dateEl = parent?.querySelector('time, [class*="date"], [datetime]');
                        const authorEl = parent?.querySelector('[class*="author"], [class*="byline"]');
                        results.push({
                            title,
                            link,
                            description: descEl?.textContent?.trim() || '',
                            date: (dateEl as HTMLTimeElement)?.dateTime || dateEl?.textContent?.trim() || '',
                            author: authorEl?.textContent?.trim() || ''
                        });
                    });
                }

                return results.slice(0, 20);
            });

            for (const item of items) {
                // For the home page target, filter to industrial/logistics content
                const isIndustrial = INDUSTRIAL_KEYWORDS.test(item.title) || INDUSTRIAL_KEYWORDS.test(item.description);
                const isFromIndustrialPage = page.url().includes('/industrial');

                if (isFromIndustrialPage || isIndustrial) {
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

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        // Broader URL pattern - match any globest.com article link
        const linkPattern = /href="(https?:\/\/(?:www\.)?globest\.com\/[^"]*\/[^"]+)"/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link)) continue;
            // Skip non-article pages
            if (link.includes('/author/') || link.includes('/about/') ||
                link.includes('/contact') || link.includes('/subscribe') ||
                link.includes('/privacy') || link.includes('/terms')) continue;
            // Skip section index pages
            if (/\/sectors\/[^\/]+\/?$/.test(link) && !link.includes('/sectors/industrial/')) continue;
            seen.add(link);

            // Look for title in nearby HTML (expanded search radius)
            const nearbyHTML = html.substring(Math.max(0, match.index - 800), match.index + 800);
            const titleMatch = /<h[2345][^>]*>([^<]+)<\/h[2345]>/.exec(nearbyHTML) ||
                              /class="[^"]*title[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML) ||
                              /class="[^"]*heading[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 15) {
                // Filter for industrial/logistics content when scraping home page
                if (INDUSTRIAL_KEYWORDS.test(title) || link.includes('/industrial')) {
                    articles.push(this.buildArticle({ title, link }));
                }
            }
        }

        return articles.slice(0, 20);
    }
}
