/**
 * LoopNet Scraper
 *
 * Scrapes LoopNet industrial property listings for NJ, PA, FL.
 * Converts listings into "availability" articles for the briefing feed.
 * Uses Playwright (Cloudflare-protected, JS-rendered search results).
 */

import { Page } from 'playwright';
import { NormalizedItem } from '../../types/index.js';
import { BaseScraper, randomDelay } from '../base-scraper.js';
import { ScraperDomainConfig, ScraperTarget } from '../scraper-config.js';

interface LoopNetListing {
    title: string;
    link: string;
    address: string;
    size: string;
    price: string;
    propertyType: string;
    broker: string;
    image: string;
}

export class LoopNetScraper extends BaseScraper {
    constructor(config: ScraperDomainConfig) {
        super(config);
    }

    async extractArticles(target: ScraperTarget, page: Page | null, html?: string): Promise<NormalizedItem[]> {
        if (page) {
            return this.extractFromPage(page, target);
        }
        // LoopNet requires JS rendering — axios won't work
        return [];
    }

    private async extractFromPage(page: Page, target: ScraperTarget): Promise<NormalizedItem[]> {
        const articles: NormalizedItem[] = [];

        try {
            // Wait for listing cards to load
            await page.waitForSelector('[class*="placard"], [class*="listing-card"], article[data-id]', {
                timeout: 20000
            }).catch(() => {});

            // Scroll down to load more results
            for (let i = 0; i < 3; i++) {
                await page.mouse.wheel(0, 600);
                await randomDelay(800, 1500);
            }

            const listings = await page.evaluate(() => {
                const results: LoopNetListing[] = [];
                const seen = new Set<string>();

                // LoopNet uses placard-based listing cards
                const cardSelectors = [
                    '[class*="placard"]',
                    '[class*="listing-card"]',
                    'article[data-id]',
                    '[class*="property-card"]',
                    '.placardContent'
                ];

                let cards: Element[] = [];
                for (const selector of cardSelectors) {
                    const found = document.querySelectorAll(selector);
                    if (found.length > 0) {
                        cards = Array.from(found);
                        break;
                    }
                }

                for (const card of cards) {
                    try {
                        // Extract link
                        const linkEl = card.querySelector('a[href*="/Listing/"]') ||
                                       card.querySelector('a[href*="/listing/"]') ||
                                       card.querySelector('a[href*="loopnet.com"]') ||
                                       card.querySelector('a');
                        if (!linkEl) continue;
                        const link = (linkEl as HTMLAnchorElement).href;
                        if (!link || seen.has(link)) continue;
                        seen.add(link);

                        // Extract title/address
                        const titleEl = card.querySelector('[class*="title"], [class*="name"], h2, h3, h4') ||
                                        card.querySelector('[class*="address"]');
                        const title = titleEl?.textContent?.trim() || '';

                        // Extract address (often separate from title)
                        const addressEl = card.querySelector('[class*="address"], [class*="location"], [class*="subtitle"]');
                        const address = addressEl?.textContent?.trim() || '';

                        // Extract size
                        const sizeEl = card.querySelector('[class*="size"], [class*="sqft"], [class*="area"]');
                        let size = sizeEl?.textContent?.trim() || '';
                        if (!size) {
                            // Look for SF pattern in any text
                            const cardText = card.textContent || '';
                            const sfMatch = cardText.match(/[\d,]+\s*(?:SF|sq\s*ft|square\s*feet)/i);
                            if (sfMatch) size = sfMatch[0];
                        }

                        // Extract price
                        const priceEl = card.querySelector('[class*="price"], [class*="rate"]');
                        let price = priceEl?.textContent?.trim() || '';
                        if (!price) {
                            const cardText = card.textContent || '';
                            const priceMatch = cardText.match(/\$[\d,.]+(?:\s*(?:\/SF|\/yr|\/mo|M|PSF))?/i);
                            if (priceMatch) price = priceMatch[0];
                        }

                        // Extract property type
                        const typeEl = card.querySelector('[class*="type"], [class*="property-type"], [class*="category"]');
                        const propertyType = typeEl?.textContent?.trim() || 'Industrial';

                        // Extract broker
                        const brokerEl = card.querySelector('[class*="broker"], [class*="agent"], [class*="contact"]');
                        const broker = brokerEl?.textContent?.trim() || '';

                        // Extract image
                        const imgEl = card.querySelector('img');
                        const image = imgEl?.src || '';

                        if (title || address) {
                            results.push({
                                title: title || address,
                                link,
                                address: address || title,
                                size,
                                price,
                                propertyType,
                                broker,
                                image
                            });
                        }
                    } catch {
                        // Skip individual card errors
                    }
                }

                return results.slice(0, 25);
            }) as LoopNetListing[];

            // Determine region from target URL
            const region = this.getRegionFromUrl(target.url);
            const listingType = target.url.includes('for-sale') ? 'for sale' : 'for lease';

            for (const listing of listings) {
                const description = this.buildDescription(listing, listingType);
                const displayTitle = this.buildTitle(listing, listingType);

                const article = this.buildArticle({
                    title: displayTitle,
                    link: listing.link,
                    description,
                    image: listing.image || undefined
                });

                // Override region and category for listings
                article.regions = region ? [region] : ['US'];
                article.category = 'availabilities';

                articles.push(article);
            }

            console.log(`[LoopNet] Extracted ${articles.length} listings from ${target.label}`);
        } catch (error) {
            console.error(`[LoopNet] Extraction error:`, (error as Error).message);
        }

        return articles;
    }

    private getRegionFromUrl(url: string): string | null {
        if (/\/nj\//i.test(url) || /new-jersey/i.test(url)) return 'NJ';
        if (/\/pa\//i.test(url) || /pennsylvania/i.test(url)) return 'PA';
        if (/\/fl\//i.test(url) || /florida/i.test(url)) return 'FL';
        return null;
    }

    private buildTitle(listing: LoopNetListing, listingType: string): string {
        const parts: string[] = [];

        // Property type + listing type
        const type = listing.propertyType || 'Industrial Property';
        parts.push(`${type} ${listingType}`);

        // Address
        if (listing.address) {
            parts.push(`at ${listing.address}`);
        } else if (listing.title && listing.title !== listing.address) {
            parts.push(`— ${listing.title}`);
        }

        // Size
        if (listing.size) {
            parts.push(`(${listing.size})`);
        }

        return parts.join(' ');
    }

    private buildDescription(listing: LoopNetListing, listingType: string): string {
        const parts: string[] = [];

        if (listing.title) parts.push(listing.title);
        if (listing.address && listing.address !== listing.title) parts.push(listing.address);

        const details: string[] = [];
        if (listing.size) details.push(listing.size);
        if (listing.price) details.push(listing.price);
        if (listing.propertyType) details.push(listing.propertyType);
        if (details.length > 0) parts.push(details.join(' | '));

        if (listing.broker) parts.push(`Broker: ${listing.broker}`);
        parts.push(`Listed ${listingType} on LoopNet.`);

        return parts.join('. ');
    }
}
