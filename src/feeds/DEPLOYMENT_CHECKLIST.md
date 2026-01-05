# Pipeline Integration Deployment Checklist

This checklist provides step-by-step guidance for deploying the integrated pipeline across your Woodmont Industrial News Briefing system.

## Phase 1: Deployment (Switch Imports)

### Step 1.1: Update rssfeed.ts (Main Entry Point)
**File**: `rssfeed.ts` (Line 15)

**Current Code**:
```typescript
import { fetchAllRSSArticles } from './src/feeds/fetcher.js';
```

**New Code**:
```typescript
import { fetchAllRSSArticles } from './src/feeds/fetcher-integration.js';
```

**Action Items**:
- [ ] Edit `rssfeed.ts`
- [ ] - [ ] Change import on line 15
- [ ] - [ ] Commit: "Deploy: Switch rssfeed.ts to use pipeline integration"
- [ ] - [ ] Test locally with `npx tsx rssfeed.ts --no-browser`
- [ ] - [ ] Verify server starts without errors
- [ ] - [ ] Check console logs show "Initial: Fetching RSS feeds"

- [ ] ### Step 1.2: Optional - Create Fetcher Shim for Backward Compatibility
- [ ] **File**: `src/feeds/fetcher.ts`

- [ ] **Purpose**: Keep old fetcher.ts as a re-export shim if other code might import directly from it.

- [ ] **Implementation**:
- [ ] ```typescript
- [ ] // Backward compatibility shim - re-export from new integration
- [ ] export {
- [ ]   fetchAllRSSArticles,
- [ ]     getLastFetchInfo,
- [ ]   getBlockedFeeds
- [ ]   } from './fetcher-integration.js';
- [ ]   ```

- [ ]   **Action Items**:
- [ ]   - [ ] Decide if needed (only if other files import directly from fetcher.ts)
- [ ]   - [ ] If yes: Replace contents of src/feeds/fetcher.ts with re-export
- [ ]   - [ ] Test imports still work
- [ ]   - [ ] Commit: "Add fetcher.ts backward compatibility shim"

- [ ]   ---

- [ ]   ## Phase 2: Monitoring (Track Improvements)

- [ ]   ### Step 2.1: Set Up Performance Metrics
- [ ]   **Track these metrics for 1-2 weeks**:

- [ ]   ```typescript
- [ ]   // In your monitoring/dashboard code
- [ ]   const metrics = getLastFetchInfo();
- [ ]   console.log({
- [ ]     timestamp: metrics.timestamp,
- [ ]   totalFetched: metrics.totalFetched,
- [ ]     totalKept: metrics.totalKept,
- [ ]   deduplicationRate: ((metrics.totalFetched - metrics.totalKept) / metrics.totalFetched * 100).toFixed(1) + '%',
- [ ]     sourcesProcessed: metrics.sourcesProcessed,
- [ ]   avgArticlesPerSource: (metrics.totalKept / metrics.sourcesProcessed).toFixed(1),
- [ ]     lastArticleTime: metrics.lastArticle?.pubDate
- [ ] });
- [ ] ```

- [ ] **Action Items**:
- [ ] - [ ] Add metrics logging to your monitoring endpoint or dashboard
- [ ] - [ ] Track daily for performance baseline
- [ ] - [ ] Document expected improvements:
- [ ]   - **Deduplication Rate**: Should see 10-20% reduction from duplicates
- [ ]     - **Processing Time**: Should be 40-50% faster than before
- [ ]   - **Article Quality**: Better filtering with rule engine

- [ ]   ### Step 2.2: Monitor Blocked Feeds
- [ ]   ```typescript
- [ ]   const blocked = getBlockedFeeds();
- [ ]   if (blocked.length > 0) {
- [ ]     console.warn('🚫 Blocked feeds (24-hour cooldown):',blocked);
- [ ]   // Alert operations team
- [ ]   }
- [ ]   ```

- [ ]   **Action Items**:
- [ ]   - [ ] Set up alerts for feeds in circuit breaker
- [ ]   - [ ] Monitor every 6 hours for first week
- [ ]   - [ ] Document which feeds are problematic
- [ ]   - [ ] Plan: Email ingestion for blocked feeds

- [ ]   ### Step 2.3: Create Monitoring Dashboard
- [ ]   **Suggested metrics to track**:
- [ ]   - Fetch success/failure rate per feed
- [ ]   - Article count trends
- [ ]   - Deduplication effectiveness
- [ ]   - Average processing time per 15-min cycle
- [ ]   - Rule engine classification accuracy (A/B/C distribution)

- [ ]   **Action Items**:
- [ ]   - [ ] Create monitoring endpoint `/api/metrics`
- [ ]   - [ ] Return: fetch stats, blocked feeds, performance timings
- [ ]   - [ ] Build simple dashboard HTML to visualize

- [ ]   ---

- [ ]   ## Phase 3: Optimize (Fine-tune Rules)

- [ ]   ### Step 3.1: Review Classification Accuracy
- [ ]   **After 1 week of monitoring**:

- [ ]   **Check the distribution of articles by tier**:
- [ ]   ```typescript
- [ ]   const items = Array.from(itemStore.values());
- [ ]   const byTier = items.reduce((acc, item) => {
- [ ]     acc[item.tier] = (acc[item.tier] || 0) + 1;
- [ ]   return acc;
- [ ]   }, {});
- [ ]   console.log('Articles by tier:', byTier);
- [ ]   // Expected: Mostly A/B, small C percentage
- [ ]   ```

- [ ]   **Action Items**:
- [ ]   - [ ] Run analysis of article distribution
- [ ]   - [ ] If too many Tier C articles: Adjust keywords in `classification_rules.json`
- [ ]   - [ ] If too few Tier C articles: Your rules might be too broad
- [ ]   - [ ] Target: 60-70% Tier A/B, 30-40% Tier C

- [ ]   ### Step 3.2: Optimize classification_rules.json
- [ ]   **Review and update**:

- [ ]   ```json
- [ ]   {
- [ ]     "approvedSources": [
- [ ]     // Add/remove based on monitoring
- [ ]     // Check which sources produce best Tier A articles
- [ ]   ],
- [ ]     "keywords": {
- [ ]     "industrial": [
- [ ]       // Add domain-specific keywords from monitoring
- [ ]         "warehouse", "logistics", "supply chain", etc.
- [ ]         ]
- [ ]       },
- [ ]     "scoring": {
- [ ]     "baseScore": 1.0,
- [ ]     "multipliers": {
- [ ]       // Adjust weights based on accuracy
- [ ]         "industrial": 1.5,  // Higher weight = more importance
- [ ]           "creIntent": 2.0
- [ ]           }
- [ ]         }
- [ ]     }
- [ ] ```

- [ ] **Action Items**:
- [ ] - [ ] Identify low-quality feeds (producing mostly Tier C)
- [ ] - [ ] Add more keywords from top-tier articles
- [ ] - [ ] Increase multipliers for high-confidence terms
- [ ] - [ ] Test changes locally first
- [ ] - [ ] Commit: "Optimize: Fine-tune classification rules based on monitoring"

- [ ] ### Step 3.3: Deduplication Analysis
- [ ] **Check deduplication effectiveness**:

- [ ] ```typescript
- [ ] // Count duplicates removed
- [ ] const totalFetched = metrics.totalFetched;
- [ ] const totalKept = metrics.totalKept;
- [ ] const dedupRate = ((totalFetched - totalKept) / totalFetched * 100);
- [ ] console.log(`Deduplication removed ${dedupRate.toFixed(1)}% redundant articles`);
- [ ] ```

- [ ] **Action Items**:
- [ ] - [ ] Monitor dedup rate over 2 weeks
- [ ] - [ ] If dedup rate < 5%: Check if feeds are unique enough
- [ ] - [ ] If dedup rate > 30%: May indicate feed overlap strategy working well
- [ ] - [ ] Adjust deduplication sensitivity if needed

- [ ] ---

- [ ] ## Phase 4: Enhance (Add Custom Features)

- [ ] ### Step 4.1: Custom Pipeline Stages
- [ ] **Example: Add email validation stage**

- [ ] ```typescript
- [ ] // src/feeds/pipeline.ts - Add after Stage 4
- [ ] async function validateEmails(articles: NormalizedItem[]): Promise<NormalizedItem[]> {
- [ ]   return articles.filter(article => {
- [ ]       // Add custom validation logic
- [ ]       return article.author && article.author.includes('@');
- [ ]     });
- [ ] }
- [ ] ```

- [ ] **Action Items**:
- [ ] - [ ] Identify needed custom stages
- [ ] - [ ] Implement stage function
- [ ] - [ ] Add to processFeedsFullPipeline orchestration
- [ ] - [ ] Add tests
- [ ] - [ ] Commit: "Enhance: Add custom validation stage"

- [ ] ### Step 4.2: Performance Tuning
- [ ] **Options to explore**:
- [ ] - [ ] Increase batch size in classifyArticlesInBatch()
- [ ] - [ ] Add caching layer for rule engine
- [ ] - [ ] Implement feed-specific optimizations
- [ ] - [ ] Add parallel feed processing if not already
- [ ] - [ ] Commit: "Enhance: Performance tuning optimizations"

- [ ] ### Step 4.3: Extended Monitoring
- [ ] **Add these advanced metrics**:
- [ ] - [ ] Feed health scores (reliability index)
- [ ] - [ ] Rule engine hit rates
- [ ] - [ ] Article freshness metrics
- [ ] - [ ] Feed quality scores
- [ ] - [ ] Commit: "Enhance: Add advanced monitoring metrics"

- [ ] ---

- [ ] ## Phase 5: Archive (Keep Old Code as Reference)

- [ ] ### Step 5.1: Decide on Old fetcher.ts
- [ ] **Options**:

- [ ] **Option A: Archive with Documentation** (Recommended)
- [ ] 1. Create `src/feeds/fetcher.ARCHIVED.ts`
- [ ] 2. Copy original fetcher.ts content there
- [ ] 3. Keep lightweight shim in fetcher.ts for imports
- [ ] 4. Document why archived in code comments

- [ ] **Option B: Remove Completely**
- [ ] 1. Delete src/feeds/fetcher.ts
- [ ] 2. Use shim pattern for backward compat
- [ ] 3. Remove from Git history: `git rm --cached src/feeds/fetcher.ts`

- [ ] **Option C: Keep as Reference**
- [ ] 1. Leave fetcher.ts as-is
- [ ] 2. Add comment: "See fetcher-integration.ts for active implementation"
- [ ] 3. Mark as deprecated but keep for reference

- [ ] **Action Items**:
- [ ] - [ ] Choose option (A recommended for first deployment)
- [ ] - [ ] Execute archive/cleanup
- [ ] - [ ] Commit: "Archive: Old fetcher.ts - see fetcher-integration.ts for active code"
- [ ] - [ ] Document in README if needed

- [ ] ### Step 5.2: Update Documentation
- [ ] **Update in README.md or docs/**:

- [ ] - [ ] Add Architecture section explaining pipeline
- [ ] - [ ] Link to PIPELINE_INTEGRATION_GUIDE.md
- [ ] - [ ] Explain deployment state (which files are active)
- [ ] - [ ] Document monitoring endpoint/dashboard
- [ ] - [ ] Add troubleshooting section

- [ ] ---

- [ ] ## Deployment Timeline

- [ ] **Week 1: Deploy & Monitor**
- [ ] - Monday: Switch imports, deploy to production
- [ ] - Daily: Monitor metrics, check for blocked feeds
- [ ] - Friday: Review initial performance data

- [ ] **Week 2: Optimize**
- [ ] - Monday-Wednesday: Fine-tune classification rules
- [ ] - Thursday-Friday: Analyze results, make adjustments
- [ ] - Saturday: Run analysis, prepare optimization report

- [ ] **Week 3+: Enhance & Polish**
- [ ] - Add custom pipeline stages as needed
- [ ] - Implement advanced monitoring
- [ ] - Archive/clean up old code
- [ ] - Document best practices

- [ ] ---

- [ ] ## Success Criteria

- [ ] ✅ **Deployment Successful When**:
- [ ] - [ ] rssfeed.ts imports from fetcher-integration.js
- [ ] - [ ] Server starts without errors
- [ ] - [ ] Background fetch cycle completes successfully
- [ ] - [ ] getLastFetchInfo() returns valid metrics
- [ ] - [ ] No regression in article count

- [ ] ✅ **Integration Successful After 1 Week**:
- [ ] - [ ] Processing time is 40-50% faster
- [ ] - [ ] Deduplication is removing 10-20% redundant articles
- [ ] - [ ] No blocked feeds (or expected problematic ones)
- [ ] - [ ] Tier A/B article percentage is 60-70%
- [ ] - [ ] Monitoring dashboard shows trends

- [ ] ✅ **Optimization Complete After 2 Weeks**:
- [ ] - [ ] Classification rules fine-tuned
- [ ] - [ ] Deduplication working optimally
- [ ] - [ ] All monitoring in place
- [ ] - [ ] Team trained on new system
- [ ] - [ ] Documentation complete

- [ ] ---

- [ ] ## Rollback Plan

- [ ] If issues occur, quickly revert:

- [ ] ```bash
- [ ] # Switch back to old fetcher
- [ ] git revert <commit_that_changed_fetcher_import>
git push
# Redeploy
```

Or simpler:

```typescript
// In rssfeed.ts, revert import:
import { fetchAllRSSArticles } from './src/feeds/fetcher.js';
```

Then restart server.

---

## Next Steps

1. **TODAY**: Read this checklist, approve Phase 1
2. 2. **TOMORROW**: Execute Phase 1 (update imports, deploy)
   3. 3. **This Week**: Execute Phase 2 (set up monitoring)
      4. 4. **Next Week**: Execute Phase 3 (optimize rules)
         5. 5. **Following Weeks**: Execute Phase 4 & 5 (enhance & archive)
           
            6. ---
           
            7. ## Questions?
           
            8. Refer to:
            9. - `PIPELINE_INTEGRATION_GUIDE.md` - Architecture and concepts
               - - `fetcher-integration.ts` - Implementation details
                 - - `test-pipeline-integration.ts` - Testing approach
                   - - `RULE_ENGINE_IMPLEMENTATION.md` - Classification rules
                    
                     - Good luck with the deployment! 🚀
                     - 
