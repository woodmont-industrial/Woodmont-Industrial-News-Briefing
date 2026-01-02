#!/usr/bin/env python3
"""
Quick test of the newsletter with new sources
"""
import requests
import json

def test_newsletter():
    """Test the newsletter API with the updated sources"""
    
    print("🧪 Testing Newsletter with Boss's Priority Sources")
    print("=" * 60)
    
    # Test the newsletter API
    try:
        response = requests.get("http://localhost:3000/api/newsletter?days=1", timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            html_content = data.get('html', '')
            
            print(f"✅ Newsletter generated successfully!")
            print(f"   Length: {len(html_content)} characters")
            
            # Check for boss's priority sources
            priority_sources = ['Real Estate NJ', 'Bisnow', 'WSJ', 'CoStar', 'LoopNet', 'Lehigh Valley', 'NJBIZ']
            found_sources = []
            
            for source in priority_sources:
                if source in html_content:
                    found_sources.append(source)
                    print(f"   ✅ Found articles from: {source}")
                else:
                    print(f"   ❌ No articles from: {source}")
            
            # Check for industrial focus
            industrial_keywords = ['industrial', 'warehouse', 'logistics', 'distribution']
            industrial_count = sum(html_content.lower().count(keyword) for keyword in industrial_keywords)
            print(f"\n📊 Industrial Focus:")
            print(f"   Found {industrial_count} industrial-related mentions")
            
            # Check for target states
            target_states = ['NJ', 'PA', 'FL', 'TX']
            state_count = sum(html_content.count(state) for state in target_states)
            print(f"\n🗺️ Target States:")
            print(f"   Found {state_count} mentions of target states")
            
            # Show a preview
            print(f"\n📄 Newsletter Preview:")
            print("   " + "-" * 50)
            lines = html_content.split('\n')
            for line in lines[:10]:
                if line.strip():
                    print(f"   {line[:100]}...")
            
        else:
            print(f"❌ Newsletter failed: HTTP {response.status_code}")
            print(f"   Response: {response.text}")
            
    except Exception as e:
        print(f"❌ Error testing newsletter: {str(e)}")
        print("\n💡 Make sure the server is running:")
        print("   npm start")
        print("   Then run this test again")

if __name__ == "__main__":
    test_newsletter()
