/**
 * Woodmont Industrial News Briefing - Main Entry Point
 *
 * This is a thin entry point that uses modular components from src/
 *
 * Usage:
 *   npx tsx rssfeed.ts                    - Start the server
 *   npx tsx rssfeed.ts --no-browser       - Start without opening browser
 *   npx tsx rssfeed.ts --build-static     - Build static files for GitHub Pages
 *   npx tsx rssfeed.ts --send-newsletter  - Send newsletter manually
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import * as http from 'http';
import { handleRequest } from './src/server/endpoints.js';
import { fetchAllRSSArticles } from './src/feeds/fetcher.js';
import { saveArticlesToFile, loadArticlesFromFile } from './src/store/storage.js';
import { log } from './src/server/logging.js';
import { buildStaticRSS } from './src/build/static.js';

const PORT = process.env.PORT || 8080;

/**
 * Start the HTTP server
 */
async function startServer(openBrowserOnStart: boolean = true): Promise<void> {
    // Load articles from file on startup
    const loadedCount = loadArticlesFromFile();

    const server = http.createServer((req, res) => {
        handleRequest(req, res);
    });

    server.listen(PORT, () => {
        log('info', 'Server started successfully', { port: PORT, loadedArticles: loadedCount });
        console.log(`\n🚀 Local RSS dashboard running at http://localhost:${PORT}`);
        console.log(`📊 Loaded ${loadedCount} articles from persistent storage`);

        // Open browser if enabled
        if (openBrowserOnStart) {
            console.log('Opening browser... (use --no-browser flag to disable)');
            setTimeout(() => {
                import('./src/server/browser.js').then(({ openBrowser }) => {
                    openBrowser(`http://localhost:${PORT}`);
                });
            }, 1000);
        } else {
            console.log('Browser auto-open disabled (--no-browser flag or NO_BROWSER=true)');
        }

        // Fetch RSS feeds on startup for fresh data
        setTimeout(async () => {
            try {
                console.log('🔄 Initial: Fetching RSS feeds for fresh data...');
                await fetchAllRSSArticles();
                saveArticlesToFile();
                console.log('✅ Initial: RSS feeds loaded with fresh data');
            } catch (err) {
                const error = err as Error;
                console.error('❌ Initial fetch failed:', error.message);
            }
        }, 2000);

        // Save articles every minute
        setInterval(() => {
            saveArticlesToFile();
        }, 60 * 1000);

        // Fetch RSS feeds every 15 minutes in background
        setInterval(async () => {
            try {
                console.log('🔄 Background: Fetching RSS feeds...');
                await fetchAllRSSArticles();
                saveArticlesToFile();
                console.log('✅ Background: RSS feeds updated');
            } catch (err) {
                const error = err as Error;
                console.error('❌ Background fetch failed:', error.message);
            }
        }, 15 * 60 * 1000);
    });

    // Save articles on graceful shutdown
    process.on('SIGINT', () => {
        log('info', 'Server shutting down (SIGINT)');
        console.log('\n💾 Saving articles before shutdown...');
        saveArticlesToFile();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        log('info', 'Server shutting down (SIGTERM)');
        console.log('\n💾 Saving articles before shutdown...');
        saveArticlesToFile();
        process.exit(0);
    });
}

/**
 * Send newsletter manually
 */
async function sendNewsletter(): Promise<void> {
    console.log('Sending manual newsletter...');
    try {
        const { sendDailyNewsletter } = await import('./src/server/email.js');
        const success = await sendDailyNewsletter();
        if (success) {
            console.log('Newsletter sent successfully!');
            process.exit(0);
        } else {
            console.error('Failed to send newsletter');
            process.exit(1);
        }
    } catch (err) {
        console.error('Error sending newsletter:', err);
        process.exit(1);
    }
}

// Main entry point
if (require.main === module) {
    const args = process.argv.slice(2);
    const noBrowserFlag = args.includes('--no-browser') || process.env.NO_BROWSER === 'true';

    if (args.includes('--build-static')) {
        // Build static files for GitHub Pages
        console.log('🏗️ Building static files for GitHub Pages...');
        buildStaticRSS().catch(err => {
            console.error('Build failed:', err);
            process.exit(1);
        });
    } else if (args.includes('--send-newsletter')) {
        // Send newsletter manually
        sendNewsletter();
    } else {
        // Start the server
        startServer(!noBrowserFlag);
    }
}

// Export for programmatic use
export { startServer, sendNewsletter, buildStaticRSS };
