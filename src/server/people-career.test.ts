import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { NormalizedItem } from '../types/index.js';
import { generateJSONFeed } from '../build/feed-generators.js';
import {
    applyPeopleFilter, isTargetRegion, loadIncludedArticles, passesPeopleIndustrialCheck,
    preparePeopleArticle, preparePeopleReservePool, qualifiesForPeopleRescue,
    reCategorizeRelevantAsPeople,
} from './newsletter-filters.js';

// Synthetic source excerpts. An approved mirror URL represents the existing
// transport, not approval to fetch or onboard any new publisher domain.
const article = (id: string, title: string, description = '', extra: Partial<NormalizedItem> = {}): NormalizedItem => ({
    id, title, description, link: `https://news.google.com/rss/articles/test-${id}`,
    pubDate: '2026-10-28T10:00:00Z', category: 'relevant', source: 'Example News', tier: 'C', ...extra,
});

const surnamePair = article('pair',
    'Reed, Vale join Example Brokerage to expand New Jersey, Pennsylvania industrial platform',
    'Example Brokerage welcomed industrial brokers Taylor Reed and Morgan Vale to its New Jersey and Eastern Pennsylvania team.',
    { pubDate: '2026-10-05T10:00:00Z' });
const addsPair = article('adds',
    'Example Brokerage Adds Rowan, Bell to Central Florida Industrial Team',
    'The Central Florida industrial real estate team welcomed Avery Rowan as Vice President and Jordan Bell as Senior Associate.');
const pureRole = article('role',
    'Jane Doe joins New Jersey industrial brokerage as managing director',
    'The New Jersey industrial brokerage appointed Jane Doe as managing director.');
const namedHire = article('named',
    'Example Brokerage hires Taylor Grey and Devon Hale for its Pennsylvania and New Jersey industrial platform',
    'Taylor Grey is an executive managing director. Devon Hale is an associate director. The Pennsylvania and New Jersey team advises on industrial outdoor storage.',
    { pubDate: '2026-10-06T10:00:00Z' });

const positives = [surnamePair, addsPair, pureRole, namedHire,
    article('shared-lakeland', 'Casey Lane joins Lakeland industrial brokerage as managing director'),
    article('shared-winter-haven', 'Avery Dean joins Winter Haven industrial brokerage as managing director'),
    article('person-with-region', 'Elizabeth Chen joins New Jersey industrial brokerage as managing director'),
];
const negatives = [
    article('coalition', 'Example Capital joins New Jersey industrial coalition as operating partner',
        'The industrial real estate company joined a joint venture in New Jersey.'),
    article('tenant', 'Former warehouse tenant joins New Jersey coalition',
        'The New Jersey industrial tenant joined a coalition.'),
    article('company-board', 'Example Logistics joins New Jersey industrial advisory board',
        'The New Jersey industrial company joined the board.'),
    article('company-adds', 'Example Brokerage adds two warehouses to its New Jersey industrial portfolio',
        'The company adds industrial properties to its New Jersey portfolio.'),
    article('office', 'Example appoints Jane Doe to lead New Jersey office brokerage team',
        'The office broker previously worked in industrial real estate and warehouse leasing.'),
    article('residential', 'Example names Jane Doe as New Jersey residential brokerage managing director',
        'Her former role involved industrial real estate brokerage and warehouse leasing.'),
    article('charity', 'Example Foundation appoints Jane Doe to New Jersey charity advisory board',
        'The foundation supports pediatric medical research. Doe is an industrial broker in New Jersey.'),
    article('new-york', 'Jane Doe joins New York industrial brokerage as managing director',
        'The New York industrial brokerage appointed Doe as managing director.'),
    article('national', 'Jane Doe joins national industrial brokerage as managing director',
        'The national industrial brokerage appointed Doe as managing director.'),
    article('mid-atlantic', 'Example Brokerage hires Jane Doe for Mid-Atlantic industrial brokerage',
        'Jane Doe has joined the Mid-Atlantic industrial brokerage services team as an executive vice president.'),
    article('surname-county', 'Example Brokerage hires Jane Morris as industrial brokerage managing director',
        'Jane Morris will advise the national industrial brokerage team.'),
    ...['Elizabeth Chen', 'Easton Reed', 'Edison Vale', 'Linden Bell', 'Elizabeth García', 'Edison O’Connor'].map((name, i) => article(`person-town-${i}`,
        `${name} joins Example Brokerage as industrial broker`,
        `${name} has joined the industrial brokerage as managing director, following a career advising on warehouse leasing.`)),
];

let checks = 0;
const quiet = <T>(fn: () => T): T => {
    const log = console.log;
    console.log = () => {};
    try { return fn(); } finally { console.log = log; }
};
const check = (label: string, fn: () => void) => {
    quiet(fn);
    checks++;
    console.log(`PASS: ${label}`);
};

for (const a of positives) {
    check(`${a.id}: all selection paths and final career gate`, () => {
        assert.equal(isTargetRegion(a), true);
        assert.equal(preparePeopleArticle(a).category, 'people');
        assert.equal(applyPeopleFilter([a]).length, 1);
        assert.equal(reCategorizeRelevantAsPeople([a], [], []).people.length, 1);
        assert.equal(qualifiesForPeopleRescue(a), true);
        assert.equal(passesPeopleIndustrialCheck(preparePeopleArticle(a)), true);
    });
}
for (const a of negatives) {
    check(`${a.id}: no early People routing`, () => {
        assert.equal(preparePeopleArticle(a).category, 'relevant');
        if (!['new-york', 'national', 'mid-atlantic', 'surname-county'].includes(a.id!) && !a.id.startsWith('person-town-')) {
            assert.equal(applyPeopleFilter([a]).length, 0);
            assert.equal(reCategorizeRelevantAsPeople([a], [], []).people.length, 0);
            assert.equal(qualifiesForPeopleRescue(a), false);
        }
    });
}
check('a source-free headline does not invent a role for surname-only joiners', () => {
    const thin = { ...surnamePair, description: '' };
    assert.equal(preparePeopleArticle(thin).category, 'relevant');
    assert.equal(applyPeopleFilter([thin]).length, 0);
});
check('AI-written text cannot create missing source evidence for adds', () => {
    const prepared = preparePeopleArticle({ ...addsPair, description: '' });
    const rewritten = { ...prepared, description: addsPair.description.replace('real estate', 'brokerage') };
    assert.equal(applyPeopleFilter([rewritten]).length, 0);
    assert.equal(qualifiesForPeopleRescue(rewritten), false);
    assert.equal(passesPeopleIndustrialCheck(rewritten), false);
});
check('the input cannot supply a trusted career-evidence flag', () => {
    const forged = { ...addsPair, description: '', _peopleCareerEvidence: true };
    assert.equal(preparePeopleArticle(forged).category, 'relevant');
    assert.equal(passesPeopleIndustrialCheck(preparePeopleArticle(forged)), false);
});
check('no source-domain exception', () => {
    const unknown = { ...pureRole, link: 'https://unapproved-source.example/hire' };
    assert.equal(preparePeopleArticle(unknown).category, 'relevant');
    assert.equal(passesPeopleIndustrialCheck(preparePeopleArticle(unknown)), false);
});
check('a former office job does not negate an explicitly industrial new role', () => {
    const former = article('former',
        'Former office broker Jane Doe joins New Jersey industrial brokerage as managing director');
    assert.equal(preparePeopleArticle(former).category, 'people');
    assert.equal(passesPeopleIndustrialCheck(preparePeopleArticle(former)), true);
});
check('reserve careers are re-bucketed before section minima', () => {
    const pool = preparePeopleReservePool({ sections: { relevant: [pureRole, negatives[3]] } });
    assert.deepEqual(pool.sections.people.map(a => a.id), ['role']);
    assert.deepEqual(pool.sections.relevant.map(a => a.id), ['company-adds']);
});

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'people-regressions-'));
const fixedNow = '2026-10-29T12:00:20Z';
const fillers = [
    'New Jersey warehouse rental demand outlook', 'Pennsylvania industrial vacancy report',
    'Florida distribution property investment trends', 'National warehouse construction market analysis',
    'Industrial real estate lending outlook', 'United States logistics property supply forecast',
].map((title, i) => article(`context-${i}`, title,
    'Industrial real estate market analysis of warehouse properties in New Jersey, Pennsylvania and Florida.'));

function replay(label: string, items: NormalizedItem[], reserve: object = { sections: {} }, queue: object = { articles: [] }) {
    const docs = path.join(scratch, label, 'docs');
    fs.mkdirSync(path.join(docs, 'preferences'), { recursive: true });
    const write = (file: string, data: object) => fs.writeFileSync(path.join(docs, file), JSON.stringify(data));
    write('feed.json', generateJSONFeed(items));
    write('sent-articles.json', { sentIds: [], sentArticles: [], sentTitles: [], sentUrls: [] });
    write('excluded-articles.json', { excludedIds: [], excludedUrls: [] });
    write('included-articles.json', queue);
    write('preferences/reserve-pool.json', reserve);
    const output = path.join(scratch, label, 'result.json');
    execFileSync(process.execPath, ['--import', 'tsx', 'scripts/replay-people-email.ts', docs, output, fixedNow], {
        cwd: process.cwd(), env: { PATH: process.env.PATH, TZ: 'America/New_York' },
        stdio: 'pipe', timeout: 60000,
    });
    const result = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(result.dryRun, true);
    assert.equal(result.networkRequests, 0);
    return result;
}

try {
    check('one real hire survives the rendered-email final gates with no property-deal nouns', () => {
        const result = replay('single', [...fillers, pureRole]);
        assert.deepEqual(result.sections.people, ['role']);
        assert.ok(result.renderedIds.includes('role'));
    });
    check('older misclassified hires reach People even when Relevant is full', () => {
        const result = replay('older', [...fillers, surnamePair, namedHire]);
        assert.deepEqual(result.sections.people, ['named', 'pair']);
        assert.ok(result.renderedIds.includes('pair') && result.renderedIds.includes('named'));
    });
    check('adds routes to People in the rendered email', () => {
        const result = replay('adds', [...fillers, addsPair]);
        assert.deepEqual(result.sections.people, ['adds']);
        assert.ok(!result.sections.relevant.includes('adds'));
    });
    check('corporate, office, residential, charity, national and NY stories do not render as People', () => {
        const result = replay('negative', [...fillers, ...negatives.map(a => ({ ...a, category: 'people' }))]);
        assert.deepEqual(result.sections.people, []);
    });
    check('existing thirty-day date limit and future-date rejection still apply', () => {
        const expired = { ...pureRole, id: 'expired', pubDate: '2026-09-20T10:00:00Z' };
        const future = { ...pureRole, id: 'future', pubDate: '2026-10-30T10:00:00Z' };
        const result = replay('dates', [...fillers, expired, future]);
        assert.deepEqual(result.sections.people, []);
    });
    check('a Relevant reserve hire reaches People before thin-send padding', () => {
        const result = replay('reserve', fillers, { sections: { relevant: [{
            ...pureRole, url: pureRole.link, date_published: pureRole.pubDate,
        }] } });
        assert.deepEqual(result.sections.people, ['role']);
        assert.ok(result.renderedIds.includes('role'));
    });
    check('manual inclusion captures source evidence and renders in People', () => {
        const queue = { articles: [{ ...pureRole, url: pureRole.link, date_published: pureRole.pubDate }] };
        const result = replay('queue', fillers, undefined, queue);
        assert.deepEqual(result.sections.people, ['role']);
        assert.ok(result.renderedIds.includes('role'));
        const loaded = loadIncludedArticles(path.join(scratch, 'queue', 'docs'));
        assert.equal(loaded[0].category, 'people');
        assert.equal(passesPeopleIndustrialCheck(loaded[0]), true);
    });
} finally {
    fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(`All People career regressions passed (${checks} cases, including seven offline rendered-email replays).`);
