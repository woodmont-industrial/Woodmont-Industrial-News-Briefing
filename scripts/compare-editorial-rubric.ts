/** Authenticated, non-sending comparison. Never publish article text or email HTML. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getAIProviders } from '../src/filter/ai-provider.js';
import { classifyWoodmontBatch } from '../src/filter/llm-classifier.js';
import { WOODMONT_RUBRIC_VERSION } from '../src/filter/woodmont-rubric.js';
import { reviewEditorialCandidates, getEditorialReviewCandidates, writeEditorialFeed } from '../src/build/editorial-review.js';
import { mapFeedItemsToArticles } from '../src/server/newsletter-filters.js';
import { editorialRubricCases } from './editorial-rubric-cases.js';
import { editorialVerdictFields } from '../src/filter/editorial-verdict.js';

const BASE = 'd8497eb163c5bd2e6ef3f9ddb7add9a6e795f66d';
const INSTANT = '2026-10-22T12:00:20Z';
const REPLAY = path.resolve('scripts/replay-editorial-email.ts');
const directory = path.resolve('artifacts/editorial-rubric');
const keys = { GROQ_API_KEY: process.env.GROQ_API_KEY, CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY };
const realFetch = globalThis.fetch;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-comparison-'));
const report: any = { baseline: BASE, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    frozenNowUtc: INSTANT, rubricVersion: WOODMONT_RUBRIC_VERSION,
    noDelivery: true, storedCorpusOnly: true, providers: [] };
const save = () => {
    const serialized = JSON.stringify(report, null, 2) + '\n';
    for (const key of Object.values(keys)) assert.ok(!key || !serialized.includes(key), 'secret-free report required');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'result.json'), serialized);
};
const docs = path.join(scratch, 'input');
const baselineCode = path.join(scratch, 'baseline');
const replay = (input: string, code: string, label: string) => {
    const result = path.join(scratch, `${label}.json`);
    execFileSync(process.execPath, ['--import', path.resolve('node_modules/tsx/dist/loader.mjs'), REPLAY, input, result, INSTANT],
        { cwd: code, env: { PATH: process.env.PATH, TZ: 'America/New_York' }, stdio: 'pipe', timeout: 120000 });
    return JSON.parse(fs.readFileSync(result, 'utf8'));
};

async function main() {
    assert.ok(keys.GROQ_API_KEY && keys.CEREBRAS_API_KEY, 'Both existing provider secrets are required');
    fs.mkdirSync(docs);
    execFileSync('tar', ['-xf', '-', '-C', docs], {
        input: execFileSync('git', ['archive', `${BASE}:docs`], { maxBuffer: 128 * 1024 * 1024 }),
    });
    const feed = JSON.parse(fs.readFileSync(path.join(docs, 'feed.json'), 'utf8'));
    report.poolSize = feed.items.length;
    execFileSync('git', ['worktree', 'add', '--detach', baselineCode, BASE], { stdio: 'pipe' });
    fs.symlinkSync(path.resolve('node_modules'), path.join(baselineCode, 'node_modules'), 'dir');
    report.baselineEmail = replay(docs, baselineCode, 'baseline');
    report.enforcementOnlyEmail = replay(docs, process.cwd(), 'enforcement-only');
    const oldSource = execFileSync('git', ['show', `${BASE}:src/filter/woodmont-rubric.ts`], { encoding: 'utf8' });
    const oldPrompt = /WOODMONT_SYSTEM_PROMPT = `([\s\S]*?)`;/m.exec(oldSource)?.[1];
    const oldVersion = /WOODMONT_RUBRIC_VERSION = '([^']+)'/.exec(oldSource)?.[1];
    assert.ok(oldPrompt && oldVersion);
    const originalItems = mapFeedItemsToArticles(feed.items);
    report.reviewCandidates = getEditorialReviewCandidates(originalItems).length;
    save();

    // Providers are independent and SERIAL: no fallback or simultaneous shared-key jobs.
    for (const provider of getAIProviders()) {
        delete process.env.GROQ_API_KEY; delete process.env.CEREBRAS_API_KEY;
        process.env[provider.name === 'Groq' ? 'GROQ_API_KEY' : 'CEREBRAS_API_KEY'] = provider.apiKey;
        const result: any = { provider: provider.name, model: provider.model, requests: 0, statuses: {}, paired: [], success: false };
        report.providers.push(result); save();
        let lastRequest = 0;
        let tokenState: { limit: number; remaining: number; at: number } | undefined;
        let quotaExhausted = false;
        globalThis.fetch = async (url, init) => {
            assert.equal(String(url), provider.url, 'requests stay on the selected provider endpoint');
            assert.equal(init?.method, 'POST');
            if (quotaExhausted) throw new Error('Provider quota exhausted');
            let wait = 2200 - (Date.now() - lastRequest);
            if (provider.name === 'Groq' && lastRequest) {
                // Groq's token header is TPM, whereas its request header is RPD.
                // Account for prompt + reserved output, not just requests/minute.
                const payload = JSON.parse(String(init?.body));
                const estimated = Math.ceil(payload.messages.reduce((n: number, message: any) => n + message.content.length, 0) / 3.5)
                    + payload.max_completion_tokens + 256;
                wait = Math.max(wait, tokenState
                    ? Math.max(0, estimated - tokenState.remaining) / tokenState.limit * 60000 - (Date.now() - tokenState.at)
                    : 30000 - (Date.now() - lastRequest));
            }
            if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
            assert.ok(++result.requests <= 260, 'comparison request budget');
            lastRequest = Date.now();
            const response = await realFetch(url, init);
            result.statuses[response.status] = (result.statuses[response.status] || 0) + 1;
            const limit = Number(response.headers.get('x-ratelimit-limit-tokens'));
            const remaining = Number(response.headers.get('x-ratelimit-remaining-tokens'));
            if (limit > 0 && Number.isFinite(remaining)) {
                tokenState = { limit, remaining, at: Date.now() };
                result.tokenLimitPerMinute = limit;
            }
            // Daily quota exhaustion cannot justify sleeping a runner for hours.
            const retry = Number(response.headers.get('retry-after'));
            if (response.status === 429 && retry > 60) { quotaExhausted = true; throw new Error('Provider daily quota exhausted'); }
            return response;
        };
        try {
            const realCases: Record<string, string> = {
                'editorial-trade': '501b1a852a3e6a88b88032e85cbfed2a7cbe866c',
                'pa-corridor-report': '3f26b26e0686a63f604c4d1cbdf236223c9108d8',
                'nonprofit-warehouse': 'ea0f173089c0bf0d5cd7c792266dd2c0e2ea10d6',
            };
            const cases = editorialRubricCases(new Date(INSTANT)).map(test => ({ ...test,
                article: realCases[test.article.id]
                    ? originalItems.find(article => article.id === realCases[test.article.id])! : test.article }));
            const phaseItems: Record<string, any[]> = {};
            for (const phase of ['old', 'new']) {
                result.phase = `paired-${phase}`;
                const input = cases.map(c => ({ ...c.article }));
                const summary = await classifyWoodmontBatch(input, 1, 0, provider.name === 'Groq' ? 360000 : 150000, {
                    asOf: new Date(INSTANT), ...(phase === 'old' ? { rubric: { version: oldVersion!, systemPrompt: oldPrompt! } } : {}),
                });
                phaseItems[phase] = input;
                result.paired.push({ phase, summary, decisions: input.map((item: any, i) => ({
                    id: item.id, expected: cases[i].approve, approve: item._woodmontApprove ?? null,
                    correct: item._woodmontApprove === cases[i].approve,
                    rubricVersion: item._woodmontRubricVersion ?? null,
                    modelApprove: item._woodmontModelApprove ?? null,
                    dateValidation: item._woodmontDateValidation ?? null,
                })) });
                save();
            }
            assert.ok(result.paired[1].summary.classified === cases.length && result.paired[1].summary.failed === 0
                && result.paired[1].decisions.every((decision: any) => decision.correct && decision.rubricVersion === WOODMONT_RUBRIC_VERSION),
                'new rubric must retain editorial reports and reject paired listings, out-of-region events, charity and stale controls');
            // Re-run the OLD prompt on the actual disputed corpus as well. Comparing
            // only against cached verdicts would confound prompt and model changes.
            result.phase = 'stored-old';
            // The primary gets the entire disputed cohort. The fallback is tested
            // on the same three real cases plus seven paired controls, within TPM.
            const disputed = provider.name === 'Groq'
                ? phaseItems.old.filter(item => Object.values(realCases).includes(item.id))
                : structuredClone(originalItems.filter((item: any) => item.category === 'relevant' && item._woodmontApprove === false));
            const oldReview = provider.name === 'Groq' ? { classified: disputed.length, targeted: true }
                : await classifyWoodmontBatch(disputed, 1, 0, 180000,
                    { asOf: new Date(INSTANT), rubric: { version: oldVersion!, systemPrompt: oldPrompt! } });
            result.oldRejectedCohort = { summary: oldReview, decisions: disputed.map((item: any) => ({
                id: item.id, approve: item._woodmontRubricVersion === oldVersion ? item._woodmontApprove : null,
            })) };
            save();
            result.phase = 'stored-new';
            const updated = structuredClone(originalItems);
            // Exercise the real build's four-minute budget, not an unbounded experiment.
            if (provider.name === 'Groq') {
                for (const item of phaseItems.new.filter(item => Object.values(realCases).includes(item.id))) {
                    Object.assign(updated.find(article => article.id === item.id)!, editorialVerdictFields(item));
                }
                result.review = { mode: 'targeted fallback: three real articles', classified: 3,
                    candidates: report.reviewCandidates, remaining: report.reviewCandidates - 3 };
            } else {
                result.review = await reviewEditorialCandidates(updated, { asOf: new Date(INSTANT), maxConcurrent: 1, batchDelayMs: 0 });
            }
            const providerDocs = path.join(scratch, provider.name);
            fs.cpSync(docs, providerDocs, { recursive: true });
            writeEditorialFeed(updated, path.join(providerDocs, 'feed.json'));
            const stored = JSON.parse(fs.readFileSync(path.join(providerDocs, 'feed.json'), 'utf8')).items;
            result.versionedInFeed = stored.filter((item: any) => item._woodmontRubricVersion === WOODMONT_RUBRIC_VERSION).length;
            result.dateOverrides = stored.filter((item: any) => item._woodmontDateValidation === 'STALE_RULE_11').map((item: any) => item.id);
            assert.equal(result.versionedInFeed, result.review.classified, 'successful verdicts reach the production feed writer');
            result.transitions = stored.flatMap((item: any) => {
                const previous: any = originalItems.find(a => a.id === item.id);
                return previous?._woodmontApprove !== item._woodmontApprove
                    ? [{ id: item.id, before: previous?._woodmontApprove ?? null, after: item._woodmontApprove }] : [];
            });
            result.rejectedCohortComparison = disputed.map((item: any) => {
                const next = stored.find((candidate: any) => candidate.id === item.id);
                return { id: item.id, old: item._woodmontRubricVersion === oldVersion ? item._woodmontApprove : null,
                    new: next?._woodmontRubricVersion === WOODMONT_RUBRIC_VERSION ? next._woodmontApprove : null };
            });
            result.phase = 'email-render';
            result.email = replay(providerDocs, process.cwd(), provider.name);
            const hireId = '54d72d5316e4ac01ebf45df8de17f5728d16cf0d';
            assert.ok(result.email.sections.people.includes(hireId) && result.email.renderedIds.includes(hireId), 'the queued hire still renders in People');
            for (const id of ['501b1a852a3e6a88b88032e85cbfed2a7cbe866c', '3f26b26e0686a63f604c4d1cbdf236223c9108d8']) {
                const corrected = stored.find((item: any) => item.id === id);
                assert.equal(corrected?._woodmontRubricVersion, WOODMONT_RUBRIC_VERSION, 'fresh disputed reports are actually reconsidered');
                assert.equal(corrected?._woodmontApprove, true, 'fresh editorial research must not remain rejected as a listing or wrong region');
            }
            assert.equal(stored.find((item: any) => item.id === 'ea0f173089c0bf0d5cd7c792266dd2c0e2ea10d6')?._woodmontApprove, false);
            result.phase = 'complete';
            result.success = true;
        } catch {
            result.error = 'COMPARISON_FAILED: inspect sanitized paired decisions and coverage';
        }
        save();
        console.log(JSON.stringify({ provider: result.provider, model: result.model, success: result.success,
            requests: result.requests, statuses: result.statuses, paired: result.paired,
            review: result.review, versionedInFeed: result.versionedInFeed, email: result.email,
            phase: result.phase, rejectedCohortComparison: result.rejectedCohortComparison }));
    }
    assert.ok(report.providers.length === 2 && report.providers.every((provider: any) => provider.success),
        'Both providers must pass independently. No email or corpus is uploaded.');
    console.log('PASS: paired provider comparisons and full-pool offline email replays; no delivery');
}
main().catch(() => { console.error('Editorial comparison incomplete; see sanitized result.json'); process.exitCode = 1; }).finally(() => {
    globalThis.fetch = realFetch;
    for (const [key, value] of Object.entries(keys)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    save();
    const modules = path.join(baselineCode, 'node_modules');
    if (fs.existsSync(modules) && fs.lstatSync(modules).isSymbolicLink()) fs.unlinkSync(modules);
    if (fs.existsSync(path.join(baselineCode, '.git'))) {
        try { execFileSync('git', ['worktree', 'remove', '--force', baselineCode], { stdio: 'pipe' }); } catch { /* scratch cleanup below */ }
    }
    fs.rmSync(scratch, { recursive: true, force: true });
});
