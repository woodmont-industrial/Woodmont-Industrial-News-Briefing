import assert from 'node:assert/strict';
import { classifyWoodmontBatch } from './llm-classifier.js';
import type { NormalizedItem } from '../types/index.js';

const article = (id: string) => ({ id, title: 'New Jersey warehouse demand rises',
    category: 'relevant', pubDate: '2026-11-16T12:00:00Z', link: 'https://example.test/story',
    _woodmontApprove: false, _woodmontRubricVersion: 'old' } as NormalizedItem);
const okay = () => new Response(JSON.stringify({ choices: [{ message: { content:
    JSON.stringify({ approve: true, reason: 'Eligible industrial market analysis', confidence: 90 }) } }] }));
async function main() {
    const realFetch = globalThis.fetch;
    const names = ['GROQ_API_KEY', 'CEREBRAS_API_KEY', 'GROQ_MODEL', 'CEREBRAS_MODEL'];
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    process.env.GROQ_API_KEY = process.env.CEREBRAS_API_KEY = 'synthetic-test-key';
    delete process.env.GROQ_MODEL; delete process.env.CEREBRAS_MODEL;
    try {
        const calls: string[] = [];
        globalThis.fetch = async url => {
            const name = String(url).includes('cerebras') ? 'Cerebras' : 'Groq'; calls.push(name);
            return name === 'Cerebras' ? new Response('private error body must not be logged', { status: 404 }) : okay();
        };
        const fallback = await classifyWoodmontBatch([article('a'), article('b'), article('c')], 1, 0, 1000);
        assert.equal(fallback.classified, 3);
        assert.equal(calls.filter(name => name === 'Cerebras').length, 1, 'access/model errors disable that provider for the rest of this review');
        assert.equal(fallback.failureReasons['Cerebras:http-404'], 1, 'the first provider failure remains visible even when fallback succeeds');
        assert.equal(JSON.stringify(fallback).includes('private error body'), false);
        assert.equal(JSON.stringify(fallback).includes('synthetic-test-key'), false);

        globalThis.fetch = async url => String(url).includes('cerebras')
            ? new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '' } }] })) : okay();
        const empty = await classifyWoodmontBatch([article('empty')], 1, 0, 1000);
        assert.equal(empty.classified, 1);
        assert.equal(empty.failureReasons['Cerebras:empty-content:length'], 1, 'empty reasoning-only output is distinct from HTTP failure');
        assert.equal(empty.failureReasons['Cerebras:http-404'], undefined, 'diagnostics are isolated per run');

        let timeoutCalls = 0;
        globalThis.fetch = async url => {
            if (String(url).includes('cerebras')) { timeoutCalls++; throw new DOMException('expired', 'TimeoutError'); }
            return okay();
        };
        const recovered = await classifyWoodmontBatch([article('one'), article('two'), article('three')], 1, 0, 1000);
        assert.equal(recovered.classified, 3);
        assert.equal(timeoutCalls, 1, 'a stalled primary cools down while fallback keeps reviewing');

        globalThis.fetch = async () => new Response('unavailable', { status: 401 });
        const stored = article('stored');
        const down = await classifyWoodmontBatch([stored, article('deferred-1'), article('deferred-2')], 1, 0, 1000);
        assert.equal(down.failed, 1);
        assert.equal(down.deferred, 2, 'do not hammer providers with known access failures');
        assert.equal((stored as any)._woodmontApprove, false);
        assert.equal((stored as any)._woodmontRubricVersion, 'old');

        globalThis.fetch = async () => new Response('rate limited', { status: 429, headers: { 'retry-after': '3600' } });
        const started = Date.now();
        const limited = await classifyWoodmontBatch([article('limited'), article('deferred')], 1, 0, 100);
        assert.ok(Date.now() - started < 500, 'Retry-After cannot extend the build budget');
        assert.equal(limited.failed, 1);
        assert.equal(limited.deferred, 1);
        assert.equal(limited.failureReasons['Cerebras:http-429'], 1);
        assert.equal(limited.failureReasons['Groq:http-429'], 1);

        let inFlight = 0, peak = 0;
        globalThis.fetch = async () => {
            inFlight++; peak = Math.max(peak, inFlight);
            await new Promise(resolve => setTimeout(resolve, 2));
            inFlight--; return okay();
        };
        const concurrent = await classifyWoodmontBatch(Array.from({ length: 6 }, (_, i) => article(String(i))), 5, 0, 1000);
        assert.equal(concurrent.classified, 6);
        assert.equal(peak, 2, 'respect the primary provider concurrency limit');

        delete process.env.CEREBRAS_API_KEY;
        globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('request expired', 'TimeoutError')));
        });
        // Keep the event loop alive while AbortSignal.timeout's unref'd timer fires in this mock.
        const keepAlive = setTimeout(() => {}, 500);
        try {
            const start = Date.now();
            const timed = await classifyWoodmontBatch([article('timeout'), article('not-started')], 1, 0, 25);
            assert.ok(Date.now() - start < 300, 'a request shares the remaining batch deadline');
            assert.equal(timed.failureReasons['Groq:timeout'], 1);
            assert.equal(timed.deferred, 1);
            assert.equal(timed.budgetExhausted, true);
        } finally { clearTimeout(keepAlive); }
    } finally {
        globalThis.fetch = realFetch;
        for (const name of names) {
            if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
        }
    }
    console.log('PASS: bounded editorial requests, fallback, safe diagnostics, cooldown, concurrency and verdict preservation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
