/**
 * Lehigh Valley Business Scraper
 *
 * Scrapes LVB real estate news.
 * RSS feed returns 403, so we scrape directly.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class LVBScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            await page.waitForSelector('article, [class*="article"], [class*="post"], a[href]', {
                timeout: 15000
            }).catch(() => {});

            // Handle cookie consent if present
            try {
                const acceptBtn = await page.$('button:has-text("Accept"), button:has-text("I Agree"), [class*="cookie"] button');
                if (acceptBtn) {
                    await acceptBtn.click();
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch { /* No cookie dialog */ }

            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 1500));

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('lvb.com')) return;
                    if (link === window.location.href) return;
                    if (link.includes('/category/') || link.includes('/tag/') ||
                        link.includes('/author/') || link.includes('/page/')) return;

                    // LVB article patterns - usually has article slug
                    const isArticleLink = link.match(/lvb\.com\/[^\/]+\/[^\/]+/) ||
                        link.match(/lvb\.com\/\d{4}\/\d{2}\//);

                    if (!isArticleLink) return;
                    if (seen.has(link)) return;

                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, [class*="title"], [class*="heading"]');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    } else {
                        title = anchor.textContent?.trim() || '';
                    }

                    if (!title || title.length < 15 || title.length > 200) return;
                    if (/^(read more|learn more|view all|see all|continue)/i.test(title)) return;

                    seen.add(link);

                    const parent = anchor.closest('article, [class*="post"], [class*="card"], li') || anchor.parentElement?.parentElement;
                    const descEl = parent?.querySelector('p, [class*="excerpt"], [class*="summary"]');
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
            console.error(`[LVB] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
