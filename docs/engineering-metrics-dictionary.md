# Engineering metrics — data dictionary

Three append-only datasets track production logic changes and their per-send impact.
All values are reproducible from git, tests, replay configs, `docs/quality-scores.csv`,
the per-send diagnostics, and the daily `docs/feed.json` build. No placeholders — unknown
historical values are left **blank** and explained here.

## docs/engineering-changelog.csv — one row per standalone production logic change
Auto (git/tests/CI/replay): `date, commit_sha, files_changed, lines_added, lines_removed,
test_suite, tests_added, ci_checks_passed, implemented_date, historical_items_reviewed/affected,
false_positives_found, live_occurrences_blocked, replay_dates`.
Manual annotation: `change_name, change_type, component, bug_class, issue_found_date,
editorial_outcome, risk_level, notes`.
- `validation_level` ∈ {unit-tested, replay-validated, production-observed} — highest level reached.
- Score transitions are **not** stored here — see engineering-validations.csv.
- `historical_items_*` are blank for office-led / People / DC because those replay counts were not
  re-run in the session that built this file (cite the commit + test suite instead).

## docs/engineering-validations.csv — one row per (commit, replay date)
Each frozen-replay validation is its own row (e.g. the buyer-HQ commit has separate 07-02 and 07-30
rows). `score_*` are from the **frozen replay**; where a production `quality-scores.csv` baseline
differs (AI descriptions enriched at send time), the note records it (buyer-HQ 07-02: replay 77→89
vs prod-CSV 70→82 — same +12). `run_id` is blank (replays use synthetic run ids).

## docs/daily-logic-impact.csv — one row per production send
- Auto from `quality-scores.csv`: `score, grade, coverage_score, freshness_score, supply_condition,
  penalty_total, articles_shipped`.
- Auto from the per-send diagnostic archive: `relevant/transactions/availabilities/people_count,
  dc_policy_rejected`.
- Auto from that day's `feed.json` build: `articles_ingested, total_excluded, tag_artifacts_blocked,
  roundups_blocked, category_stubs_blocked, office_items_blocked, listing_events_rerouted`
  (0 before a given filter went live — historically accurate, not missing data).
- `logic_version_sha` / `production_commit_sha`: the production logic commit live at send time
  (derived from commit timestamps vs the send timestamp).

### Fields left BLANK in historical rows (and why)
- `near_duplicates_suppressed`, `people_items_rescued`, `cross_day_pool_repeats_suppressed`,
  `false_leak_penalties_prevented` — emitted by the `logicImpact` diagnostics counters added in
  commit `82bead7` (2026-08-05). They **populate from the next send onward**; earlier sends never
  recorded them, so they are blank rather than back-computed.
- `out_of_region_rejected` — derivable from the send `rejectionReasons`
  (EXCLUDED_NON_TARGET_REGION + PRIMARY_LOCATION_NON_TARGET + NO_TARGET_REGION_EVIDENCE); left blank
  in this backfill sample, populated going forward.

### `cross_day_pool_repeats_suppressed` — IMPORTANT definition
> Number of previously-sent records removed from the **full loaded candidate pool** by cross-day
> dedup, **before** any region, property-type, section, or selection filtering.

This is a dedup **workload** metric (load-stage volume — typically 100+/day on a rolling feed).
It is **NOT** a count of duplicate articles that would otherwise have shipped. A candidate-stage or
selection-stage "would-have-shipped" duplicate-impact metric is intentionally **not** included yet;
revisit only if a dashboard needs it. (Dashboard tooltip must carry this same distinction.)
