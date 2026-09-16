# Stakeholder Source Coverage + Municipal Intelligence Audit

**Date:** 2026-09-16 · **Status:** READ-ONLY INVESTIGATION — no production change proposed in this document
**Audited at:** `origin/main` @ `69c25bc` · **Evidence:** `src/feeds/feeds.json`, `src/scrapers/scraper-config.ts`,
`docs/feed-health.json` (generated 2026-09-16T12:55Z), `docs/feed.json` (229-item corpus),
`docs/newsletter-archive/*` (last 10 sends), allowlists in `src/server/email.ts` + `src/feeds/link-validation.ts`.

> **Placed in `dev-docs/` deliberately.** `docs/` is published by GitHub Pages; `dev-docs/` is not.
> This report names internal architecture and should not be served publicly.

---

## PHASE A — Requested commercial sources

### A.1 Coverage table

| Source | Approved by filters? | Active ingest? | Ingest method | Current health | Fresh items 24h/72h/14d | Selected recently? | Known limitation |
|---|---|---|---|---|---|---|---|
| **Traded.co** | Yes (trusted + scraper cfg) | Yes | GNews proxy ×3 | 3/3 ok, 300 raw → 52 kept | **0 / 0 / 1** | **No** (0 of last 10 sends) | Approved and fetching, but effectively **no selectable supply**. Deal-blurb format rarely clears section gates. |
| **NJBIZ** | Yes | Partial | 1 direct RSS + 4 GNews proxy | 4 ok / **1 failed (404)** — 400 raw → 67 kept | **0 / 0 / 0** | **No** | `NJBIZ People on the Move` RSS returns **404**. Despite 67 kept at ingest, **zero NJBIZ items in the live corpus** — dies downstream (dedup/staleness/region). |
| **GlobeSt** | Yes | Yes | GNews proxy ×3 + scraper | 4/4 ok, 311 raw → 76 kept | 0 / 0 / 3 | Yes (1) | Direct site 403s bots; proxy + Playwright scraper carry it. Thin fresh yield. |
| **The Real Deal** | Yes | Yes | GNews proxy ×1 | 1/1 ok, 100 raw → **62 kept** | 0 / 0 / 2 | Yes (2) | Direct Miami feed **disabled — Cloudflare blocked**. Highest ingest-keep rate of the group but almost nothing survives to selection. |
| **Business Journals — New York** | **Domain approved**; feed entry **disabled** | **No** | none active (direct feed present but disabled) | **No health rows — not fetched at all** | **0 / 0 / 0** | **No** | Not a plumbing gap: `bizjournals.com` is already in `APPROVED_DOMAINS` and link-validation, and `feeds.bizjournals.com/bizj_newyork` already exists in `feeds.json` — **disabled, with no note recording why**. Enabling is a config flip, not new integration. Not on the final-gate trusted list (see §A.2.1). |
| **Business Journals — South Florida** | **Domain approved** (see §A.2.1) | Yes | GNews proxy ×1 + 1 enabled direct CRE feed (a second direct entry is disabled) | 4/4 ok, 323 raw → 31 kept | **0 / 0 / 0** | **No** | **Not blocked at the domain layer.** Configured, fetching and ingest-keeping, but producing **no fresh selectable items**. Absent from `TRUSTED_DIRECT_SOURCES`, which matters only for items carrying neither NJ/PA/FL evidence nor national-macro framing. |
| **Bisnow** | Yes | Yes | 4 direct RSS + 2 GNews proxy | **5 ok / 2 failed** — 270 raw → 31 kept | 0 / 1 / 9 | **Yes (8)** — best performer | **`Bisnow New Jersey` RSS returns 404** (our primary market!). **Bisnow scraper times out.** National/Philly/SoFla feeds carry the load. |
| **Commercial Observer** | Yes | Yes | 1 direct RSS + 1 GNews proxy | 2/2 ok, 117 raw → 58 kept | 0 / 0 / 3 | Yes (5) | Healthy. NY-centric, so much is out-of-market. |
| **CoStar News** | Yes | Yes (**scraper only**) | **All 3 feed entries disabled**; Playwright scraper | 1/1 ok, 9 raw → **9 kept (100%)** | **1 / 5 / 6** | Yes (2) | Direct + proxy blocked (**Akamai 403**). The scraper is the only live path and is the single most productive fresh source in the group — and therefore a single point of failure. |

### A.2.1 Which allowlist layer? (correction, 2026-09-16)

"Allowlisted" is ambiguous in this codebase — there are **four independent layers**, and a source can pass some and fail others. An earlier draft of this table said South Florida Business Journal was "not allowlisted," which wrongly implied a global block. Verified positions for `bizjournals.com`:

| Layer | Where | Effect | `bizjournals.com` |
|---|---|---|---|
| **1. Domain allowlist** | `APPROVED_DOMAINS` (`src/shared/region-data.ts:681`), enforced at `newsletter-filters.ts:234` — rejects any article whose hostname is not approved | Hard gate on ingestion into eligibility | ✅ **PRESENT — not blocked** |
| **2. Link validation** | `src/feeds/link-validation.ts:14` (`bizjournals.com`, `feeds.bizjournals.com`) | Link/URL sanity | ✅ **PRESENT** |
| **3. Classifier approval** | `_woodmontApprove` per article (LLM rubric, advisory in some sections) | Per-article, not per-source | n/a — source-independent |
| **4. Final newsletter gate** | `TRUSTED_DIRECT_SOURCES` (`src/server/email.ts`) — one of three ways to satisfy the allowlist check (**target region OR trusted source OR national macro**) | Only decides items lacking NJ/PA/FL evidence *and* lacking macro framing | ❌ **ABSENT** |

**Correct statement:** South Florida Business Journal is **domain-approved and link-validated**; it is simply **not on the final-gate trusted-source list**, which is a narrow condition affecting only non-regional, non-macro items. It is **not** globally blocked.

One further naming trap worth recording: `BLOCKED_FEED_DOMAINS` in `src/feeds/fetcher.ts:19` also lists `bizjournals.com`, but despite the name it is **not a block list** — it is the set of domains that *"commonly block automated requests — these get stealth headers."* It makes fetching more likely to succeed, not less.

### A.2.2 Status vocabulary used in this report

These are deliberately distinct and should not be collapsed:

- **Configured** — an entry exists in `feeds.json` / scraper config (may be disabled).
- **Successfully fetching** — `feed-health.json` reports `status: ok` with `fetchedRaw > 0`.
- **Correctly attributed** — the publisher is recoverable from stored data (see §A.4 — **false for 77% of the corpus**).
- **Eligible** — passes domain allowlist, region/industrial gates and the final newsletter gate.
- **Producing fresh selectable items** — contributes items ≤72h old that actually reach a send.

Traded.co, NJBIZ and South Florida Business Journal are all *configured* and *successfully fetching*, and are *eligible* at the domain layer — but **none is producing fresh selectable items**.

### A.2 Classification against the requested taxonomy

- **Direct RSS (working):** Bisnow National/Philadelphia/South Florida, Commercial Observer, NJBIZ (main feed).
- **Direct scraper (working):** CoStar (sole path), GlobeSt (supplementary).
- **Google News proxy:** Traded.co, NJBIZ (×4), GlobeSt (×3), The Real Deal, S. FL Business Journal, Bisnow (×2), Commercial Observer.
- **Blocked/paywalled but proxied:** CoStar (Akamai 403), The Real Deal Miami (Cloudflare), GlobeSt (403 → Playwright).
- **Domain-approved and fetching, but effectively no current supply:** **Traded.co, NJBIZ, South Florida Business Journal.** All three fetch and pass ingest filtering, yet contribute **zero** items to the live corpus in the last 14 days and have never shipped in the last 10 sends. *(None is domain-blocked — see §A.2.1.)*
- **Not currently ingesting:** **New York Business Journal** — domain-approved with a direct feed already present in `feeds.json`, but **disabled and unannotated**. The gap is a disabled switch, not missing integration.
- **Broken and unnoticed:** `Bisnow New Jersey` (404), `NJBIZ People on the Move` (404), `Scraper: Bisnow` (timeout).

### A.3 The finding that matters most

**Ingest is healthy; the corpus is starving.** Across all 211 feeds this run: **13,986 raw → 3,986 kept at ingest → 229 items in the live corpus.** And that corpus is old:

| Age band | Items |
|---|---|
| ≤24h | **3** |
| 24–72h | **16** |
| 3–14d | 57 |
| **>14d** | **153 (67%)** |

Only **19 items in the entire corpus are ≤72h old.** That is the real constraint behind every symptom we have chased for two weeks — thin days, data-center concentration, `NO_FRESH_SUPPLY` / `QUALITY_REJECTED` transactions. Adding more publishers will not fix a pipeline that converts 3,986 ingest-kept items into 19 fresh corpus items.

### A.4 Observability gap (blocks proper attribution)

**177 of 229 corpus items (77%) are attributed only as `news.google.com`.** The real publisher survives only as a `" - Publisher"` title suffix. Consequences:

- Per-source ROI cannot be measured from stored data — my first pass of this very audit produced false "0 supply" readings until I parsed title suffixes.
- `article-filter-impact.csv`'s new `publisher` column will record `news.google.com` for 77% of rows.
- Feed-level health looks excellent while end-to-end contribution is invisible.

**Recommendation:** populate `_source.website` from the GNews title suffix at ingest (build-stage, no scoring impact). This is a prerequisite for evaluating any source decision, including everything below.

---

## PHASE B — Municipal / regulatory intelligence

### B.1 What exists today

- **18 county-level Google News queries** exist (Bergen, Middlesex, Hudson, Somerset, Union, Monmouth NJ; Bucks, Montgomery, Chester, Delaware PA; plus "FL Zoning Approvals"). 13 appear in health: **776 raw → 147 kept**.
- These are **news *about* counties**, not official government records. No `.gov` source, no agenda/minutes ingestion, no document handling.
- **Output reality — across the last 10 sends:** `planning board` **0**, `zoning` **0**, `ordinance` **0**, `site plan` **0**, `redevelopment` **0** (`township` 3, incidental).

**So the municipal lane already half-exists at ingest and produces nothing at output.** Adding official sources without addressing that is likely to repeat the pattern.

- **No document capability:** dependencies include `playwright` only — **no PDF text extraction, no OCR**. This is net-new engineering.
- **Section model is fixed:** `type Section = 'relevant' | 'transactions' | 'availabilities' | 'people'`. A fifth section is a schema change touching diagnostics, coverage weights, supply status, and two fixed-schema CSVs.

### B.2 Proposed record (separate lane, no scoring/section change)

A municipal record is a **different shape** from a news article and should be stored separately (`docs/municipal/*.json`), not forced into `feed.json`:

```
municipality · county · board/body · meeting_date · applicant/developer ·
property_address · block/lot · project/use_type · industrial_flag ·
warehouse_flag · data_center_flag · action_type ·
status (proposed|heard|continued|approved|denied) · zoning_or_ordinance_change ·
summary · official_source_url · agenda_url · minutes_url · agenda_packet_url ·
site_plan_url · document_published_date · confidence · evidence_level
```

**Source priority (official first):** municipality/planning-board pages → agendas & minutes → agenda packets/exhibits → ordinances & resolutions → **local newspaper reporting as supplementary discovery/context only** (never as the record of an action).

**Document handling:** text-extraction first (`pdf-parse`/`pdfjs`); classify a PDF as **scanned** when extracted text falls below a character-per-page threshold, and **queue it for OCR as an explicit fallback** rather than OCR-by-default. Scanned packets should be recorded with `evidence_level: scanned_unparsed` and a URL, so a human can open the exhibit even when we cannot read it.

### B.3 Pilot recommendation — smallest viable

**Do not attempt all ~564 NJ municipalities.** Pilot design:

- **5–10 municipalities, explicitly registered** in a small `municipal-registry.json` (municipality, county, board URLs, platform type, document pattern).
- **The municipality list is a Woodmont input, not ours to invent.** Recommend Pratiyush/leadership select based on *active acquisition and development interest* — the markets where a zoning change actually moves a decision. Candidate selection criteria: existing Woodmont holdings or pipeline, current industrial rezoning activity, and the I-78/I-287/Exit 8A/Meadowlands corridors already weighted in `TARGET_REGION_PATTERN`.
- **Shadow-only for the first 2–3 weeks** — write records to `docs/municipal/`, surface nothing in the newsletter, exactly as we ran the Relevant-supply shadow.

### B.4 Failure modes and mitigations

| Failure mode | Likelihood | Mitigation |
|---|---|---|
| Municipality site redesign | High (annual) | Per-municipality adapter + health row per source; fail loudly like `feed-health.json` |
| Dynamic agenda platforms (CivicPlus, Granicus, novusAGENDA, Municode) | High | Detect platform per municipality; write **platform** adapters, not per-town scrapers — most towns share ~5 vendors |
| No RSS | Near-certain | Assume HTML/PDF polling; RSS is a bonus |
| PDFs | Certain | Text extraction first |
| **Scanned PDFs** | Common in smaller towns | Detect and mark `scanned_unparsed`; OCR as explicit fallback, never default |
| Changed document URLs | High | Store URL + content hash; re-resolve from the agenda page rather than trusting stored links |
| Delayed minutes publication | Certain | Two-phase record: agenda (proposed/heard) → minutes (approved/denied/continued). Status must be updatable |
| Agenda posted before minutes | Certain | Same two-phase model; never infer an outcome from an agenda |
| Site plans inside large packets | Certain | Record `agenda_packet_url` + page anchor when detectable; do not attempt to split packets in the pilot |
| Duplicate reporting (newspaper vs official) | Certain | Official record is canonical; newspaper items attach as `context_urls`, deduped on municipality+address+date |

### B.5 Where should these items land initially?

**Recommendation: `relevant`, with no new section, no scoring change, and no routing change** for the pilot.

Rationale: the `relevant` section is already the home of non-transaction regional context, it already carries the region-named items that survive the final gate, and using it requires **zero** schema change. A dedicated **Regulatory / Approvals** section is **justified only after observed supply volume** — concretely, I would set the bar at **≥3 qualifying municipal records per weekday sustained over 2 weeks** in shadow. Below that, a fifth section would sit empty or near-empty and would *worsen* coverage scoring, since empty controllable sections are charged in the editorial denominator.

### B.6 Test plan

1. **Registry validation** — every municipality resolves; platform detected; board URLs reachable.
2. **Extraction unit tests** — fixture agendas/minutes/packets per platform; assert field extraction; assert scanned-PDF detection.
3. **Two-phase status test** — agenda-only record reads `proposed|heard`; minutes update flips to `approved|denied|continued` without creating a duplicate.
4. **Dedup test** — same application discovered via newspaper + official record collapses to one, official canonical.
5. **Shadow run (2–3 weeks)** — records written, nothing shipped; measure volume/day, industrial-relevant share, false-positive rate, scanned share.
6. **Frozen replay** — confirm byte-identical newsletter output while the lane is shadow-only.
7. **Negative test** — municipal lane disabled/failing must not affect a send.

### B.7 Expected blast radius

- **Pilot (shadow):** near-zero. New files under `docs/municipal/` + a new workflow. **No** change to scoring, routing, dedup, selection, sections, or send. Newsletter output byte-identical.
- **Promotion into `relevant`:** moderate. Municipal records compete for the same capped slots, so they *displace* existing items — that needs the same injection-replay treatment we used for the supply branches.
- **Dedicated section (later):** large. Touches `Section` type, `COVERAGE_WEIGHTS`, supply status, editorial coverage denominator, both fixed-schema CSVs, and the email template. Not recommended until B.5's volume bar is met.

---

## Implementation sequence — strictly separate branches

Each stage is its own branch, reviewed before the next begins. **A and B are deliberately NOT combined**: repair changes what the pipeline ingests, instrumentation changes what we can measure. Bundling them would leave us unable to tell whether a metric moved because a feed was fixed or because measurement changed.

### A. Broken-feed repair — config only

Scope: `Bisnow New Jersey` RSS 404 (primary market, currently dark), `Scraper: Bisnow` timeout, `NJBIZ People-on-the-Move` 404.

- **No scoring, filter, or routing changes.**
- **Verify before configuring:** any replacement endpoint must be fetched and shown to return *usable fresh items* (recent dates, passing the existing gates) **before** it goes into `feeds.json`. No swapping one dead URL for another unverified one.
- For each dead endpoint, explicitly decide and **document** whether to **replace or disable**: if an endpoint is permanently dead but redundant to a healthy Google News proxy already covering that publisher, **disabling with a dated `_note` is the better outcome** than inventing a replacement — it removes a permanently-failing health row and avoids adding fetch load for no yield. (`Bisnow New Jersey` is the live test of this: Bisnow already has 2 working proxies plus National/Philly/SoFla direct feeds.)
- Success criteria: `feed-health.json` failed count drops; no new failing rows; newsletter output unchanged.

### B. Publisher attribution / observability — instrumentation only

- **Additive only. Must NOT overwrite** `source`, `_source.name`, `_source.website`, `feedName`, `url`, or any field used by existing filtering, routing, dedup or the final gate. Several of these are load-bearing (`_source.website` feeds the final gate's trusted-source check; `url` feeds link validation and dedup).
- Derive a **new** diagnostic field (e.g. `resolvedPublisher`) using the existing publisher-name logic, populated from the GNews `" - Publisher"` title suffix when the origin is `news.google.com`.
- Expose a **per-resolved-publisher funnel**: `fetched → ingest-kept → corpus → in-window → final-gate → selected`.
- **Hard acceptance test:** article selection and newsletter HTML **byte-identical** (frozen A/B replay, same method used for every branch this month).

### C. Funnel-collapse investigation — read-only

- Explain the measured collapse: **13,986 raw → 3,986 ingest-kept → 229 corpus → 19 items ≤72h**.
- Attribute each major loss to a **specific stage** (ingest filters, cross-day dedup, staleness pruning, region gate, industrial gate, section gates, caps, final gate) with counts, not estimates.
- **Explicitly out of scope: weakening any quality gate.** A supply problem must not be "solved" by lowering standards — that trade was already rejected when the `LOW_INFORMATION_ARTIFACT` and diversity work stayed narrow. Legitimate outcomes are: fixing bugs, correcting mis-tuned windows, or accepting the loss as intended behaviour and going back to genuine supply.
- Depends on **B** for trustworthy per-publisher attribution.

### D. New York Business Journal

- **After** B and C, so the measurement is trustworthy. **Exception:** the direct feed `feeds.bizjournals.com/bizj_newyork` already exists in `feeds.json` (disabled, domain-approved). If a quick fetch shows it returns usable fresh industrial items, **shadow it first** — that is a trivial, proven, reversible test and is cheaper than waiting.
- Note it is not on `TRUSTED_DIRECT_SOURCES`, so NY items lacking NJ/PA/FL evidence and macro framing will still fail the final gate. Expect genuinely-relevant NY items to be a minority; do not judge it on raw volume.

### E. Municipal intelligence

- Remains a **separate shadow-only project** per §B.3–B.7. **No fifth newsletter section yet** — deferred until the §B.5 volume bar (≥3 qualifying records/weekday over 2 weeks) is met in shadow.
- Independent of A–D; can proceed in parallel, but must not be bundled into any of them.

### Deliberately not recommended yet

- **Do not add Traded.co or South Florida Business Journal capacity.** Both are domain-approved and fetching, and both contribute nothing. More of a source that already yields zero is not a fix; diagnose downstream loss in **C** first.

**Nothing in this document has been implemented.** No feeds added, no classifier or scoring change, no production modification.
