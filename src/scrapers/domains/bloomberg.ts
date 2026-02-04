/**
 * Bloomberg Scraper (Supplementary)
 *
 * Scrapes Bloomberg real estate/markets headlines.
 * Paywalled — only extracts public headlines + brief descriptions.
 * Only runs if RSS returned < 3 articles.
 * Uses Playwright.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class BloombergScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            await page.waitForSelector('article, [class*="story"], [class*="headline"], [data-component*="story"]', {
                timeout: 15000
            }).catch(() => {});

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const selectors = [
                    'article a[href*="/news/"]',
                    '[data-component*="story"] a',
                    '[class*="story-list"] a',
                    '[class*="headline"] a',
                    'a[href*="/news/articles/"]',
                    'h2 a, h3 a'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;
                        const title = anchor.textContent?.trim() || '';
                        if (title && link && !seen.has(link) && title.length > 15
                            && (link.includes('/news/') || link.includes('/articles/'))) {
                            seen.add(link);
                            const parent = anchor.closest('article, [class*="story"]') || anchor.parentElement;
                            const descEl = parent?.querySelector('p, [class*="summary"]');
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
            console.error(`[Bloomberg] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
