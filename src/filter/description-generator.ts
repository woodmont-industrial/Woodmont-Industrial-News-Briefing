/**
 * AI-Powered Article Description Generator using Groq
 *
 * Generates factual 1-3 sentence summaries for articles missing descriptions.
 * CRITICAL: Only states facts from the title/description — never invents details.
 */

import { NormalizedItem } from '../types/index.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `You summarize commercial real estate news articles for an industry briefing.

CRITICAL RULES — NEVER VIOLATE THESE:
1. ONLY state facts that appear in the TITLE or EXISTING DESCRIPTION provided. Do NOT invent, assume, or fabricate any details.
2. NEVER make up dollar amounts, square footage, company names, locations, cap rates, or any specific numbers that are not in the provided text.
3. NEVER mention companies or people not named in the title or description.
4. If the title only names a company and an action, just describe that action concisely — do NOT add fake specifics.
5. If you don't know a detail, LEAVE IT OUT. A shorter accurate summary is always better than a longer fabricated one.
6. Write 1-3 sentences. Be concise and professional.
7. Focus on: who, what, where, deal size — but ONLY if these details are explicitly provided.

GOOD (only uses facts from title):
Title: "Prologis signs 250,000 SF lease in Edison, NJ with Amazon"
→ "Prologis signed a 250,000 SF lease in Edison, NJ with Amazon as the tenant."

GOOD (title has limited info, keeps it short):
Title: "Industrial vacancy rates decline in Q4"
→ "Industrial vacancy rates declined in the fourth quarter, signaling tightening market conditions."

BAD (invents numbers not in title):
Title: "Retail Centers Portfolio Expands With Town Lane Acquisition"
→ "Town Lane acquired a 1.1M SF portfolio for $500M in South Florida." ← FABRICATED! None of these details were in the title.

CORRECT version:
Title: "Retail Centers Portfolio Expands With Town Lane Acquisition"
→ "Town Lane expanded its retail centers portfolio through a new acquisition."`;

const USER_PROMPT = `Summarize ONLY using facts from the title and description below. Do NOT invent any details.

TITLE: {title}
SOURCE: {source}
EXISTING DESCRIPTION: {existing_desc}

Factual summary:`;

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
 * Verify the AI description doesn't contain fabricated details.
 * Checks that specific numbers/names in the description actually appear in the source text.
 */
function containsFabrication(desc: string, title: string, existingDesc: string): boolean {
    const sourceText = (title + ' ' + existingDesc).toLowerCase();
    const descLower = desc.toLowerCase();

    // Extract dollar amounts from description — they must exist in source
    const descDollars = descLower.match(/\$[\d,.]+\s*(?:million|billion|m|b|k)/gi) || [];
    for (const amount of descDollars) {
        // Check if this amount (or its core number) appears in source
        const num = amount.replace(/[$,\s]/g, '').match(/[\d.]+/)?.[0];
        if (num && !sourceText.includes(num)) {
            return true; // Fabricated dollar amount
        }
    }

    // Extract SF amounts from description — they must exist in source
    const descSF = descLower.match(/[\d,.]+ ?(sf|square feet|sq\.?\s*ft)/gi) || [];
    for (const sf of descSF) {
        const num = sf.match(/[\d,.]+/)?.[0]?.replace(/,/g, '');
        if (num && !sourceText.replace(/,/g, '').includes(num)) {
            return true; // Fabricated SF amount
        }
    }

    // Check for percentage figures
    const descPct = descLower.match(/[\d.]+\s*%/g) || [];
    for (const pct of descPct) {
        const num = pct.replace(/\s*%/, '');
        if (!sourceText.includes(num)) {
            return true; // Fabricated percentage
        }
    }

    // Never mention "woodmont" — the AI shouldn't reference the reader's company
    if (descLower.includes('woodmont')) {
        return true;
    }

    return false;
}

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
    let rejected = 0;

    for (let i = 0; i < needsDesc.length; i += BATCH_SIZE) {
        const batch = needsDesc.slice(i, i + BATCH_SIZE);

        const promises = batch.map(article => generateSingleDescription(article, apiKey));
        const results = await Promise.allSettled(promises);

        for (let j = 0; j < results.length; j++) {
            if (results[j].status === 'fulfilled') {
                const desc = (results[j] as PromiseFulfilledResult<string | null>).value;
                if (desc) {
                    // Post-generation fabrication check
                    const existingDesc = (batch[j].description || (batch[j] as any).content_text || '').trim();
                    if (containsFabrication(desc, batch[j].title || '', existingDesc)) {
                        console.log(`[AI Desc] REJECTED fabrication for "${batch[j].title?.substring(0, 50)}": ${desc.substring(0, 80)}...`);
                        rejected++;
                    } else {
                        batch[j].description = desc;
                        generated++;
                    }
                }
            }
        }

        // Delay between batches to avoid rate limits
        if (i + BATCH_SIZE < needsDesc.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    console.log(`[AI Desc] Generated ${generated}/${needsDesc.length} descriptions (${rejected} rejected as fabrication)`);
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
                    temperature: 0.1,
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
            .replace(/^(Summary|Factual summary):\s*/i, '')
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
