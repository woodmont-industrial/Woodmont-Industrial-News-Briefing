# Woodmont Industrial News Feed - GitHub Pages Version

## 🏗️ Architecture
This project is designed to run on GitHub Pages with automated article updates via GitHub Actions and email delivery through Microsoft Copilot Agent.

### Components
- **Frontend**: React app hosted on GitHub Pages
- **Backend**: GitHub Actions for RSS scraping
- **Email**: Microsoft Copilot Agent with Graph API
- **Data**: Articles stored in `articles.json`

## 🚀 Quick Start

### For Users
1. Visit the GitHub Pages site
2. Browse articles by category, region, or date
3. Download newsletter as PDF
4. Subscribe to email updates (contact admin)

### For Developers
```bash
# Clone repository
git clone https://github.com/[username]/[repo].git
cd [repo]

# Install dependencies
npm install

# Run locally (with server)
npm start

# Build for GitHub Pages
npm run build
```

## 📅 Automation Schedule

### GitHub Actions
- **Runs**: Monday-Friday at 8:00 AM EST
- **Updates**: RSS feeds and articles.json
- **Deploys**: Updates GitHub Pages automatically

### Email Schedule
- **Daily Newsletter**: 9:00 AM EST (Mon-Fri)
- **Weekly Review**: Fridays at 4:00 PM EST
- **Sent via**: Microsoft Copilot Agent

## 📊 Features

### Article Management
- Automatic RSS feed aggregation
- Category-based filtering (Transactions, Availabilities, People News, Market Intelligence)
- Regional filtering (NJ, NY, PA, FL, TX, etc.)
- Admin approval workflow for filtered articles
- Blacklist functionality

### Newsletter Generation
- HTML newsletter generation
- PDF download capability
- Email delivery via Copilot Agent
- Customizable timeframes

### Admin Features
- Manual article addition
- Review and approve filtered articles
- Blacklist unwanted articles
- Manage newsletter recipients

## 🔧 Configuration

### RSS Feeds
Add new feeds in `rssfeed.ts`:
```typescript
const RSS_FEEDS = [
  {
    url: "https://example.com/rss.xml",
    name: "Source Name",
    region: "NJ",
    source: "Example",
    timeout: 10000
  }
];
```

### Email Recipients
Update in Admin panel or via Copilot Agent configuration.

## 📝 Deployment Notes

### GitHub Pages
- Source: `main` branch, `/docs` folder
- Custom domain: Configure in repository settings if needed

### GitHub Actions
- Workflow: `.github/workflows/update-articles.yml`
- Triggers: Schedule (Mon-Fri 8 AM EST) or manual
- Secrets: None required (uses public RSS feeds)

### Copilot Agent
- Config: `copilot-agent.yml`
- Auth: Microsoft Graph API OAuth
- Schedule: Defined in agent configuration

## 🛠️ Local Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Running Locally
```bash
# Start server with live RSS updates
npm start

# Build static version
npm run build

# Generate newsletter
npm run build
# Then visit http://localhost:8080 and use Newsletter tab
```

## 📈 Monitoring

### GitHub Actions
- Check Actions tab in GitHub repository
- Look for "Update Articles and Deploy" workflow
- View logs for any failures

### Email Delivery
- Copilot Agent dashboard
- Microsoft 365 admin center (if configured)
- Check spam/junk folders initially

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Make changes
4. Test locally
5. Submit pull request

## 📞 Support

For issues or questions:
- Create GitHub issue
- Contact: operationssupport@woodmontproperties.com

## 📄 License

Copyright © 2024 Woodmont Industrial Partners. All rights reserved.
