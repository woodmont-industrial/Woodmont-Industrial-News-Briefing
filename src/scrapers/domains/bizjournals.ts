/**
 * BizJournals Scraper (Supplementary)
 *
 * Scrapes BizJournals CRE section pages.
 * Only runs if RSS returned < 3 articles.
 * Uses Playwright with Google referrer to bypass Cloudflare.
 * Reduced to 2 targets (SoFla + Philly) to save time.
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

export class BizJournalsScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (!page) return [];

        const articles: NormalizedItem[] = [];

        try {
            // Set Google referrer to appear as organic search traffic
            await page.setExtraHTTPHeaders({
                'Referer': 'https://www.google.com/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            });

            // Wait for page content - Cloudflare may take longer
            await page.waitForSelector('a[href], article, [class*="story"], [class*="headline"], [class*="card"], main', {
                timeout: 20000
            }).catch(() => {});

            // Extended wait for Cloudflare challenge resolution
            const content = await page.content();
            if (content.toLowerCase().includes('just a moment') || content.toLowerCase().includes('checking your browser')) {
                console.log('[BizJournals] Cloudflare challenge detected, waiting longer...');
                await new Promise(r => setTimeout(r, 12000));
            }

            // Scroll to load lazy content
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

                    if (!link.includes('bizjournals.com')) return;
                    if (link === window.location.href) return;

                    // BizJournals article patterns
                    const isArticleLink = link.includes('/news/') && link.split('/').length > 5 ||
                        link.includes('/content/') ||
                        link.includes('/inno/') ||
                        link.includes('/commercial-real-estate/') && link.split('/').length > 5;

                    if (!isArticleLink) return;
                    // Skip section index pages
                    if (link.endsWith('/news/') || link.endsWith('/news') ||
                        link.endsWith('/commercial-real-estate/') || link.endsWith('/commercial-real-estate')) return;
                    if (seen.has(link)) return;

                    // Get title
                    let title = '';
                    const titleEl = anchor.querySelector('h1, h2, h3, h4, [class*="title"], [class*="headline"], [class*="heading"], span');
                    if (titleEl) {
                        title = titleEl.textContent?.trim() || '';
                    }
                    if (!title || title.length < 10) {
                        title = anchor.textContent?.trim() || '';
                    }

                    if (!title || title.length < 15 || title.length > 300) return;
                    if (/^(read more|sign in|subscribe|premium|member exclusive)/i.test(title)) return;

                    seen.add(link);
                    const parent = anchor.closest('article, [class*="story"], [class*="card"], [class*="item"], li, div') || anchor.parentElement;
                    const descEl = parent?.querySelector('p, [class*="description"], [class*="summary"], [class*="blurb"]');
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
            console.error(`[BizJournals] Extraction error:`, (error as Error).message);
        }

        return articles;
    }
}
