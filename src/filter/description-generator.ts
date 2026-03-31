/**
 * AI-Powered Article Description Generator
 *
 * Generates factual 1-3 sentence summaries for articles missing descriptions.
 * CRITICAL: Only states facts from the title/description — never invents details.
 *
 * Provider: Cerebras (preferred) or Groq (fallback) via ai-provider.ts
 */

import { NormalizedItem } from '../types/index.js';
import { getAIProvider, trackTokenUsage, logTokenUsage } from './ai-provider.js';

const SYSTEM_PROMPT = `You summarize commercial real estate news articles for an industry briefing.

CRITICAL RULES — NEVER VIOLATE THESE:
1. ONLY state facts that appear in the TITLE or EXISTING DESCRIPTION provided. Do NOT invent, assume, or fabricate any details.
2. NEVER make up dollar amounts, square footage, company names, locations, cap rates, or any specific numbers that are not in the provided text.
3. NEVER mention companies or people not named in the title or description.
4. If the title only names a company and an action, just describe that action concisely — do NOT add fake specifics.
5. If you don't know a detail, LEAVE IT OUT. A shorter accurate summary is always better than a longer fabricated one.
6. Write 1-2 sentences max. Be concise and scannable.
7. ALWAYS lead with key deal fields in this order (skip any field not explicitly in the source):
   Location + Size + Key Players + Terms → then a brief context sentence if needed.

FORMAT EXAMPLES (only use facts from source):

Title: "Prologis signs 250,000 SF lease in Edison, NJ with Amazon"
→ "Edison, NJ — 250,000 SF lease. Prologis signed with Amazon as tenant."

Title: "Seagis Property Group leases 25,000 sq. ft. at industrial building in Carlstadt"
→ "Carlstadt, NJ — 25,000 SF. Seagis Property Group signed two new leases at an updated industrial building."

Title: "Manufacturer buys 50,000 sq. ft. Edison warehouse for $18 million"
→ "Edison, NJ — 50,000 SF, $18M sale. A manufacturer purchased a modern industrial warehouse from NAI DiLeo-Bram."

Title: "Industrial vacancy rates decline in Q4"
→ "Industrial vacancy rates declined in Q4, signaling tightening market conditions."

Title: "Brian Godau joins NAI James E. Hanson as vice president"
→ "Brian Godau joined NAI James E. Hanson as vice president in the firm's Parsippany office."

BAD (invents numbers not in title):
Title: "Retail Centers Portfolio Expands With Town Lane Acquisition"
→ "Town Lane acquired a 1.1M SF portfolio for $500M in South Florida." ← FABRICATED!

CORRECT version:
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
    const provider = getAIProvider();
    if (!provider) {
        console.log('[AI Desc] No AI API key set (CEREBRAS_API_KEY or GROQ_API_KEY), skipping description generation');
        return;
    }

    const needsDesc = articles.filter(a => {
        const desc = (a.description || '').trim();
        const title = (a.title || '').trim();
        // Has a real description (not just the title repeated)
        if (desc.length >= 20) {
            // Check if the description is just the title + source name
            // Google News RSS sets description = "Article Title SourceName"
            const titleNorm = title.toLowerCase().replace(/[^\w\s]/g, '').trim();
            const descNorm = desc.toLowerCase().replace(/[^\w\s]/g, '').trim();
            if (descNorm.startsWith(titleNorm) && descNorm.length < titleNorm.length + 40) {
                // Description is basically the title — needs a real one
                return true;
            }
            return false;
        }
        // Skip paywalled — AI will hallucinate without article content
        if (isPaywalled(a.source || '', (a as any).url || a.link || '')) return false;
        return true;
    });
    if (needsDesc.length === 0) {
        console.log('[AI Desc] All articles already have descriptions');
        return;
    }

    console.log(`[AI Desc] [${provider.name}] Generating descriptions for ${needsDesc.length} articles (batch: ${provider.descBatchSize}, delay: ${provider.descBatchDelayMs}ms)...`);

    const BATCH_SIZE = provider.descBatchSize;
    const BATCH_DELAY_MS = provider.descBatchDelayMs;
    let generated = 0;
    let rejected = 0;

    for (let i = 0; i < needsDesc.length; i += BATCH_SIZE) {
        const batch = needsDesc.slice(i, i + BATCH_SIZE);

        const promises = batch.map(article => generateSingleDescription(article, provider));
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
    logTokenUsage();
}

async function generateSingleDescription(
    article: NormalizedItem,
    provider: { name: string; url: string; model: string; apiKey: string }
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
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.1,
                    max_tokens: 300
                })
            });

            if (response.status === 429) {
                retries++;
                const waitTime = Math.pow(2, retries) * 2000;
                console.log(`[AI Desc] [${provider.name}] Rate limited, waiting ${waitTime / 1000}s (retry ${retries}/3)`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            break;
        }

        if (!response || !response.ok) return null;

        const data = await response.json();
        trackTokenUsage(data.usage);
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
