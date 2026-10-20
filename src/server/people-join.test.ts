import assert from 'node:assert/strict';
import { applyPeopleFilter, reCategorizeRelevantAsPeople, qualifiesForPeopleRescue, isPersonnelJoin } from './newsletter-filters.js';

// =============================================================================
// "Joins" personnel detection (2026-10-20).
// A developer's "<Surname> joins <firm> as vice president of acquisitions" hire (2026-10-16) was
// rejected NO_PEOPLE_ACTION, so People stayed empty. Bare "joins" would also admit corporate
// stories ("<Company> joins tech firms' push …"), which the rescue paths already accepted via a
// title-level JOINS. "Joins" now counts only when a PERSON joins INTO A ROLE.
//
// Every case is asserted on EACH path separately — an OR across paths would let one path's
// pass hide another path's bug:
//   F = applyPeopleFilter (item already categorised people)
//   R = reCategorizeRelevantAsPeople (Relevant item relocated into People)
//   Q = qualifiesForPeopleRescue (post-backfill second rescue; also needs target region)
// All names are synthetic.
// =============================================================================

let pass = 0;
// Google News proxy URL, as the production item carried (an approved source for isTargetRegion).
const GN = 'https://news.google.com/rss/articles/x';
const item = (title: string, desc: string, category: string): any =>
    ({ title, description: desc, category, url: GN, link: GN });

function paths(title: string, desc: string) {
    return {
        F: applyPeopleFilter([item(title, desc, 'people')]).length > 0,
        R: reCategorizeRelevantAsPeople([item(title, desc, 'relevant')], [], []).people.length > 0,
        Q: qualifiesForPeopleRescue(item(title, desc, 'relevant')),
    };
}
function expectPaths(name: string, title: string, desc: string, want: { F: boolean; R: boolean; Q: boolean }) {
    const got = paths(title, desc);
    for (const p of ['F', 'R', 'Q'] as const) assert.equal(got[p], want[p], `${name} — path ${p}`);
    console.log(`✓ ${want.F || want.R || want.Q ? 'KEEP ' : 'BLOCK'} F=${got.F ? 1 : 0} R=${got.R ? 1 : 0} Q=${got.Q ? 1 : 0}  ${name}`);
    pass++;
}
const ALL = { F: true, R: true, Q: true };
const NONE = { F: false, R: false, Q: false };

// ---- A person joining INTO A ROLE: People on every path ----
const HIRE = 'Rosen joins Example Industrial Developers as vice president of acquisitions - Real Estate NJ';
expectPaths('VP-of-acquisitions hire, as stored in feed.json (title only)', HIRE, '', ALL);
expectPaths('VP-of-acquisitions hire with an enriched description', HIRE,
    'Example Industrial Developers, a New Jersey industrial developer, has hired Rosen to run acquisitions.', ALL);
expectPaths('joins NJ office as managing director',
    'Smith joins Sample Brokerage New Jersey office as managing director of industrial',
    'Smith will lead industrial warehouse brokerage in New Jersey.', ALL);
expectPaths('person joins a board',
    'Jane Doe joins New Jersey industrial developers association board',
    'The industrial development executive joins the board.', ALL);
// National move: People via F and R; the post-backfill rescue still requires target region.
expectPaths('role-before-verb national move (no target region)',
    'Movers: Former Sample Brokers vice chairman joins Example Advisory as vice chair of industrial and logistics occupier leasing',
    'The industrial broker moves to lead occupier leasing.', { F: true, R: true, Q: false });

// ---- Corporate "joins": never People, on any path (all in NJ so region is not what blocks Q) ----
expectPaths('company joins an industry initiative (body says "joined")',
    "Examplecorp joins tech firms' push to standardize New Jersey data center development",
    'Examplecorp joined other technology companies in an industry initiative to standardize data center development in New Jersey.', NONE);
expectPaths('company joins a venture AS OPERATING PARTNER',
    'Example Industrial Capital joins New Jersey warehouse venture as operating partner',
    'The joint venture will develop an industrial warehouse in New Jersey.', NONE);
expectPaths('FORMER TENANT joins a coalition',
    'Former warehouse tenant joins New Jersey industrial coalition',
    'The coalition of New Jersey industrial occupiers now has a new member.', NONE);
expectPaths('company joins an advisory BOARD',
    'Example Logistics joins New Jersey industrial advisory board',
    'The New Jersey industrial advisory board now includes a logistics operator.', NONE);
expectPaths('company joins a coalition',
    'Sampleco joins coalition to electrify New Jersey warehouse truck fleets',
    'Sampleco joined a coalition of logistics firms to expand charging at New Jersey industrial warehouses.', NONE);
expectPaths('investor joins a venture',
    'Example Equity joins Sample Industrial Partners in Lehigh Valley warehouse venture',
    'The joint venture will develop an industrial warehouse in the Lehigh Valley, Pennsylvania.', NONE);
expectPaths('tenant joins a park',
    'Exampleco joins tenants at Edison logistics park as anchor occupant',
    'The industrial park in Edison, New Jersey, now has a warehouse tenant.', NONE);

// ---- The title-only helper itself ----
const helper: Array<[string, boolean]> = [
    [HIRE, true],
    ['Movers: Former Sample Brokers vice chairman joins Example Advisory', true],
    ["Examplecorp joins tech firms' push to standardize data center development", false],
    ['Example Industrial Capital joins New Jersey warehouse venture as operating partner', false],
    ['Former warehouse tenant joins New Jersey industrial coalition', false],
    ['Example Logistics joins New Jersey industrial advisory board', false],
    ['Investment manager Samplefund joins push for warehouse decarbonization', false],
];
for (const [t, want] of helper) { assert.equal(isPersonnelJoin(t), want, `isPersonnelJoin: ${t}`); pass++; }
console.log(`✓ isPersonnelJoin: ${helper.length} title cases`);

console.log(`\nAll people-join tests passed (${pass} checks).`);
