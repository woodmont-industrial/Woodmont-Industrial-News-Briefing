# Woodmont Industrial News Feed

Enterprise RSS feed aggregator for industrial and commercial real estate news across key regions (NJ, PA, FL). Automated newsletter generation with Copilot Studio integration.

## 🔐 Security Notice

**This repository is public** but contains an **internal Woodmont Industrial Partners tool**. The code is designed for internal use only and should not be used to scrape or redistribute content from paywalled sources without proper licensing. The system only stores **title, URL, date, and source** information - no full article text is scraped or stored.

---

## 📋 What It Does

```
Industrial News Sources → RSS Ingestion → AI Filtering → Storage → RSS 2.0 Output → Copilot Studio → Automated Email
     ↓                        ↓             ↓           ↓           ↓                ↓              ↓
   24 Feeds                Circuit        Content     Dedup       96 Articles     Summarize     Daily Briefings
   (86% Success)          Breaker        Classification              ↓            Newsletter     via O365
                                                                 Categories       Generation
```

**Enterprise RSS feed aggregator** for industrial and commercial real estate news across key regions (NJ, PA, FL). Automated newsletter generation with Copilot Studio integration.

### Core Capabilities:
- **Aggregates** 24 industrial/CRE news sources (NJBIZ, Philadelphia Business Journal, South Florida Business Journal, etc.)
- **Filters** for relevant content (NJ primary focus, approved domains, business days only)
- **Generates** RSS 2.0 feed with 96 fresh articles daily
- **Integrates** with Microsoft Copilot Studio for automated newsletter generation
- **Delivers** via Power Automate and O365 Send Email (V2)

## 📤 What It Outputs

- **RSS Feed**: `https://woodmont-industrial.github.io/Woodmont-Industrial-News-Briefing/rss.xml`
  - RSS 2.0 compliant with metadata, categories, and enclosures
  - 30-minute automated updates via GitHub Actions
  - Deduplicated, filtered, time-limited (last 5 business days)

- **Newsletter HTML**: Categorized preview for email distribution
  - Relevant Articles, Transactions, Availabilities, People News sections
  - PDF export capability
  - Timeframe selection (24 hours to 90 days)

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start local server (auto-opens browser)
npm start
```

**Server starts at**: `http://localhost:8080`

### Environment Configuration (Optional)

Create `.env` file:
```env
PORT=8080                    # Server port
API_KEY=your-secret-key      # For manual article additions
```

**Note**: Email delivery is handled via Power Automate / O365 Send Email (V2). SMTP is optional for personal testing only. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for email configuration details.

## 📦 Deployment

### GitHub Pages + GitHub Actions

**Step 1**: Enable GitHub Pages
- Repository → Settings → Pages → Deploy from branch → main/docs

**Step 2**: GitHub Actions (already configured)
- `.github/workflows/update-rss.yml` runs every 30 minutes
- Fetches articles, applies filtering, generates RSS/HTML files
- Commits changes to main branch automatically

**Step 3**: Your Public RSS URL
```
https://woodmont-industrial.github.io/Woodmont-Industrial-News-Briefing/rss.xml
```

### How It's Used at Woodmont

1. **GitHub Action runs every 30 minutes** → updates `/docs/rss.xml`
2. **GitHub Pages hosts RSS feed** at your public URL
3. **Power Automate reads RSS** → Copilot summarizes → O365 email delivery

## 🤖 Power Automate Email Integration

**As of February 2026**, newsletters are sent via Power Automate webhook instead of SMTP.

### How It Works

```
GitHub Actions → HTTP POST → Power Automate → O365 Email → Recipients
                 (webhook)    (flow)          (Send V2)   (@woodmontproperties.com)
```

### Setup Steps

1. **Create Power Automate Flow**
   - Trigger: "When an HTTP request is received"
   - Action: "Send an email (V2)" from Office 365 Outlook

2. **Add GitHub Secret**
   - Go to repository Settings → Secrets → Actions
   - Add `WEBHOOK_URL` with your flow's HTTP POST URL

3. **Test**
   - Manually trigger "Send Newsletter (Work)" workflow
   - Check inbox for email from @woodmontproperties.com

**Full documentation**: [POWER_AUTOMATE_INTEGRATION.md](docs/POWER_AUTOMATE_INTEGRATION.md)

### Fallback to SMTP

If `WEBHOOK_URL` is not configured, the system falls back to SMTP (Gmail).
This is useful for local testing but not recommended for production.

## 📰 Sources + Filtering

### Active Sources (24/24 working)
- **Regional**: NJBIZ, Philadelphia Business Journal, South Florida Business Journal, ROI-NJ
- **Industrial**: Commercial Property Executive, NAIOP, Industrial Property News
- **National**: Real Estate Weekly, GlobeSt (temporarily disabled), Commercial Search

### Filtering Logic
- **Geographic**: NJ, PA, FL focus (target markets)
- **Content**: Industrial/CRE news, transactions, availabilities, people moves
- **Quality**: Approved domains only, deduplicated, business days
- **Time**: Last 5 business days for RSS, customizable for newsletters

## 📋 Recent Changes (April 2026)

### Workflow Architecture
- **Separated build and send** — `newsletter-pipeline.yml` builds feed only (no email), `send-only.yml` handles sending. Prevents double-sends and allows safe build testing.
- **Disabled weekday crons in `build-articles.yml`** — was conflicting with pipeline on same schedule, causing git push failures. Weekend crons (Sat RSS, Sun scrapers) still active.
- **Fixed pipeline push failures** — added git stash before rebase to handle unstaged build artifacts.

### Region Filtering
- **Build-time region gate** — `MAJOR_EXCLUDE_REGIONS` and `INTERNATIONAL_EXCLUDE` now applied during feed build, not just at newsletter send time. Out-of-market articles (Atlanta, Houston, UK, Australia, etc.) are blocked before entering `feed.json`.
- **Removed TX from all UI and docs** — region selector, newsletter templates, README, frontend config all updated to NJ/PA/FL only.
- **Expanded exclusion lists** — added 30+ terms to `INTERNATIONAL_EXCLUDE` and `MAJOR_EXCLUDE_REGIONS` based on observed leaks (Nottingham UK, Traralgon Australia, Ascension Parish LA, Grand Prairie TX, Orange County CA, Poland, Malaysia, Kyrgyzstan, etc.).
- **Permanent exclusion list** — `docs/excluded-articles.json` now has 30+ normalized titles so manually removed articles don't reappear after rebuild.

### Newsletter Quality
- **Fixed description truncation** — sentence splitter was treating `$1.6B` as sentence boundary at the decimal. Now protects digit.digit patterns.
- **Fixed title replacement bug** — descriptions were replacing article titles in the email. Now always shows real title, appends description only if it adds new info.
- **Fixed Week-in-Review scoring** — dollar regex missed `$1.6B` format, weekly file didn't store URLs or dates (source bonus and recency bonus were always 0). Now stores richer data for accurate scoring.

### Known Issues / Next Steps
- **Feed tiering needed** — 27 feeds fetch articles but keep 0 after filtering. Some are regional (GlobeSt NJ, NJ Spotlight) that may be over-filtered; others are pure noise (WSJ RE, CBRE Press, Reuters CRE). Need investigation before disabling.
- **PA resilience** — PA coverage is more Google News dependent than NJ. Direct PA sources (Bisnow Philly, PBJ) should be verified as healthy.
- **Region-health reporting** — no per-region article counts in build reports. Would help diagnose when NJ/PA/FL coverage drops.
- **endpoints.ts still has NY** — `targetRegions` array includes NY at lines 286/604. Deferred for now.
- **Weekly newsletter** — `send-newsletter-work-weekly.yml` is disabled. Re-enable when ready for Friday recaps.

## 🏥 Feed Health

The system handles various feed issues automatically:

| Issue | System Response | User Action |
|-------|----------------|-------------|
| **Feed returns HTML** | Content sniffing + parsing | Check TROUBLESHOOTING.md |
| **Feed returns 404** | Temporarily disabled, logged | Monitor feed validation |
| **Feed returns 403** | Blocked, marked as access restricted | Contact source if needed |
| **Malformed URLs** | URL correction attempts | Manual fix in source config |
| **Connection timeout** | Retry with exponential backoff | Check network connectivity |

**Current Status**: 24/24 feeds operational (86% success rate)
**Temporarily Disabled**: GlobeSt (404), South FL Biz Journal (403), North Jersey Morris (404), CPE (XML error)

## 🛠️ Server Management

**GUI (Recommended):**
```bash
launch_gui.bat  # Dark-themed Python GUI
```

**Command Line:**
```bash
npm start          # Local server with browser
npm run build-static  # Generate RSS files for GitHub Pages
```

## 📚 Documentation

All supplemental documentation is organized in the [`docs/`](docs/) folder:

- **[POWER_AUTOMATE_INTEGRATION.md](docs/POWER_AUTOMATE_INTEGRATION.md)** - Email webhook setup (start here for email config)
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Complete deployment guide and secrets configuration
- **[NEXTSTEPS.md](docs/NEXTSTEPS.md)** - System overview and quick reference
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design, modules, and technical details
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Feed issues, error handling, and solutions
- **[ROADMAP.md](docs/ROADMAP.md)** - Future development plans and feature roadmap

## 📁 Project Structure

```
.
├── src/                    # Modular source code
│   ├── feeds/             # RSS configuration and fetching
│   ├── filter/            # Article classification and filtering
│   ├── store/             # Data persistence and caching
│   └── server/            # HTTP endpoints and API responses
├── docs/                  # Generated static files (GitHub Pages)
│   ├── rss.xml           # RSS 2.0 feed
│   ├── feed.json         # JSON feed
│   └── index.html        # Deployed web UI
├── .github/
│   └── workflows/
│       └── update-rss.yml # Auto-update workflow
├── server_manager.py      # GUI server manager
└── package.json
```

## 🐛 Quick Troubleshooting

**Browser doesn't auto-open**: Check port 8080 availability, visit `http://localhost:8080`

**RSS feed shows old data**: Trigger manual workflow in Actions tab or wait 30 minutes

**GitHub Action fails**: Check Actions tab for errors, ensure `npm ci` works

**Newsletter doesn't generate**: Hard refresh browser (Ctrl+F5), check server logs

For comprehensive troubleshooting, see [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## 📝 Version History

### **Version 1.12.26** - Enterprise Architecture Overhaul (January 2, 2026)
- 🎯 **MAJOR**: Complete architectural transformation from monolithic to modular design
- ✅ **RSS Infrastructure**: 24/24 working feeds with circuit breaker protection
- 🎨 **UI Enhancement**: Tile view with article previews and author attribution
- 🤖 **Copilot Studio**: Full RSS 2.0 compatibility for automated integration
- 🔒 **Security**: Enhanced .gitignore and public repo compliance
- ⚡ **Performance**: 96 fresh articles with 30-minute automated updates
- 🏗️ **CI/CD**: GitHub Actions workflow for production deployment

### **Version 1.0.0** - Initial Release
- Basic RSS feed aggregation functionality
- Local server with manual refresh
- Newsletter preview generation
- Theme support and basic UI

---

**Enterprise-grade production system** • **Copilot Studio compatible** • **Automated delivery**
