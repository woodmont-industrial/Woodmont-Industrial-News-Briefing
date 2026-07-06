# Woodmont Industrial News Briefing - System Overview

> **Last Updated**: July 6, 2026
> **Status**: Production — stable. Being submitted to leadership as complete (~July 7, 2026 sign-off).

---

## 🟢 CURRENT STATE & WHAT'S NEXT — July 6, 2026 (READ THIS FIRST)

> This is the live handoff. The "Next Steps — April 13" section further down is **superseded** (kept for history).

### Where things stand
The newsletter is **mechanically clean**: one send per weekday, zero double-sends, and the recurring dupe/leak classes are now caught before delivery. Scores are content-driven and swing with the news cycle (Fri 7/3 = 73/C; Mon 7/6 = 54/F — a thin post-holiday day, now addressed by the thin-send guarantee). The website is navy-themed and de-duplicated. Two open reliability gaps were closed 7/6: **delivery timing now affects the grade**, and **dropped send crons self-heal** off the build completion.

### Done in June–July 2026
- **Website** (`docs/index.html`, `docs/css/styles.css`, `docs/raw.html`): navy `#0B223F` theme; killed the emerald-green **body** gradient that was in `docs/css/styles.css` (external file — not inline in index.html); removed the 20px body frame (full-bleed, no white edges); collapsed article actions into **+ / − / ⋯** (Track/Raw/Ignore live under ⋯), navy-gradient buttons with hover.
- **Feed display dedup** (`docs/index.html`, in the feed-load right before `setItems`): collapses the same developer deal reported by multiple outlets (Woodmont/Sagard Rahway was 5×, Sagard NJ acquisition 2×) via **transitive developer+location/action signatures**. ⚠️ This is client-side only — `feed.json` still contains the raw dupes (see Next #2).
- **Pre-send scrub** (`src/server/email.ts` → `scrubHardProblems`, ~line 1176): last-line defense that DROPS every flagged leak class before delivery — sloth/animal-welfare, wrong-region/CA, vendor `Watch:`/`Video:` clips, garbage AI descriptions, student fluff, non-industrial, broken/pagination items. **Rule: when a new leak class is flagged, add it here.**
- **Dedup**: cross-day (`sentArticleIds`/`sigSet`/`sentTitleKeys`), within-send `extractDealSignatures` + **stateless** `devProjectSigs`, Week-in-Review dedup.
- **429 storms fixed**: Groq `llama-3.1-8b-instant` primary + Cerebras `zai-glm-4.7` fallback + request batching (`CLASSIFY_BATCH_SIZE=6`). 87 → 0 exhaustions.
- **Feed supply**: disabled dead/mislabeled scrapers; added Google News proxies for real GlobeSt deals, Colliers, Cushman, NAI Keystone, ROI-NJ/NJBIZ/RE-NJ (industrial + people). ~242 feeds.
- **Quality scoring**: `computeNewsletterScore` → `docs/quality-scores.{json,csv}` + `docs/diagnostics/latest.json`; `docs/feed-health-history.csv` archived daily. These are the **Power BI** data sources.
- **Cloud monitoring routine** (claude.ai, NOT a GitHub Action): *"Woodmont Newsletter — Daily Health Check"*, id `trig_01RqYLVcigejvKhycmXBAfk6`, cron `0 15 * * 1-5` (11 AM ET), **read-only** (`Bash/Read/Grep/Glob`), **NO email / NO connectors**. Manage at https://claude.ai/code/routines/trig_01RqYLVcigejvKhycmXBAfk6

### Done July 2–6, 2026 (latest)
- **Cross-day dedup — same developer, same project** (`src/shared/url-utils.ts` `extractCrossDayDedupSignatures`): the Woodmont/Sagard Rahway deal shipped 3 days running as reworded headlines because it emitted no signature. Added a `devdeal_<developer>_<city>` signature (precise — a different-city deal by the same developer won't collapse) + `email.ts` now persists signatures of within-send-removed duplicates so a later rewrite is caught. **Rule holds: when a dupe class appears, add a signature here.**
- **Charity/humanitarian scrub class** (`email.ts` `scrubHardProblems`): "Helping Venezuela… nonprofit warehouse" leaked on the word *warehouse*. Drops charity/relief/food-bank/fundraiser/"helping <country>" framing; the bare `nonprofit` arm needs a charity-context word so a nonprofit *developer* still passes.
- **Week-in-Review dupe (FRP Hamilton)** (`url-utils.ts`): added Hamilton + 7 NJ industrial towns to the location list, and made the comma square-foot regex hyphen-tolerant ("170,800-**square-foot**" produced no metric → no signature). The same deal now collapses; different-size deals in the same town stay separate.
- **Timing in the grade** (`src/server/newsletter-diagnostics.ts` + `email.ts`): two new penalties — `late_delivery` (−1/15 min past the 8:30 AM ET target, 30-min grace, cap −10) and `manual_send` (−5, automation didn't self-deliver). New `lateDelivery`/`manualSend` CSV columns. `email.ts` measures minutes past 8:30 AM `America/New_York` (DST-safe) and reads `TRIGGER_EVENT`.
- **Self-healing dropped crons** (`.github/workflows/send-only.yml`): GitHub silently dropped the send cron on 7/6 (a known load issue; the build still ran). Added a `workflow_run` trigger on *"Newsletter Pipeline (Build Only)"* completion, **gated to ≥11:30 UTC** so it only recovers laggy days (when GitHub also delays the build into that window) and defers to the cron on normal days. Cannot double-send (dedup guard); cannot loop (build has no `push` trigger). Auto-recovered sends take only the lateness penalty, not the manual −5.
- **Thin-send guarantee** (`email.ts`, after the tier-4 reserve fill): the Mon-after-long-weekend is structurally starved (nothing published; recent deals already sent). The reserve fill only tops each section to its *min*, so a met `relevant` section never drew on the deep relevant reserve. Now: if the WHOLE edition is < 10 items, pad `relevant` from the reserve pool (vetted macro/industry pieces, freshness-discounted). 7/6 would have gone 5 → 10.
- **Feed audit (7/6)**: feeds are healthy — 198/211 productive, 4,310 kept in one build. Only 4 dead, all redundant: *NJBIZ People* (403), *ROI-NJ* (403), *ROI-NJ Tracking* (404), *Scraper: Bisnow* (fail) — each fully covered by Google News proxies (ROI-NJ Industrial proxy alone keeps ~58) and, for Bisnow, 4 working direct regional RSS feeds. Scarcity is NOT a feed problem.

### ⚠️ Operational constraints (do not violate)
1. **Never double-send.** Production goes to hundreds; the user's job depends on it. Protection: dedup guard (`sentAt===today`, `force_send` defaults false) + `concurrency` with `cancel-in-progress: false`. Two send workflows exist but *"Send Newsletter (Work - Weekly)"* is **manual-only** (schedule commented out; last ran Apr 3) — no risk. Verify exactly one send; disable after any manual send.
2. **The monitoring routine must NEVER email.** The user has a Power Automate flow that would disperse any email to associates. Keep it output-only.
3. **`docs/index.html` is HAND-MAINTAINED** (the build does NOT regenerate it). Its inline JSX runs through **in-browser Babel** — a syntax error blanks the whole site, and a literal `</script>` anywhere in the babel block closes it early. **Before pushing index.html, validate**: extract the `text/babel` block and run `@babel/core` `transformSync` with `@babel/preset-react` (install `--no-save @babel/core @babel/preset-react`).
4. **Blocked company tooling**: `tsc.cmd` (no typechecking) and `npx tsx` (AV-blocked → use `node --import tsx rssfeed.ts ...`). To validate TS logic, `node --import tsx` a small test that imports the `.js` path; to syntax-check, `esbuild.transformSync(..., {loader:'ts'})`.
5. **Manual send when a cron drops**: `gh workflow run 255831820 --ref main -f force_send=false` (guard ON). Confirm exactly one "Newsletter sent" commit after. The auto-recovery (below) now usually makes this unnecessary.

### Current schedule (July 2026, UTC)
| Workflow | Cron (UTC) | Notes |
|----------|-----------|-------|
| `newsletter-pipeline.yml` (build) | 08:00–09:00 Mon–Fri | builds feed.json; commits `docs/` + `src/feeds/feeds.json` |
| `send-only.yml` (send) | 10:30 / 10:45 / 11:00 / 11:15 Mon–Fri | lands ~8:30–9:45 AM ET (GitHub cron lag; crons set early to absorb it) |
| `send-only.yml` (auto-recovery) | on build completion, gated ≥11:30 UTC | self-heals a dropped send cron; dedup-guarded, can't double-send/loop |
| `build-articles.yml` | weekends | Sat RSS + Sun scrapers |

### Next (all optional — project is shippable as-is)
1. **Raise the grade**: scores are content- and timing-driven now. Biggest lever on a normal day is **regional/coverage** (inspect `docs/diagnostics/latest.json`); on thin days the **thin-send guarantee** pads volume. Timing penalties (`late_delivery`/`manual_send`) reward reliable, on-time, self-delivered sends.
2. **Durable feed dedup**: move the Woodmont/Sagard dedup from client-side (`docs/index.html`) into `src/build/static.ts` so `feed.json` itself is clean (matters if Power BI or anything else reads feed.json directly).
3. **Power BI**: build the trendline off `docs/quality-scores.csv` (now includes `lateDelivery`/`manualSend`) + `docs/feed-health-history.csv`.
4. **Optional cleanup**: remove the 4 dead direct feeds (`NJBIZ People on the Move`, `ROI-NJ`, `ROI-NJ Tracking`, `Scraper: Bisnow`) from the feed config — pure noise now, fully covered by Google News proxies.

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

## Next Steps — April 13, 2026 (⚠️ SUPERSEDED — see the July 1 section at top; kept for history)

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
