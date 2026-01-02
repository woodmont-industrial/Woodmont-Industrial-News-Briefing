// Test script for the new RSS feeds
const axios = require('axios');
const xml2js = require('xml2js');

// New feeds to test
const NEW_FEEDS = [
  { url: "https://www.industrialinfo.com/rss/", name: "Industrial Info Resources", region: "US" },
  { url: "https://www.connectcre.com/feed?story-market=new-jersey", name: "ConnectCRE NJ Industrial", region: "NJ" },
  { url: "https://www.connectcre.com/feed?story-market=dallas-fort-worth", name: "ConnectCRE Dallas-Fort Worth", region: "TX" },
  { url: "https://manufacturing.einnews.com/state/texas", name: "EIN Presswire Texas Manufacturing", region: "TX" },
  { url: "https://www.connectcre.com/feed?story-market=central-florida", name: "ConnectCRE Central Florida", region: "FL" },
  { url: "https://www.connectcre.com/feed", name: "ConnectCRE Main", region: "PA" }
];

async function testFeed(url, name) {
  console.log(`\n🔍 Testing ${name}...`);
  console.log(`URL: ${url}`);
  
  try {
    // First try HEAD request
    const headResponse = await axios.head(url, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      }
    });
    
    console.log(`✅ HEAD Response: ${headResponse.status}`);
    console.log(`   Content-Type: ${headResponse.headers['content-type'] || 'Not specified'}`);
    
    // Now try GET request
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });
    
    // Check if it looks like RSS/XML
    const body = response.data;
    if (!body.includes('<rss') && !body.includes('<feed') && !body.includes('<?xml')) {
      console.log(`❌ ERROR: Response is not RSS/XML`);
      console.log(`   First 200 chars: ${body.substring(0, 200).replace(/\n/g, ' ')}`);
      return { status: 'failing', error: 'Not RSS/XML' };
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
    
    console.log(`✅ SUCCESS: ${articleCount} articles found`);
    if (lastArticle) {
      console.log(`   Latest: ${lastArticle.substring(0, 80)}...`);
    }
    
    return { status: 'working', articleCount };
    
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    if (error.response) {
      console.log(`   HTTP Status: ${error.response.status}`);
    }
    return { status: 'failing', error: error.message };
  }
}

async function main() {
  console.log('🚀 Testing New RSS Feeds...\n');
  console.log('='.repeat(80));
  
  const results = [];
  let working = 0;
  let failing = 0;
  
  for (const feed of NEW_FEEDS) {
    const result = await testFeed(feed.url, feed.name);
    results.push({ ...feed, ...result });
    
    if (result.status === 'working') {
      working++;
    } else {
      failing++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Working: ${working} feeds`);
  console.log(`❌ Failing: ${failing} feeds`);
  console.log(`📈 Success Rate: ${((working / NEW_FEEDS.length) * 100).toFixed(1)}%`);
  
  console.log('\n🎯 WORKING FEEDS:');
  results.filter(r => r.status === 'working').forEach(feed => {
    console.log(`   ✅ ${feed.name} (${feed.region}) - ${feed.articleCount} articles`);
  });
  
  console.log('\n❌ FAILING FEEDS:');
  results.filter(r => r.status === 'failing').forEach(feed => {
    console.log(`   ❌ ${feed.name} - ${feed.error}`);
  });
}

main().catch(console.error);
