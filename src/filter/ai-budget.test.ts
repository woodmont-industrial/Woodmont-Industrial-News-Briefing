import assert from 'node:assert/strict';
import { getAIProviders, resetDisabledProviders, isProviderDisabled } from './ai-provider.js';
import { classifyWoodmontBatch } from './llm-classifier.js';
import { createDescriptionBudget, generateDescriptions } from './description-generator.js';
import type { NormalizedItem } from '../types/index.js';

// 2026-11-18: the build's editorial review got 92 Cerebras HTTP 402s (one per story) and the send
// spent 5m43s summarizing 81 deep-refill candidates under Groq rate limits (delivered 8:06).

const names = ['GROQ_API_KEY', 'CEREBRAS_API_KEY', 'GROQ_MODEL', 'CEREBRAS_MODEL', 'AI_SUMMARY_BUDGET_MS'];
const saved = Object.fromEntries(names.map(n => [n, process.env[n]]));
const originalFetch = globalThis.fetch;
const story = (i: number): NormalizedItem => ({
    id: `synthetic-${i}`, title: `Example Tenant ${i} leases a 120,000 SF industrial warehouse in Edison, New Jersey`,
    description: '', source: 'Example publication', link: `https://example.test/${i}`, pubDate: new Date().toISOString(),
});
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const verdict = JSON.stringify({ approve: true, reason: 'Real industrial warehouse lease', confidence: 90 });
const summary = 'Edison, NJ — Example Tenant leased a 120,000 SF industrial warehouse.';

async function main() {
    try {
        for (const n of names) delete process.env[n];
        process.env.GROQ_API_KEY = 'synthetic-test-credential';
        process.env.CEREBRAS_API_KEY = 'synthetic-test-credential';

        // 1. One 402 stops the provider for the rest of the run, across every AI caller.
        resetDisabledProviders();
        const calls: Record<string, number> = {};
        globalThis.fetch = async (resource) => {
            const host = new URL(String(resource)).hostname.includes('cerebras') ? 'Cerebras' : 'Groq';
            calls[host] = (calls[host] || 0) + 1;
            if (host === 'Cerebras') return new Response('{"error":"payment required"}', { status: 402 });
            return ok(verdict);
        };
        const review = await classifyWoodmontBatch(Array.from({ length: 12 }, (_, i) => story(i)), 2, 0, 30_000);
        assert.ok(calls.Cerebras <= 2, `one parallel batch of 402s, not one per story (got ${calls.Cerebras})`);
        assert.equal(review.classified, 12, 'Groq reviews every story');
        assert.ok(isProviderDisabled('Cerebras'));
        assert.deepEqual(getAIProviders().map(p => p.name), ['Groq'], 'later callers do not see the provider');
        const firstPass = calls.Cerebras;
        const second = await classifyWoodmontBatch([story(20), story(21)], 2, 0, 30_000);
        assert.equal(calls.Cerebras, firstPass, 'a second review pass in the same run does not retry it');
        assert.equal(second.classified, 2);

        // 2. A summary provider cut off mid-run hands over to the next provider.
        resetDisabledProviders();
        const order: string[] = [];
        globalThis.fetch = async (resource) => {
            const host = new URL(String(resource)).hostname.includes('cerebras') ? 'Cerebras' : 'Groq';
            order.push(host);
            if (host === 'Groq') return new Response('{"error":"payment required"}', { status: 402 });
            return ok(summary);
        };
        const handover = Array.from({ length: 6 }, (_, i) => story(30 + i));
        const r2 = await generateDescriptions(handover, createDescriptionBudget(30_000));
        assert.ok(order.filter(h => h === 'Groq').length <= 4, 'at most one batch of 402s');
        assert.ok(r2.generated >= 2, `the next provider summarizes the rest (got ${r2.generated})`);

        // 3. A shared time limit: rate limits cannot hold the send past it.
        resetDisabledProviders();
        delete process.env.CEREBRAS_API_KEY;
        let requests = 0;
        globalThis.fetch = async () => {
            requests++;
            return new Response('{"error":"rate limited"}', { status: 429, headers: { 'retry-after': '4' } });
        };
        const budget = createDescriptionBudget(1_500);
        const started = Date.now();
        const deep = Array.from({ length: 81 }, (_, i) => story(100 + i));
        const r3 = await generateDescriptions(deep, budget);
        const second3 = await generateDescriptions([story(300), story(301)], budget);
        const elapsed = Date.now() - started;
        assert.ok(elapsed < 4_000, `81 rate-limited summaries finish near the 1.5s limit (took ${elapsed}ms)`);
        assert.ok(r3.skippedForBudget > 70, `stories past the limit keep their headline (skipped ${r3.skippedForBudget})`);
        assert.equal(second3.skippedForBudget, 2, 'the limit is shared by later calls in the same send');
        assert.ok(requests < 20, `no request storm (got ${requests})`);
        assert.ok(deep.every(a => a.description === ''), 'nothing invented when no summary came back');

        // 4. The default limit, and the environment override.
        process.env.AI_SUMMARY_BUDGET_MS = '5000';
        const configured = createDescriptionBudget();
        assert.ok(configured.deadline - Date.now() <= 5_000 && configured.deadline - Date.now() > 4_000);
        delete process.env.AI_SUMMARY_BUDGET_MS;
        assert.ok(createDescriptionBudget().deadline - Date.now() > 60_000, 'default limit is 90s');

        console.log('ai-budget tests passed');
    } finally {
        globalThis.fetch = originalFetch;
        resetDisabledProviders();
        for (const n of names) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
    }
}

main().catch(error => { console.error(error); process.exit(1); });
