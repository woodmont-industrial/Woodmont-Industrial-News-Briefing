# External Scheduler Contract — newsletter build and send

**Status:** contract defined, tests in place. The external caller itself is
configured outside this repository (Power Automate, cron-job.org, or any
HTTPS client) and is **not yet live** as of 2026-09-21.

---

## Why this exists

The pipeline cron, the send cron, and the watchdog cron **all depend on GitHub's
`schedule` event**. GitHub deprioritises `schedule` for this repository: events
arrive hours late or are dropped entirely. Because every recovery layer is
triggered by the same mechanism, a scheduler-wide delay disables all of them at
once.

That is exactly what happened on **Monday 2026-09-21**: `newsletter-pipeline.yml`
never ran, so no `workflow_run` recovery event was produced; the send crons never
arrived; the watchdog crons never arrived. Nothing was broken in the repository —
the whole class of trigger simply did not fire, and the day needed a manual
`workflow_dispatch`.

`repository_dispatch` and `workflow_dispatch` are **not** subject to that
deprioritisation. They fire within seconds. So the fix is to move the *timing*
off GitHub and keep GitHub's schedules purely as backstops.

---

## Layer model

| Layer | Trigger | Timing | Role |
|---|---|---|---|
| 1 | `repository_dispatch` from the external scheduler | 6:15 AM ET build, 7:30 AM ET send | **PRIMARY** |
| 2 | `schedule` crons in `newsletter-pipeline.yml` / `send-only.yml` | fire early, arrive late | fallback |
| 3 | `workflow_run` chain (send fires when the build completes) | after build | fallback |
| 4 | `newsletter-watchdog.yml` auto-dispatch | 7:30 / 8:00 / 8:30 AM ET | last resort |

**Layers 2–4 are deliberately retained.** If the external scheduler dies, the
day still delivers — late, but it delivers. Tests
(`fallback intact: …` in `.github/scripts/gate-tests.mjs`) assert this.

---

## What the external caller must send

Two POSTs per weekday to the GitHub `repository_dispatch` API.

```
POST https://api.github.com/repos/woodmont-industrial/Woodmont-Industrial-News-Briefing/dispatches
Accept:        application/vnd.github+json
Authorization: Bearer <TOKEN>
Content-Type:  application/json
```

| Time (America/New_York) | Body | Workflow triggered |
|---|---|---|
| **06:15**, Mon–Fri | `{"event_type":"build-feed"}` | `newsletter-pipeline.yml` (Newsletter Pipeline (Build Only)) |
| **07:30**, Mon–Fri | `{"event_type":"send-newsletter"}` | `send-only.yml` (Send: Newsletter Only) |

Both `event_type` values already exist in the workflows — no workflow changes
were needed to enable this:

- `newsletter-pipeline.yml` → `repository_dispatch: types: [build-feed]`
- `send-only.yml` → `repository_dispatch: types: [send-newsletter]`

A successful call returns **HTTP 204 No Content** with an empty body. It does
**not** tell you whether the workflow succeeded — only that the event was
accepted. Treat any non-204 as a failure and retry (see *Retries* below).

### Token

A fine-grained PAT scoped to **this repository only**, with:

- **Contents: read and write** (the send commits `sent-articles.json`)
- **Actions: read and write**

Store it in the scheduler's secret store. **Never commit it.** If it leaks,
revoke it immediately — a `repository_dispatch` token can trigger a real send
to real recipients.

---

## Why 6:15 and 7:30

- **06:15 build** — leaves ~75 minutes for scrapers, gap assessment, RSS build
  and the commit to land before the send reads `feed.json`. The build typically
  takes 5–15 minutes, so this is generous headroom, not a tight coupling.
- **07:30 send** — the target delivery time.

The build completing at ~6:20 also fires the layer-3 `workflow_run` chain, which
**cannot** deliver early: `workflow_run` is an automated trigger and is held by
the 7:15 AM ET delivery floor. Test:
`6:15 ET build completion -> workflow_run held by the 7:15 floor`.

### The build staleness gate and the external dispatch

`newsletter-pipeline.yml` skips when a build already succeeded **less than 2
hours ago**, to avoid redundant builds. That gate is kept for `schedule` runs,
but a `repository_dispatch` now bypasses it.

Without the bypass the design would be primary in name only: GitHub's lagged
pipeline crons (which fire at 2:55–3:55 ET but *arrive* late) can land a build
anywhere in the 5:00–6:14 ET range, and that would silently suppress the 6:15
external build — so the 7:30 send would go out on whatever content the lagged
cron happened to produce, at whatever time it happened to run. The whole point
of the external clock is that the pre-send refresh happens at a known time.

Cost of the bypass: on days when a lagged cron build lands shortly before 6:15,
two builds run ~30 minutes apart. `concurrency: { group: newsletter-build }`
serialises them, so they queue rather than conflicting on the git push. Tests:
`build: scheduled run with a build 35 min ago -> staleness gate SKIPS (unchanged)`
and `build: external repository_dispatch with a build 35 min ago -> RUNS anyway`.

---

## Safety properties (all test-asserted)

These are enforced by the gate in `send-only.yml`, extracted and executed
verbatim by `.github/scripts/gate-tests.mjs`.

1. **The external send bypasses the 7:15 delivery floor.** The floor applies
   only to `schedule` and `workflow_run`. A deliberate trigger
   (`repository_dispatch`, `workflow_dispatch`) is exempt, so a 7:30 dispatch
   delivers at 7:30 rather than waiting for a lagged cron.

2. **The external send does NOT bypass the sent-today dedup.** Only the
   `force_send: true` input on a manual `workflow_dispatch` does that. So a
   retrying or double-firing external scheduler cannot double-send.

3. **Every fallback stands down once the external send lands.** A late
   `workflow_run`, a late `schedule`, and the watchdog all read
   `docs/sent-articles.json` and skip when `lastSendDate === today` (or any
   legacy `sent[].sentAt === today`).

4. **Concurrency.** `send-only.yml` uses
   `concurrency: { group: send-newsletter, cancel-in-progress: false }`, so a
   second send run queues behind the first rather than racing it. The queued
   run re-reads `sent-articles.json` after the first has committed, and skips.
   This is what closes the read-then-write window between two near-simultaneous
   triggers.

---

## Caller responsibilities

- **Fire Monday–Friday only.** A `repository_dispatch` is treated as a
  deliberate act and is **not** weekend-gated — only automated triggers are.
  An external scheduler configured to run 7 days a week **will send on
  Saturday and Sunday.** Both Power Automate recurrence and cron-job.org
  support weekday-only schedules; use them.
  (Asserted by the test
  `weekend repository_dispatch is deliberate -> proceeds`.)

- **Use America/New_York, not UTC.** Configure the scheduler in ET so the
  times track the EDT/EST transition automatically. The workflows' own crons
  are already timezone-aware; the external caller must be too, or it will drift
  an hour in November.

- **Retries.** On a non-204 response, retry up to 3 times with backoff. A
  duplicate dispatch is harmless (property 2), so retrying is always safe.

- **Do not assume delivery.** A 204 means the event was accepted, not that the
  newsletter went out.

---

## Verifying it works

After the external scheduler goes live, confirm on the first weekday:

1. `gh run list --workflow=newsletter-pipeline.yml --limit 3` — the 6:15 run
   should show `event: repository_dispatch`, started within a minute of 6:15 ET.
2. `gh run list --workflow=send-only.yml --limit 3` — the 7:30 run should show
   `event: repository_dispatch`.
3. `docs/sent-articles.json` → `lastSendDate` equals today.
4. `docs/newsletter-archive/<today>.html` exists.
5. The later cron and watchdog runs should appear as **skipped**
   ("Already sent today"), not as additional sends.

If step 2 shows `event: schedule` or `workflow_dispatch` instead, the external
clock did **not** fire and a fallback layer covered for it — investigate the
scheduler rather than the repository.

---

## Running the tests

```
node .github/scripts/gate-tests.mjs
```

Extracts the real `script:` blocks from `send-only.yml` and
`newsletter-watchdog.yml` and runs them against mocks with a frozen clock, so
the code under test is the exact text GitHub executes. The
`EXTERNAL SCHEDULER CONTRACT` section covers the five required scenarios plus
fallback-intact and legacy-state cases.

---

## Known limitation

The sent-today comparison uses the **UTC** date
(`new Date().toISOString().split('T')[0]`), while the floor and weekend gates
use **America/New_York** wall-clock. For a 6:15–8:30 AM ET operating window the
two always agree (ET morning is the same calendar day in UTC). A send attempted
after 8:00 PM ET would compute tomorrow's UTC date and could bypass the dedup.
This is out of scope for this change and is recorded here rather than silently
altered; it only becomes reachable if the delivery window ever moves to the
evening.
