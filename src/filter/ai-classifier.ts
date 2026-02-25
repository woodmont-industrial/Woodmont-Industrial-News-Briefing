/**
 * AI-Powered Article Classifier
 *
 * Classifies articles for Woodmont Industrial Partners briefing:
 * - Determines category (relevant, transactions, availabilities, people, exclude)
 * - Scores relevance to NJ/PA/FL industrial real estate (0-100)
 * - Extracts tracking keywords
 * - Generates brief summary
 *
 * Provider: Cerebras (preferred) or Groq (fallback) via ai-provider.ts
 */

import { NormalizedItem } from '../types/index.js';
import { getAIProvider, trackTokenUsage, logTokenUsage } from './ai-provider.js';

export interface AIClassificationResult {
    category: 'relevant' | 'transactions' | 'availabilities' | 'people' | 'exclude';
    relevanceScore: number; // 0-100
    reason: string; // Why this classification
    keywords: string[]; // Suggested tracking keywords
    summary: string; // Brief 1-sentence summary
    isIndustrial: boolean;
    region: string | null; // NJ, PA, FL, or null if not regional
}

// System prompt for the classifier — aligned with boss's exact guidelines
const SYSTEM_PROMPT = `You are an article classifier for Woodmont Industrial Partners, an industrial real estate company focused on NJ, PA, and FL.

TARGET MARKETS: New Jersey (NJ), Pennsylvania (PA), and Florida (FL).
Include national context only if it directly informs these markets.

CREDIBLE SOURCES (weight these higher): WSJ, Bloomberg, CoStar, GlobeSt, Bisnow, CBRE, JLL, Cushman & Wakefield, Colliers, Newmark, RE-NJ, NJBIZ.

CATEGORIES:

1. "relevant" — Macro trends and major industrial real estate news:
   - Interest rates, inflation, freight/logistics trends, construction inputs, labor market
   - Industrial CRE market reports: vacancy, absorption, rent growth
   - National industrial news from credible sources (see above)
   - Only include if it directly impacts NJ/PA/FL industrial markets or is a major national trend

2. "transactions" — Notable industrial land/building sales or leases:
   - Warehouse, logistics, distribution deals in NJ/PA/FL
   - Highlight deals >= 100,000 SF or >= $25 million
   - Acquisitions, dispositions, signed leases

3. "availabilities" — New/notable industrial land or building availabilities:
   - Properties for sale or lease in NJ/PA/FL
   - Spec developments, build-to-suit, new construction
   - Highlight >= 100,000 SF

4. "people" — ANY personnel moves, promotions, hires, appointments, awards, or profiles in CRE:
   - Hires, promotions, appointments at brokerages, developers, REITs, investment firms, associations
   - Industry awards, recognitions, profiles, "power broker" lists, "rising stars"
   - If the article is primarily ABOUT a person and their career, it's "people" not "relevant"
   - Firms: NAI, CBRE, JLL, Cushman, Colliers, Newmark, Prologis, NAIOP, ULI, etc.

5. "exclude" — MUST exclude:
   - Articles primarily about states other than NJ, PA, FL
   - Texas is NOT a target market (exclude Houston, Dallas, Austin, San Antonio, DFW)
   - Washington DC / D.C. is NOT a target market
   - Bay Area / Silicon Valley / San Francisco is NOT a target market
   - Political content, public figures not in CRE (Trump, Biden, Congress, Elon Musk, etc.)
   - Non-industrial properties (office, retail, multifamily, hotel, residential, self-storage)
   - International news, sports, entertainment, crypto

RULES:
- When in doubt about region but article has strong industrial CRE content from a credible source, classify as "relevant"
- If the article is primarily about a non-target state with no NJ/PA/FL connection, EXCLUDE it
- If the property type is NOT industrial (warehouse/logistics/distribution/manufacturing/cold storage), EXCLUDE it
- National macro trends (interest rates, freight, supply chain) that affect industrial CRE are "relevant"
- If a political figure or government policy is mentioned, EXCLUDE it

NJ/PA/FL CITIES TO INCLUDE:
- NJ: Newark, Jersey City, Edison, Trenton, Camden, Exit 8A, Meadowlands, Bergen, Middlesex, Monmouth, Morris, Hudson, Essex, Union, Somerset, Secaucus, Kearny, Carteret
- PA: Philadelphia, Pittsburgh, Lehigh Valley, Allentown, Bethlehem, Bucks, Montgomery, Chester, Delaware County, King of Prussia, Harrisburg
- FL: Miami, Tampa, Orlando, Jacksonville, Fort Lauderdale, West Palm Beach, Miami-Dade, Broward, Palm Beach, Hillsborough, Duval, Doral, Hialeah

Respond in JSON only.`;

const USER_PROMPT_TEMPLATE = `Classify this article:

TITLE: {title}

DESCRIPTION: {description}

SOURCE: {source}

Respond with JSON only (no markdown, no code blocks):
{
  "category": "relevant|transactions|availabilities|people|exclude",
  "relevanceScore": 0-100,
  "reason": "brief explanation",
  "keywords": ["keyword1", "keyword2"],
  "summary": "one sentence summary",
  "isIndustrial": true/false,
  "region": "NJ|PA|FL|null"
}`;

/**
 * Classify an article using AI (Cerebras preferred, Groq fallback)
 */
export async function classifyWithAI(
    title: string,
    description: string,
    source: string
): Promise<AIClassificationResult | null> {
    const provider = getAIProvider();

    if (!provider) {
        console.warn('No AI API key set (CEREBRAS_API_KEY or GROQ_API_KEY), skipping AI classification');
        return null;
    }

    try {
        const userPrompt = USER_PROMPT_TEMPLATE
            .replace('{title}', title || 'No title')
            .replace('{description}', (description || '').substring(0, 500))
            .replace('{source}', source || 'Unknown');

        // Retry logic for rate limits
        let response: Response | null = null;
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
            response = await fetch(provider.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${provider.apiKey}`
                },
                body: JSON.stringify({
                    model: provider.model,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 300
                })
            });

            if (response.status === 429) {
                // Rate limited - wait and retry
                retries++;
                const waitTime = Math.pow(2, retries) * 2000;
                console.log(`[${provider.name}] Rate limited, waiting ${waitTime / 1000}s before retry ${retries}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            break;
        }

        if (!response || !response.ok) {
            const error = response ? await response.text() : 'No response';
            console.error(`[${provider.name}] API error:`, response?.status, error);
            return null;
        }

        const data = await response.json();
        trackTokenUsage(data.usage);
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            console.error(`[${provider.name}] No content in response`);
            return null;
        }

        // Parse JSON response (handle potential markdown code blocks)
        let jsonStr = content;
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error(`[${provider.name}] Could not parse JSON from response:`, content);
            return null;
        }

        const result = JSON.parse(jsonMatch[0]) as AIClassificationResult;

        // Validate category
        const validCategories = ['relevant', 'transactions', 'availabilities', 'people', 'exclude'];
        if (!validCategories.includes(result.category)) {
            result.category = 'exclude';
        }

        // Ensure relevanceScore is number
        result.relevanceScore = Number(result.relevanceScore) || 0;

        return result;

    } catch (error) {
        console.error('AI classification error:', error);
        return null;
    }
}

/**
 * Batch classify multiple articles (with rate limiting)
 */
export async function batchClassifyWithAI(
    articles: NormalizedItem[],
    options: {
        minRelevanceScore?: number;
        maxConcurrent?: number;
        delayMs?: number;
    } = {}
): Promise<Map<string, AIClassificationResult>> {
    const provider = getAIProvider();
    const {
        minRelevanceScore = 25,
        maxConcurrent = provider?.maxConcurrent ?? 2,
        delayMs = provider?.batchDelayMs ?? 5000
    } = options;

    const maxArticlesToClassify = provider?.maxArticles ?? 15;
    const articlesToProcess = articles.slice(0, maxArticlesToClassify);
    if (articles.length > maxArticlesToClassify) {
        console.log(`[${provider?.name ?? 'AI'}] Classification limited to ${maxArticlesToClassify} articles (${articles.length} total) - remaining use rule-based filtering`);
    } else {
        console.log(`[${provider?.name ?? 'AI'}] Classifying ${articlesToProcess.length} articles (batch: ${maxConcurrent}, delay: ${delayMs}ms)`);
    }

    const results = new Map<string, AIClassificationResult>();

    // Process in batches to avoid rate limits
    for (let i = 0; i < articlesToProcess.length; i += maxConcurrent) {
        const batch = articlesToProcess.slice(i, i + maxConcurrent);

        const batchPromises = batch.map(async (article) => {
            const id = article.id || article.link || article.title;
            const result = await classifyWithAI(
                article.title || '',
                article.description || '',
                article.source || ''
            );

            if (result) {
                results.set(id, result);
            }

            return result;
        });

        await Promise.all(batchPromises);

        // Delay between batches
        if (i + maxConcurrent < articlesToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

/**
 * Filter articles using AI classification
 * Returns articles that pass the relevance threshold and are not excluded
 */
export async function filterArticlesWithAI(
    articles: NormalizedItem[],
    minRelevanceScore: number = 25
): Promise<{
    included: NormalizedItem[];
    excluded: NormalizedItem[];
    classifications: Map<string, AIClassificationResult>;
}> {
    const classifications = await batchClassifyWithAI(articles, { minRelevanceScore });

    const included: NormalizedItem[] = [];
    const excluded: NormalizedItem[] = [];

    for (const article of articles) {
        const id = article.id || article.link || article.title;
        const classification = classifications.get(id);

        if (!classification) {
            // If AI classification failed, include by default (will be filtered by rules)
            included.push(article);
            continue;
        }

        // Exclude if category is 'exclude' or relevance score too low
        if (classification.category === 'exclude' || classification.relevanceScore < minRelevanceScore) {
            excluded.push({
                ...article,
                _aiClassification: classification
            } as any);
            continue;
        }

        // Include and attach classification data
        included.push({
            ...article,
            category: classification.category,
            _aiClassification: classification,
            _aiSummary: classification.summary,
            _aiKeywords: classification.keywords
        } as any);
    }

    logTokenUsage();
    return { included, excluded, classifications };
}

/**
 * Get AI classification for a single article (for real-time use)
 */
export async function getArticleClassification(article: NormalizedItem): Promise<AIClassificationResult | null> {
    return classifyWithAI(
        article.title || '',
        article.description || '',
        article.source || ''
    );
}

export default {
    classifyWithAI,
    batchClassifyWithAI,
    filterArticlesWithAI,
    getArticleClassification
};
