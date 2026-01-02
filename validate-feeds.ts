// RSS Feed Validation Script
import axios from 'axios';
import * as xml2js from 'xml2js';

// Sample of RSS feeds to validate - testing the most important ones first
const RSS_FEEDS = [
  { url: "https://re-nj.com/feed/", name: "Real Estate NJ", region: "NJ" },
  { url: "https://www.bisnow.com/rss-feed/new-jersey", name: "Bisnow New Jersey", region: "NJ" },
  { url: "https://www.bisnow.com/rss-feed/philadelphia", name: "Bisnow Philadelphia", region: "PA" },
  { url: "https://www.bisnow.com/rss-feed/south-florida", name: "Bisnow South Florida", region: "FL" },
  { url: "https://www.bisnow.com/rss-feed/dallas-ft-worth", name: "Bisnow Dallas-Ft Worth", region: "TX" },
  { url: "https://feeds.content.dowjones.io/public/rss/latestnewsrealestate", name: "WSJ Real Estate", region: "US" },
  { url: "https://www.costar.com/rss.xml", name: "CoStar", region: "US" },
  { url: "https://www.loopnet.com/rss", name: "LoopNet", region: "US" },
  { url: "https://feeds.bizjournals.com/southflorida", name: "South FL Business Journal", region: "FL" },
  { url: "https://lvb.com/feed/", name: "Lehigh Valley Business", region: "PA" },
  { url: "https://njbiz.com/feed/", name: "NJBIZ", region: "NJ" },
  { url: "https://www.globest.com/feed/industrial/", name: "GlobeSt Industrial", region: "US" },
  { url: "https://www.connectcre.com/feed?story-sector=industrial", name: "ConnectCRE Industrial", region: "US" },
  { url: "https://www.commercialsearch.com/news/feed/", name: "Commercial Property Executive", region: "US" },
  { url: "https://nreionline.com/feed/", name: "National Real Estate Investor", region: "US" },
  { url: "https://feeds.bloomberg.com/markets/news.rss", name: "Bloomberg Markets", region: "US" },
  { url: "https://www.reuters.com/business/real-estate/rss", name: "Reuters Real Estate", region: "US" },
  { url: "https://www.supplychaindive.com/feeds/news/", name: "Supply Chain Dive", region: "US" },
  { url: "https://www.freightwaves.com/feed/", name: "FreightWaves", region: "US" },
  { url: "https://www.dcvelocity.com/rss/", name: "DC Velocity", region: "US" }
];

interface ValidationResult {
  name: string;
  url: string;
  status: 'working' | 'failing' | 'redirected';
  statusCode: number;
  contentType: string;
  error?: string;
  articleCount?: number;
  lastArticle?: string;
}

async function validateFeed(url: string, name: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    name,
    url,
    status: 'failing',
    statusCode: 0,
    contentType: ''
  };

  try {
    // First, try HEAD request to check headers
    const headResponse = await axios.head(url, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      }
    });

    result.statusCode = headResponse.status;
    result.contentType = headResponse.headers['content-type'] || '';

    // Check for redirects
    if (headResponse.status >= 300 && headResponse.status < 400) {
      result.status = 'redirected';
      result.error = `Redirected to: ${headResponse.headers.location}`;
      return result;
    }

    // If content type doesn't include XML, it's likely not an RSS feed
    if (!result.contentType.includes('xml') && !result.contentType.includes('rss')) {
      result.error = `Invalid content-type: ${result.contentType}`;
      return result;
    }

    // Now try to fetch and parse the actual feed
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });

    const body = response.data;
    
    // Check if it looks like XML/RSS
    if (!body.includes('<rss') && !body.includes('<feed') && !body.includes('<?xml')) {
      result.error = 'Response does not contain RSS/XML content';
      return result;
    }

    // Try to parse XML
    const parsed = await xml2js.parseStringPromise(body, { mergeAttrs: true });
    
    // Count articles
    let articleCount = 0;
    let lastArticle = '';
    
    if (parsed.rss && parsed.rss.channel && parsed.rss.channel[0] && parsed.rss.channel[0].item) {
      articleCount = parsed.rss.channel[0].item.length;
      if (articleCount > 0) {
        const firstItem = parsed.rss.channel[0].item[0];
        lastArticle = firstItem.title ? firstItem.title[0] : '';
      }
    } else if (parsed.feed && parsed.feed.entry) {
      articleCount = parsed.feed.entry.length;
      if (articleCount > 0) {
        const firstItem = parsed.feed.entry[0];
        lastArticle = firstItem.title ? firstItem.title : '';
      }
    }

    result.status = 'working';
    result.articleCount = articleCount;
    result.lastArticle = lastArticle;

  } catch (error: any) {
    result.error = error.message || 'Unknown error';
    if (error.response) {
      result.statusCode = error.response.status;
    }
  }

  return result;
}

async function main() {
  console.log('🔍 Validating RSS Feeds...\n');
  console.log('='.repeat(120));
  
  const results: ValidationResult[] = [];
  let working = 0;
  let failing = 0;
  let redirected = 0;

  // Validate feeds in batches to avoid overwhelming servers
  const batchSize = 5;
  for (let i = 0; i < RSS_FEEDS.length; i += batchSize) {
    const batch = RSS_FEEDS.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(feed => validateFeed(feed.url, feed.name))
    );
    results.push(...batchResults);

    // Print results for this batch
    batchResults.forEach(result => {
      const icon = result.status === 'working' ? '✅' : result.status === 'redirected' ? '⚠️' : '❌';
      const status = result.status.toUpperCase().padEnd(9);
      const code = result.statusCode.toString().padEnd(3);
      const count = result.articleCount ? `${result.articleCount} articles`.padEnd(12) : ' '.padEnd(12);
      
      console.log(`${icon} ${status} ${code} ${count} ${result.name}`);
      
      if (result.error) {
        console.log(`   └─ Error: ${result.error}`);
      }
      if (result.lastArticle) {
        console.log(`   └─ Latest: ${result.lastArticle.substring(0, 60)}...`);
      }
    });

    // Small delay between batches
    if (i + batchSize < RSS_FEEDS.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(120));
  console.log('📊 SUMMARY');
  console.log('='.repeat(120));
  
  working = results.filter(r => r.status === 'working').length;
  failing = results.filter(r => r.status === 'failing').length;
  redirected = results.filter(r => r.status === 'redirected').length;

  console.log(`✅ Working: ${working} feeds`);
  console.log(`❌ Failing: ${failing} feeds`);
  console.log(`⚠️  Redirected: ${redirected} feeds`);
  console.log(`📈 Success Rate: ${((working / RSS_FEEDS.length) * 100).toFixed(1)}%`);

  // Save results to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: { working, failing, redirected, total: RSS_FEEDS.length },
    feeds: results
  };

  require('fs').writeFileSync('feed-validation-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Detailed report saved to: feed-validation-report.json');

  // Create list of working feeds for easy copy-paste
  const workingFeeds = results.filter(r => r.status === 'working');
  console.log('\n🎯 WORKING FEEDS (copy-paste ready):');
  console.log('='.repeat(120));
  workingFeeds.forEach(feed => {
    console.log(`{ url: "${feed.url}", name: "${feed.name}", region: "RSS_FEEDS.find(f => f.url === feed.url)?.region || 'US'" },`);
  });
}

main().catch(console.error);
