/**
 * JLL Scraper
 *
 * Scrapes JLL newsroom and trends/insights pages.
 * Uses Playwright (JS-heavy React/Angular app).
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class JLLScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            // JLL is a React app, wait for content to render
            await page.waitForSelector('[class*="card"], [class*="article"], [class*="news"], [class*="insight"]', {
                timeout: 20000
            }).catch(() => {});

            // Scroll to load more content
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 2000));

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const selectors = [
                    '[class*="card"] a[href*="/newsroom/"], [class*="card"] a[href*="/trends-and-insights/"]',
                    'a[href*="/newsroom/"]',
                    'a[href*="/trends-and-insights/"]',
                    '[class*="article-card"] a',
                    '[class*="content-card"] a',
                    'h2 a, h3 a, h4 a'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;
                        const titleEl = anchor.querySelector('h2, h3, h4, [class*="title"]') || anchor;
                        const title = titleEl.textContent?.trim() || '';
                        if (title && link && !seen.has(link) && title.length > 10
                            && (link.includes('/newsroom/') || link.includes('/trends-and-insights/') || link.includes('/research/'))) {
                            seen.add(link);
                            const parent = anchor.closest('[class*="card"]') || anchor.parentElement;
                            const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"]');
                            const dateEl = parent?.querySelector('time, [class*="date"], span[class*="date"]');
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
            console.error(`[JLL] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
