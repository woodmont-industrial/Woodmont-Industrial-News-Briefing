# Capital Markets ownership watchlist

The source workbook (`institutional-ownership-nnj.xlsx`) is **not committed**.
It contains columns beyond what the Capital Markets matcher needs, so it is
kept outside the repository and only a minimal projection is published.

The build reads the workbook from `$CM_WATCHLIST_WORKBOOK`, falling back to
`~/Downloads/woodmont-private/institutional-ownership-nnj.xlsx`.

## What is published

`docs/data/capital-markets-watchlist.json` carries only the six fields used by
matching and competitor-source discovery, for 507 companies:

`Company Name` · `Secondary Type` · `City` · `State / Country` · `Website` ·
`Website Domain`

The browser loads that file automatically, so editors never have to upload the
spreadsheet. The file picker in the preview remains only as a session override.

## Regenerating after a workbook revision

```sh
CM_WATCHLIST_WORKBOOK=/path/to/institutional-ownership-nnj.xlsx \
  python3 scripts/build-capital-markets-watchlist.py
```

Regeneration is rare — only when the workbook itself changes.

**Locked-down workstations:** the generator needs `python3`, and the npm
wrappers need `.cmd`; both may be blocked by corporate policy. Neither is
required to review or ship a change. The published JSON is a plain projection —
readable in any editor — and the `Watchlist Privacy` CI job runs
`tests/capital-markets/public-watchlist.test.mjs` plus the data-minimization
validator on every push and pull request, so the field contract is enforced
there rather than locally. When the workbook changes and Python is unavailable,
regenerate on an unrestricted machine and commit the resulting JSON.

## Keeping the private copy durable

The workbook now lives only outside the repository. Store it somewhere backed
up (not just a Downloads folder) before any history maintenance is performed.
