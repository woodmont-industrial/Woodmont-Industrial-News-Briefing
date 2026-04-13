# Woodmont Industrial News Briefing - System Overview

> **Last Updated**: April 2026
> **Status**: Production - Using Power Automate Webhook

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETE SYSTEM FLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
  │  RSS Feeds  │────►│   GitHub    │────►│   GitHub    │────►│   Power     │
  │  (96+ src)  │     │   Actions   │     │   Pages     │     │  Automate   │
  │             │     │             │     │             │     │             │
  │ Bisnow      │     │ 6 AM: Fetch │     │ rss.xml     │     │ Webhook     │
  │ GlobeSt     │     │ 7 AM: Email │     │ feed.json   │     │ receives    │
  │ RE-NJ       │     │ (Mon-Fri)   │     │ index.html  │     │ newsletter  │
  │ ...         │     │             │     │             │     │ HTML        │
  └─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                      │
                                                                      ▼
                                                               ┌─────────────┐
                                                               │   O365      │
                                                               │   Email     │
                                                               │             │
                                                               │ Sends from  │
                                                               │ @woodmont   │
                                                               │ properties  │
                                                               │ .com        │
                                                               └─────────────┘
```

---

## Email System (Updated Feb 2026)

### Primary Method: Power Automate Webhook

**How it works:**
1. GitHub Action runs `rssfeed.ts --send-newsletter-work`
2. Code builds HTML newsletter from `docs/feed.json`
3. Code POSTs to Power Automate webhook URL
4. Power Automate sends email via O365

**Benefits:**
- Emails come from @woodmontproperties.com
- No SMTP credentials in GitHub
- Works through corporate firewalls

**Key commit:** `77a947f` - "Where it All Changed"

### Fallback Method: SMTP (Gmail)

If webhook is not configured or fails, the system falls back to SMTP.

**See:** [POWER_AUTOMATE_INTEGRATION.md](./POWER_AUTOMATE_INTEGRATION.md) for full details.

---

## GitHub Secrets Required

### For Power Automate (Recommended)
| Secret | Description |
|--------|-------------|
| `WEBHOOK_URL` | Power Automate HTTP trigger URL |
| `WEBHOOK_SECRET` | Optional API key for security |
| `EMAIL_TO` | Recipients (comma-separated) |
| `GROQ_API_KEY` | For AI article classification |

### For SMTP Fallback (Optional)
| Secret | Description |
|--------|-------------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail app password |
| `EMAIL_FROM` | Sender display name |

---

## GitHub Actions Schedule (Updated April 2026)

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `newsletter-pipeline.yml` | 7:00-7:40 AM EST (Mon-Fri) | Build feed (scrapers + RSS) |
| `send-only.yml` | 8:00-8:45 AM EST (Mon-Fri) | Send newsletter from feed.json |
| `build-articles.yml` | Weekends only | Sat RSS + Sun scrapers |
| `newsletter-watchdog.yml` | 8:30-9:30 AM EST (Mon-Fri) | Alert if newsletter didn't send |
| `update-scoring.yml` | Fri 1 PM EST | Groq learning loop |

**Deprecated/Disabled:** `send-newsletter-work.yml`, `update-articles.yml`, `update-rss.yml`, `newsletter-pipeline.yml` (send step removed — build only)

---

## Next Steps — April 13, 2026

### Priority 1: Fix Philadelphia Business Journal CRE Feed
**Why:** PA's best direct source is failing (0 fetched). PA is 73% Google News dependent — if GN has a bad day, PA coverage drops significantly.
**Task:** Investigate why PBJ CRE returns 0. Likely a URL change, paywall, or Cloudflare block. Fix the URL or add a Google News fallback for PBJ specifically.
**Files:** `src/feeds/feeds.json`, `src/feeds/fetcher.ts`

### Priority 2: LoopNet International Pattern Match
**Why:** UK and Australian LoopNet listings keep leaking in (PE29, PE7, Traralgon, Truganina). We're adding them one by one but new postcodes keep appearing.
**Task:** Add a regex-based filter for non-US LoopNet listings — detect UK postcodes (letter+digit patterns like PE29 7EJ), Australian 4-digit postcodes (3029, 3844), and addresses without US state abbreviations.
**Files:** `src/shared/region-data.ts`, `src/build/static.ts`

### Priority 3: Stricter Default for No-Region Articles
**Why:** Articles like "Pooler GA warehouse", "Benton County industrial", "Florence SC distribution" get through because they mention "warehouse"/"industrial" but no excluded region keyword. The build-time gate only blocks articles that explicitly mention an excluded region — no-region articles pass by default.
**Task:** For articles from Google News (not trusted direct sources), require at least one NJ/PA/FL keyword OR be a recognized national/macro topic. No region = no entry unless from Tier A source.
**Files:** `src/build/static.ts`

### Priority 4: Validate Week-in-Review Scoring
**Why:** We fixed the data storage (descriptions, URLs, dates) but haven't verified a real Friday send uses the correct top 5 by score.
**Task:** On next Friday, check the Week-in-Review section against the scoreArticle rankings. Confirm the top 5 by score are the ones that appear.
**Files:** `src/server/email.ts` (scoreArticle function)

### Priority 5: Feed Health Dashboard Visibility
**Why:** regionSummary and keptRate are now in feed-health.json but not visible in the frontend.
**Task:** Add a simple feed health section to docs/index.html showing NJ/PA/FL article counts and flagging low-value feeds.
**Files:** `docs/index.html`

---

**Last major change:** April 2026 - Build-time region gate, feed tiering (P1-P5), workflow separation, TX removal

---

## Key Files Reference

### Email System
| File | Purpose |
|------|---------|
| `src/server/email.ts` | Email sending (webhook + SMTP) |
| `src/server/newsletter-work.ts` | HTML template for "Work" format |
| `.github/workflows/send-newsletter-work.yml` | Email workflow |

### Feed System
| File | Purpose |
|------|---------|
| `src/feeds/config.ts` | RSS feed sources (96+) |
| `src/feeds/fetcher.ts` | HTTP fetching with circuit breaker |
| `src/filter/classifier.ts` | Article categorization |

### Output
| File | Purpose |
|------|---------|
| `docs/rss.xml` | RSS 2.0 feed output |
| `docs/feed.json` | JSON feed (used by newsletter) |
| `docs/index.html` | Web UI |

---

## For Future Claude Agents

### Understanding This Project

1. **Purpose**: Aggregate industrial CRE news and send daily email briefings

2. **Email Flow**:
   - Check `WEBHOOK_URL` → Use Power Automate webhook
   - Fallback to SMTP if webhook not configured
   - See `src/server/email.ts` for implementation

3. **Key Documentation**:
   - [POWER_AUTOMATE_INTEGRATION.md](./POWER_AUTOMATE_INTEGRATION.md) - Email webhook system
   - [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
   - [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues

### Common Tasks

**Test email sending locally:**
```bash
# Set environment variables first
export WEBHOOK_URL="your-webhook-url"
export EMAIL_TO="test@example.com"

# Run newsletter
npx tsx rssfeed.ts --send-newsletter-work
```

**Update RSS feeds:**
```bash
npm run build-static
```

**Revert email changes:**
```bash
git revert 77a947f  # Reverts "Where it All Changed" commit
```

---

## Troubleshooting Quick Reference

| Issue | Solution |
|-------|----------|
| Email not sending | Check GitHub Actions logs, verify WEBHOOK_URL secret |
| Wrong sender address | Ensure Power Automate flow is configured correctly |
| Falling back to SMTP | Check webhook URL is correct and flow is active |
| No articles in newsletter | Run `update-articles.yml` first, check feed health |

---

## Contact & Support

- **GitHub Issues**: For bugs and feature requests
- **Power Automate**: Check flow run history for email issues
- **Operations**: operationssupport@woodmontproperties.com

---

**Last major change:** April 2026 - Newsletter system overhaul (region gate, feed tiering, workflow separation)
