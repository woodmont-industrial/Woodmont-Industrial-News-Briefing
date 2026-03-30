/**
 * Daily Record Scraper
 *
 * Scrapes Daily Record (NJ) business news.
 * Uses Playwright to extract articles from the business section.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper, randomDelay } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class DailyRecordScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (page) {
            return this.extractFromPage(page, target);
        }
        if (html) {
            return this.extractFromHTML(html);
        }
        return [];
    }

    private async extractFromPage(page: Page, target: ScraperTarget): Promise<NormalizedItem[]> {
        const articles: NormalizedItem[] = [];

        try {
            await page.goto(target.url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });

            await page.waitForSelector('a[href], article, [class*="article"], [class*="post"], main', {
                timeout: 15000
            }).catch(() => {});

            // Handle cookie/consent dialogs
            try {
                const acceptBtn = await page.$('button:has-text("Accept"), button:has-text("I Agree"), button:has-text("Agree"), [class*="cookie"] button, [class*="consent"] button');
                if (acceptBtn) {
                    await acceptBtn.click();
                    await randomDelay(500, 1000);
                }
            } catch { /* No cookie dialog */ }

            // Scroll 2x to load dynamic content
            for (let i = 0; i < 2; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await randomDelay(600, 1200);
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    // Only include dailyrecord.com/story/ links (actual articles)
                    if (!link.includes('dailyrecord.com/story/')) return;
                    if (link === window.location.href) return;

                    // Filter out non-article links
                    if (link.includes('/category/') || link.includes('/tag/') ||
                        link.includes('/author/') || link.includes('/page/') ||
                        link.includes('/subscribe') || link.includes('/login') ||
                        link.includes('/wp-admin') || link.includes('/feed')) return;

                    if (seen.has(link)) return;

                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="heading"]');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }

                    if (!title || title.length < 15 || title.length > 200) return;
                    if (/^(read more|learn more|view all|see all|continue|subscribe|sign in|log in)/i.test(title)) return;

                    seen.add(link);

                    const parent = anchor.closest('article, [class*="post"], [class*="card"], [class*="item"], [class*="entry"], li') || anchor.parentElement?.parentElement;
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
                const article = this.buildArticle({
                    title: item.title,
                    link: item.link,
                    description: item.description,
                    pubDate: item.date || undefined
                });
                article.regions = ['NJ'];
                articles.push(article);
            }

            console.log(`[DailyRecord] Extracted ${articles.length} articles from ${target.label}`);
        } catch (error) {
            console.error(`[DailyRecord] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        const linkPattern = /href="(https?:\/\/(?:www\.)?dailyrecord\.com\/story\/[^"]+)"/g;
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
                              /class="[^"]*title[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 15) {
                const article = this.buildArticle({ title, link });
                article.regions = ['NJ'];
                articles.push(article);
            }
        }

        return articles.slice(0, 20);
    }
}
