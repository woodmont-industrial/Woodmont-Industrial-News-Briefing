# Capital Markets ownership watchlist

`institutional-ownership-nnj.xlsx` is the approved public source workbook for
the Capital Markets Preview competitor watch. It is intentionally committed so
editors do not have to upload the same file in every browser session.

This repository is public. The source workbook therefore remains publicly
downloadable in its original form, including columns that are intentionally
excluded from the browser projection below.

After replacing or editing the workbook, run:

```sh
npm run build:cm-watchlist
npm run test:capital-markets
```

The build publishes only the matcher fields to
`docs/data/capital-markets-watchlist.json`. It does not copy phone numbers or
street addresses from the workbook into the browser-readable JSON.
