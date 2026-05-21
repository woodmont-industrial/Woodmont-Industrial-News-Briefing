# Claude Resume Context — Woodmont Industrial News Briefing

This doc is for Claude when picking up work on a fresh machine. Skim top-to-bottom on first open; the morning audit checklist at the bottom is the high-frequency reference.

**Last updated:** 2026-05-17 (after the 2026-05-13 incident fixes)

---

## What this project is

Automated daily industrial-real-estate newsletter for Woodmont Industrial Partners. Focus regions: **New Jersey, Pennsylvania, Florida (all)**. Deal threshold: ≥100K SF or ≥$25M.

- **Stack:** TypeScript + Node, GitHub Actions for scheduling, GitHub Pages for the SPA, Power Automate webhook for email send.
- **Frontend:** Single-HTML SPA — React 18 via CDN + Babel standalone (NOT a build pipeline). `docs/index.html` (~2500 lines) and `docs/raw.html` (~420 lines) use inline `<script type="text/babel">`.
- **Build:** `npx tsx src/build/static.ts` → writes `docs/feed.json`, `docs/raw-feed.json`, `docs/rss.xml`.
- **Send:** `src/server/email.ts::sendDailyNewsletterWork()` is the boss-preferred path. Other paths (`sendDailyNewsletter`, `sendDailyNewsletterGoth`) are not in active use.

### Schedules (UTC)

| Workflow | Cron | Purpose |
|---|---|---|
| `build-reserve-pool.yml` | `0 3 * * *` | Tier-4 safety-net pool, top-25 per section over last 90 days |
| `newsletter-pipeline.yml` | various | Crawl + categorize + feed.json build |
| `send-only.yml` | weekdays | Renders + sends the daily email; also writes `docs/diagnostics/latest.json` |

### Local environment quirks

- **Windows + threat-locker blocks `tsx.cmd`** — can't run TypeScript locally. Use inline Node JS simulations to verify logic before pushing.
- Use Unix-style paths (`/c/...`) in bash; Windows paths (`C:\...`) for Read/Edit/Write tools.

---

## Critical files (memorize these)

| File | What it does |
|---|---|
| `src/server/email.ts` | Main send orchestrator. `sendDailyNewsletterWork()` is the boss path. Contains the 5-tier backfill cascade + finalGate + post-desc refills. |
| `src/server/newsletter-filters.ts` | Section filters: `applyStrictFilter`, `applyTransactionFilter`, `applyAvailabilityFilter`, `applyPeopleFilter`, `hasGeographicFailure`, `isTargetRegion`, `isNotExcludedRegion`, sent-articles persistence. |
| `src/server/newsletter-work.ts` | Boss-preferred email template builder. Markdown-like layout, deal-prefix extractor, publisher tag, action links. |
| `src/server/newsletter-diagnostics.ts` | `DiagnosticContext` — funnel + rejection + tier-fill counters. Output goes to `docs/diagnostics/`. |
| `src/shared/url-utils.ts` | `extractDealSignature` (singular, primary), `extractDealSignatures` (plural, multi-sig for within-newsletter), `extractCrossDayDedupSignatures` (narrow, for cross-day persistence — see 2026-05-13 fix). |
| `src/shared/region-data.ts` | `APPROVED_DOMAINS`, `INTERNATIONAL_EXCLUDE`, `MAJOR_EXCLUDE_REGIONS`, `RELEVANT_KEYWORDS`, `isStrictlyIndustrial`. |
| `src/shared/publisher-name.ts` | Display-name resolver. SPA + server both use this so "Google News X" shows as "Real Estate NJ"/"CoStar"/etc. |
| `src/filter/rule-engine.ts` | Per-article categorizer — assigns transactions/availabilities/relevant/people. |
| `src/build/build-reserve-pool.ts` | Nightly Tier-4 builder. Writes `docs/preferences/reserve-pool.json`. Path-restricted commit. |
| `docs/excluded-articles.json` | Manual exclusion list (IDs + URLs + normalized titles). |
| `docs/sent-articles.json` | 30-day rolling sent-IDs + 14-day rolling sigs for cross-day dedup. |
| `docs/diagnostics/latest.json` | Most recent send's funnel data. Per-send archives in `docs/diagnostics/newsletter-run-*.json`. |

### Section minimums

```
MIN_RELEVANT      = 4
MIN_TRANSACTIONS  = 4
MIN_AVAILABILITIES = 1
MIN_PEOPLE        = 2
MAX_PER_SECTION   = 6   (3 for availabilities)
```

### Backfill tiers (in order, each fills only if section < MIN)

1. **Tier 1 (24h)** — fresh content if relevant + transactions both ≥ MIN at 24h
2. **Tier 2 (48-72h)** — Monday uses 72h to cover weekend
3. **Tier 3 (30-day deep)** — broader pool, target-region only
4. **Tier 4 (reserve)** — `docs/preferences/reserve-pool.json`, nightly-refreshed best-of-90d
5. **Tier 5 (manual include)** — `docs/included-articles.json`, user raw-picks

Post-description cascade runs again at the end (shallow + deep), with `finalGate` wrapped into each filterFn since the 2026-05-13 fix.

---

## 2026-05-13 incident & fix (commit `44b7372`)

**Symptom:** Send shipped 5 articles total. 3 of them were CommercialSearch listing-aggregator garbage ("1215 - Compton Warehouse - CommercialSearch", etc.). Transactions/availabilities/people sections empty.

**Four cascading regressions, all fixed in one commit:**

1. **Cross-day dedup over-blocked** — The plural `extractDealSignatures` emits state-level single-metric sigs like `5ac_state-nj` and `95sf_state-nj`. Used for cross-day persistence, these collapsed every NJ small-acre / ~950K SF / FL ~$4M deal against the prior week's CenterPoint/Mapletree/Jacksonville sigs.
   - **Fix:** new `extractCrossDayDedupSignatures` in `url-utils.ts` that emits ONLY granular (city/county) + M&A company-pair sigs. Pruned state-only sigs from existing `sent-articles.json`. The plural multi-sig remains for within-newsletter cross-source dedup (`dedupeByDealSignature` at email.ts:657).

2. **finalGate bypassed by post-desc refills** — `finalGate` (the allowlist gate that blocks listing aggregators) ran once at email.ts:874, but the shallow + deep post-desc refills at lines 1000-1041 added new articles after it.
   - **Fix:** wrapped each refill `filterFn` in `finalGate` so nothing inserted via refill skips the allowlist.

3. **Reserve pool nightly build populated only `relevant`** — `isTargetRegion` rejects any URL whose hostname isn't in `APPROVED_DOMAINS`, and `news.google.com` (which carries ~80% of the feed since RSS uses Google News as a proxy for Cloudflare-blocked sources) wasn't on the list.
   - **Fix:** added `news.google.com` to `APPROVED_DOMAINS`. Remaining quality filters (`hasGeographicFailure`, `INTERNATIONAL_EXCLUDE`, `countRegionMatches`) still run against article text.

4. **People supply chronically low** — 4 people-tagged items in 235 today, 1 after region filter.
   - **Fix:** added 6 new feeds — `re-nj.com/category/people/feed/`, `njbiz.com/category/people-on-the-move/feed/`, `roi-nj.com/category/tracking/feed/`, plus 3 new Google News queries (Industrial REIT Personnel, Brokerage Industrial Hires, citybiz Executive Moves).

### Post-fix verification (from diagnostics)

| Date | Total shipped | Empty sections | Reserve fired |
|---|---|---|---|
| 2026-05-13 (pre-fix) | 5 | 3 of 4 | no (broken) |
| 2026-05-14 | 10 (4/4/1/1) | 0 | no (not needed) |
| 2026-05-15 | 8 (4/3/0/1) | 1 (availabilities) | yes (transactions +1) |

People section still chronically thin (selected=1 most days) — the new feeds need ~48h to start indexing in Google News, plus people supply is genuinely seasonal.

---

## Pre-2026-05-13 fixes worth remembering

| Commit | What |
|---|---|
| `4fbaff0` | Post-desc refill category-filter + re-dedup (CenterPoint duplicate fix from 5/12) |
| `cd5f3da` | CommercialSearch title-pattern detector + acres + M&A company-pair sigs |
| `1f23070` | Diagnostic instrumentation — populated funnel + per-feed + tier counters |
| `450e704` | Publisher-name resolver — server + SPA share `getPublisherName()` |
| `f7e662b` | `hasGeographicFailure` rules (gov agency, primary-location, listing aggregator) |
| `bb3260c` | Initial section misclassification fix (Tier 1-3 category filter) |
| `3f038f7` | Threshold enforcement, cross-source dedup, reserve pool initial build |

---

## Open risks / unfinished work

- **People section thin** — new feeds added 5/13, Google News indexing lag means full ramp by ~5/17. If still chronically thin after 5/20, look at direct LVB / GlobeSt people RSS endpoints.
- **Availabilities chronically low** — 5/15 shipped 0. Supply problem, not filter. Consider adding direct LoopNet NJ/PA/FL search feeds (need to whitelist target-region pattern in the title since aggregator detector kills generic LoopNet titles).
- **Singapore Business Times Mapletree dup** — title says "39-ha New Jersey" with no Singapore token, so `INTERNATIONAL_EXCLUDE` doesn't fire. A title-pattern detector for known international wire publishers (Singapore Business Times, South China Morning Post, Nikkei, etc.) would catch these.
- **Wrong-asset-class semantic leaks** (Anthropic office, pharma M&A) — user rejected PR #2 strict positive-evidence gate. Surgical detectors only.
- **fetchRSSFeedImproved is 400 lines** in `src/feeds/fetcher.ts` — refactor candidate but no functional issue.

---

## Rules / preferences (also in memory files — link below)

- **PR #2 strict positive-evidence gate is OFF the table.** User explicitly rejected it. Use surgical targeted fixes (title regex, source deny rules, signature dedup, manual strips) instead.
- **Hold off on edge-case patches until boss feedback.** Patch obvious wrong-region leaks; defer borderline content judgments.
- **Relevance threshold:** leaks = wrong-region/international only. National macro and keyword-matching off-topic are OK.
- **"This Week So Far" recap section was rejected** — reader doesn't want to see repeats. Quiet days stay quiet; expand fresh source pool instead.
- **Don't trigger workflows yourself** unless explicitly authorized. Daily send fires automatically at 14:00 UTC.
- **Confirm before destructive ops** — pushing, force-pushing, dropping data, etc.

---

## Morning audit checklist (when user says "check today's newsletter")

```bash
# 1. Pull latest
git fetch origin main && git pull

# 2. Did today's send fire? Look for "Newsletter sent - YYYY-MM-DD HH:MM UTC"
git log origin/main --oneline -10

# 3. Read the latest diagnostic
cat docs/diagnostics/latest.json | head -100
# or the dated file: docs/diagnostics/newsletter-run-YYYY-MM-DD-HHMM.json

# 4. Show today's shipped IDs + titles
node -e "
const sent = require('./docs/sent-articles.json');
const feed = require('./docs/feed.json');
const today = new Date().toISOString().slice(0,10);
const ids = sent.sent.filter(s => s.sentAt === today).map(s => s.id);
ids.forEach(id => {
  const it = feed.items.find(i => i.id === id);
  if (it) console.log('[' + it.category + ']', it.title?.slice(0,90));
});
"
```

**Red flags to look for:**
- Any section with `selected: 0` and `underfilled: true` for >1 day in a row
- `tier4_reserve` consistently 0 across all sections → reserve build broke again
- Listing-aggregator titles (`- CommercialSearch`, `- LoopNet`, `- PropertyShark`) in shipped items
- Cross-source duplicates (same deal, different publisher) shipping in the same email
- International publishers in title (Singapore, UK, Australia)

**If a leak ships:** add ID to `docs/excluded-articles.json::excludedIds` and the normalized title to `excludedTitles`. Both are applied by `loadExcludedArticles` in `newsletter-filters.ts`.

---

## Useful commands

```bash
# Inspect feed candidates by category
node -e "const f=require('./docs/feed.json'); const c={}; for(const i of f.items)c[i.category]=(c[i.category]||0)+1; console.log(c);"

# Check reserve pool health
node -e "const r=require('./docs/preferences/reserve-pool.json'); console.log('Generated:',r.generatedAt); console.log('Stats:',r.stats);"

# Find unsent in-window items by section
node -e "
const f=require('./docs/feed.json'); const s=require('./docs/sent-articles.json');
const sent=new Set(s.sent.map(x=>x.id));
const c48=new Date(Date.now()-48*3600*1000);
for(const cat of ['relevant','transactions','availabilities','people']){
  const arr=f.items.filter(i=>i.category===cat && new Date(i.date_published)>=c48 && !sent.has(i.id));
  console.log(cat+':',arr.length); arr.slice(0,5).forEach(i=>console.log(' -',i.title?.slice(0,80)));
}
"

# Last 14d sent sigs (after the 5/13 fix these should only be granular city/county)
node -e "
const s=require('./docs/sent-articles.json');
const cutoff=new Date(Date.now()-14*86400000);
s.sent.filter(e=>new Date(e.sentAt)>=cutoff && e.sigs).forEach(e=>console.log(e.sentAt,e.id?.slice(0,8),JSON.stringify(e.sigs)));
"
```

---

## Memory files (loaded automatically into context)

Located at `C:\Users\Pratiyush.Casley\.claude\projects\C--Users-Pratiyush-Casley-Projects\memory\`:

- `user_claude_sentinel.md` — user named this Claude "Claude Sentinel" for this project
- `feedback_disable_workflows.md` — historical (39d old); workflows have been re-enabled
- `feedback_await_boss_feedback.md` — patch obvious leaks; hold off on borderline
- `feedback_relevance_threshold.md` — leaks = wrong-region/international only
- `project_dedup_cross_source_known_issue.md` — historical 4/27 incident
- `feedback_no_pr2_strict.md` — don't recommend PR #2 strict gate

---

## Identity

User has named this Claude **"Claude Sentinel"** for this project. The boss/user is the operations contact for Woodmont Industrial Partners; recipients of the email include the broader team.
