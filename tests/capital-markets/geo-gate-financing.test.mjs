/**
 * Two corrections, proven independently:
 *   1. Municipal items are geography-gated BEFORE acceptance.
 *   2. Industrial-context-guarded structured-finance language is recognised.
 * All fixtures are synthetic: no real company, watchlist entry or article.
 */
import { loadCapitalMarkets, harness } from './load.mjs';
const { CM } = await loadCapitalMarkets();
const h = harness('geo gate + financing');
const cls = (title, extra = {}) => CM.cmClassify({ title, description: '', summary: '', ...extra });

// Guard against a vacuous suite: if these regexes stop matching, every
// expectation below would "pass" for the wrong reason.
h.section('anchors resolve');
h.chk(CM.CM_RX.municipal.test('planning board'), 'municipal regex still matches "planning board"');
h.chk(CM.CM_RX.financing.test('securitization'), 'financing regex now matches "securitization"');

h.section('1. municipal items are geography-gated');
for (const [title, want, why] of [
  ['Planning board approves a warehouse site plan in Edison, New Jersey', 'municipal', 'TARGET municipal still accepted'],
  ['Planning board approves a warehouse site plan in Vineland, New Jersey', 'municipal', 'BROADER municipal still accepted'],
  ['Planning board approves a warehouse site plan in Phoenix, Arizona', null, 'out-of-scope STATE (resolves NATIONAL) rejected'],
  ['Planning board approves a rezoning for a distribution center', null, 'no resolvable location (UNMAPPED) rejected'],
  ['Township adopts a data center ordinance in Dallas, Texas', null, 'out-of-state ordinance rejected'],
]) {
  const r = cls(title);
  h.chk(r.section === want, `${why.padEnd(48)} -> ${String(r.section)} (want ${String(want)})`);
}
h.chk(cls('Planning board approves a rezoning for a distribution center').code === 'UNMAPPED_GEO',
  'an ungated municipal item is rejected as UNMAPPED_GEO, not NO_SIGNAL');

h.section('2. structured finance is recognised, with industrial context');
for (const [title, want, why] of [
  ['Sponsor closes $1 billion ABS financing for a national data center portfolio', 'intel', 'ABS data-center portfolio qualifies'],
  ['Owner prices a $750 million securitization backed by logistics warehouses', 'intel', 'logistics securitization qualifies'],
  ['Asset-backed securities issuance funds an industrial warehouse portfolio', 'intel', 'asset-backed securities qualify'],
  ['Lender completes a single-asset single-borrower deal on a distribution center', 'intel', 'SASB with industrial context qualifies'],
]) {
  const r = cls(title);
  h.chk(r.section === want, `${why.padEnd(48)} -> ${String(r.section)} (want ${String(want)})`);
}

h.section('2b. false positives stay out');
for (const [title, why] of [
  ['Gym operator opens abs training studios across the region', 'lowercase "abs" never matches'],
  ['Bank prices a $2 billion auto loan ABS offering', 'consumer ABS lacks industrial context'],
  ['Credit card asset-backed securities spreads widen this quarter', 'consumer asset-backed lacks industrial context'],
  ['Treasury yields fall as investors move into bonds', 'generic financial-market story excluded'],
]) {
  const r = cls(title);
  h.chk(r.section !== 'intel', `${why.padEnd(48)} -> ${String(r.section)} (want not intel)`);
}
h.chk(cls('Net absorption slows across the regional industrial market').reason.includes('market-fundamentals'),
  '"absorption" still routes to market-fundamentals, not structured finance');

h.done();
