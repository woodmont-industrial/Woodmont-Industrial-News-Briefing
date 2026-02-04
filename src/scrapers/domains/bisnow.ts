/**
 * Bisnow Scraper (Supplementary)
 *
 * Scrapes Bisnow regional news pages.
 * Only runs if RSS returned < 3 articles.
 * Uses axios with Playwright fallback.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class BisnowScraper extends BaseScraper {
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
            await page.waitForSelector('[class*="article"], [class*="story"], [class*="card"]', {
                timeout: 15000
            }).catch(() => {});

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string; image: string }[] = [];
                const seen = new Set<string>();

                const selectors = [
                    'article a[href*="/news/"]',
                    '[class*="story-card"] a',
                    '[class*="article-card"] a',
                    'a[href*="/news/"]',
                    'h2 a, h3 a'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;
                        const titleEl = anchor.querySelector('h2, h3, h4, [class*="title"]') || anchor;
                        const title = titleEl.textContent?.trim() || '';
                        if (title && link && !seen.has(link) && title.length > 15
                            && link.includes('/news/')) {
                            seen.add(link);
                            const parent = anchor.closest('article, [class*="card"]') || anchor.parentElement;
                            const descEl = parent?.querySelector('p, [class*="description"]');
                            const dateEl = parent?.querySelector('time, [class*="date"]');
                            const imgEl = parent?.querySelector('img');
                            results.push({
                                title,
                                link,
                                description: descEl?.textContent?.trim() || '',
                                date: (dateEl as HTMLTimeElement)?.dateTime || dateEl?.textContent?.trim() || '',
                                image: imgEl?.src || ''
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
                    pubDate: item.date || undefined,
                    image: item.image || undefined
                }));
            }
        } catch (error) {
            console.error(`[Bisnow] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        const linkPattern = /href="(https?:\/\/www\.bisnow\.com\/[^"]*\/news\/[^"]+)"/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link)) continue;
            seen.add(link);

            const nearbyHTML = html.substring(Math.max(0, match.index - 500), match.index + 500);
            const titleMatch = /<h[234][^>]*>([^<]+)<\/h[234]>/.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 15) {
                articles.push(this.buildArticle({ title, link }));
            }
        }

        return articles.slice(0, 15);
    }
}
