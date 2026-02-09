/**
 * CoStar Scraper
 *
 * Scrapes headlines from CoStar's public article listing pages.
 * CoStar is paywalled, so we only extract headlines + brief descriptions.
 * Uses Playwright with broader headline extraction.
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
            // Wait for any content to load
            await page.waitForSelector('a[href], article, [class*="article"], [class*="story"], [class*="news"], main', {
                timeout: 15000
            }).catch(() => {});

            // Scroll to load content
            for (let i = 0; i < 2; i++) {
                await page.evaluate(() => window.scrollBy(0, 600));
                await new Promise(r => setTimeout(r, 1000));
            }

            // Extract article links and titles
            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string }[] = [];
                const seen = new Set<string>();

                // BROAD approach: scan all links on the page
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('costar.com')) return;
                    if (link === window.location.href) return;

                    // CoStar article patterns
                    const isArticleLink = link.includes('/article/') ||
                        link.includes('/news/') ||
                        link.includes('/story/') ||
                        link.match(/\/\d{4}\/\d{2}\//);

                    if (!isArticleLink) return;
                    if (seen.has(link)) return;

                    // Get title - try heading elements first, then anchor text
                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, [class*="title"], [class*="headline"], [class*="heading"], span');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }

                    if (!title || title.length < 10 || title.length > 300) return;
                    if (/^(read more|sign in|subscribe|log in|learn more)/i.test(title)) return;

                    seen.add(link);
                    // Get nearby description text
                    const parent = anchor.closest('article, [class*="card"], [class*="story"], [class*="item"], div') || anchor.parentElement?.parentElement;
                    const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"]');
                    const description = descEl?.textContent?.trim() || '';
                    results.push({ title, link, description });
                });

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
