import assert from 'node:assert/strict';
import { getAIProviders, resolveAIModel, modelReasoningEffort, completionModelOptions } from './ai-provider.js';
import { classifyWithAI, batchClassifyWithAI } from './ai-classifier.js';
import { classifyWoodmontBatch } from './llm-classifier.js';
import { generateDescriptions } from './description-generator.js';
import type { NormalizedItem } from '../types/index.js';

async function main() {
    const originalFetch = globalThis.fetch;
    const names = ['GROQ_API_KEY', 'CEREBRAS_API_KEY', 'GROQ_MODEL', 'CEREBRAS_MODEL'];
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    let passed = 0;
    function check(value: unknown, message: string) { assert.ok(value, message); passed++; }
    const item: NormalizedItem = {
        id: 'synthetic-lease', title: 'Example Tenant leases a 120,000 SF industrial warehouse in Edison, New Jersey',
        description: '', source: 'Example publication', link: 'https://example.test/lease',
        pubDate: new Date().toISOString(),
    };
    const classification = { category: 'transactions', relevanceScore: 95, reason: 'NJ industrial lease',
        keywords: ['warehouse'], summary: 'A 120,000 SF warehouse lease in Edison.', isIndustrial: true, region: 'NJ' };
    try {
        check(resolveAIModel('Cerebras') === 'qwen-3.8-27b', 'Cerebras uses the current default');
        check(resolveAIModel('Groq') === 'openai/gpt-oss-20b', 'Groq uses the current default');
        check(resolveAIModel('Cerebras', 'zai-glm-4.7') === 'qwen-3.8-27b', 'a retired override cannot retain the outage');
        check(resolveAIModel('Groq', 'llama-3.1-8b-instant') === 'openai/gpt-oss-20b', 'a retired Groq override is migrated');
        check(resolveAIModel('Cerebras', ' dedicated-model ') === 'dedicated-model', 'an unrelated override is preserved');
        check(modelReasoningEffort('qwen-3.8-27b') === 'none', 'Qwen reasoning is disabled for latency');
        check(modelReasoningEffort('openai/gpt-oss-20b') === 'low', 'GPT OSS uses its supported low mode');
        check(!('reasoning_effort' in completionModelOptions({ model: 'dedicated-model' })), 'unknown models receive no unsupported reasoning option');
        for (const name of names) delete process.env[name];
        check(getAIProviders().length === 0, 'no configured key means no provider');
        for (const selected of ['Groq', 'Cerebras']) {
            for (const name of names) delete process.env[name];
            process.env[selected === 'Groq' ? 'GROQ_API_KEY' : 'CEREBRAS_API_KEY'] = 'synthetic-test-credential';
            const provider = getAIProviders()[0];
            const calls: Record<string, any>[] = [];
            let malformedRubric = false;
            globalThis.fetch = async (resource, init) => {
                assert.equal(String(resource), provider.url);
                assert.ok(init?.signal instanceof AbortSignal, 'every call has a timeout');
                const body = JSON.parse(String(init?.body));
                assert.equal(body.model, provider.model);
                assert.equal(body.reasoning_effort, selected === 'Cerebras' ? 'none' : 'low');
                assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer synthetic-test-credential');
                calls.push(body);
                const prompt = body.messages.map((m: any) => m.content).join('\n');
                let content: string;
                if (prompt.includes('"results" array')) {
                    content = JSON.stringify({ results: [{ index: 0, ...classification }, { index: 1, ...classification }] });
                } else if (prompt.includes('"approve"')) {
                    content = JSON.stringify(malformedRubric ? { reason: 'missing approval', confidence: 95 }
                        : { approve: true, reason: 'Real industrial warehouse lease', confidence: 95 });
                } else if (prompt.includes('Respond with JSON only')) {
                    content = JSON.stringify(classification);
                } else {
                    content = 'Edison, NJ — Example Tenant leased a 120,000 SF industrial warehouse.';
                }
                return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
            };
            const single = await classifyWithAI(item.title, '', item.source!);
            check(single?.category === 'transactions', selected + ' single-item JSON is consumed');
            const batch = await batchClassifyWithAI([item, { ...item, id: 'synthetic-second' }], { delayMs: 0 });
            check(batch.size === 2, selected + ' batch JSON is consumed without per-item fallback');
            const editorialItem = { ...item };
            const editorial = await classifyWoodmontBatch([editorialItem], 1, 0, 30000);
            check(editorial.approved === 1 && editorial.failed === 0, selected + ' editorial JSON is consumed');
            const publishedAt = new Date(Date.now() - 30 * 86400000).toISOString();
            const summaryItem = { ...item, pubDate: publishedAt, date_modified: new Date().toISOString() };
            await generateDescriptions([summaryItem]);
            check(summaryItem.description?.includes('120,000 SF'), selected + ' a factual summary is consumed');
            check(calls.length === 4, selected + ' the four actual call paths were exercised');
            check(calls.slice(0, 3).every(c => c.response_format?.type === 'json_object'), selected + ' classifiers explicitly request JSON');
            check(!calls[3].response_format, selected + ' summaries retain their plain-text format');
            const summaryPrompt = calls[3].messages.map((m: any) => m.content).join('\n');
            check(summaryPrompt.includes('ARTICLE PUBLISHED (UTC): ' + publishedAt), selected + ' summary receives the publication date');
            check(/BRIEFING TIME \(UTC\): \d{4}-\d{2}-\d{2}T/.test(summaryPrompt), selected + ' summary receives the briefing timestamp');
            check(summaryPrompt.includes('Do not add age warnings') && summaryPrompt.includes('Do not imply an event happened today'),
                selected + ' summary separates date context from reader-facing age commentary');
            malformedRubric = true;
            const bad = await classifyWoodmontBatch([{ ...item }], 1, 0, 30000);
            check(bad.failed === 1 && bad.rejected === 0, selected + ' malformed editorial JSON is a failure, not a rejection');
            await generateDescriptions([{ ...item, pubDate: undefined, fetchedAt: new Date().toISOString() }]);
            const undatedPrompt = calls[calls.length - 1].messages.map((m: any) => m.content).join('\n');
            check(undatedPrompt.includes('ARTICLE PUBLISHED (UTC): Not provided'), selected + ' fetch time is never substituted for publication time');
        }
        console.log(`PASS: ${passed} AI provider recovery assertions`);
    } finally {
        globalThis.fetch = originalFetch;
        for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
