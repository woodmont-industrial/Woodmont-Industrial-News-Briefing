/**
 * Competitor watchlist attribution.
 *
 * The fixtures here stay synthetic so matching edge cases remain stable as the
 * approved public ownership list changes. That public asset has its own suite;
 * WATCHLIST_CSV can still exercise an optional runtime override.
 */
import { loadCapitalMarkets, harness, loadWatchlist } from './load.mjs';
const { CM } = await loadCapitalMarkets();
const h = harness('competitor attribution');

const row = (name, domain, type = 'Developer') => ({
  'Company Name': name, 'Secondary Type': type, 'City': '', 'State / Country': '',
  'Website Domain': domain || '',
});
// Shapes that mirror the real list's problem cases, with invented companies.
const WL = [
  row('Northgate Industrial Partners', 'northgate-industrial.example'),
  row('ACME Logistics Properties', 'acme-logistics.example'),
  row('QRZ', 'qrz-capital.example'),                        // pure acronym
  row('TPQX, Inc.', 'tpqx.example'),                        // pure acronym with suffix
  row('ZL Industrial Partners', 'zl-industrial.example'),   // 2-letter prefix - too weak
  row('New Jersey Sample Development Corporation', ''),     // begins with a state name
  row('Commercial Sample Group', ''),                       // generic industry word
  row('Vertex Holdings Corporation', 'vertex-holdings.example'),
  row('Vertex Asset Management', 'am.vertex-holdings.example'),
  row('Vertex Property Group', 'vertex-property.example'),
];
const companiesFor = (title, description = '', link = '') =>
  CM.cmCompetitorWatch([{ title, description, summary: '', link }], WL).items.map(i => i._cw.company);

h.section('a match needs BOTH company evidence and a material event');
h.chk(companiesFor('Northgate Industrial Partners acquires a warehouse').length === 1,
  'company + acquisition -> match');
h.chk(companiesFor('Northgate Industrial Partners named to a best-places-to-work list').length === 0,
  'company + non-material event -> no match');
h.chk(companiesFor('An unrelated firm acquires a warehouse').length === 0,
  'material event with no watchlist company -> no match');

h.section('acronym companies: exact uppercase token only');
h.chk(companiesFor('QRZ acquires an Edison warehouse').some(c => c === 'QRZ'),
  'uppercase acronym matches');
h.chk(companiesFor('TPQX acquires an Edison warehouse').some(c => /TPQX/.test(c)),
  'uppercase acronym with a corporate suffix matches');
for (const prose of ['the qrz report was published and a site was acquired',
                     'tpqx style cabling was acquired for the fit-out'])
  h.chk(companiesFor(prose).length === 0, `lowercase prose does not match: "${prose.slice(0, 44)}"`);
h.chk(CM.cmCompanyAliases('QRZ').length === 0, 'a pure acronym carries NO lowercase alias');
h.chk(CM.cmCompanyAliases('TPQX, Inc.').length === 0, 'suffix-stripped pure acronym carries no alias');
h.chk(CM.cmAcronymTokens('QRZ').includes('QRZ'), 'acronym token is extracted');
h.chk(!CM.cmAcronymTokens('ZL Industrial Partners').includes('ZL'),
  'a two-letter token is too weak to be an acronym');

h.section('domain evidence reaches a company with no usable name');
h.chk(companiesFor('Investor acquires a warehouse', 'details at qrz-capital.example',
  'https://qrz-capital.example/x').some(c => c === 'QRZ'), 'domain evidence matches');

h.section('geography-only and generic aliases are rejected');
h.chk(!CM.cmCompanyAliases('New Jersey Sample Development Corporation').includes('new jersey'),
  'a name beginning with a state is not aliased to that state');
h.chk(companiesFor('A firm acquires a 12-property industrial portfolio in New Jersey').length === 0,
  'an article naming only the state matches no company');
h.chk(CM.cmIsGeographyOnly('new jersey') && CM.cmIsGeographyOnly('edison'),
  'states and municipalities are recognised as geography');
h.chk(!CM.cmIsGeographyOnly('northgate industrial partners'), 'a real company name is not geography');
for (const w of ['commercial', 'community', 'development', 'observer', 'journal'])
  h.chk(CM.cmCompanyAliases(w).length === 0, `generic word "${w}" yields no alias`);
h.chk(companiesFor('Warehouse sells for $21M - Commercial Sample Observer').every(c => !/^Commercial$/.test(c)),
  'a publication name does not match a "Commercial" family');

h.section('family ambiguity is flagged, not guessed');
const fam = CM.cmCompetitorWatch(
  [{ title: 'Vertex acquires an industrial portfolio', description: '', summary: '', link: '' }], WL);
h.chk(fam.items.length === 1 && fam.items[0]._cw.familyMatch === true,
  'a bare family brand is flagged for verification');
h.chk((fam.items[0]._cw.alsoConsidered || []).length === 3, 'all candidate entities are listed');
const exact = CM.cmCompetitorWatch(
  [{ title: 'Vertex Property Group acquires an industrial portfolio', description: '', summary: '', link: '' }], WL);
h.chk(exact.items[0]._cw.company === 'Vertex Property Group' && exact.items[0]._cw.familyMatch === false,
  'a specific entity name resolves exactly');
const byDomain = CM.cmCompetitorWatch([{ title: 'Vertex acquires a portfolio',
  description: 'see am.vertex-holdings.example', summary: '', link: '' }], WL);
h.chk(byDomain.items[0]._cw.company === 'Vertex Asset Management',
  'the more specific domain disambiguates within a family');

h.section('optional: runtime override, only when WATCHLIST_CSV is set');
const real = loadWatchlist(CM);
if (!real) h.note('WATCHLIST_CSV not set - optional override skipped');
else {
  const res = CM.cmCompetitorWatch([], real);
  h.chk(res.diag.companiesLoaded > 0, `runtime override parsed: ${res.diag.companiesLoaded} companies, ${res.diag.withDomains} with domains`);
  h.chk(res.diag.rejectedGenericName <= 2, `at most a couple of companies are unusable (${res.diag.rejectedGenericName})`);
}

process.exit(h.done());
