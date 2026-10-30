import assert from 'node:assert/strict';
import { hasUnsupportedSummaryQuantity, summaryQuantities } from './summary-quantities.js';

const same = [
    ['Example Buyer buys 160K SF industrial warehouse', 'The warehouse measures 160,000 SF.'],
    ['Example Builder breaks ground on a 1 Million-Square-Foot New Jersey logistics park', 'New Jersey — 1,000,000 SF logistics park.'],
    ['A 160,000-square-foot warehouse', 'The warehouse totals 160K SF.'],
    ['A 1.5M-SF distribution center', 'A 1,500,000 square foot distribution center.'],
    ['A 1-million-square-foot warehouse', 'A 1,000,000 SF warehouse.'],
    ['A $1.6B industrial sale', 'The sale price was $1,600M.'],
    ['A $1,600 million industrial sale', 'The property sold for $1.6 billion.'],
    ['A $25,000,000 sale of a 50,000 sq. ft. warehouse', 'A 50K SF warehouse sold for $25M.'],
    ['The cap rate is 4 percent', 'A 4% cap rate.'],
    ['Warehouse vacancy is 5.0%', 'Warehouse vacancy is 5 percent.'],
];
for (const [source, summary] of same) assert.equal(hasUnsupportedSummaryQuantity(summary, source), false, `${source} -> ${summary}`);
const invented = [
    ['A 160K SF warehouse', 'A 160,001 SF warehouse.'],
    ['A $1.6B sale', 'The sale price was $160M.'],
    ['A $160M sale', 'A 160M SF warehouse.'],
    ['A 160K SF warehouse', 'A $160,000 sale.'],
    ['A warehouse at 160000 Example Road', 'The warehouse measures 160,000 SF.'],
    ['A 25,000 SF warehouse', 'A $25M sale.'],
    ['A $25M sale', 'A $2.5M sale.'],
    ['A 4% cap rate', 'A 40% cap rate.'],
    ['An industrial warehouse sold', 'The property sold for $25,000,000.'],
];
for (const [source, summary] of invented) assert.equal(hasUnsupportedSummaryQuantity(summary, source), true, `${source} -> ${summary}`);
assert.deepEqual(summaryQuantities('160K SF at $25M with a 4.0% cap rate'), [
    {unit:'usd',value:25000000},{unit:'sf',value:160000},{unit:'percent',value:4},
]);
console.log(`PASS: ${same.length} numeric equivalences, ${invented.length} invented quantities and typed units`);
