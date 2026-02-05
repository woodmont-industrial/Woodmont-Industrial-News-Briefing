/**
 * Reuters Scraper
 *
 * Scrapes real estate and business articles from Reuters.
 * Uses Playwright only (axios gets 401).
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
        // Reuters requires Playwright (blocks axios)
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            // Wait for content to load
            await page.waitForSelector('a[href*="/"], article, [data-testid]', {
                timeout: 15000
            }).catch(() => {});

            // Scroll to load more
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 1500));

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // Scan all links for Reuters article patterns
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('reuters.com')) return;
                    if (link === window.location.href) return;

                    // Reuters article URL patterns
                    const isArticleLink =
                        link.includes('/business/') ||
                        link.includes('/markets/') ||
                        link.includes('/world/') ||
                        link.match(/\/\d{4}\/\d{2}\/\d{2}\//); // Date pattern

                    // Exclude category/section pages
                    const isCategory = link.match(/reuters\.com\/(business|markets|world)\/?$/);
                    if (!isArticleLink || isCategory) return;
                    if (seen.has(link)) return;

                    let title = '';
                    // Look for heading inside the link
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, span[class*="title"], [data-testid*="Heading"]');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    } else if (anchor.textContent) {
                        // Use link text but filter out navigation items
                        const text = anchor.textContent.trim();
                        if (text.length > 20 && text.length < 200 && !text.includes('\n')) {
                            title = text;
                        }
                    }

                    if (!title || title.length < 20) return;
                    if (/^(more|sign up|subscribe|login)/i.test(title)) return;

                    seen.add(link);

                    const parent = anchor.closest('article, [class*="story"], [class*="card"], li') || anchor.parentElement?.parentElement;
                    const descEl = parent?.querySelector('p, [class*="description"]');
                    const dateEl = parent?.querySelector('time, [datetime]');

                    results.push({
                        title,
                        link,
                        description: descEl?.textContent?.trim() || '',
                        date: (dateEl as HTMLTimeElement)?.dateTime || ''
                    });
                });

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
}
