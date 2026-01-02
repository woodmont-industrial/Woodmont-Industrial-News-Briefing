#!/usr/bin/env python3
"""
Script to test the fixed RSS feed URLs
"""
import urllib.request
import urllib.error
import sys

# Fixed feeds to test
fixed_feeds = [
    ("Modern Materials Handling", "https://www.mhmonline.com/rss.xml"),
    ("CSCMP", "https://www.cscmp.org/cscmp-news-rss"),
    ("Institute for Supply Management", "https://www.ismworld.org/supply-management-news-rss"),
    ("Material Handling & Logistics", "https://www.mhlnews.com/rss.xml"),
    ("Industrial Property", "https://www.industrialproperty.com/rss.xml"),
    ("Warehousing & Logistics", "https://www.warehousingandlogistics.com/rss.xml"),
    ("Logistics Property", "https://www.logisticsproperty.com/rss.xml"),
    ("Crexi Commercial Marketplace", "https://www.crexi.com/blog/feed/"),
    ("NAIOP", "https://www.naiop.org/news-rss"),
    ("NAIOP Industrial", "https://www.naiop.org/industrial-development-rss"),
    ("SIOR", "https://www.sior.com/news-rss"),
    ("SHD Logistics", "https://www.shdlogistics.com/rss.xml"),
    ("Daily Record NJ", "https://www.dailyrecord.com/rss"),
    ("Lehigh Valley Business", "https://www.lehighvalleylive.com/rss"),
    ("LoopNet Commercial News", "https://www.loopnet.com/learn/commercial-real-estate-news/feed/"),
    ("CoStar News", "https://www.costar.com/feed"),
]

def test_feed(name, url):
    """Test a single feed URL"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        
        with urllib.request.urlopen(req, timeout=15) as response:
            content_type = response.headers.get('content-type', '').lower()
            content = response.read().decode('utf-8', errors='ignore')
            content_preview = content[:200] if content else ''
            
            # Check if it's actually RSS/XML
            is_rss = ('xml' in content_type or 
                     'rss' in content_type or 
                     content_preview.startswith('<?xml') or
                     '<rss' in content_preview or
                     '<feed' in content_preview)
            
            # Check if it's HTML (bad)
            is_html = ('html' in content_type or 
                       content_preview.startswith('<!DOCTYPE html') or
                       '<html' in content_preview)
            
            status = "✅ RSS" if is_rss else "❌ HTML" if is_html else f"⚠️ {content_type}"
            
            print(f"{name:35} {status:10} {response.status}")
            
            if not is_rss:
                print(f"  → Content-Type: {content_type}")
                print(f"  → Preview: {content_preview[:100]}...")
                return False
            
            return True
        
    except Exception as e:
        print(f"{name:35} ❌ ERROR   {str(e)[:50]}")
        return False

if __name__ == "__main__":
    print("Testing FIXED RSS Feed URLs...")
    print("=" * 70)
    
    working = []
    still_broken = []
    
    for name, url in fixed_feeds:
        if test_feed(name, url):
            working.append((name, url))
        else:
            still_broken.append((name, url))
    
    print("\n" + "=" * 70)
    print(f"FIXED FEEDS SUMMARY: {len(working)} working, {len(still_broken)} still broken")
    
    if working:
        print("\n✅ SUCCESSFULLY FIXED:")
        for name, url in working:
            print(f"  ✅ {name}")
    
    if still_broken:
        print("\n❌ STILL BROKEN:")
        for name, url in still_broken:
            print(f"  ❌ {name}: {url}")
