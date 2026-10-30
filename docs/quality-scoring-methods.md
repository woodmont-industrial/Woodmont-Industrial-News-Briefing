# Quality score measurement versions

The shared-geography correction changes how regional credit is measured. It
does not change the component weights, article windows or transaction thresholds.
Scores across that measurement change must not be treated as a continuous
like-for-like quality trend. The October 30 replay's 11-point difference between
the old and corrected scorers is documented in `newsletter-quality-review.md`.

New diagnostics, archive metadata and quality-history entries carry
`scoringVersion: 2026-10-30-shared-geography-v1`. Existing historical entries and
their numeric scores are not rewritten. An absent version means the historic
method was not recorded; it does not imply one uniform earlier algorithm.

The send also writes `docs/quality-score-methods.csv` with columns
`date,runId,scoringVersion`. Historical rows in this lookup are labelled
`legacy-unversioned`. The existing 23-column quality CSV and 38-column daily
logic-impact CSV stay unchanged. Retry handling stages the new lookup and merges
its keyed rows alongside the score history. The lookup covers retained quality
history; older unmatched records should also display `legacy-unversioned`.

## Power BI

After the first production send with this code, import the lookup as a new table.
Until that first send the CSV may not exist. It is served at:

`https://raw.githubusercontent.com/woodmont-industrial/Woodmont-Industrial-News-Briefing/main/docs/quality-score-methods.csv`

Use a left join or relationship from `quality-scores.runId` to lookup `runId`.
For the logic-impact table, use `daily-logic-impact.run_id` to lookup `runId`.
Treat missing lookup values as `legacy-unversioned`. Separate chart series by
scoring version or annotate the first actual production date carrying the new
version. The version's date identifies the code revision, not a deployment date;
do not assume October 30 was the production measurement break.

This repository change makes provenance available. It does not modify the
existing Power BI dataset or report. That model still needs the lookup imported
and its chart configured to show the break.
