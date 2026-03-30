/**
 * CBRE Scraper (Supplementary)
 *
 * Scrapes CBRE insights and press releases.
 * Only runs if RSS returned < 3 articles.
 * Uses axios with Playwright fallback.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper, randomDelay } from '../base-scraper.js';
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

            // Scroll to load content
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await randomDelay(800, 1500);
            }

            // Wait for late content
            await randomDelay(1000, 2000);

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('cbre.com')) return;
                    if (link === window.location.href) return;

                    const isArticleLink =
                        (link.includes('/insights/briefs/') && !link.endsWith('/briefs/')) ||
                        (link.includes('/insights/articles/') && !link.endsWith('/articles/')) ||
                        (link.includes('/insights/reports/') && !link.endsWith('/reports/')) ||
                        (link.includes('/insights/figures/') && !link.endsWith('/figures/')) ||
                        link.includes('/press-releases/') ||
                        link.includes('/books/');

                    if (!isArticleLink) return;
                    if (/\/(insights|reports|articles|press-releases)\/?$/.test(link)) return;
                    if (seen.has(link)) return;

                    const titleEl = anchor.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="heading"], span') || anchor;
                    let title = titleEl.textContent?.trim() || '';
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }
                    title = title.replace(/\s+/g, ' ').trim();

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

            console.log(`[CBRE] Extracted ${articles.length} articles`);
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
