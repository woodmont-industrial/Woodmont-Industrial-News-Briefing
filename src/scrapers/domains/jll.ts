/**
 * JLL Scraper
 *
 * Scrapes JLL newsroom and trends/insights pages.
 * Uses axios with Playwright fallback (JS-heavy site).
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class JLLScraper extends BaseScraper {
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
            // Wait for any content to load (JLL uses dynamic rendering)
            await page.waitForSelector('a[href], article, [class*="card"], main', {
                timeout: 15000
            }).catch(() => {});

            // Handle cookie consent dialog if present
            try {
                const acceptButton = await page.$('button:has-text("Accept All"), button:has-text("Accept"), #onetrust-accept-btn-handler');
                if (acceptButton) {
                    await acceptButton.click();
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch { /* Cookie dialog not present or already dismissed */ }

            // Scroll to load lazy content
            for (let i = 0; i < 3; i++) {
                await page.evaluate(() => window.scrollBy(0, 800));
                await new Promise(r => setTimeout(r, 1000));
            }

            const items = await page.evaluate(() => {
                const results: { title: string; link: string; description: string; date: string }[] = [];
                const seen = new Set<string>();

                // Broad selector approach - look for all links
                const allLinks = document.querySelectorAll('a[href]');

                allLinks.forEach(el => {
                    const anchor = el as HTMLAnchorElement;
                    const link = anchor.href;

                    // Filter for JLL content
                    if (!link.includes('jll.com')) return;
                    if (link === window.location.href) return;

                    // Broad article link patterns
                    const isArticleLink =
                        (link.includes('/news/') && !link.endsWith('/news/') && !link.endsWith('/news')) ||
                        (link.includes('/newsroom/') && !link.endsWith('/newsroom/') && !link.endsWith('/newsroom')) ||
                        link.includes('/trends-and-insights/') && !link.endsWith('/trends-and-insights/') && link.split('/').length > 5 ||
                        link.includes('/research/') && !link.endsWith('/research/') && !link.endsWith('/research') && link.split('/').length > 5 ||
                        link.includes('/press-releases/') ||
                        link.match(/\/\d{4}\/\d{2}\//) || // Date patterns like /2024/01/
                        link.includes('/investor/') && link.split('/').length > 6 ||
                        link.includes('/cities/') && link.split('/').length > 6;

                    if (!isArticleLink) return;
                    if (seen.has(link)) return;

                    // Get title from the link or nearby heading
                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, h5, [class*="title"], [class*="heading"], span');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }

                    // Skip if title is too short or is navigation text
                    if (!title || title.length < 15) return;
                    if (/^(read more|learn more|view all|see all|load more|back to|contact us)/i.test(title)) return;

                    seen.add(link);

                    // Try to find description and date from parent container
                    const parent = anchor.closest('article, [class*="card"], [class*="item"], [class*="result"], [class*="tile"], [role="listitem"], li, div') || anchor.parentElement?.parentElement;
                    const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"], [class*="excerpt"], [class*="body"]');
                    const dateEl = parent?.querySelector('time, [class*="date"], [datetime], [class*="time"]');

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
            console.error(`[JLL] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private extractFromHTML(html: string): NormalizedItem[] {
        const articles: NormalizedItem[] = [];
        // Match JLL article links
        const linkPattern = /href="(https?:\/\/(?:www\.)?(?:us\.)?jll\.com\/[^"]*(?:news|research|insights|press)[^"]*)"/g;
        const seen = new Set<string>();

        let match;
        while ((match = linkPattern.exec(html)) !== null) {
            const link = match[1];
            if (seen.has(link)) continue;
            // Skip section index pages
            if (link.endsWith('/newsroom') || link.endsWith('/newsroom/') ||
                link.endsWith('/research') || link.endsWith('/research/') ||
                link.endsWith('/news') || link.endsWith('/news/')) continue;
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
