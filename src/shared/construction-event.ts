/**
 * One construction project at one milestone, read from a normalized headline key
 * (see normalizeTitleKey: lower case, punctuation removed, "3.7" -> "3 7", "953,000" -> "953 000").
 *
 * Two reports of the same groundbreaking count once; a later milestone of the same project still
 * runs. The Apex in Logan Township was sent 2026-11-13 as "break ground on first of four
 * buildings at 3.7 million sq. ft. logistics campus in Logan Township" and again 2026-11-18 as
 * "break ground on 474-acre industrial campus in Southern New Jersey": same developers, same
 * milestone, a town against a region, and sizes in different units. No deal-event signature
 * covers it because a groundbreaking is not a sale, lease or financing.
 */

import { geoFromKey, placeRelation, type Geo } from './construction-geo.js';

export type ConstructionMilestone =
    | 'proposal' | 'approval' | 'start' | 'tilt-up' | 'topping-out' | 'nearing-completion' | 'completion';

export interface ConstructionEvent {
    milestone: ConstructionMilestone;
    developer: string[];        // distinctive subject tokens
    place: string[];            // specific place tokens; empty when only a region or none is named
    region: boolean;            // the place named is a state or multi-county region
    county: boolean;            // the place named is a county, which may contain the other's town
    detail: string[];           // distinctive words after the milestone ("coffee", "nebius")
    sqft: number | null;
    acres: number | null;
    phase: number | null;       // "first of four buildings" = 1, "phase 2" / "second building" = 2
    geo: Geo;                   // verified state / county / region counties (construction-geo.ts)
}

// Most specific first: "nears completion" is not "completion"; a groundbreaking that mentions an
// earlier approval is a start.
const MILESTONES: Array<[ConstructionMilestone, RegExp]> = [
    ['nearing-completion', /\b(?:nears?|nearing|close to|approaching)\s+completion\b/],
    ['topping-out', /\b(?:tops?|topped|topping)\s+out\b/],
    ['tilt-up', /\btilt(?:s|ed|ing)?\s+(?:up|walls|panels)\b|\btilting\s+walls\b/],
    ['start', /\b(?:breaks?|breaking|broke)\s+ground\b|\bground\s*breaking\b|\b(?:begins?|began|starts?|started|launch(?:es|ed)?|kicks?\s+off)\s+construction\b|\bconstruction\s+(?:begins|began|starts|started|underway|kicks\s+off)\b/],
    ['completion', /\b(?:completes?|completed|completion\s+of|finish(?:es|ed)|delivers?|delivered|delivery\s+of|ribbon\s+cutting|opens?|opened)\b/],
    ['approval', /\b(?:approves?|approved|approval|backs|greenlights?|okays?|clears)\b/],
    ['proposal', /\b(?:proposes?|proposed|proposal|plans?|planned|pitch(?:es|ed)?|unveils?|files?\s+plans|seeks?\s+approval)\b/],
];
const CONSTRUCTION_OBJECT_RE = /\b(?:warehouses?|buildings?|facilit(?:y|ies)|parks?|campus(?:es)?|projects?|developments?|cent(?:er|re)s?|distribution|logistics|industrial|plants?|cold storage|spec|flex|data centers?|sq ft|sf|acres?)\b/;
// A "completes" that is a deal ("completes $13M sale") is not a construction milestone.
const DEAL_RE = /\b(?:acquisitions?|acquires?|acquired|sales?|sells?|sold|buys?|bought|purchases?d?|leases?|leased|leasing|refinanc\w*|loans?|financing|recapitaliz\w*)\b/;

const SUBJECT_STOP = new Set(('a an the and of its for new real estate holdings group partners partner capital properties property '
    + 'investments investment management development developments developer developers company co inc llc lp ltd industrial logistics '
    + 'realty trust reit advisors fund funds firm team joint venture jv affiliate affiliates us usa american national county city '
    + 'township borough town board zoning planning officials commission council state local owner owners builder builders construction '
    + 'global international north south east west northern southern central '
    // what is being built is not who is building it ("data center plan" in four unrelated towns)
    + 'data center centers warehouse warehouses building buildings facility facilities park parks campus project projects '
    + 'distribution plant cold storage spec flex manufacturing ecommerce fulfillment support drug site sites hub '
    // headline filler
    + 'what about know with from that this these would could gets get second third potential existing exclusive lawsuit '
    + 'residents win wins fight review master rules exempt plan plans proposal proposed proposes massive major huge big '
    + 'more first sixth expands expand network '
    // units and figures
    + 'acre acres square feet foot million billion').split(' '));
// Project descriptors: never a developer, but distinctive enough to compare as detail.
const NOT_DEVELOPER = new Set('district overlay zone corridor expansion redevelopment'.split(' '));
// Words after the milestone that describe any project, not this one.
const DETAIL_STOP = new Set(('ground breaks broke construction begins starts underway opens opened completes completed completion '
    + 'approves approved approval tops topped tilt walls square foot feet acre acres million billion building buildings '
    + 'phase largest american north south east west amid despite after following first second third fourth four three '
    + 'near into over under upon through year years month months square photos video report news').split(' '));
const PLACE_GENERIC = new Set('township county city borough town village the of area region'.split(' '));
const REGION_WORDS = new Set(('new jersey nj pennsylvania pa florida fl northern southern central north south east west eastern western '
    + 'northeast northwest southeast southwest northeastern northwestern southeastern southwestern '
    + 'greater metro region area state jersey lehigh valley shore coast i 78 81 corridor').split(' '));

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, one: 1, two: 2, three: 3, four: 4, ii: 2, iii: 3 };

/** "953 000" -> 953000, "3 7" -> 3.7, "1 2" -> 1.2 */
function keyNumber(text: string): number {
    const parts = text.trim().split(/\s+/);
    if (parts.length === 1) return Number(parts[0]);
    if (parts.slice(1).every(p => p.length === 3)) return Number(parts.join(''));
    return Number(`${parts[0]}.${parts.slice(1).join('')}`);
}

function sizes(key: string): { sqft: number | null; acres: number | null } {
    const sf = key.match(/\b(\d+(?: \d+)*)\s*(million|m|k)?\s*(?:sf|sq ft|square f(?:ee|oo)t)\b/);
    const sqft = sf ? Math.round(keyNumber(sf[1]) * (sf[2] === 'million' || sf[2] === 'm' ? 1e6 : sf[2] === 'k' ? 1e3 : 1)) : null;
    const ac = key.match(/\b(\d+(?: \d+)*)\s*acres?\b/);
    return { sqft, acres: ac ? keyNumber(ac[1]) : null };
}

function phase(key: string): number | null {
    const ofMany = key.match(/\b(first|second|third|fourth|fifth)\s+(?:of\s+\w+\s+)?(?:buildings?|phases?|warehouses?)\b/);
    if (ofMany) return ORDINALS[ofMany[1]];
    const ph = key.match(/\bphase\s+(\d+|one|two|three|four|ii|iii)\b/);
    if (ph) return /^\d+$/.test(ph[1]) ? Number(ph[1]) : ORDINALS[ph[1]];
    return null;
}

export function constructionEventFromTitleKey(key: string): ConstructionEvent | null {
    if (!key || !CONSTRUCTION_OBJECT_RE.test(key)) return null;
    let milestone: ConstructionMilestone | null = null;
    let at = -1;
    for (const [name, re] of MILESTONES) {
        const m = key.match(re);
        if (!m) continue;
        if (name === 'completion' && DEAL_RE.test(key)) continue;
        if ((name === 'approval' || name === 'proposal') && DEAL_RE.test(key)) continue;
        milestone = name; at = m.index ?? 0;
        break;
    }
    if (!milestone) return null;
    const developer = [...new Set(key.slice(0, at).split(/\s+/)
        .filter(w => w.length >= 3 && !/^\d/.test(w) && !SUBJECT_STOP.has(w) && !NOT_DEVELOPER.has(w)))];
    // With no developer named, only a stated size can anchor a match ("4,500-Acre Data Center
    // District Approved In Pennsylvania Town" = Salem Township's 4,466-acre approval, sent 11-03).
    const size = sizes(key);
    if (developer.length === 0 && size.sqft === null && size.acres === null) return null;
    // The place is the last "in X" / "near X" phrase; a region names no single town.
    const tail = key.match(/\b(?:in|near)\s+((?:[a-z0-9]+\s?){1,4})$/)?.[1]?.trim() ?? '';
    const placeWords = tail.split(/\s+/).filter(w => w && !PLACE_GENERIC.has(w));
    const region = placeWords.length > 0 && placeWords.every(w => REGION_WORDS.has(w) || /^\d+$/.test(w));
    const place = region ? [] : placeWords.filter(w => !REGION_WORDS.has(w) && !/^\d+$/.test(w));
    // With no developer, the words before the milestone describe the project itself
    // ("4 500 acre data center district approved ...").
    const afterMilestone = developer.length ? key.slice(at).split(/\s+/).slice(1) : key.split(/\s+/);
    const detail = [...new Set(afterMilestone.filter(w => w.length >= 4 && !/^\d/.test(w) && !SUBJECT_STOP.has(w)
        && !DETAIL_STOP.has(w) && !REGION_WORDS.has(w) && !PLACE_GENERIC.has(w) && !place.includes(w)))];
    const county = !region && /\bcounty\b/.test(tail);
    return {
        milestone, developer, place, region, county,
        detail, ...size, phase: phase(key),
        geo: geoFromKey(key, tail, place.join(' '), county),
    };
}

const conflicts = (x: number | null, y: number | null) => x !== null && y !== null && Math.abs(x - y) > Math.max(x, y) * 0.15;
const agrees = (x: number | null, y: number | null) => x !== null && y !== null && !conflicts(x, y);

/**
 * Same project at the same milestone. Hard stops: a different milestone, conflicting states
 * (New Jersey vs Florida, Morris County vs Tampa), different towns, conflicting size or phase.
 * Then a shared developer AND a project identifier: the same town, a VERIFIED county-to-town or
 * region-to-county match (Monmouth County / Manalapan; Southern New Jersey / Logan Township), or a
 * shared distinctive detail ("coffee" in two reports of one plant opening). An agreeing size
 * only supports a match; it never makes one, even for a two-firm joint venture.
 */
export function constructionEventsSameProject(a: ConstructionEvent, b: ConstructionEvent): boolean {
    if (a.milestone !== b.milestone) return false;
    const relation = placeRelation(a.geo, b.geo);
    if (relation === 'conflict') return false;
    const sharedPlace = a.place.length > 0 && a.place.some(w => b.place.includes(w));
    // Two specific places that are neither the same nor a verified county/town pair are two sites.
    if (a.place.length && b.place.length && !sharedPlace && relation !== 'contains') return false;
    if (conflicts(a.sqft, b.sqft) || conflicts(a.acres, b.acres)) return false;
    const phaseA = a.phase ?? 1, phaseB = b.phase ?? 1;
    if (phaseA !== phaseB) return false;
    const sharedDev = a.developer.filter(w => b.developer.includes(w)).length;
    const sharedDetail = a.detail.some(w => b.detail.includes(w));
    if (sharedDev === 0) {
        // A report that names no developer: the size must agree tightly, plus a shared detail.
        if (a.developer.length > 0 && b.developer.length > 0) return false;
        const tight = (x: number | null, y: number | null) => x !== null && y !== null && Math.abs(x - y) <= Math.max(x, y) * 0.03;
        return sharedDetail && (tight(a.sqft, b.sqft) || tight(a.acres, b.acres));
    }
    return sharedPlace || relation === 'contains' || sharedDetail;
}
