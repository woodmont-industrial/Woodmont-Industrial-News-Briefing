import assert from 'node:assert/strict';
import { generateDescriptions, isHeadlineOnlyDescription } from './description-generator.js';
import { buildWorkBriefing } from '../server/newsletter-work.js';
import type { NormalizedItem } from '../types/index.js';

async function main() {
    const names = ['GROQ_API_KEY', 'CEREBRAS_API_KEY'];
    const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
    const realFetch = globalThis.fetch;
    delete process.env.CEREBRAS_API_KEY;
    process.env.GROQ_API_KEY = 'synthetic-test-key';
    const core = 'Example Builder nears completion of 216,000 SF cold storage project in Bethlehem, Pennsylvania';
    const make = (description: string) => ({
        id: 'synthetic-completion', title: core + ' - REBusinessOnline', description,
        source: 'news.google.com', link: 'https://news.google.com/synthetic-story',
        pubDate: '2026-11-13T14:42:00Z', category: 'relevant',
    } as NormalizedItem);
    const summary = 'Bethlehem, Pennsylvania — A 216,000 SF cold storage project is nearing completion.';
    let requests = 0;
    try {
        globalThis.fetch = async () => {
            requests++;
            return new Response(JSON.stringify({ choices: [{ message: { content: summary } }] }));
        };
        for (const description of [core, core + ' REBusinessOnline', core + ' - REBusinessOnline']) {
            const item = make(description);
            assert.equal(isHeadlineOnlyDescription(item), true);
            await generateDescriptions([item]);
            assert.equal(item.description, summary, 'the cleaned RSS headline still receives an AI summary');
            const html = buildWorkBriefing([item], [], [], [], 'November 17, 2026');
            assert.ok(html.includes('A 216,000 SF cold storage project is nearing completion.'),
                'the factual summary is visible in the final email');
            assert.ok(!html.includes('Earlier development'));
        }
        const rich = make('The project includes a freezer warehouse and temperature-controlled loading areas.');
        assert.equal(isHeadlineOnlyDescription(rich), false);
        await generateDescriptions([rich]);
        assert.equal(requests, 3, 'an existing publisher description is preserved without a new request');
        assert.equal(rich.description, 'The project includes a freezer warehouse and temperature-controlled loading areas.');
    } finally {
        globalThis.fetch = realFetch;
        for (const name of names) {
            if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
        }
    }
    console.log('PASS: publisher-cleaned RSS descriptions are summarized and rendered without changing real source text');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
