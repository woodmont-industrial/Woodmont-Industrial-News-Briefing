#!/usr/bin/env python3
"""
Script to test RSS feed URLs and identify broken ones
"""
import urllib.request
import urllib.error
import sys
from urllib.parse import urlparse

# List of feeds to test
feeds = [
    ("Supply Chain Dive", "https://www.supplychaindive.com/feeds/news/"),
    ("Modern Materials Handling", "https://www.mmh.com/rss"),
    ("CSCMP", "https://www.cscmp.org/rss.xml"),
    ("Institute for Supply Management", "https://www.ismworld.org/rss/"),
    ("Food Logistics", "https://www.foodlogistics.com/rss"),
    ("Material Handling & Logistics", "https://www.mhlnews.com/rss"),
    ("Supply Chain Brain Logistics", "https://www.supplychainbrain.com/rss/topic/1135-logistics"),
    ("Logistics Management", "https://www.logisticsmgmt.com/feed/"),
    ("Industrial Property", "https://www.industrialproperty.com/feed/"),
    ("Warehousing & Logistics", "https://www.warehousingandlogistics.com/feed/"),
    ("Logistics Property", "https://www.logisticsproperty.com/feed/"),
    ("Crexi Commercial Marketplace", "https://www.crexi.com/feed/"),
    ("BOMA", "https://www.boma.org/feed/"),
    ("Urban Land Institute", "https://uli.org/feed/"),
    ("NAIOP", "https://www.naiop.org/feed/"),
    ("NAIOP Industrial", "https://www.naiop.org/en/Magazine/Reports/Industrial-RSS"),
    ("SIOR", "https://www.sior.com/feed/"),
    ("RE Business Online", "https://rebusinessonline.com/feed/"),
    ("Logistics Manager UK", "https://www.logisticsmanager.com/feed/"),
    ("SHD Logistics", "https://www.shdlogistics.com/feed/"),
    ("Daily Record NJ", "https://dailyrecord.newspapers.com/feed/"),
    ("Lehigh Valley Business", "https://lvb.com/feed/"),
    ("Real Estate NJ", "https://re-nj.com/feed/"),
    ("LoopNet Commercial News", "https://www.loopnet.com/rss/commercial-real-estate-news"),
    ("CoStar News", "https://www.costar.com/news/rss"),
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
            
            print(f"{name:30} {status:10} {response.status}")
            
            if not is_rss:
                print(f"  → Content-Type: {content_type}")
                print(f"  → Preview: {content_preview[:100]}...")
                return False
            
            return True
        
    except Exception as e:
        print(f"{name:30} ❌ ERROR   {str(e)[:50]}")
        return False

if __name__ == "__main__":
    print("Testing RSS Feed URLs...")
    print("=" * 60)
    
    working = []
    broken = []
    
    for name, url in feeds:
        if test_feed(name, url):
            working.append((name, url))
        else:
            broken.append((name, url))
    
    print("\n" + "=" * 60)
    print(f"SUMMARY: {len(working)} working, {len(broken)} broken")
    
    if broken:
        print("\nBROKEN FEEDS:")
        for name, url in broken:
            print(f"  ❌ {name}: {url}")
