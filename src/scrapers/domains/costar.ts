/**
 * CoStar Scraper
 *
 * Scrapes headlines from CoStar's public article listing pages.
 * CoStar is paywalled, so we only extract headlines + brief descriptions.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class CoStarScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            // Wait for article content to load
            await page.waitForSelector('article, [class*="article"], [class*="story"], [class*="news"]', {
                timeout: 15000
            }).catch(() => {});

            // Extract article links and titles
            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string }[] = [];

                // Try multiple selector patterns for CoStar's layout
                const selectors = [
                    'article a[href*="/article/"]',
                    'a[href*="/article/"]',
                    '[class*="article"] a',
                    '[class*="story"] a',
                    '[class*="headline"] a',
                    'h2 a, h3 a'
                ];

                const seen = new Set<string>();

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const link = (el as HTMLAnchorElement).href;
                        const title = el.textContent?.trim() || '';
                        if (title && link && !seen.has(link) && title.length > 10) {
                            seen.add(link);
                            // Get nearby description text
                            const parent = el.closest('article') || el.parentElement?.parentElement;
                            const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');
                            const description = descEl?.textContent?.trim() || '';
                            results.push({ title, link, description });
                        }
                    });
                }

                return results.slice(0, 20);
            });

            for (const item of items) {
                if (item.title && item.link) {
                    articles.push(this.buildArticle({
                        title: item.title,
                        link: item.link,
                        description: item.description
                    }));
                }
            }
        } catch (error) {
            console.error(`[CoStar] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
