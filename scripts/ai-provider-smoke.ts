/** Authenticated compatibility check. Synthetic inputs only; no feed build or delivery. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAIProviders } from '../src/filter/ai-provider.js';
import { classifyWithAI, batchClassifyWithAI } from '../src/filter/ai-classifier.js';
import { classifyWoodmontBatch } from '../src/filter/llm-classifier.js';
import { generateDescriptions } from '../src/filter/description-generator.js';
import type { NormalizedItem } from '../src/types/index.js';

async function main() {
    const configured = getAIProviders();
    const originalFetch = globalThis.fetch;
    const keys = { Groq: process.env.GROQ_API_KEY, Cerebras: process.env.CEREBRAS_API_KEY };
    const report: any = { generatedAt: new Date().toISOString(), syntheticInputs: true, providers: [] };
    let requests = 0;
    const file = path.resolve('artifacts/ai-provider-smoke/result.json');
    const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n'); };
    save();
    if (!keys.Groq || !keys.Cerebras) throw new Error('Both existing provider secrets are required to verify access independently.');
    try {
        for (const configuredProvider of configured) {
            // Isolate providers: a healthy fallback cannot disguise a broken primary.
            delete process.env.GROQ_API_KEY;
            delete process.env.CEREBRAS_API_KEY;
            const keyName = configuredProvider.name === 'Groq' ? 'GROQ_API_KEY' : 'CEREBRAS_API_KEY';
            process.env[keyName] = configuredProvider.apiKey;
            const result: any = { provider: configuredProvider.name, model: configuredProvider.model, success: false, statuses: [] };
            const before = requests;
            globalThis.fetch = async (url, init) => {
                assert.equal(String(url), configuredProvider.url, 'smoke requests stay on the selected completion endpoint');
                assert.equal(init?.method, 'POST');
                if (++requests > 24) throw new Error('Smoke-test request budget exhausted.');
                const response = await originalFetch(url, init);
                result.statuses.push(response.status);
                return response;
            };
            const lease: NormalizedItem = {
                id: 'synthetic-nj-lease',
                title: 'Example Tenant signs a 120,000 SF industrial warehouse lease in Edison, New Jersey',
                description: 'Example Tenant signed the lease for a 120,000 SF warehouse in Edison, New Jersey.',
                source: 'REBusinessOnline', link: 'https://rebusinessonline.com/synthetic-compatibility-fixture',
                pubDate: new Date().toISOString(), category: 'transactions',
            };
            const office: NormalizedItem = {
                id: 'synthetic-office', title: 'Example Tenant leases a 120,000 SF office tower in Dallas, Texas',
                description: 'The deal is an office lease in Dallas, Texas.',
                source: 'REBusinessOnline', link: 'https://rebusinessonline.com/synthetic-office-fixture',
                pubDate: new Date().toISOString(),
            };
            try {
                const single = await classifyWithAI(lease.title, lease.description!, lease.source!);
                assert.ok(single && single.category === 'transactions' && single.isIndustrial === true
                    && Number.isFinite(single.relevanceScore) && typeof single.reason === 'string'
                    && Array.isArray(single.keywords) && typeof single.summary === 'string' && single.region === 'NJ',
                    'single classification must return usable industrial/NJ JSON');
                result.singleClassification = 'pass';
                const batch = await batchClassifyWithAI([{ ...lease }, { ...office }], { delayMs: 0 });
                assert.equal(batch.size, 2, 'batch must classify both synthetic stories');
                assert.equal(batch.get(lease.id)?.category, 'transactions');
                assert.equal(batch.get(office.id)?.category, 'exclude');
                assert.equal(batch.get(office.id)?.isIndustrial, false);
                result.batchClassification = 'pass';
                const editorial = await classifyWoodmontBatch([{ ...lease }], 1, 0, 30000);
                assert.equal(editorial.classified, 1, 'the editorial JSON must be consumed');
                assert.equal(editorial.failed, 0);
                assert.equal(editorial.approved, 1, 'an unambiguous fresh NJ warehouse lease must be approved');
                result.editorialClassification = 'pass';
                const summary = { ...lease, description: '' };
                await generateDescriptions([summary]);
                assert.ok(summary.description.length >= 20 && summary.description !== summary.title, 'a real summary is required');
                assert.match(summary.description, /Edison/i);
                assert.match(summary.description, /120[,.]?000|120\s*K/i);
                result.summary = summary.description;
                result.success = true;
            } catch (error) {
                result.error = error instanceof Error ? error.message : 'Provider compatibility check failed';
            }
            result.requests = requests - before;
            report.providers.push(result);
            save();
            console.log(JSON.stringify(result));
        }
        assert.ok(report.providers.length === 2 && report.providers.every((p: any) => p.success),
            'Both providers must pass all four real call paths. See the result artifact.');
        console.log('PASS: both providers returned usable classification, editorial JSON and factual summaries; no delivery was invoked.');
    } finally {
        globalThis.fetch = originalFetch;
        for (const [name, value] of Object.entries(keys)) {
            const keyName = name === 'Groq' ? 'GROQ_API_KEY' : 'CEREBRAS_API_KEY';
            if (value === undefined) delete process.env[keyName]; else process.env[keyName] = value;
        }
        report.requests = requests;
        save();
    }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'AI smoke test failed'); process.exitCode = 1; });
