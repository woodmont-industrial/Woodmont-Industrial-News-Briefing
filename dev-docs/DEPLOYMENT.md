# Deployment Guide

> **Last Updated**: February 2026
> **Email Method**: Power Automate Webhook (Primary) / SMTP (Fallback)

---

## Quick Start Checklist

### 1. GitHub Repository Setup
- [x] Code pushed to GitHub
- [x] GitHub Pages enabled (Settings → Pages → main/docs)
- [x] GitHub Actions workflows configured

### 2. GitHub Secrets Configuration
Go to: `https://github.com/woodmont-industrial/Woodmont-Industrial-News-Briefing/settings/secrets/actions`

**Required Secrets:**
| Secret | Required | Description |
|--------|----------|-------------|
| `WEBHOOK_URL` | Yes* | Power Automate HTTP trigger URL |
| `WEBHOOK_SECRET` | No | Optional API key for webhook security |
| `EMAIL_TO` | Yes | Recipients (comma-separated) |
| `GROQ_API_KEY` | No | For AI article classification |

**SMTP Fallback (Optional):**
| Secret | Description |
|--------|-------------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Gmail address |
| `SMTP_PASS` | Gmail app password |
| `EMAIL_FROM` | Sender display name |

*Either `WEBHOOK_URL` or SMTP secrets must be configured.

### 3. Power Automate Setup
See: [POWER_AUTOMATE_INTEGRATION.md](./POWER_AUTOMATE_INTEGRATION.md)

**Quick steps:**
1. Create flow with "When an HTTP request is received" trigger
2. Add "Send an email (V2)" action
3. Copy the webhook URL to GitHub Secrets

### 4. Test the System
1. Go to GitHub Actions tab
2. Run "Update Articles" workflow manually
3. Run "Send Newsletter (Work)" workflow manually
4. Check email inbox

---

## Architecture Overview

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  RSS Feeds   │────►│   GitHub     │────►│   Power      │
│  (96+ src)   │     │   Actions    │     │   Automate   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │                     │
                            ▼                     ▼
                     ┌──────────────┐     ┌──────────────┐
                     │   GitHub     │     │   O365       │
                     │   Pages      │     │   Email      │
                     └──────────────┘     └──────────────┘
```

---

## Email Configuration

### Primary: Power Automate Webhook

**Advantages:**
- Sends from corporate @woodmontproperties.com
- No SMTP credentials stored in GitHub
- Works through corporate firewalls (HTTPS only)
- Leverages existing Microsoft 365 infrastructure

**How it works:**
1. GitHub Action triggers `rssfeed.ts --send-newsletter-work`
2. Code POSTs newsletter HTML to Power Automate webhook
3. Power Automate sends email via O365 connector

### Fallback: SMTP (Gmail)

**When used:**
- `WEBHOOK_URL` not configured
- Webhook call fails

**Disadvantages:**
- Emails come from Gmail, not corporate domain
- Requires SMTP credentials in GitHub Secrets
- May be blocked by corporate firewalls (port 587)

---

## Workflow Schedule

| Workflow | Cron | Time (EST) | Purpose |
|----------|------|------------|---------|
| `update-articles.yml` | `0 11 * * 1-5` | 6 AM | Fetch feeds, update docs/ |
| `send-newsletter-work.yml` | `0 12 * * 1-5` | 7 AM | Send email newsletter |

---

## Monitoring & Troubleshooting

### GitHub Actions
- Check **Actions** tab for workflow runs
- View logs for detailed output
- Re-run failed workflows as needed

### Power Automate
- Check **Run history** in your flow
- Look for failed runs and error messages
- Test with manual trigger if needed

### Common Issues

| Issue | Solution |
|-------|----------|
| Webhook returns 400 | Check JSON schema matches payload |
| Webhook returns 401 | Verify `WEBHOOK_SECRET` matches flow |
| Email not arriving | Check Power Automate run history |
| Wrong sender | Configure O365 connector correctly |
| No articles | Run `update-articles.yml` first |

---

## Security Best Practices

1. **Never commit credentials** - Use GitHub Secrets only
2. **Webhook URL is sensitive** - Treat it like a password
3. **Add webhook security** - Use `WEBHOOK_SECRET` for API key validation
4. **Monitor run history** - Watch for unusual activity

---

## Reverting Changes

If the Power Automate integration doesn't work:

**Option 1: Don't set WEBHOOK_URL**
The code automatically falls back to SMTP.

**Option 2: Git revert**
```bash
git revert 77a947f  # "Where it All Changed" commit
```

---

## Related Documentation

- [POWER_AUTOMATE_INTEGRATION.md](./POWER_AUTOMATE_INTEGRATION.md) - Detailed webhook setup
- [NEXTSTEPS.md](./NEXTSTEPS.md) - System overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical design
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Problem solving

---

## Key Commits Reference

| Commit | Description |
|--------|-------------|
| `77a947f` | "Where it All Changed" - Power Automate webhook integration |

---

**Questions?** Check GitHub Actions logs or Power Automate flow run history.
