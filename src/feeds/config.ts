import { createRequire } from 'module';
import { FeedConfig } from '../types/index.js';

const require = createRequire(import.meta.url);
const feedsData: any[] = require('./feeds.json');

// Browser headers to bypass 403 errors
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache"
};

// Feed types for better categorization and filtering
export const FEED_TYPES = {
  NEWS: 'news',
  INDUSTRIAL_NEWS: 'industrial-news',
  PRESS_RELEASE: 'press-release',
  MACRO: 'macro'
} as const;

// Resolve "browser" header markers to actual BROWSER_HEADERS object
export const RSS_FEEDS: FeedConfig[] = feedsData.map(feed => ({
  ...feed,
  headers: feed.headers === 'browser' ? BROWSER_HEADERS : feed.headers
}));
