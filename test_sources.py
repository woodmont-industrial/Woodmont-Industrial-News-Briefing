#!/usr/bin/env python3
"""
Test script to verify which RSS feeds are actually fetching articles
"""
import requests
import json
from datetime import datetime

def test_rss_feeds():
    """Test each RSS feed individually to see what's working"""
    
    # Your boss's priority feeds
    priority_feeds = {
        "Real Estate NJ": "https://re-nj.com/feed/",
        "Commercial Search": "https://www.commercialsearch.com/feed/", 
        "WSJ": "https://feeds.content.dowjones.io/public/rss/latestnewsrealestate",
        "Bisnow NJ": "https://www.bisnow.com/rss-feed/new-jersey",
        "Bisnow PA": "https://www.bisnow.com/rss-feed/philadelphia", 
        "Bisnow FL": "https://www.bisnow.com/rss-feed/south-florida",
        "GlobeSt": "https://www.globest.com/feed/",
        "NAIOP": "https://www.naiop.org/en/rss-feeds-and-alerts",
        "Commercial Property Exec": "https://www.commercialpropertyexecutive.com/feed/",
        "South FL Business Journal": "https://www.bizjournals.com/southflorida/feed/",
        "LoopNet": "https://www.loopnet.com/feeds/news.rss",
        "CoStar": "https://www.costar.com/rss",
        "Lehigh Valley Business": "https://lvb.com/feed/",
        "Daily Record NJ": "https://dailyrecord.com/feed",
        "NJBIZ": "https://njbiz.com/feed/"
    }
    
    print("🔍 Testing RSS Feed Sources")
    print("=" * 60)
    
    working_feeds = []
    broken_feeds = []
    
    for name, url in priority_feeds.items():
        print(f"\n📡 Testing {name}...")
        try:
            response = requests.get(url, timeout=10, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })
            
            if response.status_code == 200:
                content = response.text[:500]
                
                # Check if it's actually RSS/XML
                if '<?xml' in content or '<rss' in content or '<feed' in content:
                    print(f"✅ {name}: Working RSS feed")
                    working_feeds.append((name, url))
                else:
                    print(f"❌ {name}: Not RSS (might be HTML)")
                    broken_feeds.append((name, url, "Not RSS format"))
            else:
                print(f"❌ {name}: HTTP {response.status_code}")
                broken_feeds.append((name, url, f"HTTP {response.status_code}"))
                
        except Exception as e:
            print(f"❌ {name}: Error - {str(e)}")
            broken_feeds.append((name, url, str(e)))
    
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print(f"✅ Working feeds: {len(working_feeds)}")
    print(f"❌ Broken feeds: {len(broken_feeds)}")
    
    print("\n✅ WORKING FEEDS:")
    for name, url in working_feeds:
        print(f"   • {name}: {url}")
    
    print("\n❌ BROKEN FEEDS:")
    for name, url, error in broken_feeds:
        print(f"   • {name}: {error}")
    
    # Generate TypeScript array for working feeds
    print("\n" + "=" * 60)
    print("📝 TYPESCRIPT CONFIG FOR WORKING FEEDS:")
    print("// BOSS'S PRIORITY FEEDS - Verified Working")
    for name, url in working_feeds:
        region = "US"
        if "NJ" in name: region = "NJ"
        elif "PA" in name: region = "PA" 
        elif "FL" in name: region = "FL"
        
        print(f'{{ url: "{url}", name: "{name}", region: "{region}", source: "{name.split()[0]}", timeout: 120000 }},')

if __name__ == "__main__":
    test_rss_feeds()
