/**
 * CBRE Scraper (Supplementary)
 *
 * Scrapes CBRE insights and press releases.
 * Only runs if RSS returned < 3 articles.
 * Uses axios with Playwright fallback.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class CBREScraper extends BaseScraper {
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
            await page.waitForSelector('[class*="card"], [class*="article"], [class*="result"], [class*="insight"]', {
                timeout: 20000
            }).catch(() => {});

            // Scroll to load content
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 2000));

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const selectors = [
                    '[class*="card"] a[href*="/insights/"], [class*="card"] a[href*="/newsroom/"]',
                    'a[href*="/insights/"]',
                    'a[href*="/newsroom/"]',
                    'a[href*="/reports/"]',
                    '[class*="result-card"] a',
                    '[class*="article"] a',
                    '[class*="news"] a',
                    'h2 a, h3 a'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;
                        const titleEl = anchor.querySelector('h2, h3, h4, [class*="title"]') || anchor;
                        const title = titleEl.textContent?.trim() || '';
                        // Accept insights, reports, books, newsroom, and press-release links
                        const isArticleLink = link.includes('/insights/') ||
                            link.includes('/press-releases/') ||
                            link.includes('/newsroom/') ||
                            link.includes('/reports/') ||
                            link.includes('/books/');
                        if (title && link && !seen.has(link) && title.length > 10 && isArticleLink) {
                            seen.add(link);
                            const parent = anchor.closest('[class*="card"]') || anchor.parentElement;
                            const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"]');
                            const dateEl = parent?.querySelector('time, [class*="date"]');
                            results.push({
                                title,
                                link,
                                description: descEl?.textContent?.trim() || '',
                                date: (dateEl as HTMLTimeElement)?.dateTime || dateEl?.textContent?.trim() || ''
                            });
                        }
                    });
                }

                return results.slice(0, 15);
            });

            for (const item of items) {
                articles.push(this.buildArticle({
                    title: item.title,
                    link: item.link,
                    description: item.description,
                    pubDate: item.date || undefined
                }));
            }
        } catch (error) {
            console.error(`[CBRE] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        const linkPattern = /href="(https?:\/\/www\.cbre\.com\/(insights|newsroom|reports|books)\/[^"]+)"/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link)) continue;
            seen.add(link);

            const nearbyHTML = html.substring(Math.max(0, match.index - 500), match.index + 500);
            const titleMatch = /<h[234][^>]*>([^<]+)<\/h[234]>/.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 10) {
                articles.push(this.buildArticle({ title, link }));
            }
        }

        return articles.slice(0, 15);
    }
}
