# Newsletter selection and summary repair

This branch consolidates the pending summary-context and editorial-review work
with shared geography and bounded publisher fact recovery. It keeps the existing
article windows and transaction floor; it adds no seven-day or fourteen-day
editorial cutoff and removes the inline age-warning labels.

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
the two archived issues before applying changes. A separate CI check fetches only
the approved public releases through the production page loader and verifies
that the recovered facts reach Transactions. This check uses no provider or
delivery credentials and uploads no artifacts. The existing provider smoke test
is unchanged; real model reclassification of this branch remains a distinct check.

Review the changed article IDs and section placements, not only the aggregate
score. Missing source facts, cross-publisher repeats and thin sections can still
limit an issue. This branch does not enable Capital Markets production, change
the scheduler or recipients, or send a newsletter during validation.
