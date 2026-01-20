import Parser from 'rss-parser';
import axios from 'axios';

// Define types inline since module import is failing
export interface NormalizedItem {
    id: string;
    title: string;
    link: string;
    source: string;
    region: string;
    pubDate: string;
    description: string;
    content: string;
    author: string;
    category: string;
    imageUrl: string;
    tier: 'A' | 'B' | 'C';
    keywords: string[];
    isRelevant: boolean;
    hasCRE: boolean;
    hasIndustrial: boolean;
    hasTransaction: boolean;
    hasSize: boolean;
    hasPrice: boolean;
    hasDevelopment: boolean;
    hasGeography: boolean;
    hasPropertySignals: boolean;
    hasHardNegative: boolean;
}

export interface FeedConfig {
    url: string;
    name: string;
    region?: string;
    enabled?: boolean;
}

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: ['media:content', 'enclosure', 'description', 'content:encoded', 'pubDate', 'published']
  }
});

export interface ParsedFeed {
  items: NormalizedItem[];
  status: 'ok' | 'error';
  error?: string;
}

export async function parseRSSFeed(feed: FeedConfig): Promise<ParsedFeed> {
  try {
    // First try with rss-parser
    const parsed = await parser.parseURL(feed.url);
    
    const items: NormalizedItem[] = [];
    
    for (const item of parsed.items) {
      try {
        const normalized: NormalizedItem = {
          id: computeId(item.link || item.guid || ''),
          title: item.title || '',
          link: normalizeUrl(item.link || item.guid || ''),
          source: feed.name,
          region: feed.region || 'US',
          pubDate: (item.pubDate || item.published) ? new Date(item.pubDate || item.published).toISOString() : '',
          description: stripHtmlTags(item.description || item['content:encoded'] || ''),
          content: item.content || item['content:encoded'] || item.description || '',
          author: (item as any).creator || (item as any).author || '',
          category: item.categories?.join(', ') || '',
          imageUrl: extractImage(item),
          tier: 'C', // Will be classified later
          keywords: [],
          isRelevant: false,
          hasCRE: false,
          hasIndustrial: false,
          hasTransaction: false,
          hasSize: false,
          hasPrice: false,
          hasDevelopment: false,
          hasGeography: false,
          hasPropertySignals: false,
          hasHardNegative: false
        };
        
        items.push(normalized);
      } catch (e) {
        console.error(`Error normalizing item from ${feed.name}:`, e);
      }
    }
    
    return {
      status: 'ok',
      items
    };
    
  } catch (error: any) {
    // Fallback to manual parsing if rss-parser fails
    try {
      return await parseManually(feed);
    } catch (fallbackError) {
      return {
        status: 'error',
        error: `RSS Parser failed: ${error.message}. Manual parse failed: ${fallbackError}`,
        items: []
      };
    }
  }
}

// Fallback manual parser using xml2js
async function parseManually(feed: FeedConfig): Promise<ParsedFeed> {
  const xml2js = require('xml2js');
  
  const response = await axios.get(feed.url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml'
    }
  });
  
  const parsed = await xml2js.parseStringPromise(response.data, { mergeAttrs: true });
  const items: NormalizedItem[] = [];
  
  let rawItems: any[] = [];
  if (parsed.rss?.channel?.[0]?.item) {
    rawItems = parsed.rss.channel[0].item;
  } else if (parsed.feed?.entry) {
    rawItems = parsed.feed.entry;
  }
  
  for (const rawItem of rawItems) {
    try {
      const normalized: NormalizedItem = {
        id: computeId(rawItem.link?.[0] || rawItem.id?.[0] || ''),
        title: rawItem.title?.[0] || '',
        link: normalizeUrl(rawItem.link?.[0] || rawItem.id?.[0] || ''),
        source: feed.name,
        region: feed.region || 'US',
        pubDate: (rawItem.pubDate?.[0] || rawItem.published?.[0]) ? new Date(rawItem.pubDate?.[0] || rawItem.published?.[0]).toISOString() : '',
        description: stripHtmlTags(rawItem.description?.[0] || rawItem.summary?.[0] || ''),
        content: rawItem['content:encoded']?.[0] || rawItem.description?.[0] || '',
        author: rawItem['dc:creator']?.[0] || rawItem.author?.[0] || '',
        category: (rawItem.category?.map((c: any) => typeof c === 'string' ? c : c._).join(', ') || ''),
        imageUrl: extractImageFromRaw(rawItem),
        tier: 'C',
        keywords: [],
        isRelevant: false,
        hasCRE: false,
        hasIndustrial: false,
        hasTransaction: false,
        hasSize: false,
        hasPrice: false,
        hasDevelopment: false,
        hasGeography: false,
        hasPropertySignals: false,
        hasHardNegative: false
      };
      
      items.push(normalized);
    } catch (e) {
      console.error(`Error normalizing item from ${feed.name}:`, e);
    }
  }
  
  return {
    status: 'ok',
    items
  };
}

// Helper functions (moved from main file)
function computeId(link: string): string {
  if (!link) return Math.random().toString(36).substr(2, 9);
  const stripped = stripTrackingParams(link);
  return Buffer.from(stripped).toString('base64').replace(/[+/=]/g, '').substr(0, 16);
}

function normalizeUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.toString();
  } catch {
    return url;
  }
}

function stripTrackingParams(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    // Remove common tracking parameters
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(param => {
      u.searchParams.delete(param);
    });
    return u.toString();
  } catch {
    return url;
  }
}

function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function extractImage(item: any): string {
  // Try various image fields
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
    return item.enclosure.url;
  }
  if (item['media:content']?.url) {
    return item['media:content'].url;
  }
  if (item['media:thumbnail']?.url) {
    return item['media:thumbnail'].url;
  }
  
  // Extract from description/content
  const content = item.content || item['content:encoded'] || item.description || '';
  const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
  return imgMatch ? imgMatch[1] : '';
}

function extractImageFromRaw(rawItem: any): string {
  if (rawItem.enclosure?.[0]?.$?.url && rawItem.enclosure[0].$.type?.startsWith('image/')) {
    return rawItem.enclosure[0].$.url;
  }
  if (rawItem['media:content']?.[0]?.$?.url) {
    return rawItem['media:content'][0].$.url;
  }
  
  const content = rawItem['content:encoded']?.[0] || rawItem.description?.[0] || '';
  const imgMatch = content.match(/<img[^>]+src="([^"]+)"/);
  return imgMatch ? imgMatch[1] : '';
}
