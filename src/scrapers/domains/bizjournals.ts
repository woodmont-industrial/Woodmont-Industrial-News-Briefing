/**
 * BizJournals Scraper (Supplementary)
 *
 * Scrapes BizJournals CRE section pages.
 * Only runs if RSS returned < 3 articles.
 * Uses Playwright (site blocks axios requests).
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class BizJournalsScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            await page.waitForSelector('article, [class*="story"], [class*="headline"], [class*="card"]', {
                timeout: 15000
            }).catch(() => {});

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const selectors = [
                    'article a[href*="/news/"]',
                    '[class*="story"] a[href*="/news/"]',
                    '[class*="headline"] a',
                    '[class*="card"] a[href*="/news/"]',
                    'a[href*="/commercial-real-estate/"]',
                    'h2 a, h3 a'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;
                        const title = anchor.textContent?.trim() || '';
                        if (title && link && !seen.has(link) && title.length > 15
                            && link.includes('bizjournals.com')) {
                            seen.add(link);
                            const parent = anchor.closest('article, [class*="story"], [class*="card"]') || anchor.parentElement;
                            const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"]');
                            const dateEl = parent?.querySelector('time, [class*="date"], [class*="timestamp"]');
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
            console.error(`[BizJournals] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
