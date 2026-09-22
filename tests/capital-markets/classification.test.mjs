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
  // completion wins when both appear
  ['Space marketed for lease in Edison, New Jersey has now been leased, 200,000 square feet', 'leases'],
]) h.chk(cls(title).section === want, `${String(cls(title).section).padEnd(15)} <- ${title.slice(0, 60)}`);

h.section('sales mean ownership transfer, not financing');
for (const [title, isSale] of [
  ['Buyer acquires Edison, New Jersey warehouse for $40 million', true],
  ['Owner refinances Edison, New Jersey warehouse with a $40 million loan', false],
  ['$40 million CMBS loan backed by Edison, New Jersey warehouses', false],
  ['Warehouse for sale for $40 million in Edison, New Jersey', false],
]) h.chk((cls(title).section === 'sales') === isSale,
  `${isSale ? 'SALE    ' : 'NOT SALE'} <- ${title.slice(0, 58)}`);

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

process.exit(h.done());
