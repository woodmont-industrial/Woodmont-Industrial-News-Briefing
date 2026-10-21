# Social-source pilot — setup (local machine only)

A 30-day test of whether developer, brokerage and municipal accounts on X, Instagram and Facebook surface qualifying developments that the scanner and newsletter feed miss. Collection and evaluation run on an approved local host; private data is never written to the repo or published to the website. GitHub runs the validation and reader-installation checks described below.

## What can run through GitHub

The `Social Pilot Checks` workflow runs the classifier fixtures, privacy checks,
and installation/help checks for the pinned readers on an Ubuntu runner. It runs
on pushes to this pilot branch and pull requests targeting either the scanner
branch or `main`; the general CI workflow only covers pull requests to `main`.
It receives no social credentials or account list and uploads no posts or reports.
This proves tool installation and command startup on Linux, not live collection.

The `collect`, `evaluate` and `status` commands remain local-only. A hosted runner
does not inherit the dedicated Chrome profile, extension or logged-in Facebook
and Instagram sessions. X can technically use explicit dedicated-account
credentials on another approved host, but the current pilot does not include a
cloud collection mode or a private destination for its account list and reports.
Do not put those files in this public repository or a public Actions log.

## Ground rules
- **Dedicated accounts only.** Use new X, Instagram and Facebook accounts made for this. Never your personal or Woodmont accounts: these readers use logged-in sessions, and the platforms can restrict accounts they detect doing so.
- **Separate Chrome profile.** The OpenCLI extension can read the cookies of the Chrome profile it's installed in. Install it **only** in a new profile signed in to the dedicated Instagram and Facebook accounts. Never install it in the profile you use for Woodmont 365, GitHub or anything else.
- **Read-only.** The collector runs exactly three read commands (`scripts/social-pilot.ts` → `READ_COMMANDS`). Both tools also offer posting, liking and following; the pilot never calls them.
- **Low and slow.** Run collection at most once a day. If a tool reports 429, a challenge or "login required", stop for the day and sign in again in the pilot profile. Don't retry in a loop.

## 1. Private directory
Create `%USERPROFILE%\.woodmont-social\`, or set `WOODMONT_SOCIAL_DIR` to another folder **outside** the repository. Copy `scripts/social-pilot/accounts.example.json` there as `accounts.json`, then replace the entries with the 10–15 pilot accounts:
- `domains`: the account owner's own website. Only a linked announcement there can verify a post.
- Facebook `handle`: the page name exactly as it appears as a post author. The dedicated Facebook account must **follow** each page, because the pilot reads that account's feed.

## 2. Tools, pinned and isolated
```powershell
# X reader, in its own virtual environment
py -m venv $env:USERPROFILE\.woodmont-social\tools\venv
& $env:USERPROFILE\.woodmont-social\tools\venv\Scripts\python.exe -m pip install twitter-cli==0.8.5
# OpenCLI, local prefix, install scripts skipped (they only write shell completions)
npm install --prefix $env:USERPROFILE\.woodmont-social\tools @jackwener/opencli@2.0.2 --ignore-scripts
```
Point the pilot at them (once per shell, or in your profile):
```powershell
$env:SOCIAL_TWITTER_BIN = "$env:USERPROFILE\.woodmont-social\tools\venv\Scripts\twitter.exe"
$env:SOCIAL_OPENCLI_BIN = "$env:USERPROFILE\.woodmont-social\tools\node_modules\.bin\opencli.cmd"
```

## 3. X (dedicated account)
Sign in to x.com with the dedicated account **in the pilot Chrome profile**. Copy the values of its `auth_token` and `ct0` cookies (DevTools → Application → Cookies), and set them as environment variables for the shell that runs the pilot. Don't write them into the repo or any file inside it.
```powershell
$env:TWITTER_AUTH_TOKEN = "<auth_token>"; $env:TWITTER_CT0 = "<ct0>"
```
twitter-cli otherwise tries to read cookies from your browsers itself. Setting these variables makes it use the dedicated account.

## 4. Instagram and Facebook (OpenCLI)
1. In the **pilot Chrome profile**, install the OpenCLI extension (Chrome Web Store: "OpenCLI"), then sign in to the dedicated Instagram and Facebook accounts.
2. Install the pilot's Instagram adapter, which keeps the full caption, the permalink and the date:
   ```powershell
   New-Item -ItemType Directory -Force $env:USERPROFILE\.opencli\clis\woodmont-instagram | Out-Null
   Copy-Item scripts\social-pilot\opencli\woodmont-instagram\posts.js $env:USERPROFILE\.opencli\clis\woodmont-instagram\
   ```
3. Check: `& $env:SOCIAL_OPENCLI_BIN woodmont-instagram posts <a-public-account> --limit 3 -f json`

Facebook's reader exposes only the post author and a text excerpt, with no link and no date. Facebook posts are therefore **leads** for a person to check, never verified findings.

## 5. Daily run
```powershell
node --import tsx scripts/social-pilot.ts collect
node --import tsx scripts/social-pilot.ts evaluate     # writes reports\<date>.md
node --import tsx scripts/social-pilot.ts status       # running pilot totals
```

## What the report means
| Status | Meaning | Use |
|---|---|---|
| verified | Links to an announcement on the account's **own** domain, and Jacob's rules qualify that **page** | Candidate for the scanner |
| post-only | The post's own text qualifies, but nothing verifiable is linked | A person checks it |
| lead | Facebook post that qualifies on its excerpt | A person checks it |

Each development counts once across platforms, and is marked **already known** when the scanner or the newsletter feed has it.

## Decision after 30 days
Continue only if the pilot found developments that are **verified AND new**: not already in the scanner or the newsletter feed, and in numbers worth the account upkeep. Run `status` for that count.
