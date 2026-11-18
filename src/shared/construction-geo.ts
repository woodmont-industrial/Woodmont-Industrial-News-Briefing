/**
 * Just enough geography to tell whether two construction headlines can name the same site.
 *
 * Keys are normalized title keys (lower case, punctuation removed: "Miami-Dade" -> "miami dade").
 * Every entry here is a verified fact; a place that is NOT listed is unknown, and an unknown
 * place can never prove a match. Town names shared by two NJ counties (Monroe, Franklin,
 * Hamilton, Washington, Springfield, Fairfield, Harrison, Union, Salem...) or with a PA/other
 * target town (Bethlehem, Lebanon, Dover, Clinton) are left out on purpose.
 */

export type StateCode = string;

export interface Geo {
    state: StateCode | null;
    county: string | null;       // "<state>:<county>", e.g. "nj:monmouth"
    counties: string[] | null;   // a named region's counties ("south jersey")
}

const COUNTY_TOWNS: Record<string, string> = {
    'nj:bergen': 'carlstadt|east rutherford|moonachie|teterboro|lyndhurst|hackensack|mahwah|little ferry|south hackensack|rutherford|paramus|fair lawn|elmwood park|saddle brook|englewood|ridgefield|north arlington|wood ridge|hasbrouck heights|fort lee|garfield|lodi|teaneck',
    'nj:hudson': 'secaucus|kearny|jersey city|bayonne|hoboken|north bergen|union city|west new york|weehawken',
    'nj:essex': 'newark|belleville|nutley|bloomfield|montclair|west caldwell|livingston|east orange|irvington|roseland|millburn|maplewood|verona|cedar grove',
    'nj:passaic': 'paterson|clifton|wayne|totowa|little falls|woodland park|haledon|hawthorne|west milford|pompton lakes|wanaque|ringwood|prospect park',
    'nj:union': 'elizabeth|linden|rahway|cranford|kenilworth|hillside|roselle|plainfield|summit|westfield|berkeley heights|clark|garwood|mountainside|new providence|scotch plains|fanwood|winfield',
    'nj:middlesex': 'edison|woodbridge|carteret|perth amboy|sayreville|south brunswick|north brunswick|east brunswick|new brunswick|piscataway|south plainfield|cranbury|old bridge|plainsboro|dayton|metuchen|highland park|south river|spotswood|jamesburg|dunellen|avenel|iselin|sewaren|keasbey|port reading',
    'nj:monmouth': 'manalapan|freehold|howell|wall|neptune|marlboro|holmdel|middletown|red bank|long branch|asbury park|tinton falls|eatontown|englishtown|millstone|upper freehold|colts neck|hazlet|aberdeen|matawan|keyport|farmingdale',
    'nj:ocean': 'lakewood|jackson|toms river|brick|manchester|stafford|barnegat|little egg harbor|lacey|plumsted|point pleasant',
    'nj:somerset': 'bridgewater|hillsborough|somerville|branchburg|bound brook|manville|montgomery|bedminster|bernards|basking ridge',
    'nj:morris': 'parsippany|rockaway|randolph|morristown|mount olive|roxbury|denville|east hanover|whippany|cedar knolls|florham park|wharton|mine hill|montville|pine brook|boonton|lincoln park|butler|kinnelon|pequannock|riverdale|mendham|budd lake|flanders|ledgewood|landing',
    'nj:sussex': 'newton|sparta|hardyston|vernon|hopatcong|andover|hamburg|ogdensburg',
    'nj:warren': 'phillipsburg|hackettstown|lopatcong|pohatcong|belvidere|blairstown|oxford',
    'nj:hunterdon': 'flemington|readington|frenchtown|lambertville|high bridge|whitehouse station|tewksbury',
    'nj:mercer': 'trenton|ewing|robbinsville|east windsor|west windsor|hightstown|princeton|pennington',
    'nj:burlington': 'bordentown|mount laurel|moorestown|cinnaminson|delran|willingboro|westampton|pemberton|lumberton|medford|evesham|marlton|maple shade|palmyra|riverside|delanco|edgewater park|chesterfield|southampton|tabernacle',
    'nj:camden': 'cherry hill|pennsauken|gloucester city|bellmawr|voorhees|winslow|lindenwold|haddonfield|runnemede|pine hill|waterford|gibbsboro|somerdale|audubon|collingswood|barrington|clementon|sicklerville',
    'nj:gloucester': 'logan|swedesboro|woolwich|west deptford|deptford|paulsboro|east greenwich|mantua|glassboro|williamstown|woodbury|pitman|clayton|south harrison|bridgeport|gibbstown|mullica hill|sewell|thorofare|westville',
    'nj:salem': 'pennsville|carneys point|penns grove|oldmans|pedricktown|pilesgrove|woodstown|alloway|mannington',
    'nj:cumberland': 'vineland|millville|bridgeton|upper deerfield',
    'nj:atlantic': 'atlantic city|egg harbor|egg harbor township|hammonton|galloway|pleasantville|mays landing|absecon|buena',
    'nj:cape may': 'ocean city|wildwood|woodbine',
    'pa:lehigh': 'allentown|whitehall|upper macungie|lower macungie|macungie|fogelsville|breinigsville|emmaus|coplay|catasauqua',
    'pa:northampton': 'easton|nazareth|palmer|upper nazareth|lower nazareth|bath|wind gap|bangor',
    'pa:luzerne': 'hazleton|wilkes barre|pittston|kingston|jenkins|drums|hazle',
    'pa:lackawanna': 'scranton|dunmore|olyphant|jessup|archbald|carbondale',
    'pa:philadelphia': 'philadelphia',
    'pa:bucks': 'bristol|bensalem|levittown|quakertown|morrisville|falls township',
    'pa:cumberland': 'carlisle|mechanicsburg|shippensburg|camp hill',
    'pa:dauphin': 'harrisburg|hummelstown',
    'fl:miami dade': 'miami|doral|medley|hialeah|miami gardens|opa locka|homestead',
    'fl:broward': 'fort lauderdale|pompano beach|miramar|pembroke pines|davie|sunrise|deerfield beach|coconut creek|plantation|weston|dania beach',
    'fl:palm beach': 'west palm beach|boca raton|riviera beach|jupiter|delray beach|boynton beach|wellington|lake worth',
    'fl:hillsborough': 'tampa|plant city|brandon',
    'fl:orange': 'orlando|apopka|ocoee|winter garden',
    'fl:polk': 'lakeland|auburndale|winter haven|haines city|bartow|davenport',
    'fl:duval': 'jacksonville',
    'fl:pinellas': 'st petersburg|saint petersburg|clearwater|pinellas park|largo',
    'fl:osceola': 'kissimmee',
    'fl:seminole': 'sanford',
    'fl:lee': 'fort myers|cape coral',
    'fl:marion': 'ocala',
};

const TOWN_COUNTY = new Map<string, string>();
for (const [county, towns] of Object.entries(COUNTY_TOWNS)) {
    for (const town of towns.split('|')) TOWN_COUNTY.set(town, county);
}
// County names alone: one state only when the name is unique across our states.
const COUNTY_BY_NAME = new Map<string, string[]>();
for (const county of Object.keys(COUNTY_TOWNS)) {
    const name = county.split(':')[1];
    COUNTY_BY_NAME.set(name, [...(COUNTY_BY_NAME.get(name) || []), county]);
}
for (const extra of ['pa:monroe', 'pa:carbon', 'pa:schuylkill', 'pa:berks', 'pa:wayne', 'pa:pike', 'pa:montgomery', 'pa:chester', 'pa:delaware', 'pa:york', 'pa:lancaster', 'pa:lebanon', 'fl:pasco', 'fl:manatee', 'fl:sarasota', 'fl:volusia', 'fl:brevard', 'fl:st lucie', 'fl:lake']) {
    const name = extra.split(':')[1];
    COUNTY_BY_NAME.set(name, [...(COUNTY_BY_NAME.get(name) || []), extra]);
}

const SOUTH_JERSEY = ['nj:gloucester', 'nj:camden', 'nj:burlington', 'nj:salem', 'nj:cumberland', 'nj:atlantic', 'nj:cape may'];
const NORTH_JERSEY = ['nj:bergen', 'nj:hudson', 'nj:essex', 'nj:passaic', 'nj:union', 'nj:morris', 'nj:sussex', 'nj:warren'];
const CENTRAL_JERSEY = ['nj:middlesex', 'nj:monmouth', 'nj:somerset', 'nj:mercer', 'nj:hunterdon'];
// Longest phrase first.
const REGIONS: Array<[RegExp, StateCode, string[] | null]> = [
    [/\b(?:south|southern)\s+(?:new\s+)?jersey\b/, 'nj', SOUTH_JERSEY],
    [/\b(?:north|northern)\s+(?:new\s+)?jersey\b/, 'nj', NORTH_JERSEY],
    [/\bcentral\s+(?:new\s+)?jersey\b/, 'nj', CENTRAL_JERSEY],
    [/\blehigh\s+valley\b/, 'pa', ['pa:lehigh', 'pa:northampton']],
    [/\b(?:northeast|northeastern)\s+(?:pennsylvania|pa)\b/, 'pa', ['pa:luzerne', 'pa:lackawanna', 'pa:monroe', 'pa:wayne', 'pa:pike', 'pa:carbon', 'pa:schuylkill']],
    [/\bsouth\s+florida\b/, 'fl', ['fl:miami dade', 'fl:broward', 'fl:palm beach']],
    [/\bcentral\s+florida\b/, 'fl', ['fl:orange', 'fl:osceola', 'fl:seminole', 'fl:polk', 'fl:lake', 'fl:volusia', 'fl:brevard']],
    [/\btampa\s+bay\b/, 'fl', ['fl:hillsborough', 'fl:pinellas', 'fl:pasco', 'fl:manatee']],
];
const STATES: Array<[RegExp, StateCode]> = [
    [/\bnew\s+jersey\b|\bnj\b|\b(?:south|north|central|southern|northern)\s+jersey\b|\bjersey\s+city\b/, 'nj'],
    [/\bpennsylvania\b|\bpa\b/, 'pa'],
    [/\bflorida\b|\bfl\b/, 'fl'],
    [/\bnew\s+york\b|\bny\b/, 'ny'],
    [/\bwest\s+virginia\b/, 'wv'],
    [/\b(?<!west\s)virginia\b/, 'va'],
    [/\bnorth\s+carolina\b/, 'nc'],
    [/\bsouth\s+carolina\b/, 'sc'],
    [/\btexas\b|\btx\b/, 'tx'],
    [/\bgeorgia\b/, 'ga'],
    [/\bohio\b/, 'oh'],
    [/\bcalifornia\b/, 'ca'],
    [/\barizona\b/, 'az'],
    [/\btennessee\b/, 'tn'],
    [/\bindiana\b/, 'in'],
    [/\billinois\b/, 'il'],
    [/\bmaryland\b/, 'md'],
    [/\bconnecticut\b/, 'ct'],
    [/\bmassachusetts\b/, 'ma'],
    [/\bkentucky\b/, 'ky'],
    [/\balabama\b/, 'al'],
    [/\bmichigan\b/, 'mi'],
    [/\bnevada\b/, 'nv'],
    [/\butah\b/, 'ut'],
    [/\bcolorado\b/, 'co'],
];

/** The county of a listed town inside the place phrase ("manalapan roi" with a publisher tag). */
function knownTown(placeName: string): string | null {
    const words = placeName.split(/\s+/).filter(Boolean);
    for (let len = words.length; len >= 1; len--) {
        for (let i = 0; i + len <= words.length; i++) {
            const c = TOWN_COUNTY.get(words.slice(i, i + len).join(' '));
            if (c) return c;
        }
    }
    return null;
}

/** Where a construction headline key says the project is, as far as we can verify. */
export function geoFromKey(key: string, tail: string, placeName: string, isCounty: boolean): Geo {
    const named = [...new Set(STATES.filter(([re]) => re.test(key)).map(([, s]) => s))];
    const stated = named.length === 1 ? named[0] : null;
    let county: string | null = null;
    let counties: string[] | null = null;
    let state: StateCode | null = stated;
    for (const [re, s, list] of REGIONS) {
        if (re.test(tail)) { counties = list; state = state ?? s; break; }
    }
    if (!counties && placeName) {
        if (isCounty) {
            const options = (COUNTY_BY_NAME.get(placeName) || []).filter(c => !stated || c.startsWith(`${stated}:`));
            if (options.length === 1) county = options[0];
        } else {
            const c = knownTown(placeName);
            // A town listed in another state than the one the headline names is a different place.
            if (c && (!stated || c.startsWith(`${stated}:`))) county = c;
        }
    }
    if (county) state = state ?? county.split(':')[0];
    return { state, county, counties };
}

export type PlaceRelation = 'same' | 'contains' | 'conflict' | 'unknown';

/** Verified relation between two headlines' places. Only 'same' and 'contains' prove a match. */
export function placeRelation(a: Geo, b: Geo): PlaceRelation {
    if (a.state && b.state && a.state !== b.state) return 'conflict';
    if (a.county && b.county) return a.county === b.county ? 'contains' : 'conflict';
    const region = a.counties ? a : b.counties ? b : null;
    const other = region === a ? b : a;
    if (region && other.county) return region.counties!.includes(other.county) ? 'contains' : 'conflict';
    return 'unknown';
}
