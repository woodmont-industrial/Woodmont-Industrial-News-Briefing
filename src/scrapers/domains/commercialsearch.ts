/**
 * CommercialSearch Scraper
 *
 * Scrapes CommercialSearch (formerly CP Executive) national news.
 * cpexecutive.com redirects to commercialsearch.com, so this covers both.
 * Uses Playwright to handle JS-rendered content and lazy loading.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper, randomDelay } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

// Category paths to exclude (not article pages)
const CATEGORY_SLUGS = new Set([
    'national', 'property-management', 'author', 'construction',
    'development', 'finance', 'investment', 'leasing', 'management',
    'sustainability', 'technology', 'multifamily', 'industrial',
    'office', 'retail', 'hospitality', 'healthcare', 'data-centers',
    'life-sciences', 'mixed-use', 'self-storage', 'seniors-housing',
    'student-housing'
]);

export class CommercialSearchScraper extends BaseScraper {
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
            // Navigate to the target URL
            await page.goto(target.url, {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
                referer: 'https://www.google.com/'
            });

            // Wait for content to load
            await page.waitForSelector('a[href], article, [class*="article"], [class*="post"], main', {
                timeout: 15000
            }).catch(() => {});

            // Handle cookie consent if present
            try {
                const acceptBtn = await page.$('button:has-text("Accept"), button:has-text("I Agree"), button:has-text("Got it"), [class*="cookie"] button');
                if (acceptBtn) {
                    await acceptBtn.click();
                    await randomDelay(500, 1000);
                }
            } catch { /* No cookie dialog */ }

            // Scroll 3x to trigger lazy loading
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await randomDelay(600, 1200);
            }

            const categorySlugsList = Array.from(CATEGORY_SLUGS);

            const items = await page.evaluate((excludeSlugs: string[]) => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();
                const categorySet = new Set(excludeSlugs);

                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    // Must be a commercialsearch.com/news/ link
                    if (!link.includes('commercialsearch.com/news/')) return;
                    if (link === window.location.href) return;

                    // Parse the path after /news/
                    const url = new URL(link);
                    const newsIndex = url.pathname.indexOf('/news/');
                    if (newsIndex === -1) return;
                    const afterNews = url.pathname.substring(newsIndex + 6).replace(/\/$/, '');

                    // Skip if it's empty (just /news/) or a known category
                    if (!afterNews) return;
                    const segments = afterNews.split('/').filter(Boolean);
                    if (segments.length === 0) return;

                    // Filter out category pages: single segment that matches a known category
                    if (segments.length === 1 && categorySet.has(segments[0])) return;

                    // Filter out author pages
                    if (segments[0] === 'author') return;

                    // Filter out pagination, tags, etc.
                    if (link.includes('/page/') || link.includes('/tag/') ||
                        link.includes('/subscribe') || link.includes('/login') ||
                        link.includes('/wp-admin') || link.includes('/feed')) return;

                    if (seen.has(link)) return;

                    // Extract title from heading elements or title-like classes
                    let title = '';
                    const titleEl = anchor.querySelector('h2, h3, [class*="title"], [class*="heading"]');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }

                    if (!title || title.length < 15 || title.length > 200) return;
                    if (/^(read more|learn more|view all|see all|continue|subscribe|sign in|log in)/i.test(title)) return;

                    seen.add(link);

                    // Extract description and date from parent container
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
            }, categorySlugsList);

            for (const item of items) {
                const article = this.buildArticle({
                    title: item.title,
                    link: item.link,
                    description: item.description,
                    pubDate: item.date || undefined
                });
                articles.push(article);
            }

            console.log(`[CommercialSearch] Extracted ${articles.length} articles from ${target.label}`);
        } catch (error) {
            console.error(`[CommercialSearch] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        const linkPattern = /href="(https?:\/\/(?:www\.)?commercialsearch\.com\/news\/[^"]+)"/g;
        const seen = new Set<string>();
        const categorySet = CATEGORY_SLUGS;

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link)) continue;

            // Parse path after /news/
            try {
                const url = new URL(link);
                const newsIndex = url.pathname.indexOf('/news/');
                if (newsIndex === -1) continue;
                const afterNews = url.pathname.substring(newsIndex + 6).replace(/\/$/, '');
                if (!afterNews) continue;
                const segments = afterNews.split('/').filter(Boolean);
                if (segments.length === 0) continue;
                if (segments.length === 1 && categorySet.has(segments[0])) continue;
                if (segments[0] === 'author') continue;
            } catch {
                continue;
            }

            if (link.includes('/page/') || link.includes('/tag/') ||
                link.includes('/subscribe') || link.includes('/login')) continue;

            seen.add(link);

            const nearbyHTML = html.substring(Math.max(0, match.index - 800), match.index + 800);
            const titleMatch = /<h[2345][^>]*>([^<]+)<\/h[2345]>/.exec(nearbyHTML) ||
                              /class="[^"]*title[^"]*"[^>]*>([^<]+)</.exec(nearbyHTML);
            const title = titleMatch ? titleMatch[1].trim() : '';

            if (title && title.length > 15) {
                const article = this.buildArticle({ title, link });
                articles.push(article);
            }
        }

        return articles.slice(0, 20);
    }
}
