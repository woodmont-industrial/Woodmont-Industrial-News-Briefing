/**
 * JLL Scraper
 *
 * Scrapes JLL newsroom and trends/insights pages.
 * Uses Playwright (JS-heavy site).
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
            // Wait for any content to load (JLL uses dynamic rendering)
            await page.waitForSelector('a[href*="/news"], a[href*="/newsroom"], a[href*="/trends"], a[href*="/insights"], article, [class*="card"]', {
                timeout: 15000
            }).catch(() => {});

            // Handle cookie consent dialog if present
            try {
                const acceptButton = await page.$('button:has-text("Accept All"), button:has-text("Accept"), #onetrust-accept-btn-handler');
                if (acceptButton) {
                    await acceptButton.click();
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch { /* Cookie dialog not present or already dismissed */ }

            // Scroll to load lazy content
            for (let i = 0; i < 2; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await new Promise(r => setTimeout(r, 1000));
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // JLL uses various patterns - try multiple approaches
                // Look for all links that might be articles
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    // Filter for JLL article patterns
                    if (!link.includes('jll.com')) return;
                    if (link.includes('/newsroom') && link === window.location.href) return; // Skip current page

                    const isArticleLink =
                        (link.includes('/news/') && !link.endsWith('/news/')) ||
                        (link.includes('/newsroom/') && !link.endsWith('/newsroom/') && !link.endsWith('/newsroom')) ||
                        link.includes('/trends-and-insights/') ||
                        link.includes('/research/') ||
                        link.match(/\/\d{4}\/\d{2}\//); // Date patterns like /2024/01/

                    if (!isArticleLink) return;
                    if (seen.has(link)) return;

                    // Get title from the link or nearby heading
                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="heading"]');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    } else {
                        title = anchor.textContent?.trim() || '';
                    }

                    // Skip if title is too short or is navigation text
                    if (!title || title.length < 15) return;
                    if (/^(read more|learn more|view all|see all|load more)/i.test(title)) return;

                    seen.add(link);

                    // Try to find description and date from parent container
                    const parent = anchor.closest('article, [class*="card"], [class*="item"], [class*="result"], li') || anchor.parentElement?.parentElement;
                    const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');
                    const dateEl = parent?.querySelector('time, [class*="date"], [datetime]');

                    results.push({
                        title,
                        link,
                        description: descEl?.textContent?.trim() || '',
                        date: (dateEl as HTMLTimeElement)?.dateTime || dateEl?.textContent?.trim() || ''
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
            console.error(`[JLL] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
