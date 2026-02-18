# Newsletter User Choice Interface & Guardrails Proposal

## Problem Statement

The newsletter is being shared with coworkers at a CRE firm. The backend filtering pipeline (89+ feeds, classifier, regional/political/industrial filters, AI filter, exclude/include lists) works well. However, the frontend newsletter UI lacks guardrails and editorial controls:

- **No empty-newsletter protection**: Nothing stops you from sending a newsletter with 0 articles
- **No send confirmation**: Clicking "Send" fires immediately with no review step
- **No per-article control**: You can't remove a single bad article from the preview before sending
- **No recipient validation**: Plain textarea, no email format checking, no persistence across sessions
- **No double-send protection**: Clicking Send twice sends two emails
- **No send audit trail**: No record of what was sent, when, or to whom

## Proposed Changes

### 1. Minimum Article Threshold Gate

After generating the newsletter, count articles per section. If 0 total articles: block sending entirely with a clear message. If < 3 articles: show a warning banner suggesting a wider timeframe.

**Pros:**
- Prevents the most embarrassing scenario (empty email to coworkers)
- Zero UI complexity — just a conditional message
- Fast to implement

**Cons:**
- Threshold of 3 is arbitrary — may need tuning
- Could be frustrating if user intentionally wants a short update

---

### 2. Pre-Send Confirmation Dialog

Replace the direct-send button with a two-step flow: click Send → see a confirmation modal → confirm or cancel. The modal shows article count breakdown by section, recipient list, and flags invalid emails.

**Pros:**
- Standard UX pattern everyone understands
- Shows exactly what will be sent and to whom in one glance
- Catches bad email addresses before the API call
- Very effective at preventing accidental sends

**Cons:**
- Adds one extra click to every send (minor friction)
- Modal UI needs to be responsive and match the existing design

---

### 3. Per-Article Toggle in Preview

Add an "Edit Articles" view alongside the iframe preview. Each article gets a checkbox; unchecking removes it from the newsletter. "Select All / Deselect All" per section. Regenerate button rebuilds HTML from checked articles only.

**Pros:**
- Gives full editorial control — remove one bad article without excluding it forever
- Per-session action, doesn't pollute the team exclude list
- Users can curate exactly what their coworkers see
- Section-level controls (deselect all in a weak section) are handy

**Cons:**
- Most complex change — requires storing article arrays in state and re-rendering
- Two views to manage (preview iframe vs. edit list) could confuse first-time users
- If user unchecks too many articles, they might send a nearly-empty newsletter (mitigated by Part 1 threshold)

---

### 4. Recipient Management (Chip Input + Persistence)

Replace the plain textarea with a tag/chip-style email input. Each email becomes a removable chip with format validation. Persist recipients to server preferences so they survive across sessions and browsers.

Also move the recipient input from the AdminPanel tab into the Newsletter tab — users should see recipients alongside the preview.

**Pros:**
- Visual email chips are easier to scan than a comma-separated blob
- Immediate validation catches typos (e.g., `john@companycom`)
- Server persistence means recipients don't need to be re-entered on every device
- Collocating recipients with the preview is more intuitive

**Cons:**
- Chip input is more code than a textarea
- Moving recipients out of AdminPanel changes the current layout — may need to update the Admin tab to show "Recipients configured in Newsletter tab"
- Server persistence adds a GitHub API write (though it piggybacks on existing debounced save)

---

### 5. Send Rate Limiting (Client-Side Cooldown)

After a successful send, disable the Send button for 60 seconds with a countdown. On page load, check if a newsletter was sent in the last 5 minutes and maintain the cooldown. Stores `lastNewsletterSent` timestamp in server preferences.

**Pros:**
- Prevents the classic double-click / accidental re-send
- Visible countdown reassures user the first send worked
- Simple to implement (one `setInterval` + one preference field)

**Cons:**
- Client-side only — a determined user could bypass via dev tools (acceptable for a trusted team)
- 60-second cooldown might feel long if user legitimately needs to re-send (e.g., fixed a typo)
- Does not prevent a different user from sending simultaneously (unlikely given small team)

---

### 6. Send History Log

After each successful send, log `{ sentAt, articleCount, recipientCount, timeframeDays }` to server preferences. Show last 5 entries in a collapsible panel in the Newsletter tab. Cap at 20 entries.

**Pros:**
- Auditability — "Did I already send today?" is answered at a glance
- Helps avoid duplicate sends even beyond the cooldown window
- Tiny data footprint (20 entries max)

**Cons:**
- Only tracks sends from the frontend — server-side `newsletter-work.ts` sends are not captured here
- No link to the actual HTML that was sent (would balloon storage)
- Minimal standalone value — most useful in combination with the other changes

---

## Files to Modify

| File | Changes |
|------|---------|
| `docs/index.html` | All 6 parts: stats tracking, confirmation dialog, article toggles, recipient chips, rate limit, history |
| `docs/js/utils.js` | Add `newsletterRecipients`, `lastNewsletterSent`, `newsletterHistory` to server prefs |

## Suggested Implementation Order

| Priority | Part | Effort | Impact |
|----------|------|--------|--------|
| 1 | Minimum article threshold | Low | Prevents empty newsletters |
| 2 | Pre-send confirmation dialog | Medium | Prevents accidental sends |
| 3 | Send rate limiting | Low | Prevents double-sends |
| 4 | Per-article toggles | High | Full editorial control |
| 5 | Recipient management | Medium | Better UX + persistence |
| 6 | Send history log | Low | Auditability |

Parts 1-3 are the critical guardrails (low-medium effort, high safety impact). Parts 4-6 are quality-of-life improvements.

## Overall Pros & Cons

### Overall Pros
- Addresses every known gap in the send flow
- Incremental — each part works independently, can ship in stages
- No backend changes needed (all frontend + existing server prefs)
- Small team context means client-side guards are sufficient
- Follows existing code patterns (React state, server prefs via GitHub API)

### Overall Cons
- Adds ~300-500 lines to an already large `index.html` (~2600 lines)
- Per-article toggle (Part 3) is the most complex and may need iteration
- All guardrails are client-side — `newsletter-work.ts` server path has its own separate protections
- Chip input (Part 4) replaces a simple textarea — slightly higher maintenance surface
- Send history only covers frontend sends, not automated server sends
