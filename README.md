# Woodmont Industrial News Feed

Enterprise RSS feed aggregator for industrial and commercial real estate news across key regions (NJ, PA, TX, FL). Automated newsletter generation with Copilot Studio integration.

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

**Enterprise RSS feed aggregator** for industrial and commercial real estate news across key regions (NJ, PA, TX, FL). Automated newsletter generation with Copilot Studio integration.

### Core Capabilities:
- **Aggregates** 24 industrial/CRE news sources (NJBIZ, Philadelphia Business Journal, Houston Business Journal, etc.)
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
- **Regional**: NJBIZ, Philadelphia Business Journal, Houston Business Journal, South Florida Business Journal
- **Industrial**: Commercial Property Executive, NAIOP, Industrial Property News
- **National**: Real Estate Weekly, GlobeSt (temporarily disabled), Commercial Search

### Filtering Logic
- **Geographic**: NJ primary focus, PA/TX/FL secondary
- **Content**: Industrial/CRE news, transactions, availabilities, people moves
- **Quality**: Approved domains only, deduplicated, business days
- **Time**: Last 5 business days for RSS, customizable for newsletters

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
