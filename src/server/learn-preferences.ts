/**
 * Groq Learning Loop — Phase 3 of the Newsletter Feedback System
 *
 * Analyzes newsletter feedback (approved/rejected articles) and uses Groq API
 * to identify patterns, then updates scoring weights for future newsletters.
 *
 * Usage:
 *   npx tsx src/server/learn-preferences.ts
 *   npx tsx rssfeed.ts --learn-preferences
 *
 * Requires: GROQ_API_KEY environment variable
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackEntry {
    articleId: string;
    title: string;
    normalizedTitle: string;
    action: 'approved' | 'rejected';
    reason: string | null;
    section: string;
    qualityScore: number;
    source: string;
    region: string | null;
    date: string;
    user: string;
}

interface FeedbackData {
    feedback: FeedbackEntry[];
}

interface ScoringWeights {
    updatedAt: string;
    regionWeights: Record<string, number>;
    sourceWeights: Record<string, number>;
    dealSizeThresholds: {
        highValue_SF: number;
        highValue_dollars: number;
    };
    companyBonus: Record<string, number>;
    topicPreferences: Record<string, number>;
    learnedExclusions: string[];
}

// ---------------------------------------------------------------------------
// Default weights (mirrors the hardcoded values in email.ts scoreArticle)
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS: ScoringWeights = {
    updatedAt: new Date().toISOString().split('T')[0],
    regionWeights: {
        NJ: 30,
        PA: 25,
        FL: 20,
        National: 5,
    },
    sourceWeights: {
        're-nj.com': 10,
        'commercialobserver.com': 10,
        'bisnow.com': 10,
        'globest.com': 10,
        'costar.com': 10,
        'news.google.com': 0,
    },
    dealSizeThresholds: {
        highValue_SF: 100000,
        highValue_dollars: 50000000,
    },
    companyBonus: {
        prologis: 15,
        amazon: 15,
        blackstone: 15,
        ares: 15,
        eqt: 15,
        'link logistics': 15,
        'bridge industrial': 15,
        sagard: 15,
        woodmont: 15,
    },
    topicPreferences: {
        logistics: 10,
        cold_storage: 8,
        data_center: 5,
        last_mile: 8,
        industrial_outdoor_storage: 10,
    },
    learnedExclusions: [],
};

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

function resolveDocsPath(filename: string): string {
    // Works from repo root regardless of cwd
    const repoRoot = path.resolve(__dirname, '..', '..');
    return path.join(repoRoot, 'docs', filename);
}

// ---------------------------------------------------------------------------
// Load feedback data (last 30 days)
// ---------------------------------------------------------------------------

function loadFeedback(): FeedbackEntry[] {
    const feedbackPath = resolveDocsPath('newsletter-feedback.json');
    if (!fs.existsSync(feedbackPath)) {
        console.log('📭 No feedback file found — nothing to learn from.');
        return [];
    }

    try {
        const raw = fs.readFileSync(feedbackPath, 'utf-8');
        const data: FeedbackData = JSON.parse(raw);

        if (!data.feedback || !Array.isArray(data.feedback) || data.feedback.length === 0) {
            console.log('📭 Feedback file is empty — nothing to learn from.');
            return [];
        }

        // Filter to last 30 days
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const recent = data.feedback.filter(f => {
            if (!f.date) return false;
            return new Date(f.date) >= cutoff;
        });

        console.log(`📊 Loaded ${recent.length} feedback entries from last 30 days (${data.feedback.length} total)`);
        return recent;
    } catch (err) {
        console.error('❌ Failed to parse feedback file:', (err as Error).message);
        return [];
    }
}

// ---------------------------------------------------------------------------
// Load current scoring weights
// ---------------------------------------------------------------------------

function loadCurrentWeights(): ScoringWeights {
    const weightsPath = resolveDocsPath('scoring-weights.json');
    if (!fs.existsSync(weightsPath)) {
        console.log('📝 No scoring-weights.json found — using defaults.');
        return { ...DEFAULT_WEIGHTS };
    }

    try {
        const raw = fs.readFileSync(weightsPath, 'utf-8');
        const weights: ScoringWeights = JSON.parse(raw);
        console.log(`📊 Loaded current weights (last updated: ${weights.updatedAt})`);
        return weights;
    } catch (err) {
        console.error('⚠️ Failed to parse scoring-weights.json — using defaults:', (err as Error).message);
        return { ...DEFAULT_WEIGHTS };
    }
}

// ---------------------------------------------------------------------------
// Call Groq API
// ---------------------------------------------------------------------------

async function callGroq(feedback: FeedbackEntry[], currentWeights: ScoringWeights): Promise<ScoringWeights | null> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error('❌ GROQ_API_KEY environment variable not set');
        return null;
    }

    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    // Summarize feedback for the prompt (don't send massive payloads)
    const feedbackSummary = feedback.map(f => ({
        title: f.title,
        action: f.action,
        reason: f.reason,
        section: f.section,
        source: f.source,
        region: f.region,
        qualityScore: f.qualityScore,
    }));

    const prompt = `You are analyzing newsletter feedback for a commercial industrial real estate (CRE) briefing sent to a senior executive.

Here is the recent feedback (articles approved and rejected by the user):
${JSON.stringify(feedbackSummary, null, 2)}

Current scoring weights:
${JSON.stringify(currentWeights, null, 2)}

Analyze the patterns:
- Which regions does the user prefer? (look at approved vs rejected by region)
- Which sources does the user trust? (approved sources vs rejected sources)
- What deal sizes matter? (look at SF and dollar amounts in approved articles)
- Which companies/topics are preferred?
- What types of articles get rejected? (look at rejection reasons)

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "regionWeights": {"NJ": number, "PA": number, "FL": number, "National": number},
  "sourceWeights": {"domain.com": number, ...},
  "dealSizeThresholds": {"highValue_SF": number, "highValue_dollars": number},
  "companyBonus": {"company": number, ...},
  "topicPreferences": {"topic": number, ...},
  "learnedExclusions": ["keyword1", "keyword2"]
}`;

    console.log(`🤖 Calling Groq API (model: ${model})...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a data analyst for a commercial real estate newsletter. Return ONLY valid JSON, no markdown fences, no explanations.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.2,
                max_tokens: 2000,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Groq API error (${response.status}):`, errorText);
            return null;
        }

        const data = await response.json() as {
            choices: Array<{ message: { content: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };

        if (data.usage) {
            console.log(`📊 Groq tokens: ${data.usage.total_tokens} total (${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion)`);
        }

        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            console.error('❌ Empty response from Groq API');
            return null;
        }

        return parseGroqResponse(content, currentWeights);
    } catch (err) {
        console.error('❌ Groq API call failed:', (err as Error).message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Parse Groq response — handle potential markdown wrapping
// ---------------------------------------------------------------------------

function parseGroqResponse(content: string, currentWeights: ScoringWeights): ScoringWeights | null {
    // Strip markdown code fences if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
        // Remove opening fence (```json or ```)
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
        // Remove closing fence
        cleaned = cleaned.replace(/\n?```\s*$/, '');
    }

    // Try to extract JSON object if there's surrounding text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        console.error('❌ Could not find JSON object in Groq response');
        console.error('   Raw response:', content.substring(0, 200));
        return null;
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate structure — must have at least regionWeights
        if (!parsed.regionWeights || typeof parsed.regionWeights !== 'object') {
            console.error('❌ Invalid response structure: missing regionWeights');
            return null;
        }

        // Merge with current weights to preserve any fields Groq didn't return
        const updated: ScoringWeights = {
            updatedAt: new Date().toISOString().split('T')[0],
            regionWeights: { ...currentWeights.regionWeights, ...parsed.regionWeights },
            sourceWeights: { ...currentWeights.sourceWeights, ...parsed.sourceWeights },
            dealSizeThresholds: { ...currentWeights.dealSizeThresholds, ...parsed.dealSizeThresholds },
            companyBonus: { ...currentWeights.companyBonus, ...parsed.companyBonus },
            topicPreferences: { ...currentWeights.topicPreferences, ...parsed.topicPreferences },
            // Learned exclusions are ADDITIVE — merge old + new, deduplicate
            learnedExclusions: [
                ...new Set([
                    ...(currentWeights.learnedExclusions || []),
                    ...(parsed.learnedExclusions || []),
                ]),
            ],
        };

        // Sanity check: clamp all numeric weights to reasonable ranges
        for (const key of Object.keys(updated.regionWeights)) {
            updated.regionWeights[key] = clamp(updated.regionWeights[key], 0, 50);
        }
        for (const key of Object.keys(updated.sourceWeights)) {
            updated.sourceWeights[key] = clamp(updated.sourceWeights[key], -10, 25);
        }
        for (const key of Object.keys(updated.companyBonus)) {
            updated.companyBonus[key] = clamp(updated.companyBonus[key], 0, 30);
        }
        for (const key of Object.keys(updated.topicPreferences)) {
            updated.topicPreferences[key] = clamp(updated.topicPreferences[key], -5, 20);
        }
        updated.dealSizeThresholds.highValue_SF = clamp(updated.dealSizeThresholds.highValue_SF, 10000, 1000000);
        updated.dealSizeThresholds.highValue_dollars = clamp(updated.dealSizeThresholds.highValue_dollars, 1000000, 500000000);

        return updated;
    } catch (err) {
        console.error('❌ Failed to parse Groq JSON response:', (err as Error).message);
        console.error('   Cleaned content:', cleaned.substring(0, 300));
        return null;
    }
}

function clamp(value: number, min: number, max: number): number {
    if (typeof value !== 'number' || isNaN(value)) return min;
    return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Save updated weights
// ---------------------------------------------------------------------------

function saveWeights(weights: ScoringWeights): void {
    const weightsPath = resolveDocsPath('scoring-weights.json');
    fs.writeFileSync(weightsPath, JSON.stringify(weights, null, 2) + '\n', 'utf-8');
    console.log(`✅ Updated scoring-weights.json (${Object.keys(weights.regionWeights).length} regions, ${Object.keys(weights.sourceWeights).length} sources, ${weights.learnedExclusions.length} exclusions)`);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function learnPreferences(): Promise<boolean> {
    console.log('🧠 Starting Groq learning loop...\n');

    // 1. Load feedback
    const feedback = loadFeedback();
    if (feedback.length === 0) {
        console.log('\n✅ No feedback to process — scoring weights unchanged.');
        return true; // Not an error, just nothing to do
    }

    // 2. Load current weights
    const currentWeights = loadCurrentWeights();

    // 3. Summarize feedback stats
    const approved = feedback.filter(f => f.action === 'approved').length;
    const rejected = feedback.filter(f => f.action === 'rejected').length;
    console.log(`\n📈 Feedback summary: ${approved} approved, ${rejected} rejected`);

    const rejectionReasons = feedback
        .filter(f => f.action === 'rejected' && f.reason)
        .reduce((acc, f) => {
            acc[f.reason!] = (acc[f.reason!] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    if (Object.keys(rejectionReasons).length > 0) {
        console.log('   Rejection reasons:', JSON.stringify(rejectionReasons));
    }

    // 4. Call Groq API
    const updatedWeights = await callGroq(feedback, currentWeights);
    if (!updatedWeights) {
        console.error('\n❌ Learning failed — scoring weights unchanged.');
        return false;
    }

    // 5. Log changes
    console.log('\n📊 Weight changes:');
    for (const region of Object.keys(updatedWeights.regionWeights)) {
        const old = currentWeights.regionWeights[region] ?? 0;
        const updated = updatedWeights.regionWeights[region];
        if (old !== updated) {
            console.log(`   Region ${region}: ${old} → ${updated}`);
        }
    }
    const newExclusions = updatedWeights.learnedExclusions.filter(
        e => !(currentWeights.learnedExclusions || []).includes(e)
    );
    if (newExclusions.length > 0) {
        console.log(`   New exclusions: ${newExclusions.join(', ')}`);
    }

    // 6. Save
    saveWeights(updatedWeights);
    console.log('\n✅ Learning complete.');
    return true;
}

// ---------------------------------------------------------------------------
// Direct execution
// ---------------------------------------------------------------------------

if (require.main === module) {
    // Load .env if running directly
    try {
        require('dotenv').config();
    } catch {
        // dotenv not required if env vars are set externally
    }

    learnPreferences().then(success => {
        process.exit(success ? 0 : 1);
    }).catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}
