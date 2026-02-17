# Proposal: Upgrade AI Filtering from Groq to Anthropic Claude Haiku

## Problem

The current AI pipeline uses **Groq's free tier** (llama-3.1-8b-instant) for article classification and description generation. Groq's rate limits force:
- Tiny batches: 3 articles at a time with 2-second delays
- Hard cap: Only 15 articles classified per build
- Lower quality: Open-source model occasionally miscategorizes articles or generates weak descriptions
- No cost: Free tier, but quality and throughput are limited

Additionally, the **Ignore button** in the browser was not syncing to the server because no GitHub token was configured — meaning articles users marked as irrelevant were still appearing in automated newsletters.

## Proposed Solution

### 1. Replace Groq with Anthropic Claude Haiku for AI Tasks

**What changes:**
- Article relevance scoring (is this industrial real estate news relevant to NJ/PA/FL?)
- Description generation (1-3 sentence summaries of articles)
- Smart categorization (transactions vs. availabilities vs. people vs. relevant)

**Why Claude Haiku:**
- Significantly better reasoning than llama-3.1-8b
- More accurate industrial CRE classification
- Better descriptions with less hallucination on paywalled content
- Much more generous rate limits — can process 40+ articles per batch vs. 15

**Cost:**
- ~$0.06/day with Haiku (150 articles/day)
- **$50 in credits = 800+ days of operation**
- Groq stays as automatic fallback if Anthropic key is not set

### 2. Add "Sync All Ignores to GitHub" Button

Users who previously ignored articles without a GitHub token can now push all their local exclusions to the server in one click.

## Technical Changes

| File | Change |
|------|--------|
| `src/filter/ai-provider.ts` | New shared module — selects Anthropic (preferred) or Groq (fallback) based on which API key is set |
| `src/filter/ai-classifier.ts` | Switch from Groq to provider-agnostic API calls; increase batch sizes for Haiku |
| `src/filter/description-generator.ts` | Same — switch to provider-agnostic calls; increase batch sizes |
| `src/build/static.ts` | Update env var checks to support both `ANTHROPIC_API_KEY` and `GROQ_API_KEY` |
| `docs/js/utils.js` | Add batch sync function for ignored articles |
| `docs/index.html` | Add "Sync All Ignores" button in Settings tab |
| GitHub Workflows (3 files) | Pass `ANTHROPIC_API_KEY` secret to build and newsletter steps |

## Setup Required

1. **Add GitHub Secret**: `ANTHROPIC_API_KEY` in repo Settings > Secrets and variables > Actions
2. No new npm dependencies — uses raw `fetch()` like the existing Groq integration
3. Groq continues to work as fallback — no breaking changes

## Cost Comparison

| Provider | Model | Cost/Day (~150 articles) | $50 Lasts | Quality |
|----------|-------|--------------------------|-----------|---------|
| Groq | llama-3.1-8b-instant | Free | Forever | Good |
| **Anthropic** | **Claude Haiku 4.5** | **~$0.06** | **800+ days** | **Excellent** |
| Anthropic | Claude Sonnet 4.5 | ~$0.30 | ~160 days | Best |

**Recommendation:** Haiku — best cost/quality ratio for this use case.

## Risk

- **Zero downtime risk**: Groq stays as automatic fallback
- **No data changes**: Same article pipeline, just smarter filtering
- **Reversible**: Remove the `ANTHROPIC_API_KEY` secret to revert to Groq instantly
