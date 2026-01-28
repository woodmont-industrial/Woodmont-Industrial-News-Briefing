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

// System prompt for the classifier
const SYSTEM_PROMPT = `You are an article classifier for Woodmont Industrial Partners. You focus on real estate news relevant to THREE states: New Jersey, Pennsylvania, and Florida.

CLASSIFY INTO ONE CATEGORY:

1. "relevant" - Real estate market news:
   - Articles mentioning NJ, PA, or FL cities/counties/regions
   - National CRE trends that impact NJ/PA/FL markets (interest rates, cap rates, industrial demand, e-commerce logistics)
   - Major players active in NJ/PA/FL (Prologis, Duke Realty, Blackstone, CBRE, JLL, Cushman, Colliers)
   - Market reports, economic news, construction trends

2. "transactions" - Property SALES or LEASES:
   - Deals in NJ/PA/FL regardless of size
   - Acquisitions, dispositions, leases signed
   - Include even without specific $ or SF mentioned

3. "availabilities" - Properties FOR SALE/LEASE:
   - Any listing in NJ/PA/FL markets
   - Properties hitting the market, newly marketed
   - Include ALL availability news regardless of size

4. "people" - Personnel moves in CRE:
   - Hires, promotions, appointments at firms active in NJ/PA/FL
   - Include national firms with NJ/PA/FL operations
   - Executive moves, team expansions, new offices

5. "exclude" - ONLY these:
   - Articles PRIMARILY about other states with NO NJ/PA/FL relevance
   - Political news (Trump, Biden, tariffs, elections, executive orders)
   - Purely residential single-family home news

LOCATION FLEXIBILITY:
- Include if mentions NJ/PA/FL cities: Newark, Jersey City, Edison, Trenton, Camden, Meadowlands, Exit 8A, Philadelphia, Pittsburgh, Lehigh Valley, Miami, Tampa, Orlando, Jacksonville, Fort Lauderdale, etc.
- Include if mentions NJ/PA/FL counties: Bergen, Middlesex, Monmouth, Morris, Burlington, Camden, Gloucester, Bucks, Chester, Montgomery, Broward, Miami-Dade, Palm Beach, etc.
- Include national trends/major players even without specific state mention
- When in doubt, INCLUDE rather than exclude

BE INCLUSIVE: The goal is to capture 10-15% of articles, not 2%. Include anything potentially relevant.

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
        minRelevanceScore = 25,
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
