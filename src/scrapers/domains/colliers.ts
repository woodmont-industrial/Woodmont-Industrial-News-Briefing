/**
 * Colliers Scraper
 *
 * Scrapes Colliers news and research pages.
 * Uses Playwright (JS-heavy site).
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class ColliersScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            // Wait for content
            await page.waitForSelector('a[href], article, [class*="card"]', {
                timeout: 15000
            }).catch(() => {});

            // Scroll to load lazy content
            for (let i = 0; i < 2; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await new Promise(r => setTimeout(r, 1000));
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // Scan all links for Colliers article patterns
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('colliers.com')) return;
                    if (link === window.location.href) return;

                    // Article URL patterns for Colliers
                    const isArticleLink =
                        (link.includes('/news/') && !link.endsWith('/news') && !link.endsWith('/news/')) ||
                        (link.includes('/research/') && !link.endsWith('/research') && !link.endsWith('/research/')) ||
                        link.includes('/insight/') ||
                        link.includes('/report/') ||
                        link.includes('/press-release/');

                    if (!isArticleLink) return;
                    if (seen.has(link)) return;

                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="heading"]');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    } else {
                        title = anchor.textContent?.trim() || '';
                    }

                    if (!title || title.length < 15) return;
                    if (/^(read more|learn more|view all|see all|download)/i.test(title)) return;

                    seen.add(link);

                    const parent = anchor.closest('article, [class*="card"], [class*="item"], li') || anchor.parentElement?.parentElement;
                    const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"]');
                    const dateEl = parent?.querySelector('time, [class*="date"]');

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
            console.error(`[Colliers] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
