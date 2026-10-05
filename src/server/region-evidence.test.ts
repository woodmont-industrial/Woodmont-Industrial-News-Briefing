/**
 * Region and asset evidence in the department newsletter's filters.
 *
 * Two live defects, both found from a single bad send on 2026-10-05 in which a
 * Manhattan office story shipped in Transactions.
 */
import { isStrictlyIndustrial } from '../shared/region-data.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
let failures = 0;
const check = (ok: unknown, label: string): void => {
    if (ok) console.log(`  OK   ${label}`);
    else { console.error(`  FAIL ${label}`); failures++; }
};

console.log('=== a size unit is not asset evidence ===');
// "square feet" was in CRE_DEAL_SIGNALS and in hasPropertyContext, so the check
// was circular: the token satisfied the deal signal and then proved its own
// property context. This story names no asset at all — its only qualifying
// token was the square footage of the tenant's CURRENT headquarters.
const sony = 'Sony in Talks to Anchor Tishman Speyer 99 Hudson Boulevard. '
    + 'Sony is in negotiations to become the anchor tenant of the planned 99 Hudson Boulevard in Hudson Yards. '
    + 'Sony current U.S. headquarters is in the top 568,000 square feet of 11 Madison Avenue.';
check(isStrictlyIndustrial(sony) === false, 'an office story whose only token is a square footage is not industrial');
check(isStrictlyIndustrial('Executive buys a 5,000 square feet apartment') === false,
    'a size unit with no CRE asset is not industrial');

console.log('=== real assets still qualify ===');
for (const [text, why] of [
    ['Investor acquires a 250,000 square feet warehouse in Edison, New Jersey', 'warehouse'],
    ['Investor acquires a 250,000 square feet building in Edison, New Jersey', 'building named as the asset'],
    ['Tenant leased 480,000 square feet at an industrial park in Linden, New Jersey', 'industrial park'],
    ['Buyer acquired a logistics facility in Vineland, New Jersey', 'logistics facility'],
] as Array<[string, string]>) check(isStrictlyIndustrial(text) === true, `${why} still qualifies`);

console.log('=== multi-word phrases are not wrapped in literal quotes ===');
// Every multi-word phrase in three regexes was written as "New Jersey" inside
// the pattern, so it could only match text containing the quote characters.
// "New Jersey" itself never matched its own target-region regex.
const filters = fs.readFileSync(path.join(REPO, 'src', 'server', 'newsletter-filters.ts'), 'utf8');
const regexLines = filters.split('\n').filter(l =>
    /^\s*(?:export\s+)?const\s+(?:NON_TARGET_US_STATE_RE|NON_TARGET_COUNTRY_RE|TARGET_REGION_PHRASE_RE)\s*=/.test(l));
check(regexLines.length === 3, `all three region regexes are present (${regexLines.length})`);
for (const line of regexLines) {
    const name = (line.match(/const\s+(\w+)/) || [])[1];
    check(!line.includes('"'), `${name} contains no literal quote characters`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nOK: region and asset evidence');
process.exit(failures ? 1 : 0);
