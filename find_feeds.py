#!/usr/bin/env python3
"""
Find working RSS feed URLs for broken sources
"""
import requests
import re

def find_alternative_feeds():
    """Find working RSS feeds for the broken sources"""
    
    alternatives = {
        "GlobeSt": [
            "https://www.globest.com/feed/",
            "https://www.globest.com/rss.xml",
            "https://feeds.feedburner.com/GlobeSt",
            "https://www.globest.com/feed/rss/"
        ],
        "Commercial Property Executive": [
            "https://www.commercialpropertyexecutive.com/feed/",
            "https://cpexecutive.com/feed/",
            "https://www.commercialpropertyexecutive.com/feed/rss/",
            "https://cpexecutive.com/rss/"
        ],
        "NAIOP": [
            "https://www.naiop.org/en/rss-feeds-and-alerts",
            "https://www.naiop.org/rss",
            "https://www.naiop.org/feed",
            "https://naiop.org/feed/"
        ],
        "South FL Business Journal": [
            "https://www.bizjournals.com/southflorida/feed/",
            "https://www.bizjournals.com/miami/feed/",
            "https://www.bizjournals.com/southflorida/rss/",
            "https://feeds.bizjournals.com/southflorida"
        ],
        "LoopNet": [
            "https://www.loopnet.com/feeds/news.rss",
            "https://www.loopnet.com/rss",
            "https://www.loopnet.com/feed",
            "https://loopnet.com/feed.xml"
        ],
        "CoStar": [
            "https://www.costar.com/rss",
            "https://www.costar.com/feed",
            "https://www.costar.com/rss.xml",
            "https://feeds.costar.com/costar/news"
        ],
        "Daily Record NJ": [
            "https://www.dailyrecord.com/feed",
            "https://www.dailyrecord.com/rss",
            "https://www.northjersey.com/feed",
            "https://www.dailyrecord.com/feed/"
        ],
        "Commercial Search": [
            "https://www.commercialsearch.com/feed/",
            "https://www.commercialsearch.com/rss",
            "https://commercialsearch.com/feed/",
            "https://www.commercialsearch.com/rss.xml"
        ]
    }
    
    print("🔍 Finding Alternative RSS Feeds")
    print("=" * 60)
    
    working_alternatives = []
    
    for source, urls in alternatives.items():
        print(f"\n📡 Testing alternatives for {source}...")
        found_working = False
        
        for url in urls:
            try:
                response = requests.get(url, timeout=10, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                })
                
                if response.status_code == 200:
                    content = response.text[:500]
                    if '<?xml' in content or '<rss' in content or '<feed' in content:
                        print(f"✅ FOUND: {url}")
                        working_alternatives.append((source, url))
                        found_working = True
                        break
                    else:
                        print(f"❌ Not RSS: {url}")
                else:
                    print(f"❌ HTTP {response.status_code}: {url}")
                    
            except Exception as e:
                print(f"❌ Error: {url} - {str(e)}")
        
        if not found_working:
            print(f"❌ No working alternative found for {source}")
    
    print("\n" + "=" * 60)
    print("📊 WORKING ALTERNATIVES FOUND:")
    for source, url in working_alternatives:
        print(f"   • {source}: {url}")
    
    # Generate TypeScript config
    print("\n📝 TYPESCRIPT CONFIG FOR WORKING ALTERNATIVES:")
    for source, url in working_alternatives:
        region = "US"
        if "NJ" in source: region = "NJ"
        elif "FL" in source: region = "FL"
        
        print(f'{{ url: "{url}", name: "{source}", region: "{region}", source: "{source.split()[0]}", timeout: 120000 }},')

if __name__ == "__main__":
    find_alternative_feeds()
