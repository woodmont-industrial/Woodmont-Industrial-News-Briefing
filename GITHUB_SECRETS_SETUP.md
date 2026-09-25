# GitHub Secrets Setup

This repository must never contain live passwords, tokens, webhook URLs,
recipient lists, watchlist rows, or other credentials. Store all sensitive
values in **Settings → Secrets and variables → Actions**.

## Production newsletter secrets

Configure the values used by the existing delivery workflow:

- `WEBHOOK_URL`
- `WEBHOOK_SECRET`
- `EMAIL_TO`
- `SMTP_HOST` (fallback only)
- `SMTP_PORT` (fallback only)
- `SMTP_USER` (fallback only)
- `SMTP_PASS` (fallback only)
- `EMAIL_FROM`
- `NEWSLETTER_RECIPIENTS` (when used by the selected workflow)

Use either the Power Automate webhook or SMTP fallback. Do not paste example
credentials into this guide, commits, issues, workflow logs, or pull requests.

## Capital Markets canary secrets

The gated test workflow uses:

- `CM_CANARY_TO` — one or two approved test recipients only
- `CM_CANARY_SMTP_HOST` — dedicated canary SMTP host; never reuse the production
  Power Automate webhook
- `CM_CANARY_SMTP_PORT` — `587` (STARTTLS) or `465` (TLS)
- `CM_CANARY_SMTP_USER` — dedicated canary SMTP user
- `CM_CANARY_SMTP_PASS` — dedicated canary SMTP password or app password
- `CM_CANARY_EMAIL_FROM` — corporate sender address for the test message
- `CM_WATCHLIST_CSV_B64` — optional gzip-compressed, base64-encoded private
  watchlist, read at runtime and never written to the repository or uploaded
  with the public shadow artifact. Existing uncompressed base64 values remain
  supported, but the compressed form is required when the raw value would
  exceed GitHub's 48 KB secret limit.

Optional repository variable:

- `CM_CANARY_ALLOWED_DOMAINS` — comma-separated approved recipient domains;
  defaults to `woodmontproperties.com`

The canary workflow requires the operator to type `SEND TEST ONLY`, enforces a
maximum of two recipients, adds a prominent test banner, and does not update
production sent-article state. It cannot use `WEBHOOK_URL` or the generic
`SMTP_*` production variables, preventing a production webhook with a
hard-coded audience from turning a test into a department-wide send.

Create a GitHub Environment named `capital-markets-canary`, add at least one
required reviewer, and scope the `CM_CANARY_*` secrets to that environment when
the repository plan supports environment secrets. The job receives `EMAIL_TO`
only under the non-delivery name `CM_PRODUCTION_TO_COMPARE`; code uses it to
reject an exact match with the production destination, including a single
distribution-list alias.

### Encode the private watchlist

The encoder validates the required `Company Name` header, row count, UTF-8
encoding, runtime size limit, and GitHub's 48 KB encoded-secret limit. It emits
the secret value to standard output and reports only counts and byte sizes to
standard error; it never logs company names or domains.

On Windows PowerShell, copy the encoded value directly to the clipboard without
creating an intermediate file:

```powershell
npm run --silent encode:cm-watchlist -- "C:\private\Institutional_Ownership_Watchlist.csv" | Set-Clipboard
```

Paste the clipboard value into the `CM_WATCHLIST_CSV_B64` secret under the
protected `capital-markets-canary` Environment, save it, and then clear the
clipboard:

```powershell
Set-Clipboard -Value ""
```

On macOS, replace `Set-Clipboard` with `pbcopy`. Base64 is transport encoding,
not encryption: never paste the value into a commit, issue, pull request,
workflow input, or workflow log. The decoder recognizes gzip by its standard
magic bytes and refuses invalid base64, invalid UTF-8, or output above 2 MB.

Before pushing a branch that changes Capital Markets code or examples, check
the committed tree and added commit history against the private list:

```powershell
npm run --silent validate:cm-watchlist-privacy -- "C:\private\Institutional_Ownership_Watchlist.csv"
```

The validator reports only counts, file paths, finding types, and private term
indexes. It never prints the matched company name, acronym, or domain.

## Verification

1. Run the **Capital Markets Shadow (No Send)** workflow first.
2. Download and inspect its HTML and JSON artifacts.
3. Configure `CM_CANARY_TO` for the approved reviewers.
4. Run **Capital Markets Canary (Test Recipients Only)** manually.
5. Do not enable production delivery until the required shadow runs and canary
   approvals are complete.

If a real credential was ever committed, removing it from the current file is
not sufficient. Rotate or revoke it at the provider immediately, then clean the
Git history through an approved incident-response process.
