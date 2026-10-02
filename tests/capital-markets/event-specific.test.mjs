/**
 * Event-specific classification.
 *
 * A direct-source pilot showed the classifier was unsafe on richer article
 * text: the proxy feed's 200-character truncation had been masking three
 * defects. With full bodies, a Miami RETAIL sale and a Michigan OFFICE lease
 * entered industrial sections, an Arizona portfolio resolved to a PA/NJ market
 * on an incidental body mention of "Newtown", and an office lease reported
 * 810,460 SF after summing every figure in the body.
 *
 * Fixtures below are the three real failures plus positive and negative
 * controls. Classification order is: event -> asset class -> location ->
 * event-specific measurement -> Jacob's threshold.
 */
import { loadCapitalMarkets, harness } from './load.mjs';
const { CM } = await loadCapitalMarkets();
const h = harness('event-specific classification');
const cls = (title, description = '') => CM.cmClassify({ title, description, summary: '' });

h.section('1. asset class is enforced on the deal sections');
const retail = cls('Publix Pays $83.5M for Miami Shopping Center',
  'Publix Super Markets bought out its landlord at Airpark Plaza in Miami. The company paid $83.25 million for the 204,000-square-foot shopping center.');
h.chk(retail.section === null, 'a Miami retail sale is rejected');
h.chk(retail.code === 'NOT_INDUSTRIAL', `and the code says why (${retail.code})`);

const office = cls('Landlord Signs 157,642 SF Office Lease in Southfield, Michigan',
  'The lease is at Travelers Tower II, a 13-story office building totaling 810,460 square feet.');
h.chk(office.section === null, 'an office lease is rejected');
h.chk(office.code === 'NOT_INDUSTRIAL', `and the code says why (${office.code})`);

h.chk(cls('Buyer acquires an Edison, New Jersey apartment community for $50 million').section === null,
  'multifamily is rejected');
h.chk(cls('Buyer acquires an Edison, New Jersey hotel for $50 million').section === null,
  'hospitality is rejected');
h.chk(cls('Buyer acquires an Edison, New Jersey property for $50 million').section === null,
  'unknown asset class is rejected, never inferred');
h.chk(cls('Buyer acquires an Edison, New Jersey self-storage facility for $50 million').section === null,
  'self-storage is rejected until Jacob includes it');

h.section('2. geography follows the event, not an incidental mention');
const tucson = cls('Equus Trades Tucson Warehouse Portfolio for $165.7M',
  'Everview Partners purchased an 85-building industrial portfolio across Tucson for $165.75 million. Newtown advised on the deal.');
h.chk(tucson.section === null, 'an Arizona portfolio does not qualify');
h.chk(tucson.tier !== 'BROADER' && tucson.tier !== 'TARGET',
  `and is not relocated into a PA/NJ market by "Newtown" (tier ${tucson.tier})`);
h.chk(cls('Buyer acquires a Dallas, Texas industrial warehouse for $50 million',
  'The seller also owns assets in Edison, New Jersey.').section === null,
  'an out-of-market headline overrides incidental target-market body text');

h.section('3. square footage is event-specific, never summed');
h.chk(office.magnitude !== 810460, 'figures from the body are not summed into one total');
const amb = cls('Tenant signs an industrial warehouse lease in Edison, New Jersey',
  'The tenant took 120,000 square feet in a building of 450,000 square feet.');
h.chk(amb.code === 'AMBIGUOUS_SF', `competing figures with no stated aggregate are ambiguous (${amb.code})`);
const agg = cls('Buyer acquires an Edison, New Jersey industrial warehouse portfolio',
  'The portfolio trades for $50 million, totaling 500,000 square feet across four buildings.');
h.chk(agg.section !== null || agg.code !== 'AMBIGUOUS_SF',
  'an aggregate the source states explicitly is usable');

h.section('positive controls still qualify');
h.chk(cls('Longpoint Buys Miami-Dade Warehouse Portfolio for $195M',
  'The industrial warehouse portfolio traded for $195 million.').section === 'sales',
  'a legitimate Miami industrial sale still qualifies');
h.chk(cls('Tenant signs 124,000 square foot industrial warehouse lease in Linden, New Jersey').section === 'leases',
  'a legitimate NJ warehouse lease still qualifies');
h.chk(cls('Hanover Company Delivers 358K-SF Lehigh Valley Industrial Project - Connect CRE').section === 'construction',
  'the Hanover construction completion still qualifies');

process.exit(h.done());
