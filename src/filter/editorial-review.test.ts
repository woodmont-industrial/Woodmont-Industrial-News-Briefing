import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { applyStrictFilter, applyPeopleFilter, applyAvailabilityFilter, isRoutableRegionalDeal, mapFeedItemsToArticles } from '../server/newsletter-filters.js';
import { RELEVANT_KEYWORDS } from '../shared/region-data.js';
import { getEditorialReviewCandidates, reviewEditorialCandidates, writeEditorialFeed } from '../build/editorial-review.js';
import { editorialVerdictFields, indexEditorialVerdicts, withCurrentEditorialVerdict } from './editorial-verdict.js';
import { WOODMONT_RUBRIC_VERSION, WOODMONT_SYSTEM_PROMPT, buildArticleUserPrompt } from './woodmont-rubric.js';
import type { NormalizedItem } from '../types/index.js';

const article = (id: string, extra: Record<string, unknown> = {}): NormalizedItem => ({
    id, title: 'Industrial warehouse demand strengthens in New Jersey',
    description: 'A report measures industrial warehouse leasing and vacancy in New Jersey.',
    link: `https://rebusinessonline.com/synthetic-${id}`, source: 'Example Research', category: 'relevant',
    pubDate: '2026-10-21T10:00:00Z', _woodmontApprove: false, ...extra,
} as NormalizedItem);

async function main() {
    for (const label of ['Relevant', 'Relevant (backfill)', 'Relevant (deep)', 'Relevant (refill)', 'Relevant (deep-pd)', 'Reserve Relevant']) {
        assert.equal(applyStrictFilter([article(label)], RELEVANT_KEYWORDS, label).length, 0,
            `${label}: omitting diagnostics cannot bypass an explicit rejection`);
    }
    for (const verdict of [true, undefined, null]) {
        assert.equal(applyStrictFilter([article('eligible', { _woodmontApprove: verdict })], RELEVANT_KEYWORDS, 'Relevant').length, 1,
            'approved and unknown verdicts still pass the existing deterministic checks');
    }
    const deal = article('local-deal', { category: 'transactions',
        title: 'Example Tenant buys industrial warehouse in Edison, New Jersey for $4M' });
    assert.equal(isRoutableRegionalDeal(deal), false, 'router cannot revive an AI-rejected deal');
    assert.equal(isRoutableRegionalDeal({ ...deal, _woodmontApprove: true } as any), true,
        'a genuine small local deal remains routable when approved');
    const people = article('person', { category: 'people',
        title: 'Jane Doe joins Example Brokerage in New Jersey as vice president of industrial acquisitions' });
    const availability = article('listing', { category: 'availabilities',
        title: '120,000 SF industrial warehouse available for lease in Edison NJ' });
    assert.equal(applyPeopleFilter([people]).length, 1, 'People retains its existing advisory policy');
    assert.equal(applyAvailabilityFilter([availability]).length, 1, 'Availability retains its existing advisory policy');

    const old = article('reconsider', { _predictedPublish: false, _woodmontRubricVersion: 'old',
        _woodmontClassifiedAt: '2026-10-20T10:00:00Z', _woodmontModel: 'old-model' });
    const overflow = article('overflow', { _predictedPublish: false, _predictedReason: 'CAP_OVERFLOW' });
    const candidates = getEditorialReviewCandidates([old, overflow, deal]);
    assert.deepEqual(new Set(candidates.map(a => a.id)), new Set(['reconsider', 'overflow', 'local-deal']),
        'rejected, capped and routed candidates are enrolled on deterministic evidence');
    assert.equal((old as any)._woodmontApprove, false, 'enrollment never clears the real stored rejection');
    const reserve = { ...article('reconsider'), ...editorialVerdictFields(old) };
    assert.equal((reserve as any)._woodmontRubricVersion, 'old', 'reserve copies preserve provenance');
    const current = { ...old, _woodmontApprove: false, _woodmontRubricVersion: WOODMONT_RUBRIC_VERSION } as any;
    const reconciled = withCurrentEditorialVerdict({ ...reserve, _woodmontApprove: true } as any, indexEditorialVerdicts([current]));
    assert.equal((reconciled as any)._woodmontApprove, false, 'an old reserve approval cannot hide the current feed rejection');
    assert.equal((reconciled as any)._woodmontRubricVersion, WOODMONT_RUBRIC_VERSION);

    const realFetch = globalThis.fetch;
    const keys = { GROQ_API_KEY: process.env.GROQ_API_KEY, CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY };
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-build-test-'));
    delete process.env.CEREBRAS_API_KEY;
    process.env.GROQ_API_KEY = 'synthetic-test-key';
    try {
        globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not a verdict' } }] }));
        await reviewEditorialCandidates([old], { maxConcurrent: 1, batchDelayMs: 0 });
        assert.equal((old as any)._woodmontApprove, false, 'malformed replies preserve the old rejection');
        assert.equal((old as any)._woodmontRubricVersion, 'old', 'failed calls never stamp the new version');
        globalThis.fetch = async (_url, init) => {
            const body = JSON.parse(String(init?.body));
            assert.equal(body.messages[0].content, WOODMONT_SYSTEM_PROMPT);
            assert.match(body.messages[1].content, /2026-10-22/);
            return new Response(JSON.stringify({ choices: [{ message: { content:
                JSON.stringify({ approve: true, reason: 'APPROVE: industrial market analysis', confidence: 90 }) } }] }));
        };
        const result = await reviewEditorialCandidates([old], { maxConcurrent: 1, batchDelayMs: 0, asOf: new Date('2026-10-22T12:00:20Z') });
        assert.equal(result.classified, 1);
        const destination = path.join(scratch, 'feed.json');
        writeEditorialFeed([old], destination);
        const stored = JSON.parse(fs.readFileSync(destination, 'utf8')).items[0];
        assert.equal(stored._woodmontApprove, true, 'the corrected verdict reaches the actual feed writer');
        assert.equal(stored._woodmontRubricVersion, WOODMONT_RUBRIC_VERSION);
        assert.ok(stored._woodmontModel && Number.isFinite(Date.parse(stored._woodmontClassifiedAt)));
        assert.equal(stored._predictedPublish, true, 'prediction is recomputed after the old rejection changes');
        const loaded = mapFeedItemsToArticles([stored])[0];
        assert.equal((loaded as any)._woodmontRubricVersion, WOODMONT_RUBRIC_VERSION, 'version survives the send-time reader');
    } finally {
        globalThis.fetch = realFetch;
        for (const [key, value] of Object.entries(keys)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        fs.rmSync(scratch, { recursive: true, force: true });
    }
    assert.match(buildArticleUserPrompt({ title: 'Data', url: 'https://example.test/story' }), /URL: https:\/\/example.test\/story/);
    console.log('PASS: Relevant enforcement, advisory controls, reconsideration, failed-call preservation and serialized rubric provenance');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
