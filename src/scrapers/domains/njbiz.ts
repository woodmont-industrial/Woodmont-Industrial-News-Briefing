/**
 * NJBIZ Scraper
 *
 * Scrapes NJBIZ real estate news.
 * RSS feed returns 403, so we scrape directly.
 * Uses axios with Playwright fallback + Google referrer.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class NJBIZScraper extends BaseScraper {
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
            // Set Google referrer to bypass 403
            await page.setExtraHTTPHeaders({
                'Referer': 'https://www.google.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            });

            await page.waitForSelector('a[href], article, [class*="article"], [class*="post"], main', {
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

            // Scroll to load content
            for (let i = 0; i < 2; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await new Promise(r => setTimeout(r, 1000));
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('njbiz.com')) return;
                    if (link === window.location.href) return;
                    if (link.includes('/category/') || link.includes('/tag/') ||
                        link.includes('/author/') || link.includes('/page/') ||
                        link.includes('/subscribe') || link.includes('/login')) return;

                    // NJBIZ article patterns
                    const isArticleLink = (link.match(/njbiz\.com\/[^\/]+\/[^\/]+/) &&
                        !link.endsWith('/real-estate/') &&
                        !link.endsWith('/real-estate')) ||
                        link.match(/njbiz\.com\/\d{4}\/\d{2}\//);

                    if (!isArticleLink) return;
                    if (seen.has(link)) return;

                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="heading"], span');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }

                    if (!title || title.length < 15 || title.length > 200) return;
                    if (/^(read more|learn more|view all|see all|continue|subscribe)/i.test(title)) return;

                    seen.add(link);

                    const parent = anchor.closest('article, [class*="post"], [class*="card"], [class*="item"], li, div') || anchor.parentElement?.parentElement;
                    const descEl = parent?.querySelector('p, [class*="excerpt"], [class*="summary"], [class*="description"]');
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
            console.error(`[NJBIZ] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        const linkPattern = /href="(https?:\/\/(?:www\.)?njbiz\.com\/[^"]*\/[^"]+)"/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link)) continue;
            if (link.includes('/category/') || link.includes('/tag/') ||
                link.includes('/author/') || link.includes('/page/') ||
                link.includes('/subscribe') || link.includes('/login')) continue;
            seen.add(link);

            const nearbyHTML = html.substring(Math.max(0, match.index - 800), match.index + 800);
            const titleMatch = /<h[2345][^>]*>([^<]+)<\/h[2345]>/.exec(nearbyHTML) ||
                              /class="[^"]*title[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML) ||
                              /class="[^"]*heading[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 15) {
                articles.push(this.buildArticle({ title, link }));
            }
        }

        return articles.slice(0, 20);
    }
}
