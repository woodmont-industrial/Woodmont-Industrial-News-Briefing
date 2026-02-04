/**
 * Cushman & Wakefield Scraper
 *
 * Scrapes C&W news and insights pages.
 * Uses Playwright (JS-heavy site).
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class CushWakeScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            await page.waitForSelector('[class*="card"], [class*="article"], [class*="news"], [class*="result"]', {
                timeout: 20000
            }).catch(() => {});

            // Scroll to trigger lazy loading
            await page.evaluate(() => window.scrollBy(0, 1500));
            await new Promise(r => setTimeout(r, 2000));

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const selectors = [
                    '[class*="card"] a[href*="/news/"], [class*="card"] a[href*="/insights/"]',
                    'a[href*="/news/"]',
                    'a[href*="/insights/"]',
                    '[class*="result-item"] a',
                    '[class*="article-card"] a',
                    'h2 a, h3 a'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;
                        const titleEl = anchor.querySelector('h2, h3, h4, [class*="title"]') || anchor;
                        const title = titleEl.textContent?.trim() || '';
                        if (title && link && !seen.has(link) && title.length > 10
                            && (link.includes('/news/') || link.includes('/insights/'))) {
                            seen.add(link);
                            const parent = anchor.closest('[class*="card"], [class*="result"]') || anchor.parentElement;
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

                return results.slice(0, 20);
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
            console.error(`[CushWake] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
