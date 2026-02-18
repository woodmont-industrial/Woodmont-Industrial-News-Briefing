# Woodmont Industrial News Briefing - System Overview

> **Last Updated**: February 2026
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

## GitHub Actions Schedule

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `update-articles.yml` | 6 AM EST (Mon-Fri) | Fetch RSS feeds, update docs/ |
| `send-newsletter-work.yml` | 7 AM EST (Mon-Fri) | Send email newsletter |

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

**Last major change:** Feb 2026 - Power Automate webhook integration (`77a947f`)
