/**
 * Cushman & Wakefield Scraper
 *
 * Scrapes C&W news and insights pages.
 * Uses Playwright (JS-heavy SPA site).
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper, randomDelay } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class CushWakeScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            // Wait for any meaningful content
            await page.waitForSelector('[class*="card"], [class*="article"], [class*="news"], [class*="result"], a[href*="/news/"], a[href*="/insights/"]', {
                timeout: 25000
            }).catch(() => {});

            // Handle cookie consent
            try {
                const acceptBtn = await page.$('button:has-text("Accept All"), button:has-text("Accept"), #onetrust-accept-btn-handler');
                if (acceptBtn) {
                    await acceptBtn.click();
                    await randomDelay(500, 1000);
                }
            } catch { /* No consent dialog */ }

            // Scroll progressively to trigger lazy loading
            for (let i = 0; i < 4; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await randomDelay(800, 1500);
            }

            // Extra wait for late-loading SPA content
            await randomDelay(1000, 2000);

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // Broad approach — scan all links
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('cushmanwakefield.com')) return;
                    if (link === window.location.href) return;

                    // C&W article patterns
                    const isArticleLink =
                        (link.includes('/news/') && !link.endsWith('/news/') && !link.endsWith('/news')) ||
                        (link.includes('/insights/') && !link.endsWith('/insights/') && link.split('/').length > 5) ||
                        (link.includes('/press-releases/') && !link.endsWith('/press-releases/')) ||
                        (link.includes('/stories/') && !link.endsWith('/stories/')) ||
                        (link.includes('/marketbeats/') && !link.endsWith('/marketbeats/'));

                    if (!isArticleLink) return;
                    if (seen.has(link)) return;

                    const titleEl = anchor.querySelector('h2, h3, h4, [class*="title"], [class*="heading"]') || anchor;
                    let title = titleEl.textContent?.trim() || '';
                    title = title.replace(/\s+/g, ' ').trim();

                    if (!title || title.length < 10 || title.length > 300) return;
                    if (/^(read more|learn more|view all|see all|load more|download|contact)/i.test(title)) return;

                    seen.add(link);
                    const parent = anchor.closest('[class*="card"], [class*="result"], article, [class*="item"]') || anchor.parentElement;
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

            console.log(`[CushWake] Extracted ${articles.length} articles`);
        } catch (error) {
            console.error(`[CushWake] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
