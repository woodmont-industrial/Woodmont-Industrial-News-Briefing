/**
 * AI-Powered Article Description Generator using Groq
 *
 * Generates 1-2 sentence summaries for articles missing descriptions.
 * Focuses on: location, size, key players, terms — per boss's briefing spec.
 */

import { NormalizedItem } from '../types/index.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `You write concise article summaries for an industrial real estate daily briefing.

Rules:
- Write exactly 1-2 sentences, max 180 characters total.
- Include: location, deal size (SF or $), key players/companies, and terms when available.
- Focus on industrial CRE: warehouse, logistics, distribution, manufacturing.
- Target markets: New Jersey, Pennsylvania, Florida.
- Be factual and specific. No filler words.
- If the title already says everything, just rephrase it more concisely with any extra context.

Examples of good summaries:
- "Prologis signed a 250,000 SF warehouse lease in Edison, NJ with Amazon for a last-mile distribution center."
- "CBRE reports NJ industrial vacancy fell to 4.2% in Q4, with 8.5M SF of net absorption driven by logistics demand."
- "NAI Hanson brokered the $32M sale of a 180,000 SF distribution facility in Carteret, NJ to Bridge Industrial."`;

const USER_PROMPT = `Summarize this article in 1-2 sentences (max 180 chars). Include location, size, players, terms if available.

TITLE: {title}
SOURCE: {source}

Summary:`;

// Skip AI generation for paywalled sources — AI can't read the article anyway
const PAYWALLED_SOURCES = [
    'wsj', 'wall street journal', 'bloomberg', 'costar', 'bisnow',
    'globest', 'commercial observer', 'therealdeal', 'the real deal',
    'bizjournals', 'business journal', 'njbiz', 'lvb'
];

function isPaywalled(source: string, url: string): boolean {
    const check = (source + ' ' + url).toLowerCase();
    return PAYWALLED_SOURCES.some(pw => check.includes(pw));
}

// Reject garbage AI responses
const GARBAGE_PATTERNS = [
    'no specific information',
    'please provide',
    'i cannot',
    'i don\'t have',
    'not enough information',
    'unable to summarize',
    'no article details',
    'no details provided',
    'insufficient information'
];

/**
 * Generate descriptions for articles missing them
 */
export async function generateDescriptions(articles: NormalizedItem[]): Promise<void> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.log('[AI Desc] GROQ_API_KEY not set, skipping description generation');
        return;
    }

    const needsDesc = articles.filter(a => {
        if (a.description && a.description.trim().length >= 20) return false;
        // Skip paywalled — AI will hallucinate without article content
        if (isPaywalled(a.source || '', (a as any).url || a.link || '')) return false;
        return true;
    });
    if (needsDesc.length === 0) {
        console.log('[AI Desc] All articles already have descriptions');
        return;
    }

    console.log(`[AI Desc] Generating descriptions for ${needsDesc.length} articles...`);

    // Process in batches of 2 to stay under rate limits
    const BATCH_SIZE = 2;
    const BATCH_DELAY_MS = 3000;
    let generated = 0;

    for (let i = 0; i < needsDesc.length; i += BATCH_SIZE) {
        const batch = needsDesc.slice(i, i + BATCH_SIZE);

        const promises = batch.map(article => generateSingleDescription(article, apiKey));
        const results = await Promise.allSettled(promises);

        for (let j = 0; j < results.length; j++) {
            if (results[j].status === 'fulfilled') {
                const desc = (results[j] as PromiseFulfilledResult<string | null>).value;
                if (desc) {
                    batch[j].description = desc;
                    generated++;
                }
            }
        }

        // Delay between batches to avoid rate limits
        if (i + BATCH_SIZE < needsDesc.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    console.log(`[AI Desc] Generated ${generated}/${needsDesc.length} descriptions`);
}

async function generateSingleDescription(
    article: NormalizedItem,
    apiKey: string
): Promise<string | null> {
    try {
        const prompt = USER_PROMPT
            .replace('{title}', article.title || 'No title')
            .replace('{source}', article.source || 'Unknown');

        let response: Response | null = null;
        let retries = 0;

        while (retries < 3) {
            response = await fetch(GROQ_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 150
                })
            });

            if (response.status === 429) {
                retries++;
                const waitTime = Math.pow(2, retries) * 2000;
                console.log(`[AI Desc] Rate limited, waiting ${waitTime / 1000}s (retry ${retries}/3)`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            break;
        }

        if (!response || !response.ok) return null;

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();

        if (!content || content.length < 10) return null;

        // Clean up: remove quotes, markdown, ensure max length
        let desc = content
            .replace(/^["']|["']$/g, '')
            .replace(/^Summary:\s*/i, '')
            .replace(/\*\*/g, '')
            .trim();

        // Reject garbage responses where AI couldn't generate a real summary
        const descLower = desc.toLowerCase();
        if (GARBAGE_PATTERNS.some(p => descLower.includes(p))) {
            console.log(`[AI Desc] Rejected garbage response for "${article.title?.substring(0, 40)}"`);
            return null;
        }

        if (desc.length > 200) {
            desc = desc.substring(0, 197).replace(/\s+\S*$/, '') + '...';
        }

        return desc;
    } catch (error) {
        console.error(`[AI Desc] Error for "${article.title?.substring(0, 40)}":`, (error as Error).message);
        return null;
    }
}
