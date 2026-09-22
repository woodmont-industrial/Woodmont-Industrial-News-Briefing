# Municipal Intelligence Monitor — Shadow V1

This module monitors official municipal records without depending on Google News. It is intentionally isolated from the production newsletter, email send, GitHub Pages, article scoring, and normal Woodmont news rubric.

## Safety boundary

- Public repository: generic adapters, schemas, deterministic screening/extraction, lifecycle logic, fixtures, and tests.
- Private/local only: the real municipality watchlist, official URLs being monitored, target developers/sites, priority rules, and generated observations.
- Shadow output is written only under `.municipal-shadow/` when it is inside the repository. The path is gitignored, and the runner rejects `docs/` or other public in-repository output paths.
- No GitHub Action or schedule invokes this runner.
- Moratorium, ban, restriction, opposition, denial, and similar language is retained as valuable municipal intelligence. `woodmont-rubric.ts` is not imported or reused.

## Architecture

```text
Private config
    ↓
Source adapter (official HTML or Legistar)
    ↓
Normalized document + provenance + content hash
    ↓
Stage 1 deterministic relevance screening
    ↓
Provider-neutral extraction interface
    ↓
Deterministic baseline extractor
    ↓
Document/event deduplication + conservative project identity
    ↓
Immutable event history + current project lifecycle
    ↓
Private .municipal-shadow JSON state and run report
```

The adapter contract separates document discovery from content acquisition. V1 includes:

1. `html` — discovers relevant official agenda, minutes, packet, ordinance, resolution, application, and hearing links from a configured municipal page. Cross-host document links must be explicitly allowlisted.
2. `legistar` — reads the documented Legistar events shape and discovers agenda/minutes attachments with event/body/date provenance.

The extraction interface is provider-neutral. V1 uses `BaselineMunicipalExtractor`, which only fills fields supported by deterministic evidence. Unknown values remain `null`.

## Run locally

Copy `config/municipal.example.json` to a private path outside the public repository, replace the sample municipalities with the approved watchlist, and run:

```bash
npm run municipal:shadow -- --config /private/path/municipal.private.json
```

Override the output directory when needed:

```bash
npm run municipal:shadow -- --config /private/path/municipal.private.json --output /private/path/municipal-shadow
```

Run the fully offline demonstration:

```bash
npm run municipal:fixture
```

Run tests and the isolated strict typecheck:

```bash
npm run test:municipal
npm run typecheck
```

## Private config schema

```json
{
  "schemaVersion": 1,
  "request": {
    "timeoutMs": 20000,
    "maxBytes": 15728640
  },
  "keywords": {
    "uses": ["optional additional use term"],
    "landUse": ["optional additional entitlement term"],
    "governmentAction": ["optional additional action term"]
  },
  "municipalities": [
    {
      "id": "example-town-nj",
      "name": "Example Township",
      "state": "NJ",
      "sources": [
        {
          "id": "planning-board",
          "type": "html",
          "body": "Planning Board",
          "url": "https://example.gov/planning-board/"
        }
      ]
    }
  ]
}
```

Configuration validation is strict. Unknown fields, duplicate IDs, invalid URLs, invalid state abbreviations, or nonsensical request limits fail with an actionable error rather than silently running.

## Private output

Each run maintains:

- `documents.json` — content-addressed document revisions and official provenance.
- `candidates.json` — Stage 1 decisions, matched terms, excerpts, and reason codes.
- `events.json` — immutable extracted municipal events.
- `projects.json` — current project state plus complete event history.
- `run-report.json` — source/document/event/project counters and errors by source.

Repeated identical documents are marked unchanged and do not create another event or project. Revised content creates a new document revision/event and may advance the matched project's lifecycle. Ambiguous identity is preserved and flagged; the engine does not silently merge uncertain projects.

## V1 limitations and deliberate deferrals

- PDF files are acquired, size-limited, hashed, and retained with provenance, but their text is marked `metadata-only`. PDF text extraction is deferred to V2 to avoid adding a large parser before the first municipality set proves which platforms and document formats matter. There is no OCR.
- The deterministic extractor intentionally favors precision over completeness. An LLM extractor can later implement the same `MunicipalExtractor` contract without changing acquisition, storage, identity, or tests.
- There is no production newsletter section, email integration, public diagnostic output, scheduler, or GitHub Action in V1.
- The committed configuration and fixtures are fictional examples only. They contain no Woodmont municipality watchlist, developer targets, known projects, or internal scoring strategy.
