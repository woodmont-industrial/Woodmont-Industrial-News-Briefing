# Newsletter Archive

Every send writes the **exact HTML it generated** here, plus a metadata sidecar. This is
the ground truth of what GitHub produced — inspect it even if Gmail / Power Automate alters
the email downstream. Written on every run (success or failure); retained for the last 90 sends.

## Files
- `YYYY-MM-DD.html` — the newsletter HTML for that day's send
- `latest.html` — a stable copy of the most recent send's HTML
- `YYYY-MM-DD.json` / `latest.json` — metadata sidecar:

```json
{
  "date": "2026-07-06",
  "githubRunId": "28796500499",
  "generatedAt": "2026-07-06T13:50:06Z",
  "sentToRelay": true,
  "articleCount": 5,
  "score": 54,
  "grade": "F",
  "triggerEvent": "workflow_dispatch",
  "isFriday": false,
  "subject": "Woodmont Industrial Partners — Daily Industrial News Briefing"
}
```

- `sentToRelay` — did the send to the Power Automate webhook / SMTP relay succeed (before anything downstream).
- `triggerEvent` — `schedule` (normal cron), `workflow_dispatch` (manual), `workflow_run` (auto-recovery), or `repository_dispatch`.
- `score` / `grade` — the quality score for that send (same as `docs/quality-scores.csv`).

Populated starting with the first send after 2026-07-06. Written by `sendDailyNewsletterWork` in `src/server/email.ts`; committed by `.github/workflows/send-only.yml`.
