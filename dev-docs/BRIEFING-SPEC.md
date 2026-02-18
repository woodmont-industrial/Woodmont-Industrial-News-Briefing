# Woodmont Industrial Partners Daily Industrial News Briefing

## Specification Document

**Last Updated:** January 27, 2026

---

## Goal

Produce a concise, scannable daily briefing with **EXACTLY FOUR sections**:

1. **Relevant Articles** — macro trends (rates, inflation, freight, construction inputs, labor) and major industrial real estate news
2. **Transactions** — notable industrial land/building sales or leases
3. **Availabilities** — new/notable industrial land or building availabilities for sale or lease
4. **People News** — personnel moves/promotions within industrial brokerage, development, and investment

---

## Geographic Focus (STRICT)

### Primary Markets (ONLY)

| State | Key Markets |
|-------|-------------|
| **New Jersey** | Newark, Jersey City, Edison, Exit 8A corridor, Meadowlands, Bergen County, Middlesex County, Hudson County, Somerset County, Union County, Monmouth County |
| **Pennsylvania** | Philadelphia, Lehigh Valley, I-78/I-81 corridor, Bucks County, Montgomery County, Chester County, Delaware County |
| **Florida** | Miami-Dade, Broward, Palm Beach, Fort Lauderdale, Tampa, Orlando, Jacksonville |

### EXCLUDED States/Regions

The following are **automatically filtered out**:

- Texas (Dallas, Houston, Austin)
- California (Los Angeles, Bay Area)
- Arizona (Phoenix, Mesa)
- Georgia (Atlanta)
- Tennessee (Nashville, Memphis)
- Indiana (Indianapolis)
- Ohio (Columbus, Cincinnati)
- Illinois (Chicago)
- North Carolina (Charlotte, Raleigh)
- South Carolina
- Virginia (except Delaware Valley overlap)
- Maryland (except Delaware Valley overlap)
- Colorado, Nevada, Washington, Oregon
- All international news (China, India, UK, Europe, etc.)

**Rule:** If an article mentions any excluded state/city and does NOT mention NJ, PA, or FL, it is automatically excluded.

---

## Content Filters

### INCLUDE (All Real Estate Types in NJ/PA/FL)

| Category | Examples |
|----------|----------|
| Industrial | Warehouses, distribution centers, logistics, manufacturing |
| Office | Office buildings, coworking spaces |
| Retail | Shopping centers, retail stores |
| Multifamily | Apartments, residential developments |
| Mixed-Use | Combined property types |
| Land | Development sites, land sales |
| Market Trends | Vacancy rates, rent growth, absorption, cap rates |

### EXCLUDE (Automatically Filtered)

| Category | Examples |
|----------|----------|
| **Political News** | Trump, Biden, elections, executive orders, tariffs, Congress |
| **Wrong States** | Any state other than NJ, PA, or FL |

---

## AI Classification System

All articles are processed through a **Groq AI classifier** that:

1. Analyzes title and description
2. Assigns a category: `relevant`, `transactions`, `availabilities`, `people`, or `exclude`
3. Scores relevance (0-100) based on NJ/PA/FL industrial focus
4. Extracts keywords for tracking

### AI Prompt Rules

The AI classifier follows these rules:

- Focus ONLY on NJ, PA, FL
- Property must be **physically located** in NJ/PA/FL (not just company HQ)
- Exclude any article primarily about other states
- Exclude political content (Trump, Biden, elections, etc.)
- All real estate types are included (industrial, office, retail, multifamily, etc.)

---

## Multi-Layer Filtering Pipeline

### Layer 1: URL/Source Filtering
- Remove duplicate URLs
- Remove tracking parameters
- Remove cached/preview links

### Layer 2: Rule-Based Content Filtering
- Check for excluded keywords (political content)
- Check for excluded states/cities
- Verify NJ/PA/FL presence

### Layer 3: AI Classification
- Groq AI analyzes and categorizes each article
- Assigns relevance score
- Articles below 35% relevance are excluded

### Layer 4: Post-AI Regional Validation
- Double-check that article mentions NJ, PA, or FL
- Remove any wrong-state articles that slipped through

### Layer 5: Political Content Cleanup
- Final check for political keywords
- Remove any political content that slipped through

---

## Feed Sources (113 Active Feeds)

### Regional Sources (Priority)

| Source | Region | Focus |
|--------|--------|-------|
| Real Estate NJ (RE-NJ) | NJ | Primary NJ industrial news |
| ROI-NJ | NJ | NJ real estate & business |
| NJBIZ | NJ | NJ business news |
| Philadelphia Business Journal | PA | Philly commercial real estate |
| South Florida Business Journal | FL | S. Florida commercial real estate |
| Tampa Bay Business Journal | FL | Tampa commercial real estate |
| Jacksonville Business Journal | FL | Jacksonville commercial real estate |
| The Real Deal (Miami) | FL | Florida transactions |

### National Sources (Filtered for NJ/PA/FL)

| Source | Focus |
|--------|-------|
| FreightWaves | Logistics/freight trends |
| Supply Chain Brain | Supply chain news |
| Commercial Observer | CRE transactions |
| Bisnow | CRE news (multiple regions) |
| GlobeSt | National CRE |
| CoStar | CRE data/news |

### Google News Feeds (Hyper-Targeted)

We use 40+ Google News RSS searches targeting:

- Specific NJ counties (Bergen, Middlesex, Hudson, etc.)
- Specific PA counties (Bucks, Montgomery, Chester, etc.)
- Specific FL counties (Miami-Dade, Broward, Palm Beach, etc.)
- Port of NY/NJ, PortMiami, Port Everglades
- Exit 8A corridor, Lehigh Valley, I-95 corridor
- Industrial developers (Prologis, Duke, CBRE, JLL, etc.)

---

## Deal Thresholds

Highlight deals meeting these criteria:

| Type | Threshold |
|------|-----------|
| Square Footage | ≥100,000 SF |
| Sale Price | ≥$25 million |
| Land Area | ≥10 acres |

---

## Exclusion Keywords (Automatic Reject)

### Political Content
```
TRUMP, BIDEN, PRESIDENT, WHITE HOUSE, EXECUTIVE ORDER,
TARIFF WAR, TRADE WAR, CONGRESS, SENATE, ELECTION,
REPUBLICAN, DEMOCRAT, POLITICAL
```

### Wrong States
```
TEXAS, CALIFORNIA, OHIO, INDIANA, ILLINOIS, GEORGIA, ARIZONA,
TENNESSEE, LOUISIANA, COLORADO, WASHINGTON, OREGON, NEVADA,
CAROLINA, VIRGINIA, MARYLAND, MICHIGAN, WISCONSIN, MINNESOTA,
DALLAS, HOUSTON, AUSTIN, LOS ANGELES, CHICAGO, ATLANTA, PHOENIX,
SEATTLE, DENVER, LAS VEGAS, NASHVILLE, CHARLOTTE, INDIANAPOLIS
```

---

## Output Format

### Email Newsletter

```
WOODMONT INDUSTRIAL PARTNERS
Daily Real Estate News Briefing
[Date]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RELEVANT ARTICLES
Macro trends affecting real estate in NJ/PA/FL

• [Article title] - [Brief summary with location, key details]
  Source: [Publication] [Track]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TRANSACTIONS
Property sales and leases in NJ/PA/FL

• [Property/Deal] - [Location, SF, Price/Terms]
  Source: [Publication] [Track]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AVAILABILITIES
Properties for sale or lease

• [Property] - [Location, SF, Asking Price/Rent]
  Source: [Publication] [Track]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PEOPLE NEWS
Personnel moves in CRE

• [Person] - [New role at Company]
  Source: [Publication] [Track]
```

---

## Action Tags

| Tag | Purpose |
|-----|---------|
| `[Track]` | Follow this topic/company/location for future articles |
| `[Ignore]` | Hide similar articles in the future |

---

## Schedule

| Event | Time | Days |
|-------|------|------|
| Article Update | Every 4 hours | Daily |
| Newsletter Send | 8:00 AM EST | Mon-Fri |
| Feed Health Check | Every 4 hours | Daily |

---

## Quality Metrics

### Current Feed Stats

- **Total Active Feeds:** 113
- **Articles Fetched per Run:** ~5,000+
- **Articles After Filtering:** ~50-150
- **Target Daily Relevant:** 3+ articles

### Why Some Days Have Fewer Articles

1. NJ/PA/FL industrial is a niche market
2. Not every day has major news/deals
3. Strict filtering removes all non-relevant content
4. Quality over quantity approach

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2025 | Initial specification |
| 1.1 | Jan 2025 | Added Track/Share/Ignore action tags |
| 2.0 | Jan 2026 | Added AI classification (Groq) |
| 2.1 | Jan 2026 | Added strict regional filtering (NJ/PA/FL only) |
| 2.2 | Jan 2026 | Added 113 feeds including county-specific searches |
| 2.3 | Jan 2026 | Added residential/irrelevant content cleanup |
| 2.4 | Jan 2026 | Complete documentation of filtering rules |

---

## Technical Implementation

- **AI Provider:** Groq (free tier, llama-3.1-8b-instant model)
- **Hosting:** GitHub Pages
- **Automation:** GitHub Actions
- **Feed Format:** RSS 2.0 + JSON Feed 1.1
- **Frontend:** React-based dashboard with Track/Ignore functionality
