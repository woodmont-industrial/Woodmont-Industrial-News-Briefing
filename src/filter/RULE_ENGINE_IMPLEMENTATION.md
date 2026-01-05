# Classification Rule Engine Implementation

## Overview
This document describes the lightweight rule engine implementation for the Woodmont Industrial News Briefing classification system.

**Goal:** Enable business logic changes (rule adjustments) WITHOUT code changes. All rules are now editable via JSON configuration.

## Files Created

### 1. `classification_rules.json`
**Location:** `src/filter/classification_rules.json`

Configuration file containing all classification rules and keywords. This file defines:
- **Categories:** Relevant, Transactions, Availabilities, People News
- - **Approved Sources:** List of allowed domains
  - - **Keywords:** Industrial, CRE Intent, Exclusion lists
    - - **Source Overrides:** Per-source classification rules
      - - **Scoring Weights:** Importance multipliers for signals
       
        - **Edit This To:** Change keywords, adjust category definitions, add/remove sources
       
        - ### 2. `rule-engine.ts`
        - **Location:** `src/filter/rule-engine.ts`
       
        - TypeScript module that implements the classification logic. Features:
        - - Loads rules from JSON (with caching for performance)
          - - Implements weighted keyword scoring
            - - Checks source overrides
              - - Validates approved sources
                - - Returns category + confidence score
                 
                  - **Key Function:**
                  - ```typescript
                    export async function classifyArticleWithRules(
                      title: string,
                      description: string,
                      link: string,
                      source?: string,
                      feedType?: FeedType
                    ): Promise<ClassificationResult>
                    ```

                    ## Integration with Existing `classifier.ts`

                    ### Current State
                    Your existing `classifier.ts` contains hardcoded keyword arrays and classification logic. To integrate the rule engine **WITHOUT changing the external interface**:

                    ### Minimal Integration Steps

                    **Option 1: Gradual Migration (Recommended)**
                    1. Import the rule engine at the top of classifier.ts:
                    2. ```typescript
                       import { classifyArticleWithRules } from './rule-engine.js';
                       ```

                       2. Modify the existing `classifyArticle()` function to call the rule engine:
                       3. ```typescript
                          export async function classifyArticle(
                            title: string,
                            description: string,
                            link: string,
                            source?: string,
                            feedType?: FeedType
                          ): Promise<ClassificationResult> {
                            try {
                              // Use new rule engine
                              return await classifyArticleWithRules(title, description, link, source, feedType);
                            } catch (error) {
                              console.error('Rule engine failed, using fallback:', error);
                              // Keep original logic as fallback
                              return classifyArticleOriginal(title, description, link, source, feedType);
                            }
                          }
                          ```

                          3. Keep the original function as `classifyArticleOriginal()` for fallback
                         
                          4. **Option 2: Clean Replacement**
                          5. Replace the entire body of `classifyArticle()` with a call to the rule engine (after you've verified it works).
                         
                          6. ## How to Use the Rule Engine
                         
                          7. ### Editing Classification Rules
                         
                          8. 1. **Open** `src/filter/classification_rules.json`
                             2. 2. **Edit** the JSON file (NO code compilation needed)
                                3. 3. **Commit** the changes to Git
                                   4. 4. **Deploy** - rules are loaded dynamically on server startup
                                     
                                      5. ### Common Changes
                                     
                                      6. #### Adding a New Keyword
                                      7. ```json
                                         "keywords": {
                                           "industrial": [
                                             "warehouse",
                                             "distribution",
                                             "your-new-keyword"  // Add here
                                           ]
                                         }
                                         ```

                                         #### Adjusting Source Overrides
                                         ```json
                                         "sourceOverrides": {
                                           "github.com": {
                                             "category": "github",
                                             "alwaysApply": true
                                           },
                                           "yourdomain.com": {  // Add new override
                                             "category": "relevant",
                                             "alwaysApply": true
                                           }
                                         }
                                         ```

                                         #### Adding New Approved Sources
                                         ```json
                                         "approvedSources": [
                                           "re-nj.com",
                                           "yoursource.com"  // Add here
                                         ]
                                         ```

                                         ## Architecture Benefits

                                         | Aspect | Before (Hardcoded) | After (Rule Engine) |
                                         |--------|-------------------|---------------------|
                                         | Change Rules | Edit code → recompile → redeploy | Edit JSON → commit → auto-reload |
                                         | Time to Update | 10-15 minutes | 1-2 minutes |
                                         | Risk | Higher (code changes) | Lower (config only) |
                                         | Testing | Requires code tests | JSON validation |
                                         | Scalability | Fixed in code | Dynamic via config |

                                         ## Performance Considerations

                                         - **Caching:** Rules are loaded once and cached in memory (subsequent calls use cache)
                                         - - **Async:** `classifyArticleWithRules()` is async to support future enhancements
                                           - - **Fallback:** If JSON fails to load, function returns error with fallback option
                                            
                                             - ## Next Steps
                                            
                                             - 1. **Test the rule engine** with your existing classification data
                                               2. 2. **Compare results** between old and new logic
                                                  3. 3. **Fine-tune weights** in JSON until results match expectations
                                                     4. 4. **Migrate classifier.ts** to use the rule engine
                                                        5. 5. **Remove old keyword arrays** from classifier.ts once confident
                                                          
                                                           6. ## Example: Updating Keywords for Better Results
                                                          
                                                           7. Problem: Too many false positives on "retail"?
                                                          
                                                           8. **Solution (30 seconds):**
                                                           9. 1. Open `classification_rules.json`
                                                           2. Add "retail" to exclusion keywords:
                                                           3. ```json
                                                              "exclusions": [
                                                                "apartment",
                                                                "retail",  // Add this line
                                                                "shopping center"
                                                              ]
                                                              ```
                                                              3. Save and commit
                                                              4. 4. No recompile needed - live on next server reload
                                                                
                                                                 5. ## Troubleshooting
                                                                
                                                                 6. **Q: Rules not loading?**
                                                                 7. A: Check browser console for fetch errors. Ensure `classification_rules.json` path is correct relative to server.
                                                                
                                                                 8. **Q: Wrong category assignments?**
                                                                 9. A: Adjust keyword weights and scoring thresholds in the JSON file.
                                                                
                                                                 10. **Q: Performance issues?**
                                                                 11. A: Caching prevents reload on every call. If cache is stale, restart server.
                                                                
                                                                 12. ## Files Overview
                                                                
                                                                 13. ```
                                                                     src/filter/
                                                                     ├── classifier.ts                    (EXISTING - keep wrapper function)
                                                                     ├── rule-engine.ts                   (NEW - core logic)
                                                                     ├── classification_rules.json         (NEW - editable config)
                                                                     └── RULE_ENGINE_IMPLEMENTATION.md    (This file)
                                                                     ```

                                                                     ## Testing the Rule Engine

                                                                     Quick validation:
                                                                     ```bash
                                                                     # Ensure classification_rules.json is valid JSON
                                                                     node -e "console.log(JSON.parse(require('fs').readFileSync('./src/filter/classification_rules.json')))"

                                                                     # Check that it loads without errors
                                                                     npm test -- --testPathPattern="rule-engine"
                                                                     ```

                                                                     ---
                                                                     **Status:** Ready for integration. No foundational files changed.
                                                                     
