/**
 * CBRE Scraper (Supplementary)
 *
 * Scrapes CBRE insights and press releases.
 * Only runs if RSS returned < 3 articles.
 * Uses axios with Playwright fallback.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class CBREScraper extends BaseScraper {
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
            await page.waitForSelector('a[href], article, [class*="card"], main', {
                timeout: 20000
            }).catch(() => {});

            // Scroll to load content
            for (let i = 0; i < 2; i++) {
                await page.evaluate(() => window.scrollBy(0, 1000));
                await new Promise(r => setTimeout(r, 1500));
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // Broad approach - find all links
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('cbre.com')) return;
                    if (link === window.location.href) return;

                    // Accept insights, reports, books, newsroom, and press-release links
                    const isArticleLink = (link.includes('/insights/') && link.split('/').length > 5) ||
                        link.includes('/press-releases/') ||
                        link.includes('/newsroom/') ||
                        (link.includes('/reports/') && link.split('/').length > 5) ||
                        (link.includes('/articles/') && link.split('/').length > 5) ||
                        link.includes('/books/');

                    if (!isArticleLink) return;
                    // Skip index pages
                    if (link.endsWith('/insights/') || link.endsWith('/insights') ||
                        link.endsWith('/reports/') || link.endsWith('/reports') ||
                        link.endsWith('/articles/') || link.endsWith('/articles')) return;
                    if (seen.has(link)) return;

                    const titleEl = anchor.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="heading"], span') || anchor;
                    let title = titleEl.textContent?.trim() || '';
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }

                    if (!title || title.length < 10 || title.length > 300) return;
                    if (/^(read more|learn more|view all|see all|load more|download)/i.test(title)) return;

                    seen.add(link);
                    const parent = anchor.closest('[class*="card"], article, [class*="item"], [class*="result"], li, div') || anchor.parentElement;
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
            console.error(`[CBRE] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        const linkPattern = /href="(https?:\/\/(?:www\.)?cbre\.com\/(?:insights|newsroom|reports|books|press-releases|articles)\/[^"]+)"/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link)) continue;
            // Skip index pages
            if (/\/(insights|reports|articles|press-releases)\/?$/.test(link)) continue;
            seen.add(link);

            const nearbyHTML = html.substring(Math.max(0, match.index - 800), match.index + 800);
            const titleMatch = /<h[2345][^>]*>([^<]+)<\/h[2345]>/.exec(nearbyHTML) ||
                              /class="[^"]*title[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML) ||
                              /class="[^"]*heading[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 10) {
                articles.push(this.buildArticle({ title, link }));
            }
        }

        return articles.slice(0, 20);
    }
}
