/**
 * AI-Powered Article Classifier using Groq (FREE tier)
 *
 * Classifies articles for Woodmont Industrial Partners briefing:
 * - Determines category (relevant, transactions, availabilities, people, exclude)
 * - Scores relevance to NJ/PA/FL industrial real estate (0-100)
 * - Extracts tracking keywords
 * - Generates brief summary
 */

import { NormalizedItem } from '../types/index.js';

// Groq API configuration (FREE tier - very fast, generous limits)
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant'; // Fast, free model

export interface AIClassificationResult {
    category: 'relevant' | 'transactions' | 'availabilities' | 'people' | 'exclude';
    relevanceScore: number; // 0-100
    reason: string; // Why this classification
    keywords: string[]; // Suggested tracking keywords
    summary: string; // Brief 1-sentence summary
    isIndustrial: boolean;
    region: string | null; // NJ, PA, FL, or null if not regional
}

// System prompt for the classifier - VERY STRICT
const SYSTEM_PROMPT = `You are a STRICT article classifier for Woodmont Industrial Partners. You ONLY care about INDUSTRIAL real estate (warehouses, logistics centers, distribution facilities, manufacturing plants, cold storage) in THREE states: New Jersey, Pennsylvania, and Florida.

CLASSIFY INTO ONE CATEGORY:

1. "relevant" - Industrial market news ONLY if it mentions NJ, PA, or FL specifically, OR is about national industrial/logistics trends that directly affect these markets
2. "transactions" - Industrial property SALES or LEASES that are PHYSICALLY LOCATED in NJ, PA, or FL. The property itself must be in these states.
3. "availabilities" - Industrial properties FOR SALE/LEASE in NJ, PA, or FL only
4. "people" - Personnel moves at industrial CRE firms operating in NJ, PA, or FL
5. "exclude" - EVERYTHING ELSE

MUST EXCLUDE (classify as "exclude"):
- ANY article about states OTHER than NJ, PA, FL (Texas, California, Indiana, Ohio, etc.)
- Residential real estate (homes, apartments, condos, housing)
- Retail, office, hospitality, self-storage
- Political news (Trump, Biden, tariffs, elections)
- International news (China, India, Europe, UK)
- Stock market, crypto, general business news
- Weather, sports, entertainment
- Realtors associations, residential brokers
- Company expansions in OTHER states (even if company is from NJ/PA/FL)

LOCATION CHECK - BE STRICT:
- "Company X expands in Texas" = EXCLUDE (wrong state)
- "NJ-based company buys property in Indiana" = EXCLUDE (property not in NJ/PA/FL)
- "Warehouse sold in New Jersey" = transactions (correct)
- "Miami industrial market report" = relevant (correct)

If unsure, choose "exclude". Be VERY strict.

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
 * Classify an article using Groq
 */
export async function classifyWithAI(
    title: string,
    description: string,
    source: string
): Promise<AIClassificationResult | null> {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        console.warn('GROQ_API_KEY not set, skipping AI classification');
        return null;
    }

    try {
        const userPrompt = USER_PROMPT_TEMPLATE
            .replace('{title}', title || 'No title')
            .replace('{description}', (description || '').substring(0, 500))
            .replace('{source}', source || 'Unknown');

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.1,
                max_tokens: 300
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Groq API error:', response.status, error);
            return null;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            console.error('No content in Groq response');
            return null;
        }

        // Parse JSON response (handle potential markdown code blocks)
        let jsonStr = content;
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('Could not parse JSON from Groq response:', content);
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
    const {
        minRelevanceScore = 30,
        maxConcurrent = 5, // Groq has generous rate limits
        delayMs = 200
    } = options;

    const results = new Map<string, AIClassificationResult>();

    // Process in batches to avoid rate limits
    for (let i = 0; i < articles.length; i += maxConcurrent) {
        const batch = articles.slice(i, i + maxConcurrent);

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
        if (i + maxConcurrent < articles.length) {
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
    minRelevanceScore: number = 40
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
