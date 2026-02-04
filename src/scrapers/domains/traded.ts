/**
 * Traded.co Scraper
 *
 * Scrapes the Traded.co deal tracker.
 * Cloudflare-protected — uses full CF bypass with extended waits.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper, randomDelay } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class TradedScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            // Traded.co has strong Cloudflare protection — give extra time
            await randomDelay(3000, 5000);

            // Wait for deal content to load
            await page.waitForSelector('[class*="deal"], [class*="card"], [class*="transaction"], table, [class*="listing"]', {
                timeout: 30000
            }).catch(() => {});

            // Scroll to load more deals
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await randomDelay(1000, 2000);
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // Traded.co shows deal cards/rows
                const selectors = [
                    '[class*="deal"] a',
                    '[class*="card"] a',
                    '[class*="transaction"] a',
                    'table tbody tr a',
                    '[class*="listing"] a',
                    'a[href*="/deal/"]',
                    'a[href*="/property/"]',
                    'a[href*="/transaction/"]',
                    'h2 a, h3 a, h4 a'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;
                        const title = anchor.textContent?.trim() || '';
                        if (title && link && !seen.has(link) && title.length > 5) {
                            seen.add(link);
                            const parent = anchor.closest('[class*="deal"], [class*="card"], tr') || anchor.parentElement;
                            const descParts: string[] = [];
                            parent?.querySelectorAll('span, td, [class*="detail"], [class*="info"]').forEach(el => {
                                const text = el.textContent?.trim();
                                if (text && text.length > 2 && text !== title) {
                                    descParts.push(text);
                                }
                            });
                            const dateEl = parent?.querySelector('time, [class*="date"]');
                            results.push({
                                title,
                                link,
                                description: descParts.slice(0, 3).join(' | '),
                                date: (dateEl as HTMLTimeElement)?.dateTime || dateEl?.textContent?.trim() || ''
                            });
                        }
                    });
                }

                return results.slice(0, 30);
            });

            for (const item of items) {
                if (item.title && item.link) {
                    articles.push(this.buildArticle({
                        title: item.title,
                        link: item.link,
                        description: item.description,
                        pubDate: item.date || undefined
                    }));
                }
            }
        } catch (error) {
            console.error(`[Traded] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
