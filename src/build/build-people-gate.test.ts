import assert from 'node:assert/strict';
import type { NormalizedItem } from '../types/index.js';
import { isStrictlyIndustrial } from '../shared/region-data.js';
import { isIndustrialCareerMove } from '../server/newsletter-filters.js';

// The build's include gate (static.ts shouldIncludeArticle / cleanMerged)
// drops anything that fails isStrictlyIndustrial, plus "people fluff" without
// a property keyword. Regional industrial hires rarely name a property, so on
// 2026-11-02 they were discarded before the email's People rules ran. These
// synthetic cases pin the exemption: the career evidence admits them, while
// the controls stay out.
const article = (id: string, title: string, description = ''): NormalizedItem => ({
    id, title, description, link: `https://news.google.com/rss/articles/test-${id}`,
    pubDate: '2026-10-28T10:00:00Z', category: 'relevant', source: 'Example News', tier: 'C',
});

// gateFails: the shared industrial gate alone rejects this text, as it did
// for the real headlines of the same shape.
const admitted: Array<[NormalizedItem, boolean]> = [
    [article('svc', 'Avery Rowan Joins Example Brokerage as Vice President of Industrial Services',
        'Avery Rowan joins the New Jersey team as vice president.'), true],
    [article('broker', 'Example Brokerage Hires Veteran Industrial Broker Taylor Grey as Executive Managing Director',
        'Taylor Grey will lead the brokerage team in Central Florida.'), true],
    [article('evp', 'Example Brokerage welcomes Morgan Vale as executive vice president in Mount Laurel',
        'Morgan Vale brings 18 years of industrial brokerage experience to the Greater Philadelphia team.'), false],
    [article('coo', 'Jordan Bell, veteran CRE executive, joins Example Industrial as chief operating officer',
        'Example Industrial, a New Jersey industrial real estate developer, named Jordan Bell chief operating officer.'), false],
    // Surname-only and role-less team hires, as trade headlines write them.
    [article('team-surname', 'Example Brokerage recruits Vale to expand Philadelphia-area industrial leasing team',
        'Example Brokerage recruits Vale to expand Philadelphia-area industrial leasing team  Example News'), false],
    [article('team-name', 'Example Brokerage recruits Morgan Vale to expand Philadelphia-area industrial leasing team'), false],
    [article('promote-surname', 'Example Brokerage promotes industrial broker Shaw to executive vice president in New Jersey'), false],
];

const excluded = [
    article('office', 'Example appoints Casey Lane to lead New Jersey office brokerage team',
        'The office broker previously worked in industrial real estate.'),
    article('charity', 'Example Foundation appoints Casey Lane to New Jersey charity advisory board',
        'Lane is an industrial broker in New Jersey.'),
    article('new-york', 'Casey Lane joins New York industrial brokerage as managing director',
        'The New York industrial brokerage appointed Lane as managing director.'),
    article('no-industrial', 'Casey Lane joins Example Brokerage as managing director in Newark',
        'Lane will advise clients across New Jersey.'),
    article('company', 'Example Capital joins New Jersey industrial coalition as operating partner',
        'The industrial real estate company joined a joint venture in New Jersey.'),
    // Firms as the object of a hiring verb.
    article('firm-broker', 'Example Owner hires Harbor & Finch as leasing broker for New Jersey industrial portfolio'),
    article('firm-taps', 'Example REIT taps Northwind to lead Pennsylvania industrial development team'),
    article('firm-acronym', 'Example Brokerage hires XYZ to expand New Jersey industrial leasing team'),
    // Without industrial wording or a target region the surname path stays shut.
    article('surname-office', 'Example Brokerage welcomes Vale as executive vice president in Mount Laurel office'),
    article('surname-ny', 'Example Brokerage recruits Vale to expand New York industrial leasing team'),
];

let checks = 0;
for (const [a, gateFails] of admitted) {
    if (gateFails) {
        // Guard the premise: if the shared gate ever admits these itself, this
        // exemption is no longer what keeps them, and the test should say so.
        assert.equal(isStrictlyIndustrial(`${a.title} ${a.description}`.toLowerCase()), false, `${a.id}: gate premise`);
    }
    assert.equal(isIndustrialCareerMove(a), true, `${a.id}: career move admitted`);
    checks++;
}
for (const a of excluded) {
    assert.equal(isIndustrialCareerMove(a), false, `${a.id}: control stays out`);
    checks++;
}
console.log(`PASS: build People gate (${checks} checks)`);
