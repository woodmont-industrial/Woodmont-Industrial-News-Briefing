/**
 * CRE Daily Scraper
 *
 * Scrapes CRE Daily news articles.
 * RSS feed returns 504, so we scrape directly.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class CREDailyScraper extends BaseScraper {
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
            await page.waitForSelector('article, [class*="article"], [class*="post"], a[href]', {
                timeout: 15000
            }).catch(() => {});

            // Scroll to load more
            await page.evaluate(() => window.scrollBy(0, 1000));
            await new Promise(r => setTimeout(r, 1500));

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // Look for article links
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    if (!link.includes('credaily.com')) return;
                    if (link === window.location.href) return;

                    // Skip non-article pages
                    if (link.includes('/category/') || link.includes('/tag/') ||
                        link.includes('/author/') || link.includes('/page/')) return;

                    // Look for article URL patterns (usually /yyyy/mm/dd/ or /article-slug/)
                    const isArticleLink = link.match(/credaily\.com\/\d{4}\//) ||
                        (link.includes('credaily.com/') && link.split('/').length > 4);

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
            console.error(`[CRE Daily] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        const linkPattern = /href="(https?:\/\/www\.credaily\.com\/\d{4}\/[^"]+)"/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link)) continue;
            seen.add(link);

            const nearbyHTML = html.substring(Math.max(0, match.index - 500), match.index + 500);
            const titleMatch = /<h[234][^>]*>([^<]+)<\/h[234]>/.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 15) {
                articles.push(this.buildArticle({ title, link }));
            }
        }

        return articles.slice(0, 20);
    }
}
