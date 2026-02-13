/**
 * AI-Powered Article Description Generator using Groq
 *
 * Generates detailed 2-3 sentence summaries for articles missing descriptions.
 * Focuses on: location, size, key players, terms — per boss's briefing spec.
 */

import { NormalizedItem } from '../types/index.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `You are a senior commercial real estate analyst writing article summaries for an industrial real estate daily briefing read by executives at Woodmont Industrial Partners.

Your summaries must be:
- 2-3 sentences, approximately 250-400 characters
- Factual, specific, and professional — no filler words or vague language
- Focused on actionable intelligence: WHO did WHAT, WHERE, for HOW MUCH, and WHY it matters
- Include: exact location (city, state), deal size (SF and/or $), key players/companies, and deal terms when available
- For market reports: cite specific metrics (vacancy %, absorption SF, rent $/SF, cap rates)
- For personnel moves: name, new title, firm, and significance
- Target markets: New Jersey, Pennsylvania (especially Lehigh Valley, Philadelphia), Florida (especially South Florida, Miami)
- Industrial CRE focus: warehouse, logistics, distribution, manufacturing, last-mile, cold storage

If the title contains specific deal details, expand on the significance — don't just rephrase the title.
If limited info is available, provide context about the market or players mentioned.

Examples:
- "Prologis signed a 250,000 SF warehouse lease in Edison, NJ with Amazon for a last-mile distribution center. The deal reflects continued e-commerce demand in the Exit 8A corridor where vacancy sits below 3%."
- "CBRE reports NJ industrial vacancy fell to 4.2% in Q4 2025, with 8.5M SF of net absorption driven by 3PL and logistics tenants. Asking rents climbed 6.2% year-over-year to $17.50/SF NNN."
- "NAI Hanson brokered the $32M sale of a 180,000 SF distribution facility in Carteret, NJ to Bridge Industrial. The 5.1% cap rate signals strong investor appetite for Class A logistics assets in the northern NJ submarket."
- "Crow Holdings completed a 294,000 SF spec warehouse in Burlington, NJ with 156,000 SF still available for lease. The 40-foot clear height building targets e-commerce and distribution users along the I-295 corridor."`;

const USER_PROMPT = `Write a detailed 2-3 sentence summary (250-400 characters) for this article. Include location, deal size, key players, and market significance.

TITLE: {title}
SOURCE: {source}
EXISTING DESCRIPTION: {existing_desc}

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
    'insufficient information',
    'source is unknown',
    'no summary available',
    'summary unavailable',
    'not available',
    'no information available',
    'cannot determine',
    'no details available',
    'based on the title alone',
    'without more context',
    'without additional details',
    'the article appears to'
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

    // Process in batches of 3 (llama-3.1-8b-instant handles this easily)
    const BATCH_SIZE = 3;
    const BATCH_DELAY_MS = 2000;
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
        // Derive source from article metadata or URL domain
        let sourceName = article.source || '';
        if (!sourceName) {
            try {
                const url = (article as any).url || article.link || '';
                if (url) sourceName = new URL(url).hostname.replace('www.', '');
            } catch {}
        }

        // Include any existing short description as context for the AI
        const existingDesc = (article.description || (article as any).content_text || '').trim();

        const prompt = USER_PROMPT
            .replace('{title}', article.title || 'No title')
            .replace('{source}', sourceName || 'Industry publication')
            .replace('{existing_desc}', existingDesc.length > 5 ? existingDesc.substring(0, 500) : 'None');

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
                    temperature: 0.4,
                    max_tokens: 300
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

        if (!content || content.length < 20) return null;

        // Clean up: remove quotes, markdown, ensure max length
        let desc = content
            .replace(/^["']|["']$/g, '')
            .replace(/^Summary:\s*/i, '')
            .replace(/\*\*/g, '')
            .replace(/^[-•]\s*/gm, '')
            .trim();

        // Reject garbage responses where AI couldn't generate a real summary
        const descLower = desc.toLowerCase();
        if (GARBAGE_PATTERNS.some(p => descLower.includes(p))) {
            console.log(`[AI Desc] Rejected garbage response for "${article.title?.substring(0, 40)}"`);
            return null;
        }

        // Cap at 500 chars (2-3 good sentences)
        if (desc.length > 500) {
            desc = desc.substring(0, 497).replace(/\s+\S*$/, '') + '...';
        }

        return desc;
    } catch (error) {
        console.error(`[AI Desc] Error for "${article.title?.substring(0, 40)}":`, (error as Error).message);
        return null;
    }
}
