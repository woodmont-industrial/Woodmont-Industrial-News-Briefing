/**
 * Event-specific classification.
 *
 * A direct-source pilot showed the classifier was unsafe on richer article
 * text: the proxy feed's 200-character truncation had been masking defects.
 * Enrichment exists to add page text, so it would have injected exactly the
 * inputs that trigger them.
 *
 * Order: event -> asset class -> location -> event-specific measurement ->
 * Jacob's threshold.
 *
 * Every case below is written to FAIL without the implementation it guards.
 * Cases that pass either way are marked as controls.
 */
import { loadCapitalMarkets, harness } from './load.mjs';
const { CM } = await loadCapitalMarkets();
const h = harness('event-specific classification');
const cls = (title, description = '') => CM.cmClassify({ title, description, summary: '' });

h.section('asset class is enforced on every deal section');
const retail = cls('Publix Pays $83.5M for Miami Shopping Center',
  'Publix Super Markets bought out its landlord at Airpark Plaza in Miami. The company paid $83.25 million for the 204,000-square-foot shopping center.');
h.chk(retail.section === null && retail.code === 'NOT_INDUSTRIAL',
  `a Miami retail sale is rejected as NOT_INDUSTRIAL (${retail.code})`);

// The lease verb DOES match here, so the asset gate is what rejects it — the
// earlier fixture used a verb the lease regex missed, so it never reached the
// gate it was meant to exercise.
const office = cls('Tenant leased 157,642 square feet of office space in Southfield, Michigan',
  'The lease is at Travelers Tower II, a 13-story office building totaling 810,460 square feet.');
h.chk(office.section === null && office.code === 'NOT_INDUSTRIAL',
  `an office lease reaches the lease path and is rejected there (${office.code})`);

// Construction had kept the looser isInd test and admitted this.
const retailBuild = cls('Developer breaks ground on an Edison, New Jersey shopping center',
  'The site sits beside an industrial warehouse park.');
h.chk(retailBuild.section === null && retailBuild.code === 'NOT_INDUSTRIAL',
  `shopping-centre construction is rejected despite an industrial body mention (${retailBuild.code})`);

for (const [asset, title] of [
  ['multifamily', 'Buyer acquires an Edison, New Jersey apartment community for $50 million'],
  ['hospitality', 'Buyer acquires an Edison, New Jersey hotel for $50 million'],
  ['self-storage', 'Buyer acquires an Edison, New Jersey self-storage facility for $50 million'],
  ['unknown', 'Buyer acquires an Edison, New Jersey property for $50 million'],
]) h.chk(cls(title).section === null, `${asset} is rejected`);

h.section('geography follows the event, not an incidental mention');
// Tucson had to be known as a non-target metro: while it was unrecognised the
// headline resolved UNMAPPED, the resolver fell back to the body, and the
// seller's Newtown, Pennsylvania address relocated an Arizona deal to BROADER.
const tucson = cls('Equus Trades Tucson Warehouse Portfolio for $165.7M',
  'The seller is headquartered in Newtown, Pennsylvania.');
h.chk(tucson.tier === 'NATIONAL',
  `a Tucson deal resolves NATIONAL, not relocated by a Newtown address (${tucson.tier})`);
h.chk(cls('Buyer acquires a Dallas, Texas industrial warehouse for $50 million',
  'The seller also owns assets in Edison, New Jersey.').tier === 'NATIONAL',
  'an out-of-market headline overrides incidental target-market body text');

// Headline precedence must not become a rejection: this deal qualifies on
// Jacob's national threshold and was briefly thrown out as a conflict.
const dallas = cls('Buyer acquires a Dallas, Texas industrial warehouse for $750 million',
  'The buyer is headquartered in Edison, New Jersey.');
h.chk(dallas.section === 'sales' && dallas.tier === 'NATIONAL',
  `a $750M national sale still qualifies despite an Edison HQ mention (${dallas.section}/${dallas.tier})`);
for (const description of [
  'The portfolio is in Tucson, Arizona. It was advised by a firm in Newtown, Pennsylvania.',
  'The portfolio is in Tucson, Arizona but was advised by a firm in Newtown, Pennsylvania.',
]) {
  const r = cls('Firm acquires an industrial warehouse portfolio for $165.7 million', description);
  h.chk(r.tier === 'NATIONAL' && r.code === 'BELOW_THRESHOLD',
    'a location in the body follows the portfolio rather than its adviser');
}
h.chk(cls('Firm acquires an industrial warehouse for $50 million',
  'The buyer is headquartered in Edison, New Jersey.').code === 'UNMAPPED_GEO',
  'a participant headquarters is not a substitute for an asset location');
h.chk(cls('Firm acquires an industrial warehouse for $50 million',
  'The warehouse is in Edison, New Jersey.').section === 'sales',
  'a genuine property-location statement in the body remains usable');
h.chk(cls('Tenant signs an industrial warehouse lease',
  'The tenant leased 120,000 square feet in Edison, New Jersey.').section === 'leases',
  'a transaction sentence can provide the property location');
for (const tenant of ['Grocery distributor', 'Supermarket operator', 'Regional office of a retailer']) {
  h.chk(cls(`${tenant} leased 200,000 SF warehouse in Edison, New Jersey`).section === 'leases',
    'tenant business or department words do not override an explicit warehouse');
}

h.section('square footage belongs to the event, never the container');
// The aggregate describes the BUILDING. Taking it admitted a 12,000 SF lease
// as 200,000 SF, sailing past Jacob's 15,000 SF target threshold.
const inBuilding = cls('Tenant signs an industrial warehouse lease in Edison, New Jersey',
  'The tenant took 12,000 square feet in a building totaling 200,000 square feet.');
h.chk(inBuilding.magnitude === 12000,
  `the leased area is used, not the building (${inBuilding.magnitude})`);
h.chk(inBuilding.section === null && inBuilding.code === 'BELOW_THRESHOLD',
  `so it correctly fails the 15,000 SF target threshold (${inBuilding.code})`);

// The ordinary adjectival form was missed entirely, turning a valid lease into
// MISSING_SF.
const hyphen = cls('Tenant signs an industrial warehouse lease in Linden, New Jersey',
  'The tenant took a 120,000-square-foot distribution facility.');
h.chk(hyphen.section === 'leases' && hyphen.magnitude === 120000,
  `a hyphenated 120,000-square-foot figure is read (${hyphen.section}/${hyphen.magnitude})`);

// Exercises the helper on the LEASE path, which is the only path that calls it.
const spread = cls('Industrial warehouse space in Edison, New Jersey is now leased',
  'One building measures 300,000 square feet. A separate building measures 450,000 square feet.');
h.chk(spread.code === 'AMBIGUOUS_SF',
  `figures spread across sentences with no stated aggregate are ambiguous (${spread.code})`);

const agg = cls('Tenant leased industrial warehouse space in Edison, New Jersey',
  'The deal covers four buildings totaling 500,000 square feet.');
h.chk(agg.section === 'leases' && agg.magnitude === 500000,
  `an aggregate the source states is usable (${agg.section}/${agg.magnitude})`);

h.section('controls — these pass with or without the change');
h.chk(cls('Longpoint Buys Miami-Dade Warehouse Portfolio for $195M',
  'The industrial warehouse portfolio traded for $195 million.').section === 'sales',
  'a legitimate Miami industrial sale still qualifies');
h.chk(cls('Tenant signs 124,000 square foot industrial warehouse lease in Linden, New Jersey').section === 'leases',
  'a legitimate NJ warehouse lease still qualifies');
h.chk(cls('Hanover Company Delivers 358K-SF Lehigh Valley Industrial Project - Connect CRE').section === 'construction',
  'the Hanover construction completion still qualifies');


h.section("square footage is found by position relative to the verb, not order or size");
// Taking the first figure was only accidentally right: a container can lead
// the sentence, and lease and availability wording put the area on opposite
// sides of the verb.
for (const [title, description, wantSf, why] of [
  ["Tenant signs an industrial warehouse lease in Edison, New Jersey",
   "In a building totaling 200,000 square feet, the tenant took 12,000 square feet.",
   12000, "container stated FIRST does not become the deal"],
  ["Tenant signs an industrial warehouse lease in Edison, New Jersey",
   "The tenant took 12,000 square feet in a building totaling 200,000 square feet.",
   12000, "container stated LAST does not become the deal"],
  ["Industrial warehouse space available in Edison, New Jersey",
   "Within a 450,000 square foot building, 120,000 square feet is available.",
   120000, "availability wording puts the area BEFORE the verb"],
  ["Tenant leased 12,000 square feet in a 200,000 square foot industrial warehouse in Edison, New Jersey",
   "", 12000, "two figures in the headline do not resolve to the larger"],
]) {
  const r = cls(title, description);
  h.chk(r.magnitude === wantSf, why.padEnd(56) + " -> " + String(r.magnitude) + " (want " + wantSf + ")");
}

h.section("non-target metros match as whole phrases");
// A substring test let "reno" match inside "Zireno Capital", so a company name
// with no location at all resolved NATIONAL and cleared the national threshold.
h.chk(cls("Zireno Capital acquires a warehouse portfolio for $750 million").tier !== "NATIONAL",
  "a city name inside a company name is not a location");
h.chk(cls("Buyer acquires a Reno, Nevada industrial warehouse for $750 million").tier === "NATIONAL",
  "the actual city still resolves");
h.chk(CM.cmPhraseInText("zireno capital", "reno") === false, "cmPhraseInText rejects a substring");
h.chk(CM.cmPhraseInText("in reno, nevada", "reno") === true, "cmPhraseInText accepts a whole phrase");
h.chk(CM.cmPhraseInText("deal in st. louis closed", "st. louis") === true,
  "a phrase with a period and a space still matches");


h.section("a figure plays a ROLE: transaction area, building area, or stated total");
// Distance to the verb could not tell these apart. In the first the BUILDING
// is nearest the verb; in the second the nearest figure is one leg of a deal
// whose total the source states.
for (const [title, description, wantSf, wantSection, why] of [
  ["Tenant signs an industrial warehouse lease in Edison, New Jersey",
   "Leased space in a 200,000 square foot warehouse, occupying 12,000 square feet.",
   12000, null, "a building nearest the verb is not the transaction"],
  ["Tenant signs an industrial warehouse lease in Dallas, Texas",
   "Leased 200,000 square feet at one warehouse and 300,000 square feet at another, totaling 500,000 square feet.",
   500000, "leases", "a source-stated transaction total beats the nearest leg"],
]) {
  const r = cls(title, description);
  h.chk(r.magnitude === wantSf, why.padEnd(56) + " -> " + String(r.magnitude) + " (want " + wantSf + ")");
  h.chk(r.section === wantSection, "  and the section follows from it -> " + String(r.section));
}
// A building total is still a building total, even phrased as one.
h.chk(cls("Tenant signs an industrial warehouse lease in Edison, New Jersey",
  "In a building totaling 200,000 square feet, the tenant took 12,000 square feet.").magnitude === 12000,
  "\"building totaling X\" is the container, not a transaction total");

process.exit(h.done());
