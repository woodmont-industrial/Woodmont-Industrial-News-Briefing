// Configuration constants for the Woodmont Industrial News app

// Regions for filtering
export const REGIONS = ["All", "NJ", "PA", "FL", "TX"];

// Environment detection
export const IS_STATIC = window.location.hostname !== 'localhost';

// API configuration
export const API_BASE = '';

// Fallback image for articles without images
export const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=400&h=300&fit=crop&crop=center";

// Category definitions
export const CATEGORIES = [
  { value: '', label: 'Category: All' },
  { value: 'relevant', label: 'RELEVANT ARTICLES' },
  { value: 'transaction', label: 'TRANSACTIONS' },
  { value: 'availabilities', label: 'AVAILABILITIES' },
  { value: 'people', label: 'PEOPLE NEWS' }
  ];

// Sorting options
export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' }
  ];

// Time frame options for articles and newsletters
export const TIMEFRAME_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' }
  ];

// Review categories for admin panel
export const REVIEW_CATEGORIES = [
  { value: 'not relevant', label: 'Not Relevant' },
  { value: 'excluded', label: 'Excluded' },
  { value: 'unapproved source', label: 'Unapproved Source' }
  ];

// Category color schemes
export const CATEGORY_COLORS = {
    'transaction': {
          bg: 'bg-amber-100 dark:bg-amber-900',
          text: 'text-amber-800 dark:text-amber-200'
    },
    'availabilities': {
          bg: 'bg-green-100 dark:bg-green-900',
          text: 'text-green-800 dark:text-green-200'
    },
    'people': {
          bg: 'bg-purple-100 dark:bg-purple-900',
          text: 'text-purple-800 dark:text-purple-200'
    },
    'relevant': {
          bg: 'bg-slate-100 dark:bg-slate-700',
          text: 'text-slate-800 dark:text-slate-200'
    }
};

// API endpoints
export const ENDPOINTS = {
    ARTICLES: IS_STATIC ? 'feed.json' : '/api/articles',
    LAST_FETCH: '/api/last-fetch',
    REFRESH: '/api/refresh',
    NEWSLETTER: '/api/newsletter',
    MANUAL_ARTICLE: '/api/manual',
    SEND_NEWSLETTER: '/api/send-newsletter',
    APPROVE_ARTICLE: '/api/approve-article',
    BLACKLIST_ARTICLE: '/api/blacklist-article'
};

// Polling interval (5 minutes)
export const POLLING_INTERVAL = 5 * 60 * 1000;

// Newsletter section limits - INCREASED for more coverage
export const NEWSLETTER_LIMITS = {
    relevant: 10,
    transaction: 8,
    availabilities: 8,
    people: 6
};

export default {
    REGIONS,
    IS_STATIC,
    API_BASE,
    FALLBACK_IMAGE,
    CATEGORIES,
    SORT_OPTIONS,
    TIMEFRAME_OPTIONS,
    REVIEW_CATEGORIES,
    CATEGORY_COLORS,
    ENDPOINTS,
    POLLING_INTERVAL,
    NEWSLETTER_LIMITS
};
