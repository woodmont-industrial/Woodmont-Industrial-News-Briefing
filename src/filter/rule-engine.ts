import { NormalizedItem, FeedType } from '../types/index.js';

interface ClassificationRules {
    categories: Record<string, any>;
    approvedSources: string[];
    keywords: Record<string, string[]>;
    sourceOverrides: Record<string, any>;
    scoring: Record<string, number>;
}

let rulesCache: ClassificationRules | null = null;

/**
 * Load classification rules from JSON file
 * Implements lazy-loading with caching for performance
 */
async function loadRules(): Promise<ClassificationRules> {
    if (rulesCache) {
          return rulesCache;
    }
    try {
          const response = await fetch('./classification_rules.json');
          rulesCache = await response.json();
          return rulesCache;
    } catch (error) {
          console.error('Failed to load classification rules:', error);
          throw new Error('Could not load classification rules');
    }
}

/**
 * Check if source has an override rule
 */
function checkSourceOverride(source: string, link: string, rules: ClassificationRules): { category: string; score: number } | null {
    const sourceText = (source + ' ' + link).toLowerCase();
    for (const [domain, override] of Object.entries(rules.sourceOverrides)) {
          if (sourceText.includes(domain.toLowerCase()) && override.alwaysApply) {
                  return { category: override.category, score: 10 };
          }
    }
    return null;
}

/**
 * Check if source is approved
 */
function isApprovedSource(source: string, link: string, approvedDomains: string[]): boolean {
    const sourceText = (source + ' ' + link).toLowerCase();
    return approvedDomains.some(domain => sourceText.includes(domain.toLowerCase()));
}

/**
 * Score keyword matches with weighted system
 */
function scoreKeywords(text: string, keywords: string[], weight: number): number {
    const matches = keywords.filter(keyword => text.includes(keyword.toLowerCase())).length;
    return matches > 0 ? Math.min(matches * weight, 10) : 0;
}

/**
 * Check for price/money signals
 */
function hasPriceSignals(text: string): boolean {
    return /\$[\d.,]+(?:million|m|billion|b|k|thousand)/i.test(text) ||
          /\d+(?:\s*million|\s*billion|\s*thousand|\s*k)/i.test(text);
}

/**
 * Check for size signals (square feet, acres)
 */
function hasSizeSignals(text: string): boolean {
    return /\d+(?:,\d+)*\s*(?:sf|sq\.?ft|square\s*feet|sqft)/i.test(text) ||
          /\d+(?:\.\d+)?\s*(?:acre|acres)/i.test(text);
}

/**
 * Main classification function using rule engine
 */
export async function classifyArticleWithRules(
    title: string,
    description: string,
    link: string,
    source?: string,
    feedType?: FeedType
  ): Promise<{ isRelevant: boolean; category: string; score: number; tier?: 'A' | 'B' | 'C' }> {
    try {
          const rules = await loadRules();
          const text = (title + ' ' + description + ' ' + link).toLowerCase();

      // 1. Check source overrides first (highest priority)
      const override = checkSourceOverride(source || '', link, rules);
          if (override) {
                  return {
                            isRelevant: true,
                            category: override.category,
                            score: override.score,
                            tier: 'A'
                  };
          }

      // 2. Check approved sources
      if (!isApprovedSource(source || '', link, rules.approvedSources)) {
              return {
                        isRelevant: false,
                        category: 'unapproved source',
                        score: 0
              };
      }

      // 3. Check exclusions
      const exclusionScore = scoreKeywords(text, rules.keywords.exclusions || [], 1);
          if (exclusionScore > 0) {
                  return {
                            isRelevant: false,
                            category: 'excluded',
                            score: 0
                  };
          }

      // 4. Calculate industrial focus
      const industrialScore = scoreKeywords(text, rules.keywords.industrial, 1.2);
          const creScore = scoreKeywords(text, rules.keywords.creIntent, 1.1);

      // 5. Score each category
      let bestMatch = { category: 'not relevant', score: 0, tier: 'C' as const };

      // RELEVANT ARTICLES (Macro + Industrial)
      if (industrialScore > 0 && creScore > 0) {
              const relevantScore = (industrialScore + creScore) / 2;
              if (relevantScore > bestMatch.score) {
                        bestMatch = { category: 'relevant', score: relevantScore, tier: 'A' };
              }
      }

      // TRANSACTIONS (Deals, Sales, Leases)
      const transactionScore = scoreKeywords(
              text,
              ['sells', 'sold', 'acquires', 'acquired', 'lease', 'leased', 'sale', 'transaction'],
              1
            );
          if (transactionScore > 0 && (hasPriceSignals(text) || hasSizeSignals(text))) {
                  const txScore = transactionScore + (hasPriceSignals(text) ? 2 : 0) + (hasSizeSignals(text) ? 2 : 0);
                  if (txScore > bestMatch.score) {
                            bestMatch = {
                                        category: 'transactions',
                                        score: Math.min(txScore, 9),
                                        tier: txScore >= 9 ? 'A' : 'B'
                            };
                  }
          }

      // AVAILABILITIES (For Lease, For Sale)
      const availScore = scoreKeywords(
              text,
              ['for sale', 'for lease', 'available', 'listing', 'on the market'],
              1
            );
          if (availScore > 0 && industrialScore > 0) {
                  if (availScore > bestMatch.score) {
                            bestMatch = { category: 'availabilities', score: availScore, tier: 'B' };
                  }
          }

      // PEOPLE NEWS (Executive moves)
      const peopleScore = scoreKeywords(
              text,
              ['appointed', 'named', 'joined', 'hired', 'promoted', 'executive', 'ceo', 'president'],
              1
            );
          if (peopleScore > 0 && (industrialScore > 0 || creScore > 0)) {
                  if (peopleScore > bestMatch.score) {
                            bestMatch = { category: 'people', score: peopleScore, tier: 'A' };
                  }
          }

      return {
              isRelevant: bestMatch.score > rules.scoring.defaultThreshold,
              category: bestMatch.category,
              score: bestMatch.score,
              tier: bestMatch.tier
      };
    } catch (error) {
          console.error('Error in rule engine classification:', error);
          // Fallback to basic scoring if rules fail to load
      return {
              isRelevant: false,
              category: 'error',
              score: 0
      };
    }
}

export default { classifyArticleWithRules, loadRules };
