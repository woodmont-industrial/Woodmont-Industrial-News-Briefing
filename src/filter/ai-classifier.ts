/**
 * AI-Powered Article Classifier using Google Gemini (FREE tier)
 *
 * Classifies articles for Woodmont Industrial Partners briefing:
 * - Determines category (relevant, transactions, availabilities, people, exclude)
 * - Scores relevance to NJ/PA/FL industrial real estate (0-100)
 * - Extracts tracking keywords
 * - Generates brief summary
 */

import { NormalizedItem } from '../types/index.js';

// Google Gemini API configuration (FREE tier: 15 req/min, 1M tokens/month)
// Using gemini-1.5-flash via v1 API
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent';

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
const SYSTEM_PROMPT = `You are an article classifier for Woodmont Industrial Partners, a commercial real estate firm focused on INDUSTRIAL properties (warehouses, logistics, distribution, manufacturing, cold storage) in New Jersey, Pennsylvania, and Florida.

Your job is to classify news articles into one of these categories:

1. "relevant" - Macro trends affecting industrial CRE: interest rates, freight/logistics trends, construction costs, labor markets, e-commerce growth, supply chain news, industrial market reports
2. "transactions" - Industrial property SALES or LEASES: warehouse sold, distribution center leased, industrial portfolio acquired. Must be actual real estate deals, not stock/business transactions.
3. "availabilities" - Industrial properties FOR SALE or FOR LEASE: new listings, spec developments available, build-to-suit opportunities
4. "people" - Personnel moves in industrial CRE: broker promotions, developer hires, executive appointments at industrial firms/REITs
5. "exclude" - NOT relevant: political news, international markets (unless port-related), residential, retail, office, hospitality, sports, entertainment, crypto, stocks

STRICT RULES:
- Focus regions: NJ, PA, FL only. Exclude articles primarily about other states unless they have national industrial market implications.
- EXCLUDE all political content (Trump, Biden, elections, executive orders, tariffs unless directly about industrial imports)
- EXCLUDE international news (India, China, UK, Europe) unless about US port activity or supply chain impact
- EXCLUDE residential, retail, office, hotel, self-storage (unless industrial conversion)
- For "transactions": Must have real estate deal signals (sold, acquired, leased property) + industrial context + ideally size (SF) or price ($)
- For "availabilities": Must be property listings or new developments seeking tenants/buyers

Respond in JSON format only.`;

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
 * Classify an article using Google Gemini
 */
export async function classifyWithAI(
    title: string,
    description: string,
    source: string
): Promise<AIClassificationResult | null> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.warn('GEMINI_API_KEY not set, skipping AI classification');
        return null;
    }

    try {
        const userPrompt = USER_PROMPT_TEMPLATE
            .replace('{title}', title || 'No title')
            .replace('{description}', (description || '').substring(0, 500))
            .replace('{source}', source || 'Unknown');

        const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: fullPrompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 300
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Gemini API error:', response.status, error);
            return null;
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            console.error('No content in Gemini response');
            return null;
        }

        // Parse JSON response (handle potential markdown code blocks)
        let jsonStr = content;
        // Remove markdown code blocks if present
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');

        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('Could not parse JSON from Gemini response:', content);
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
 * Batch classify multiple articles (with rate limiting for Gemini free tier: 15 req/min)
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
        maxConcurrent = 3, // Lower for Gemini free tier (15 req/min)
        delayMs = 500 // Slower to respect rate limits
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

        // Delay between batches to respect Gemini rate limits (15 req/min)
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
