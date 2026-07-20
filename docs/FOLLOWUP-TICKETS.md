# Follow-up Tickets

Open engineering items deferred for separate decisions. Each is scoped to be a
standalone change — do not bundle them together or with unrelated fixes.

---

## TICKET-1 — Buyer-HQ pollution in cross-day location signatures

**Status:** open · **Area:** dedup (`src/shared/url-utils.ts`) · **Priority:** medium

**Problem.** `extractCrossDayDedupSignatures` keys on granular *location + metric*.
When a headline names the buyer's home market instead of (or in addition to) the
asset location, the buyer's city is added to the location set and the signature no
longer matches the same deal reported elsewhere.

**Evidence (2026-07-17 → 2026-07-20 Orlando portfolio, ~$56M — same deal):**
- Fri Week-in-Review: "Midtown Capital Partners acquires Orlando industrial portfolio for $56.1M - JLL" → sig `0sf_56m_0ac_orlando`
- Mon Transactions: "**Miami firm** adds to Orlando industrial portfolio with $56M purchase - The Business Journals" → sig `0sf_56m_0ac_miami|orlando`

"Miami firm" injected a `miami` location token → `miami|orlando` ≠ `orlando` → no
cross-day match, so the duplicate shipped. (The state-level sig `56m_state-fl`
*would* have matched but is deliberately excluded from cross-day dedup since the
2026-05-13 over-blocking fix.) Same buyer-HQ theme as the Temecula region leak
(commit 7c95e02) and the Sagard/entity dedup work (commit 9ceeb03).

**Proposed direction.** Strip buyer/owner-HQ descriptors ("Miami firm", "NJ-based
investor", "Florida investor", "<City> firm/investor/group/partners") from the text
BEFORE location extraction in `extractCrossDayDedupSignatures`, so only the asset
location forms the signature. Reuse the buyer-descriptor logic already reasoned
through for the region gate. Validate with a cross-day replay that the Orlando pair
collapses and no distinct FL deals are wrongly merged. **Do not modify dedup yet.**

---

## TICKET-2 — Week-in-Review persistence gap (cross-day dedup state)

**Status:** open · **Area:** send persistence (`src/server/email.ts`) · **Priority:** medium

**Problem.** `saveSentArticles` (email.ts:1575) persists only
`[...relevant, ...transactions, ...availabilities, ...people]`. **Week-in-Review
items are never saved** to `docs/sent-articles.json`, so a deal that appears ONLY in
the Friday Week-in-Review never enters cross-day dedup state (no id, no signature, no
titleKey). A same deal resurfacing the next week is not caught.

**Evidence.** In the Orlando case above the miss was masked — the Midtown item had
also shipped in a Jul 10 daily *section*, so its signature was persisted then (still
inside the 14-day window). But a WiR-only deal has no such backstop.

**Proposed direction.** Include Week-in-Review items when building the sent-articles /
signature payload passed to `saveSentArticles` (ids + sigs + titleKeys), so they enter
cross-day dedup state. Must NOT affect rendering (WiR still displays) or scoring (WiR
is not part of the quality score). Guard against inflating the 30-day sent-id set in a
way that would suppress legitimate re-coverage. **Do not modify dedup/persistence yet.**

---

## TICKET-3 — Publisher-suffix region false positive ("- Real Estate NJ")

**Status:** open · **Area:** region gate (`src/server/newsletter-filters.ts`) · **Priority:** medium

**Problem.** `isTargetRegion` treats the trailing " - <Publisher>" suffix as content.
A national story from an NJ trade publication passes the region gate on the publisher
name, not the deal location.

**Evidence.** "Gutman joins Cresa as managing principal, head of structured finance for
data center group **- Real Estate NJ**" → `isTargetRegion` = true because "NJ" appears
in the publisher suffix "Real Estate NJ". Cresa is a national tenant-rep firm; the move
is not NJ-specific. Exposed while validating the People rescue (2026-07-20): adding
`'joins'` to `PEOPLE_ACTION_KEYWORDS` let this item into People every day.

**Proposed direction.** Strip the trailing " - <Publisher>" suffix (Google News style)
before region-token detection in `isTargetRegion` (and the other region gates), so a
publisher name like "Real Estate NJ" / "ROI-NJ" / "RE-NJ" can't inject a region token.
Validate no legitimate NJ/PA/FL item loses its region evidence.

**Dependency.** **Hold `'joins'`** (do NOT add it to `PEOPLE_ACTION_KEYWORDS`) until
this region-evidence bug is fixed — otherwise `'joins'` re-admits the publisher-NJ
Gutman daily.
