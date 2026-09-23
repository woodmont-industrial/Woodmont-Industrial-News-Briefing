# Capital Markets Newsletter Rollout

Status: **shadow / test-only**. The existing department newsletter and its
scheduled workflow are intentionally unchanged.

## Safe operating rule

No Capital Markets code may send to the department distribution list during
this rollout. A production path is deliberately absent: public configuration
requires `productionEnabled: false`, the shadow workflow has no mail secrets,
and the canary workflow is manual and limited to one or two approved corporate
addresses.

The current production sender remains:

```text
send-only.yml -> rssfeed.ts --send-newsletter-work -> sendDailyNewsletterWork()
```

The isolated Capital Markets paths are:

```text
capital-markets-shadow.yml -> build only -> HTML + JSON artifact
capital-markets-canary.yml -> manual confirmation -> test-only recipients
```

## What can be completed without Jacob

- Keep Sales, Leases, Availabilities, Construction, Market Intelligence,
  Municipal / Entitlement, and optional Competitor Watch as separate sections.
- Apply the confirmed strict-greater-than price and square-footage thresholds.
- Use the confirmed Florida county interpretation and the documented,
  conservative New Jersey Exit 6 proxy.
- Use an independent seven-day, five-item Week in Review and show it in Friday
  delivery only. Keep it visible every day in editor previews.
- Rank by editorial section priority, market tier, magnitude, and recency.
- Collapse exact headline duplicates and only collapse cross-publisher sales
  when amount, canonical geography, timing, and corroborating story identity
  agree.
- Keep the private competitor list runtime-only. It may be supplied to a test
  run through `CM_WATCHLIST_CSV_B64` or a local `WATCHLIST_CSV`; it must never be
  committed or included in the public shadow artifact.
- Enrich missing deal facts only from public page metadata, never by guessing.
  Enrichment remains off until its shadow results are reviewed.
- Customize the public title, daily lookback, item cap, empty-send policy, and
  Week in Review settings in `config/capital-markets-newsletter.json`. The
  public `subject` setting controls the canary subject after the mandatory
  `[TEST ONLY — DO NOT FORWARD]` prefix.

## Mandatory rollout gates

1. **Regression gate:** all Capital Markets suites and the repository's existing
   newsletter regression tests pass.
2. **Shadow gate:** collect at least 10 successful no-send runs. Review the HTML
   and JSON summary for false positives, false negatives, duplicate stories,
   malformed values, and stale input.
3. **Canary gate:** send only to one or two approved `woodmontproperties.com`
   reviewers. The operator must type `SEND TEST ONLY`; the message carries a
   prominent test banner. An empty daily selection is held rather than sent.
   The canary uses a dedicated `CM_CANARY_SMTP_*` transport and has no access to
   the production webhook or generic SMTP variables. Its job runs in the
   `capital-markets-canary` GitHub Environment, which must have required
   reviewers, and it rejects an exact match with the production destination —
   even when production uses one distribution-list alias.
4. **Approval gate:** obtain two explicit approvals based on received inbox
   renders, including mobile and Outlook checks. GitHub's public shadow artifact
   excludes the private watchlist, so the received canary is authoritative when
   a watchlist is enabled.
5. **Cutover gate:** decide whether the Capital Markets briefing is a separate
   email, replaces the existing newsletter, or becomes part of it. Implement a
   new production workflow only after that decision. Do not repurpose
   `send-only.yml` during the trial.
6. **Rollback gate:** retain the existing sender unchanged until the new path has
   completed its trial. A production Capital Markets workflow must have a single
   off switch and independent same-day dedup state before scheduling.

## Fail-closed conditions

Shadow/canary generation stops or holds when any of these apply:

- geography reference files or shared classifier anchors cannot load;
- delivery HTML is incomplete, malformed, over 250 KB, or contains preview
  diagnostics;
- the newest feed refresh exceeds the configured 18-hour freshness limit, the
  feed is empty, its timestamps are invalid, or its newest timestamp is in the
  future;
- a live canary has no qualifying daily items, unless an operator explicitly
  enables the test-only empty-render override;
- confirmation text is missing or wrong;
- dedicated canary SMTP settings are absent, use a non-corporate sender, or use
  a port other than 465/587;
- there are zero recipients, more than two recipients, a non-corporate domain,
  or the canary list equals the production distribution list;
- watchlist inputs conflict, exceed their size/row limits, or lack the required
  company-name column.

## Decisions that still require Jacob or the owner

| Decision | Why it is not inferred |
|---|---|
| Whether Berks County belongs in the Lehigh Valley target tier | The supplied Lee map is not a machine-readable county definition. |
| Exact Philadelphia Metro counties | “Metro” can refer to several incompatible county sets. |
| Exact I-78/81 Corridor and CPA counties | The boundary is visual and stakeholder-specific. |
| New Jersey municipalities that override the Exit 6 latitude proxy | The supplied image has no definitive legend; edge cases need human confirmation. |
| Separate email, replacement email, or appended section | This changes department communications and cannot be inferred from editorial feedback. |
| Final subject line, cadence, and send time | These are communication decisions, not classification rules. |
| Whether official competitor websites may be fetched directly at runtime | The private list can remain secret, but crawl scope, frequency, and acceptable site terms still need an owner decision. |

Until those answers arrive, unresolved Pennsylvania and New Jersey edge cases
stay conservative or unmapped. They are never admitted under an easier guessed
threshold.

## Operator commands

```bash
npm run test:capital-markets
npm run build:capital-markets-shadow
```

The only supported email command is the manual test canary:

```bash
npm run send:capital-markets-canary
```

It must be run through the gated workflow with the documented secrets. Never
set the canary recipient secret to the department list.

## Credential incident note

The repository previously contained a plaintext SMTP credential in the setup
guide. The current file is sanitized, but deleting a value from the latest tree
does not remove it from history. Rotate or revoke that credential before any
new email workflow is approved, then perform history cleanup through the
organization's incident-response process.
