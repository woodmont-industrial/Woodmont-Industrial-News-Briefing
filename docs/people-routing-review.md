# People routing review

This change is prepared on top of PR #34. Both remain proposals until merged.
The People career gate calls `hasNewsletterTargetRegion`; there is no separate
career city list. The shared resolver excludes place tokens inside identified
career names and does not treat Mid-Atlantic as Atlantic County.

Negative controls include Elizabeth Chen, Easton Reed, Edison Vale, Linden Bell,
county-like surnames, accented names and curly apostrophes. A separate New Jersey,
Pennsylvania or Florida location still counts. Existing bare-city coverage is
preserved for property/location wording; this is not a blanket requirement for
every town to carry a state suffix.

## Thirty-day source-pool comparison

Window: September 30 through October 29, 2026, inclusive. The manifest identifies
22 pre-send feed snapshots, each taken from the parent of that day's committed
send. This avoids afternoon rebuilds overwriting a health-history row.

The same frozen articles are evaluated under PR #34 and this proposal. This is a
counterfactual comparison of rules, not a claim that those rules or scores were
deployed on every historical day.

| Measure | Result |
| --- | ---: |
| Pre-send snapshots | 22 |
| Article occurrences across snapshots | 4,827 |
| Distinct article IDs | 471 |
| Distinct People-filter decisions changed | 8 |
| People-eligible occurrences, before / after | 30 / 30 |
| Previously eligible People article IDs lost | 0 |
| Newly eligible People article IDs | 0 |
| Automatic section-category changes on this pool | 0 |

All eight changed filter decisions involve `adds`: seven property/company
announcements and one national professional-credential announcement. None passes
the full existing regional People criteria before or after. The credential story
is personnel-related, but this proposal does not introduce a national exception.

Eligibility here includes publication-date validity, the existing thirty-day
window, region, People action/routing and the final industrial check. It precedes
sent-history suppression, deduplication and section caps. Thirty occurrences are
not thirty separate moves; the same article can appear in several snapshots and
different publishers can report the same hire.

## Final rendered-email comparison

Each comparison uses identical pre-send feed, history, queue, reserve, exclusions,
weights and supporting data. The clock is fixed at 08:00:20 Eastern on each date.
AI and delivery credentials are absent and network/delivery transports are
blocked. The figures below compare PR #34 with PR #34 plus this People change;
they are not a table of historical delivered scores.

| Frozen date | Relevant before → after | Transactions before → after | Availabilities before → after | People before → after |
| --- | ---: | ---: | ---: | ---: |
| October 22 | 4 → 4 | 4 → 4 | 1 → 1 | 1 → 1 |
| October 23 | 6 → 6 | 3 → 3 | 1 → 1 | 1 → 1 |
| October 26 | 6 → 6 | 1 → 1 | 1 → 1 | 0 → 0 |
| October 27 | 5 → 5 | 1 → 1 | 1 → 1 | 0 → 0 |
| October 28 | 6 → 6 | 1 → 1 | 1 → 1 | 0 → 0 |
| October 29 | 4 → 4 | 4 → 4 | 1 → 1 | 0 → 0 |

All article IDs, section assignments and Friday review selections match, with
zero network calls. Synthetic rendered-email tests separately prove the intended
recovery when a qualifying but misclassified hire is supplied.

## Reproduce

With dependencies installed and full git history available:

```sh
node scripts/audit-people-history.cjs
node --import tsx src/server/people-career.test.ts
node --import tsx src/server/newsletter-geography.test.ts
```

The audit defaults to PR #34's reviewed head. CI supplies its actual base SHA,
reads the same frozen git objects and runs the six final-email comparisons. It
prints aggregate counts only and uploads no source pools or email artifacts.
The fixture manifest contains dates and commit IDs, not article text or watchlist
inventories. Stacked PRs receive the same non-sending CI checks; live provider
smoke-test permissions are unchanged.

This evidence covers retained source pools. It cannot establish recall for
stories never collected, and it shows no new content on those pools. CPE weekly
entry collection, direct newsroom onboarding and mixed-region role coverage
remain separate work. No new age cutoff, threshold or national exception is added.
