import assert from 'node:assert/strict';
import { qualifiesForPeopleRescue, PEOPLE_TITLE_ACTION } from './newsletter-filters.js';

// =============================================================================
// Regression: the post-backfill second People rescue must NOT promote a
// non-personnel item into People even when its DESCRIPTION is enriched with
// industrial / facility / company / action-like language.
//
// 2026-07-21: "HPS Floors Elevates New Jersey Industrial Facilities with High-
// Performance, Heavy-Duty Epoxy Solutions" (an epoxy-vendor PR item) shipped in
// People because 'elevat*' matched the marketing verb "Elevates" and a send-time
// AI description passed applyPeopleFilter. The TITLE gate must block it regardless
// of the description.
// =============================================================================

let pass = 0;
const check = (name: string, cond: boolean) => {
    assert.ok(cond, name);
    console.log(`✓ ${name}`);
    pass++;
};

const HPS_TITLE = 'HPS Floors Elevates New Jersey Industrial Facilities with High-Performance, Heavy-Duty Epoxy Solutions - EIN News';

// A production-like AI-enriched description packed with industrial / facilities /
// company / action language — exactly the content that flipped applyPeopleFilter.
const ENRICHED_DESC =
    'HPS Floors, a New Jersey flooring company, announced and named its new heavy-duty ' +
    'epoxy system for industrial facilities and warehouses; the firm appoints crews and ' +
    'welcomes clients as it promotes and elevates distribution-center flooring standards.';

const hps: any = {
    title: HPS_TITLE,
    description: ENRICHED_DESC,
    category: 'relevant',
    url: 'https://news.google.com/rss/articles/hps',
    link: 'https://news.google.com/rss/articles/hps',
};

// (1) The marketing "Elevates" title must NOT match the personnel-action regex.
check('HPS title does not match PEOPLE_TITLE_ACTION (no "elevat")', !PEOPLE_TITLE_ACTION.test(HPS_TITLE));

// (2) End-to-end: even with the enriched description, HPS cannot qualify for People.
check('HPS does NOT qualify for People rescue despite enriched description', qualifiesForPeopleRescue(hps) === false);

// (3) The description alone must not carry it in — flip the title to a bare product
//     line (no personnel verb) with the SAME enriched description → still blocked.
const productOnly: any = { ...hps, title: 'HPS Floors launches heavy-duty epoxy for New Jersey warehouses' };
check('Non-personnel title stays blocked even with action-rich description', qualifiesForPeopleRescue(productOnly) === false);

// (4) The valid verbs still work: a genuine NJ/PA/FL personnel move qualifies.
const grantDenham: any = {
    title: 'Pennsylvania Data Center Partners Names Grant Denham as Chief of Staff - GlobeNewswire',
    description: 'Pennsylvania Data Center Partners named Grant Denham as chief of staff.',
    category: 'relevant', url: 'https://news.google.com/rss/articles/gd', link: 'https://news.google.com/rss/articles/gd',
};
check('Genuine personnel move (Names … Chief of Staff, PA) still qualifies', qualifiesForPeopleRescue(grantDenham) === true);

// (5) Each retained verb still matches the regex (guard against accidental removal).
for (const v of ['hires', 'appoints', 'names', 'joins', 'promotes', 'taps', 'welcomes', 'recruits']) {
    check(`verb "${v}" still recognized`, PEOPLE_TITLE_ACTION.test(`Firm ${v} someone as director`));
}
// ...and 'elevates' is NOT recognized.
check('verb "elevates" is NOT recognized (regression guard)', !PEOPLE_TITLE_ACTION.test('HPS Floors elevates its facilities'));

console.log(`\nAll people-rescue regression tests passed (${pass} checks).`);
