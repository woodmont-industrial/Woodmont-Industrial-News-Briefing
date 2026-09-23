/**
 * Thresholds, event semantics and geography tiers.
 * All fixtures are synthetic: no real company, watchlist entry or article.
 */
import { loadCapitalMarkets, harness } from './load.mjs';
const { CM } = await loadCapitalMarkets();
const h = harness('classification');
const cls = (title, extra = {}) => CM.cmClassify({ title, description: '', summary: '', ...extra });

h.section('strict > thresholds: the exact boundary must FAIL');
for (const [title, want, why] of [
  ['Buyer acquires Edison, New Jersey warehouse for $10 million', null, 'sale $10M TARGET'],
  ['Buyer acquires Edison, New Jersey warehouse for $10,000,001', 'sales', 'sale $10,000,001 TARGET'],
  ['Buyer acquires Vineland, New Jersey warehouse for $100 million', null, 'sale $100M BROADER'],
  ['Buyer acquires Vineland, New Jersey warehouse for $100,000,001', 'sales', 'sale $100,000,001 BROADER'],
  ['Buyer acquires Dallas, Texas warehouse for $500 million', null, 'sale $500M NATIONAL'],
  ['Tenant leased 15,000 square feet in Edison, New Jersey', null, 'lease 15,000 TARGET'],
  ['Tenant leased 15,001 square feet in Edison, New Jersey', 'leases', 'lease 15,001 TARGET'],
  ['Tenant leased 100,000 square feet in Vineland, New Jersey', null, 'lease 100,000 BROADER'],
  ['Tenant leased 250,000 square feet in Dallas, Texas', null, 'lease 250,000 NATIONAL'],
  ['Developer breaks ground on 500,000 square feet industrial warehouse in Vineland, New Jersey', null, 'construction 500,000 BROADER'],
  ['Developer breaks ground on 500,001 square feet industrial warehouse in Vineland, New Jersey', 'construction', 'construction 500,001 BROADER'],
]) h.chk(cls(title).section === want, `${why.padEnd(34)} -> ${String(cls(title).section)} (want ${String(want)})`);

h.chk(/does not exceed/.test(cls('Buyer acquires Edison, New Jersey warehouse for $10 million').reason || ''),
  'a boundary rejection says "does not exceed", never "<"');

h.section('target-market construction qualifies regardless of stated SF');
h.chk(cls('Developer breaks ground on an industrial warehouse in Edison, New Jersey').section === 'construction',
  'TARGET construction with no SF still qualifies');

h.section('availability versus completed lease');
for (const [title, want] of [
  ['200,000 SF industrial building for lease in Edison, New Jersey', 'availabilities'],
  ['Now leasing: 250,000 square feet in Edison, New Jersey', 'availabilities'],
  ['120,000 square feet available in Edison, New Jersey', 'availabilities'],
  ['Offering memorandum released for a 400,000 square foot Edison, New Jersey facility', 'availabilities'],
  ['Tenant signs a lease for 200,000 square feet in Edison, New Jersey', 'leases'],
  ['Operator leased 250,000 square feet in Edison, New Jersey', 'leases'],
  ['Distributor renews 180,000 square feet in Edison, New Jersey', 'leases'],
  ['Retailer took 120,000 SF in Edison, New Jersey', 'leases'],
  ['Tenant expands its occupancy by 150,000 square feet in Edison, New Jersey', 'leases'],
  ['ACME Group and Sample Delivery ink 530,000 sq. ft. lease at new Carneys Point logistics campus', 'leases'],
  ['767,000-square-foot Sarasota distribution center listed for lease', 'availabilities'],
  // completion wins when both appear
  ['Space marketed for lease in Edison, New Jersey has now been leased, 200,000 square feet', 'leases'],
]) h.chk(cls(title).section === want, `${String(cls(title).section).padEnd(15)} <- ${title.slice(0, 60)}`);

h.section('headline-only place context stays conservative');
const carneysLease = cls('ACME Group and Sample Delivery ink 530,000 sq. ft. lease at new Carneys Point logistics campus');
h.chk(carneysLease.tier === 'BROADER', 'multi-word NJ township + logistics campus resolves as BROADER');
const sarasotaAvailability = cls('767,000-square-foot Sarasota distribution center listed for lease');
h.chk(sarasotaAvailability.tier === 'BROADER', 'city + distribution center resolves Sarasota as BROADER');
const aberdeenNoPrice = cls('Sample Capital acquires 3.5-acre low-coverage industrial site in Aberdeen');
h.chk(aberdeenNoPrice.tier === 'TARGET' && aberdeenNoPrice.code === 'MISSING_PRICE',
  '"in" corroborates an NJ township; the sale is held for its missing price, not unmapped geography');
const genericCommercial = cls('Commercial warehouse portfolio is available for lease');
h.chk(genericCommercial.tier === 'UNMAPPED', 'generic "Commercial warehouse" does not resolve the Commercial township');

h.section('sales mean ownership transfer, not financing');
for (const [title, isSale] of [
  ['Buyer acquires Edison, New Jersey warehouse for $40 million', true],
  ['Buyer completed the acquisition of an Edison, New Jersey warehouse for $40 million', true],
  ['Buyer acquires a newly completed Edison, New Jersey warehouse for $40 million', true],
  ['Owner refinances Edison, New Jersey warehouse with a $40 million loan', false],
  ['$40 million CMBS loan backed by Edison, New Jersey warehouses', false],
  ['Warehouse for sale for $40 million in Edison, New Jersey', false],
]) h.chk((cls(title).section === 'sales') === isSale,
  `${isSale ? 'SALE    ' : 'NOT SALE'} <- ${title.slice(0, 58)}`);

h.section('material portfolio financing is market intelligence');
const largeRefi = cls('ACME to land $1.7B industrial portfolio refi');
h.chk(largeRefi.section === 'intel' && /capital-trend/.test(largeRefi.reason),
  '$1.7B industrial portfolio refi qualifies as a capital-markets trend');
const smallRefi = cls('ACME lands $40 million industrial warehouse refinancing in Edison, New Jersey');
h.chk(smallRefi.section === null && smallRefi.code === 'NO_SIGNAL',
  'an ordinary property refinancing does not enter Market Intelligence');

h.chk(cls('Developer completes a 500,001 SF industrial warehouse in Vineland, New Jersey').section === 'construction',
  'an asset-specific completion remains a construction milestone');

h.section('geography tiers');
for (const [title, tier] of [
  ['Buyer acquires Edison, New Jersey warehouse for $40 million', 'TARGET'],
  ['Buyer acquires Vineland, New Jersey warehouse for $40 million', 'BROADER'],
  ['Buyer acquires Allentown, Pennsylvania warehouse for $40 million', 'TARGET'],
  ['Buyer acquires Lancaster, Pennsylvania warehouse for $40 million', 'BROADER'],
  ['Buyer acquires Miami, Florida warehouse for $40 million', 'TARGET'],
  ['Buyer acquires Tampa, Florida warehouse for $40 million', 'BROADER'],
  ['Buyer acquires Jacksonville, Florida warehouse for $40 million', 'UNMAPPED'],
]) h.chk(cls(title).tier === tier, `${String(cls(title).tier).padEnd(9)} <- ${title.slice(0, 58)}`);

h.section('NJ Exit 6 boundary');
const njCfg = CM.cmGeo.geography.states.NJ;
h.note(`comparator "${njCfg.comparator}" against ${njCfg.exit6Latitude}, fallback ${njCfg.fallbackTier}`);
h.chk(njCfg.comparator === '>', 'boundary is strictly greater-than');
h.chk(njCfg.fallbackTier === 'BROADER', 'south of the line falls back to BROADER, never UNMAPPED');
h.chk(njCfg.overrides && typeof njCfg.overrides === 'object', 'an overrides map exists for boundary corrections');
for (const [title, tier] of [
  ['Buyer acquires Florence, New Jersey warehouse for $40 million', 'BROADER'],
  ['Buyer acquires Brielle, New Jersey warehouse for $40 million', 'TARGET'],
]) h.chk(cls(title).tier === tier, `${String(cls(title).tier).padEnd(9)} <- nearest municipality below/above the line`);

h.section('geography provenance is recorded in the data file');
const G = CM.cmGeo.geography;
h.chk(Array.isArray(G._sources) && G._sources.length > 0, 'geography file records its sources');
h.chk(typeof G.states.FL._derivation === 'string' && /BUSINESS-MARKET INTERPRETATION/.test(G.states.FL._derivation),
  'Florida set is labelled a business-market interpretation, not an FDOT standard');
h.chk(G.states.FL.broaderCounties.length === 24, `Florida broader set has 24 counties`);
h.chk(G.states.FL.targetCounties.length === 3, 'Florida target set has 3 counties');
h.chk(G.states.FL._provenance && G.states.FL._provenance.status === 'CONFIRMED',
  'Florida county set is recorded as owner-CONFIRMED, with who and when');
h.chk(/reviewed by the owner, not parsed by code/.test(G.states.FL._provenance.basis),
  'Florida provenance is honest that a human read the map, not the code');
h.chk(G.states.NJ._provenance && G.states.NJ._provenance.status === 'CONTEXTUAL_ONLY',
  'the NJ image is recorded as contextual only - it has no legend');
h.chk(/straight-line proxy/.test(G.states.NJ._provenance.limitation),
  'the NJ latitude proxy limitation is documented');
h.chk(/overrides/.test(G.states.NJ._provenance.limitation),
  'boundary corrections are documented as per-municipality overrides');
h.chk(G.states.PA._pendingConfirmation && G.states.PA._pendingConfirmation.status === 'PENDING',
  'PA tier questions are recorded as explicitly PENDING');
h.chk(G.states.PA._pendingConfirmation.questions.some(q => /Berks/.test(q)),
  'the Berks / Lehigh Valley question is on the record');
h.chk(G.states.PA._pendingConfirmation.questions.some(q => /Philadelphia Metro/.test(q))
   && G.states.PA._pendingConfirmation.questions.some(q => /I-78/.test(q)),
  'the Philadelphia Metro and I-78/81/CPA questions are on the record');

h.section('NJ manual overrides actually take effect');
const njOv = CM.cmGeo.geography.states.NJ;
const savedOv = njOv.overrides;
njOv.overrides = { 'Brielle|Monmouth': 'BROADER' };
h.chk(cls('Buyer acquires Brielle, New Jersey warehouse for $40 million').tier === 'BROADER',
  'an override flips a municipality that the latitude rule placed otherwise');
njOv.overrides = savedOv || {};
h.chk(cls('Buyer acquires Brielle, New Jersey warehouse for $40 million').tier === 'TARGET',
  'removing the override restores the latitude result');

process.exit(h.done());
