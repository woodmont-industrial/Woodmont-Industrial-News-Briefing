// Test script for ALL RSS feeds in the system
const axios = require('axios');
const xml2js = require('xml2js');

// All feeds from the system
const ALL_FEEDS = [
  { url: "https://re-nj.com/feed/", name: "Real Estate NJ", region: "NJ" },
  { url: "https://www.bisnow.com/rss-feed/new-jersey", name: "Bisnow New Jersey", region: "NJ" },
  { url: "https://www.bisnow.com/rss-feed/philadelphia", name: "Bisnow Philadelphia", region: "PA" },
  { url: "https://www.bisnow.com/rss-feed/south-florida", name: "Bisnow South Florida", region: "FL" },
  { url: "https://www.bisnow.com/rss-feed/dallas-ft-worth", name: "Bisnow Dallas-Ft Worth", region: "TX" },
  { url: "https://www.bisnow.com/rss-feed/houston", name: "Bisnow Houston", region: "TX" },
  { url: "https://www.bisnow.com/rss-feed/austin", name: "Bisnow Austin", region: "TX" },
  { url: "https://www.bisnow.com/rss-feed/austin-san-antonio", name: "Bisnow Austin-San Antonio", region: "TX" },
  { url: "https://www.bisnow.com/rss-feed/new-york", name: "Bisnow New York", region: "NY" },
  { url: "https://feeds.content.dowjones.io/public/rss/latestnewsrealestate", name: "WSJ Real Estate", region: "US" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", name: "WSJ Markets", region: "US" },
  { url: "https://feeds.bizjournals.com/southflorida", name: "South FL Business Journal", region: "FL" },
  { url: "https://www.bizjournals.com/southflorida/feed/", name: "South Florida Business Journal", region: "FL" },
  { url: "https://lvb.com/feed/", name: "Lehigh Valley Business", region: "PA" },
  { url: "https://njbiz.com/feed/", name: "NJBIZ", region: "NJ" },
  { url: "https://www.commercialsearch.com/feed/", name: "Commercial Search", region: "US" },
  { url: "https://www.connectcre.com/feed?story-sector=industrial", name: "ConnectCRE Industrial", region: "US" },
  { url: "https://feeds.bloomberg.com/markets/news.rss", name: "Bloomberg Markets", region: "US" },
  { url: "https://feeds.bloomberg.com/real-estate/news.rss", name: "Bloomberg Real Estate", region: "US" },
  { url: "https://www.supplychaindive.com/feeds/news/", name: "Supply Chain Dive", region: "US" },
  { url: "https://www.freightwaves.com/feed/", name: "FreightWaves", region: "US" },
  { url: "https://www.dcvelocity.com/rss/", name: "DC Velocity", region: "US" },
  { url: "https://www.connectcre.com/feed?story-market=new-jersey", name: "ConnectCRE NJ Industrial", region: "NJ" },
  { url: "https://www.connectcre.com/feed?story-market=dallas-fort-worth", name: "ConnectCRE Dallas-Fort Worth", region: "TX" },
  { url: "https://www.connectcre.com/feed?story-market=central-florida", name: "ConnectCRE Central Florida", region: "FL" },
  { url: "https://www.connectcre.com/feed", name: "ConnectCRE Main", region: "PA" }
];

async function testFeed(url, name) {
  process.stdout.write(`\r🔍 Testing ${name}...`.padEnd(60));
  
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });
    
    const body = response.data;
    if (!body.includes('<rss') && !body.includes('<feed') && !body.includes('<?xml')) {
      process.stdout.write(`❌ Not RSS/XML\n`);
      return { status: 'failing', error: 'Not RSS/XML' };
    }
    
    const parsed = await xml2js.parseStringPromise(body, { mergeAttrs: true });
    
    let articleCount = 0;
    if (parsed.rss && parsed.rss.channel && parsed.rss.channel[0] && parsed.rss.channel[0].item) {
      articleCount = parsed.rss.channel[0].item.length;
    } else if (parsed.feed && parsed.feed.entry) {
      articleCount = parsed.feed.entry.length;
    }
    
    process.stdout.write(`✅ ${articleCount} articles\n`);
    return { status: 'working', articleCount };
    
  } catch (error) {
    process.stdout.write(`❌ ${error.message.substring(0, 30)}...\n`);
    return { status: 'failing', error: error.message };
  }
}

async function main() {
  console.log('🚀 Testing ALL RSS Feeds...\n');
  console.log('='.repeat(80));
  
  const results = [];
  let working = 0;
  let failing = 0;
  let totalArticles = 0;
  
  // Test in batches of 5 to avoid overwhelming servers
  const batchSize = 5;
  for (let i = 0; i < ALL_FEEDS.length; i += batchSize) {
    const batch = ALL_FEEDS.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(feed => testFeed(feed.url, feed.name))
    );
    
    batchResults.forEach((result, idx) => {
      const feed = batch[idx];
      results.push({ ...feed, ...result });
      
      if (result.status === 'working') {
        working++;
        totalArticles += result.articleCount || 0;
      } else {
        failing++;
      }
    });
    
    // Small delay between batches
    if (i + batchSize < ALL_FEEDS.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Feeds: ${ALL_FEEDS.length}`);
  console.log(`✅ Working: ${working} feeds`);
  console.log(`❌ Failing: ${failing} feeds`);
  console.log(`📈 Success Rate: ${((working / ALL_FEEDS.length) * 100).toFixed(1)}%`);
  console.log(`📄 Total Articles Available: ${totalArticles}`);
  
  // Group by region
  console.log('\n📍 BY REGION:');
  const byRegion = {};
  results.forEach(r => {
    if (!byRegion[r.region]) byRegion[r.region] = { working: 0, failing: 0 };
    if (r.status === 'working') byRegion[r.region].working++;
    else byRegion[r.region].failing++;
  });
  
  Object.entries(byRegion).forEach(([region, stats]) => {
    console.log(`   ${region}: ${stats.working} working, ${stats.failing} failing`);
  });
  
  console.log('\n❌ FAILING FEEDS:');
  results.filter(r => r.status === 'failing').forEach(feed => {
    console.log(`   ❌ ${feed.name} (${feed.region}) - ${feed.error.substring(0, 50)}...`);
  });
}

main().catch(console.error);
