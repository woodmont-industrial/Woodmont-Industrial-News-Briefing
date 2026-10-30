# Newsletter selection and summary repair

This branch consolidates the pending summary-context and editorial-review work
with shared geography and bounded publisher fact recovery. It keeps the existing
article windows and transaction floor; it adds no seven-day or fourteen-day
editorial cutoff and removes the inline age-warning labels.

## October 30 rendered-email correction

The production-code replay reproduces all seven daily article IDs and the
84 overall / 81 editorial scores from the October 30 send. At the earlier PR head,
the same inputs produced nine items and 80 / 77. That replay showed that the
previous listing rule still accepted a plain "warehouse for lease" headline as
a completed transaction, and three non-story items survived the final email.

The correction now:

- Recognizes explicit property offers in the headline before the SF/deal bypass.
  The build, feed reader, manual queue and reserve preparation share this rule.
  Completed deals keep precedence; a body-only mention of another available
  space cannot relocate a financing story.
- Rejects catalog landing pages without a specific property, stock-price
  headlines without a property event, and the demonstrated opposition headline.
  The guards cover normal selection, fallback, manual and weekly output. They
  preserve genuine listings, national industrial analyses and completed deals.
- Uses the shared geographic resolver in regional scoring instead of a second
  compact city list. Existing weights and macro partial credit are unchanged;
  explicit conflicting city qualifiers still fail. Verified property-location
  citations use the existing fact contract. Past score records are not rewritten.

The corrected October 30 replay has four Relevant items, two Transactions, one
Availability and no People item, plus five recap selections. The listing no
longer reaches Transactions; the catalog, stock and opposition items are absent.
The real report and manufacturing-lease story remain, and the recovered regional
sale and construction announcement render. This does not claim more People supply.

| October 30 offline replay | Daily items | Overall | Editorial |
| --- | ---: | ---: | ---: |
| Production code | 7 | 84 | 81 |
| Previous PR code | 9 | 80 | 77 |
| Corrected selection, old scorer | 7 | 73 | 70 |
| Corrected selection, shared region scorer | 7 | 84 | 81 |

The 11-point scoring difference on the last two rows is a measurement correction,
not an 11-point claim about better writing. The substantive evidence is the
changed article IDs and placements. All comparisons use stored text/verdicts,
with live AI and delivery disabled, so they are not provider-quality validation.
New results record their scoring version, with a separate method lookup for
Power BI and unchanged historical numeric scores. See `quality-scoring-methods.md`.

Local verification: 33 functional suites, three synthetic feed/reserve/manual
rendered paths, and archived-input replays for October 27, 28 and 30. Historical
replays are counterfactual evaluations of stored data, not replacements for the
original delivered scores. CI runs the new regressions and all three replays.

## Geography and routing

Early filtering, the final email gate and the last scrub call the same region
resolver. City matching uses whole phrases; explicit out-of-state qualifiers
override shared city names, including possessive prefixes such as
"Colorado's Lakewood", and state abbreviations need location context. Bare,
unqualified aliases keep the existing newsletter policy; the resolver is not
a comprehensive city-disambiguation service.
A company's home location cannot
relocate an explicitly out-of-state property. A verified portfolio location may
establish NJ/PA/FL coverage when other properties are in different US markets.
This does not change Capital Markets geography tiers or national-deal policy.

Construction starts, completions and announced warehouse expansions enter
Relevant under the current four-section email layout. They are not advertised
as available space. Known spaces at or below the smallest 15,000-SF availability
boundary fail the availability gate, including fallback and manual paths.

## Publisher facts

Fact recovery runs before build-time geography, section predictions and AI review.
It reads direct approved publisher URLs, or independently verified canonical
references keyed to an existing article ID. The two initial references in
`src/feeds/article-source-references.json` repair observed cases; they are not a
general Google News URL decoder or a new source-discovery service. Opaque proxies
without an approved reference stay unchanged.
Each reference may name an independently verified public distribution copy. A
refused origin remains on cooldown; the alternate must separately pass the same
domain, page-topic and factual-evidence checks.

Limits per build: six candidate pages, 45 seconds total, 1 MB per page and at most
two redirects per page. Every redirect must remain HTTPS on an approved publisher
domain; credentialed URLs, private DNS addresses and unapproved hosts fail. A
publisher refusal is not bypassed. Approved public page text must match the
article topic. Extraction excludes navigation and company boilerplate and declines
ambiguous areas/prices rather than selecting the largest number. Market-wide
leasing statistics are not attached as a property's area. The extractor's cache
version prevents reuse of entries accepted by the older parser.

Only compact evidence and its public source URL reach the feed. Raw HTML stays
out of the repository. The ignored cache holds at most 200 entries: successful
facts last seven days; failed attempts cool down for one day. The existing build
workflows restore this cache. Rebuilding replaces the fact suffix instead of
appending it repeatedly. Network failures leave the original feed facts intact.

Coverage is measured separately from these two reference repairs. The public
CI replay audits the entire stored feed with an empty reference list, then with
the configured references. It reports eligible candidates, approved direct
paths, unresolved proxy/direct links, cached/deferred pages, real HTTP attempts,
and final rendered sections. Eligibility means a candidate needs facts, not that
it qualifies for the newsletter. The two curated references do not demonstrate
automatic discovery of tomorrow's proxy URLs.

## Editorial and summary behavior

Relevant uses one editorial verdict gate across initial selection, all backfill
and refill paths, reserves, manual inclusion and the regional-deal router. People
and Availabilities retain their advisory AI policy. Opposition-led data-center
headlines and explicit service/equipment-company acquisitions also have narrow
deterministic guards for previously unreviewed copies.

Rubric version `2026-10-28-v4` distinguishes publisher research from listings,
property geography from company offices, and the actual 50K-SF/$10M Transactions
floor from smaller regional coverage. The existing four-minute model budget
prioritizes legacy rejections; incomplete or failed calls preserve their prior
verdict and provenance. A build is not claimed to have refreshed every article
unless its classification counts prove that.

Summary quantities are compared by value and unit. The prompt supplies internal
publication context, preserves event status and uses examples with no invented
source facts. This is not proof that every nonnumeric generated claim is correct.

## Verification and release

Regression tests exercise the actual rendered daily and Friday email pipelines
with all network/delivery transports blocked. Fixed-input comparisons reproduce
the three archived issues before applying changes. A separate CI check fetches only
the approved public releases through the production page loader and verifies
that the recovered facts reach Transactions. This check uses no provider or
delivery credentials and uploads no artifacts. The existing provider smoke test
is unchanged; real model reclassification of this branch remains a distinct check.

Review the changed article IDs and section placements, not only the aggregate
score. Missing source facts, cross-publisher repeats and thin sections can still
limit an issue. This branch does not enable Capital Markets production, change
the scheduler or recipients, or send a newsletter during validation.
