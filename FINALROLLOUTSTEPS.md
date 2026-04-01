# Newsletter Preview & Feedback System — Final Rollout Steps

## Goal
Interactive newsletter preview where the user can review, adjust, and approve articles before they go to the boss. Feedback trains the system over time to learn preferences.

---

## Phase 1: Filter Toggles & Article Management in Preview
**Status: IN PROGRESS**

### What it does
- Newsletter tab shows a **pre-send preview** with articles grouped by section (Relevant, Transactions, Availabilities, People)
- Each article shows: title, source, description, quality score, region tag
- **Filter toggles**: turn region filter, industrial filter, dedup on/off to see what changes
- **Add/remove articles**: drag articles between sections or remove them from the preview
- Preview updates live as filters are toggled
- "Send Newsletter" button only sends what's shown in the preview

### Implementation
- Frontend: `docs/index.html` — enhance the existing `NewsletterPreview` component
- Add filter toggle checkboxes above the preview
- Add `+` (restore) and `-` (remove) buttons per article in preview
- Show article quality score badge
- Show "X articles filtered" count when filters are active
- Preview fetches from `feed.json` and applies filters client-side (same logic as `email.ts`)

### Files to modify
- `docs/index.html` — NewsletterPreview component
- `docs/js/utils.js` — client-side filter functions

---

## Phase 2: Feedback Buttons & Storage
**Status: PLANNED**

### What it does
- Each article in the preview gets ✓ (approve) and ✗ (reject) buttons
- Approved articles stay in the newsletter
- Rejected articles move to:
  - `docs/excluded-articles.json` (permanent exclusion by title match — never comes back)
  - OR `docs/raw-feed.json` (Raw section — can be recovered if wrongly rejected)
- All feedback is logged to `docs/newsletter-feedback.json`

### Feedback data structure
```json
{
  "feedback": [
    {
      "articleId": "abc123",
      "title": "Blackstone $163M Pompano Beach Warehouse",
      "normalizedTitle": "blackstone 163m pompano beach warehouse",
      "action": "approved",
      "reason": null,
      "section": "transactions",
      "qualityScore": 105,
      "source": "commercialobserver.com",
      "region": "FL",
      "date": "2026-04-01",
      "user": "pratiyush"
    },
    {
      "articleId": "def456",
      "title": "Wine bar opens in Warehouse Arts District",
      "normalizedTitle": "wine bar opens in warehouse arts district",
      "action": "rejected",
      "reason": "Not CRE Related",
      "section": "relevant",
      "qualityScore": 5,
      "source": "news.google.com",
      "region": null,
      "date": "2026-04-01",
      "user": "pratiyush"
    }
  ]
}
```

### Rejection reasons (dropdown)
- Not Relevant
- Wrong Region
- Duplicate
- Old News
- Not CRE Related
- Bad Description
- Other

### Files to modify
- `docs/index.html` — add ✓/✗ buttons to preview articles
- `docs/js/utils.js` — `syncFeedbackToGitHub()` function
- `docs/newsletter-feedback.json` — new file, synced to GitHub
- `docs/excluded-articles.json` — auto-updated on rejection

---

## Phase 3: Groq Learning Loop
**Status: PLANNED**

### What it does
- Weekly (or on-demand), analyze feedback data with Groq API
- Groq identifies patterns in approved/rejected articles
- Auto-adjusts the quality scoring weights in `email.ts`
- Saves learned preferences to `docs/scoring-weights.json`

### Scoring weights structure
```json
{
  "updatedAt": "2026-04-07",
  "regionWeights": {
    "NJ": 35,
    "PA": 25,
    "FL": 20,
    "National": 5
  },
  "sourceWeights": {
    "re-nj.com": 15,
    "commercialobserver.com": 12,
    "bisnow.com": 10,
    "news.google.com": 2
  },
  "dealSizeThresholds": {
    "highValue_SF": 100000,
    "highValue_dollars": 50000000
  },
  "companyBonus": {
    "prologis": 15,
    "blackstone": 15,
    "amazon": 10,
    "woodmont": 20,
    "sagard": 15
  },
  "topicPreferences": {
    "logistics": 10,
    "cold_storage": 8,
    "data_center": 5,
    "last_mile": 8,
    "industrial_outdoor_storage": 10
  },
  "learnedExclusions": [
    "wine bar",
    "bioprocessing",
    "gene therapy",
    "arts district"
  ]
}
```

### Groq prompt template
```
You are analyzing newsletter feedback for a commercial industrial real estate briefing.

Here are the last 30 days of article approvals and rejections:
{feedback_json}

Current scoring weights:
{current_weights}

Based on the patterns in approved vs rejected articles, suggest updated weights.
Consider: region preferences, source quality, deal size importance, topic relevance.

Return a JSON object with the same structure as the current weights, adjusted based on feedback.
```

### Integration
- `src/server/learn-preferences.ts` — new file, calls Groq API with feedback
- `src/server/email.ts` — `scoreArticle()` loads weights from `scoring-weights.json` instead of hardcoded values
- GitHub Action: `update-scoring.yml` — runs weekly Friday after newsletter, calls learn script

### Files to create
- `src/server/learn-preferences.ts`
- `docs/scoring-weights.json`
- `docs/newsletter-feedback.json`
- `.github/workflows/update-scoring.yml`

### Files to modify
- `src/server/email.ts` — load dynamic weights
- `docs/index.html` — trigger learning from UI

---

## Phase 4: Monitoring & Alerting Dashboard
**Status: PLANNED**

### What it does
- Feed health dashboard shows source reliability over time (already built — `successRate` + `recentHistory`)
- Newsletter delivery confirmation (webhook response logged)
- Weekly report: articles approved/rejected ratio, top sources, scoring accuracy
- Alert if newsletter didn't send by 11 AM (watchdog already built)

---

## Current System Architecture

```
7 AM EST ─── RSS-only build ──────── updates feed.json (~3 min)
10 AM EST ── Newsletter send ─────── RSS build + filters + send (~5 min)
11 AM EST ── Watchdog ────────────── checks if newsletter sent, retries if not
3 PM EST ─── Scraper-only build ──── CBRE/JLL/LoopNet etc (~10 min)
Sun 6 PM ─── Weekend scraper ─────── catches weekend articles for Monday
Fri 12 PM ── Weekly recap ─────────── week-in-review top 5 stories
```

### Filter Pipeline (5 layers)
1. Region filter (build) — INTERNATIONAL_EXCLUDE + MAJOR_EXCLUDE_REGIONS
2. Industrial filter (build) — EXCLUDE_NON_INDUSTRIAL + isStrictlyIndustrial
3. Excluded articles (build) — ID + URL + normalized title matching
4. Quality scoring (newsletter) — region, deal size, company, source, recency
5. Final gate (newsletter) — re-runs all checks + LoopNet international + description quality

### Dedup Pipeline (4 layers)
1. URL-based (feed build) — normalizeUrlForDedupe
2. Title-based (feed build) — normalizeTitle strips source suffixes
3. Deal signature (newsletter) — extractDealSignature (SF + $ + location)
4. Title dedup (newsletter) — cross-section duplicate removal

---

## Rollout Timeline

| Phase | Target | Effort | Dependency |
|-------|--------|--------|------------|
| Phase 1 | This week | 1 session | None |
| Phase 2 | Next week | 1 session | Phase 1 |
| Phase 3 | Week after | 1 session | Phase 2 + enough feedback data |
| Phase 4 | Ongoing | Incremental | Phase 1-3 |

---

## Success Metrics
- **Zero junk articles** in newsletter (international, non-industrial, duplicates)
- **All sections populated** (4+ relevant, 4+ transactions, 1+ avail, 2+ people)
- **Real descriptions** on all articles (not title-as-description)
- **Feedback loop** reduces manual corrections over time
- **Boss satisfaction** — the ultimate metric
