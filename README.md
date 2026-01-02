# Woodmont Industrial News Feed

RSS feed aggregator for industrial and commercial real estate news across key regions (NJ, PA, TX, FL). Includes newsletter preview generation, PDF export, and theme support.

## 🚀 Quick Start (Local Testing)

```bash
# Install dependencies
npm install

# Start the server (auto-opens browser)
npm start
```

The server will:
- ✅ Start on `http://localhost:8080`
- ✅ Automatically open your browser
- ✅ Auto-refresh the feed every 30 minutes
- ✅ Manual refresh via UI button

### Environment Configuration (Optional)

Create a `.env` file in the project root:

```env
PORT=8080                    # Server port (default: 8080)
API_KEY=your-secret-key      # For manual article additions

# Email configuration for newsletter sending:
SMTP_HOST=smtp.gmail.com     # Gmail: smtp.gmail.com, Outlook: smtp-mail.outlook.com
SMTP_PORT=587                # 587 for TLS, 465 for SSL
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Gmail app password or Outlook password
EMAIL_FROM=Woodmont Daily Briefing <noreply@woodmont.com>
EMAIL_TO=team@woodmont.com, management@woodmont.com
```

### Server Management Options

**GUI (Recommended):**
```bash
# Double-click this file or run from command prompt:
launch_gui.bat
```

**Command Line:**
```bash
npm start          # Run local server with auto-open browser
npm run dev        # Same as start
npm run build      # Generate static RSS files for GitHub Pages

# Direct script execution
npx tsx rssfeed.ts --no-browser    # Start server without opening browser
npx tsx rssfeed.ts --build-static  # Generate static files only

# Legacy Command Line
server.bat         # Command-line server manager
```

## 🔄 System Resilience Improvements

- ✅ Make refresh endpoint resilient with per-source try/catch and standard result shape
- ✅ Add timeouts, retries for transient errors, circuit breaker, and last good cache
- ✅ Fix GlobeSt by sniffing content-type and parsing accordingly, log status/content-type/body
- ✅ Handle 403/404 as non-retriable, mark blocked, use fallbacks for 404
- ✅ Add drop reason counters to explain why articles are kept/filtered

## 📧 Newsletter Preview

The Newsletter section generates a **preview** of the newsletter for email distribution:
- Select timeframe (24 hours, 7 days, etc.)
- Generate HTML preview categorized by Relevant Articles, Transactions, Availabilities, People News
- Export to PDF for download
- Clear preview to switch timeframes
- Coverage period auto-updates in generated newsletter

## 🎨 Theme Support

Toggle between default (light) and dark themes using the moon/sun icon in the header.

## 📈 Future Goals

- **Email Automation**: Integrate scheduling for automated newsletter sends
- **Recipient Management**: Expand recipient list management features
- **Advanced Filtering**: Enhance relevance filtering with machine learning

## 📦 GitHub Pages Deployment

### Step 1: Repository Setup

1. **Create a GitHub repository** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/prcasley/Woodmont-Industrial-News-Briefing.git
   git push -u origin main
   ```

2. **Update RSS URLs** in `rssfeed.ts`:
   - Replace `YOUR_USERNAME` with `prcasley`
   - Replace `YOUR_REPO` with `Woodmont-Industrial-News-Briefing`
   - Lines to update: ~line 1100 (in the RSS XML generation)

### Step 2: Enable GitHub Pages

1. Go to your repository → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Select **main** branch and **/docs** folder
4. Click **Save**

```bash
# Generate static RSS files
npm run build

# Commit and push the generated files
git add docs/
git commit -m "Initial RSS build"
git push
```

The GitHub Action will automatically:
- ✅ Run every 30 minutes
- ✅ Fetch latest articles from RSS sources
- ✅ Apply deduplication, filtering, and business day limits
- ✅ Generate updated `docs/rss.xml`, `docs/feed.json`, and `docs/index.html`
- ✅ Commit changes back to the main branch
- ✅ GitHub Pages serves the updated files automatically

## 🔗 Your Public RSS URL

After deployment, your feed will be available at:

```
https://prcasley.github.io/Woodmont-Industrial-News-Briefing/rss.xml
```

### Feed Characteristics:
- ✅ Contains **article-specific URLs only** (no homepages)
- ✅ **Deduplicated** - no repeated articles
- ✅ **Filtered** - NJ primary focus, approved domains only
- ✅ **Time-limited** - last 5 business days only
- ✅ **Valid RSS 2.0** with required elements (title, link, guid, pubDate, source, category)

## 🤖 Adding to Microsoft Copilot Studio / Power Automate

1. Open **Microsoft Copilot Studio** or **Power Automate**
2. Add **RSS feed** as a data source
3. Enter your feed URL: `https://prcasley.github.io/Woodmont-Industrial-News-Briefing/rss.xml`
4. Configure refresh interval (matches the 30-minute update cycle)

## 📝 Configuration

### Add/Remove RSS Sources

Edit `rssfeed.ts` and modify the `rssFeeds` array (around line 62):

```typescript
const rssFeeds: FeedConfig[] = [
    {
        name: "NJBIZ",
        url: "https://njbiz.com/feed/",
        enabled: true
    },
    // ... more feeds
];
```

### Adjust Update Frequency

Edit `.github/workflows/update-rss.yml`:

```yaml
schedule:
  - cron: '*/30 * * * *'  # Every 30 minutes (change as needed)
```

Common cron patterns:
- `*/15 * * * *` - Every 15 minutes
- `0 * * * *` - Every hour
- `0 */2 * * *` - Every 2 hours

## 📊 API Endpoints (Local Only)

When running locally:

- `GET /` - Web UI
- `GET /api/articles` - JSON feed of all articles
- `GET /api/newsletter?days=X` - Generate newsletter HTML for X days
- `POST /api/send-newsletter` - Send newsletter via email (requires SMTP config)
- `POST /api/refresh` - Manual RSS feed refresh
- `GET /api/brief` - Articles grouped by region
- `POST /api/manual` - Add manual articles (requires API_KEY)

## 🎨 GUI Server Manager

For the best experience, use the **dark-themed GUI**:

```bash
launch_gui.bat  # Double-click to start
```

**Requirements:** Python 3.x with tkinter (included in python.org installer)
**Features:** Matte black theme, real-time status, live logs, one-click server control

If Python installation fails, use the command-line alternative:
```bash
server.bat  # Green text interface
```

## 📚 Additional Resources

- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Comprehensive troubleshooting guide

## 📁 Project Structure

```
.
├── rssfeed.ts              # Main server + RSS aggregator + newsletter generation + email sending
├── server_manager.py       # Beautiful dark-themed GUI server manager
├── launch_gui.bat          # Launcher for the GUI application
├── requirements.txt        # Python dependencies for GUI
├── frontend/
│   └── index.html          # React UI with newsletter preview, themes, filters, email sending
├── docs/                   # Generated static files (GitHub Pages)
│   ├── rss.xml            # RSS 2.0 feed
│   ├── feed.json          # JSON feed
│   └── index.html         # Deployed web UI
├── start_server.bat       # Legacy batch file to start server
├── stop_server.bat        # Legacy batch file to stop server
├── server.bat             # Legacy command-line server manager
├── .github/
│   └── workflows/
│       └── update-rss.yml # Auto-update workflow
└── package.json
```

## 🐛 Troubleshooting

### Browser doesn't auto-open
- Check if port 8080 is available
- Manually visit `http://localhost:8080`

### GitHub Action fails
- Ensure `npm ci` can install dependencies
- Check Actions tab for error logs
- Verify GitHub Pages is enabled

### RSS feed shows old data
- Trigger manual workflow run in Actions tab
- Wait for next scheduled run (30 min)
- Check if sources are accessible

### Newsletter shows 'test' or doesn't generate
- Hard refresh browser (Ctrl+F5) to clear cache
- Check server logs in terminal for errors

## 🔄 Reverting to Stable Versions

To revert to the corporate-ready version with all resilience improvements:

```bash
git checkout corporate-ready-v1
```

This tag includes:
- Resilient refresh endpoint with per-source error handling
- Timeouts, retries, circuit breaker, last good cache
- Content sniffing for GlobeSt and other feeds
- 403/404 handling and drop reason tracking

Create the tag with: `git tag -a corporate-ready-v1 -m "Stable point for corporate deployment"`
