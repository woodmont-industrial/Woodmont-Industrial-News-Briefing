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
            await page.waitForSelector('article, [class*="article"], [class*="story"], [class*="card"]', {
                timeout: 15000
            }).catch(() => {});

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string; author: string }[] = [];
                const seen = new Set<string>();

                const selectors = [
                    'article a',
                    '[class*="article-list"] a',
                    '[class*="story"] a',
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
                            && link.includes('globest.com')) {
                            seen.add(link);
                            const parent = anchor.closest('article, [class*="card"]') || anchor.parentElement;
                            const descEl = parent?.querySelector('p, [class*="description"], [class*="teaser"]');
                            const dateEl = parent?.querySelector('time, [class*="date"]');
                            const authorEl = parent?.querySelector('[class*="author"], [class*="byline"]');
                            results.push({
                                title,
                                link,
                                description: descEl?.textContent?.trim() || '',
                                date: (dateEl as HTMLTimeElement)?.dateTime || dateEl?.textContent?.trim() || '',
                                author: authorEl?.textContent?.trim() || ''
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
                    author: item.author || undefined
                }));
            }
        } catch (error) {
            console.error(`[GlobeSt] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        const linkPattern = /href="(https?:\/\/www\.globest\.com\/[^"]+)"/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link) || link.includes('/author/') || link.includes('/about/')) continue;
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
