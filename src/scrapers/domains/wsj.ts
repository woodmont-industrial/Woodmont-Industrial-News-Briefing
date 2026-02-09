/**
 * WSJ Scraper (Supplementary)
 *
 * Scrapes WSJ real estate section headlines.
 * Paywalled — only extracts public headlines.
 * Only runs if RSS returned < 3 articles.
 * Uses Playwright with broader headline extraction.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class WSJScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            // Wait for any content
            await page.waitForSelector('a[href], article, [class*="headline"], [class*="story"], main', {
                timeout: 15000
            }).catch(() => {});

            // Scroll to load content
            for (let i = 0; i < 2; i++) {
                await page.evaluate(() => window.scrollBy(0, 600));
                await new Promise(r => setTimeout(r, 1000));
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // BROAD approach: scan all links
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('wsj.com')) return;
                    if (link === window.location.href) return;

                    // WSJ article patterns - /articles/ and /livecoverage/
                    const isArticleLink = link.includes('/articles/') ||
                        link.includes('/livecoverage/') ||
                        link.includes('/story/') ||
                        link.match(/\/\d{4}\/\d{2}\/\d{2}\//);

                    if (!isArticleLink) return;
                    if (seen.has(link)) return;

                    // Get title - try multiple patterns
                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, [class*="title"], [class*="headline"], [class*="heading"], span');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }
                    // Clean up
                    title = title.replace(/^(EXCLUSIVE|BREAKING|OPINION)\s*[:|]\s*/i, '').trim();

                    if (!title || title.length < 15 || title.length > 300) return;
                    if (/^(read more|sign in|subscribe|log in|what to read)/i.test(title)) return;

                    seen.add(link);
                    const parent = anchor.closest('article, [class*="story"], [class*="card"], section, div') || anchor.parentElement;
                    const descEl = parent?.querySelector('p, [class*="summary"], [class*="description"]');
                    const dateEl = parent?.querySelector('time, [class*="date"], [class*="timestamp"], [datetime]');
                    results.push({
                        title,
                        link,
                        description: descEl?.textContent?.trim() || '',
                        date: (dateEl as HTMLTimeElement)?.dateTime || dateEl?.textContent?.trim() || ''
                    });
                });

                return results.slice(0, 15);
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
            console.error(`[WSJ] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
