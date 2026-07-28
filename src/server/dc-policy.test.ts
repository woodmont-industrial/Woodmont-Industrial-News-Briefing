import assert from 'node:assert/strict';
import { dcPolicyVerdict, dcDollarsB, dcMW, isNationalScaleDataCenterProject } from '../shared/dc-policy.js';
import { applyDataCenterPolicy, isDcExceptionItem, dcVerdictOf } from './newsletter-filters.js';

let pass = 0;
const eq = (name: string, got: unknown, exp: unknown) => { assert.deepEqual(got, exp, `${name} (got ${JSON.stringify(got)}, exp ${JSON.stringify(exp)})`); console.log(`✓ ${name}`); pass++; };
const item = (title: string, description = '') => ({ title, description, url: 'https://news.google.com/x', link: 'https://news.google.com/x' } as any);
const score = (a: any) => a.__score ?? 0;

// ---- 1. Six locked classifier cases ----
eq('lock: Bonita Springs (FL) → allow-regional', dcPolicyVerdict('Bonita Springs mayor says facility on Imperial River Road will not be a data center'), 'allow-regional');
eq('lock: Big Banks → allow-macro', dcPolicyVerdict('Big Banks Shake Off CRE Jitters, Cut Loss Reserves And Raise AI Hopes. AI and data center development erasing shadows over nonperforming loans.'), 'allow-macro');
eq('lock: Savannah $20B/3.2GW → allow-national-scale', dcPolicyVerdict('OpenAI Targets Savannah For $20B Data Center. pumping more than $20B into a new 3.2-gigawatt data center outside of Savannah.'), 'allow-national-scale');
eq('lock: Columbus OH sub-scale → reject-oor', dcPolicyVerdict('Vantage plans a new $400M data center campus in Columbus, Ohio'), 'reject-oor');
eq('lock: unknown small-town → allow-unknown-location', dcPolicyVerdict('Vantage plans a new data center facility in Millbrook'), 'allow-unknown-location');
eq('lock: NJ/PA/FL small-town w/ county → allow-regional', dcPolicyVerdict('Developer plans data center campus in Warren County, New Jersey'), 'allow-regional');

// ---- 2. Dollar / MW extraction boundaries ----
eq('$20B', dcDollarsB('$20B data center'), 20);
eq('$5 billion == threshold', isNationalScaleDataCenterProject('$5 billion data center'), true);
eq('$4.9B below threshold', isNationalScaleDataCenterProject('$4.9B data center'), false);
eq('$800 million → 0.8B', dcDollarsB('$800 million data center'), 0.8);
eq('$20,000 million comma → 20B', dcDollarsB('$20,000 million data center'), 20);
eq('500 MW == threshold', isNationalScaleDataCenterProject('500 MW data center'), true);
eq('499-megawatt below', isNationalScaleDataCenterProject('499-megawatt data center'), false);
eq('3.2 gigawatt → 3200 MW', dcMW('3.2-gigawatt data center'), 3200);
eq('$4B valuation not national', isNationalScaleDataCenterProject('Data Center Operator Goes Public At $4B Valuation'), false);

// ---- helpers for routing tests ----
const savannah = () => Object.assign(item('OpenAI Targets Savannah For $20B Data Center', 'a new 3.2-gigawatt data center outside of Savannah'), { __score: 5 });
const meta = () => Object.assign(item('Meta Ups Investment To $50B For Its Largest Data Center Project', ''), { __score: 9 });
const njDeal = () => item('NAI DiLeo marketing 75,000 sq ft industrial facility in Piscataway, NJ', 'Piscataway New Jersey industrial building');

// ---- 3. Two exception candidates compete for the one-item cap ----
{
    const r = applyDataCenterPolicy([savannah(), meta(), njDeal()], [], [], [], score);
    const exc = r.relevant.filter(a => isDcExceptionItem(a));
    eq('cap: only 1 exception survives', exc.length, 1);
    eq('cap: the higher-scored exception (Meta $50B) wins', exc[0].title.includes('Meta'), true);
    eq('cap: diagnostics logged the kept national-scale item', r.dc.nationalScaleAllowed.length, 1);
}

// ---- 4. Confirmed regional displaces a national-scale exception when the section is FULL ----
{
    const MAX = 3;
    // 3 confirmed-regional/normal + 1 exception → exception placed LAST → cap drops it
    const full = applyDataCenterPolicy([njDeal(), njDeal(), njDeal(), savannah()], [], [], [], score);
    eq('full: exception is placed LAST (pre-cap)', isDcExceptionItem(full.relevant[full.relevant.length - 1]), true);
    const capped = full.relevant.slice(0, MAX);
    eq('full: after cap, exception is displaced by regional items', capped.some(isDcExceptionItem), false);
    // With room (2 normal + 1 exception, MAX 3) → exception kept
    const room = applyDataCenterPolicy([njDeal(), njDeal(), savannah()], [], [], [], score);
    eq('room: exception kept when Relevant not full', room.relevant.slice(0, MAX).some(isDcExceptionItem), true);
}

// ---- 5. National-scale / unknown items restricted to Relevant; reject-oor dropped everywhere ----
{
    const r = applyDataCenterPolicy(
        [njDeal()],
        [savannah()],                                            // exception wrongly in Transactions
        [item('Vantage builds $400M data center in Columbus, Ohio')], // reject-oor in Availabilities
        [],
        score,
    );
    eq('restrict: exception removed from Transactions', r.transactions.length, 0);
    eq('restrict: reject-oor removed from Availabilities', r.availabilities.length, 0);
    eq('restrict: reject logged', r.dc.rejectedOutOfRegion.length, 1);
}

// ---- 6. Exception items get NO regional-coverage credit (flag used by coverage logic) ----
eq('coverage: national-scale is an exception item', isDcExceptionItem(savannah()), true);
eq('coverage: unknown-location is an exception item', isDcExceptionItem(item('Vantage plans a data center facility in Millbrook')), true);
eq('coverage: confirmed-regional is NOT an exception', isDcExceptionItem(njDeal()), false);
eq('coverage: macro is NOT an exception', isDcExceptionItem(item('10 Emerging Data Center Markets to Watch')), false);

console.log(`\nAll DC-policy tests passed (${pass} checks).`);
