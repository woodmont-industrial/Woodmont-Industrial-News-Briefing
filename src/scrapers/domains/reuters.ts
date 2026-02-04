/**
 * Reuters Scraper
 *
 * Scrapes real estate and business articles from Reuters.
 * Uses axios with Playwright fallback.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class ReutersScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        // Try Playwright first (Reuters is JS-heavy)
        if (page) {
            return this.extractFromPage(page);
        }

        // Fallback: parse HTML from axios
        if (html) {
            return this.extractFromHTML(html);
        }

        return [];
    }

    private async extractFromPage(page: Page): Promise<NormalizedItem[]> {
        const articles: NormalizedItem[] = [];

        try {
            await page.waitForSelector('[class*="story"], [class*="article"], [data-testid*="MediaStory"]', {
                timeout: 15000
            }).catch(() => {});

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // Reuters article selectors
                const selectors = [
                    '[data-testid*="MediaStory"] a',
                    'article a[href*="/business/"]',
                    '[class*="story-card"] a',
                    'a[href*="/business/"]',
                    'h3 a[href*="/"]'
                ];

                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const anchor = el as HTMLAnchorElement;
                        const link = anchor.href;
                        const title = anchor.textContent?.trim() || '';
                        if (title && link && !seen.has(link) && title.length > 15
                            && link.includes('/business/')) {
                            seen.add(link);
                            const parent = anchor.closest('article, [class*="story"]') || anchor.parentElement?.parentElement;
                            const descEl = parent?.querySelector('p, [class*="description"]');
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
            console.error(`[Reuters] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        // Simple regex extraction for article links
        const linkPattern = /href="(\/business\/[^"]+)"/g;
        const titlePattern = /<h[23][^>]*>([^<]+)<\/h[23]>/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = `https://www.reuters.com${match[1]}`;
            if (seen.has(link)) continue;
            seen.add(link);

            // Try to find a nearby title
            const nearbyHTML = html.substring(Math.max(0, match.index - 500), match.index + 500);
            const titleMatch = /<h[23][^>]*>([^<]+)<\/h[23]>/.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 15) {
                articles.push(this.buildArticle({ title, link }));
            }
        }

        return articles.slice(0, 20);
    }
}
