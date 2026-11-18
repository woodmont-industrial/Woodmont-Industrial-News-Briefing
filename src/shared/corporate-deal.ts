/**
 * Company-level M&A is not an industrial property transaction.
 *
 * "Canned water maker's $100 million acquisition includes Florida manufacturing facility"
 * (2026-11-18) is one operating company agreeing to buy another; the plant comes with the
 * business and the $100M prices the company, not the building. It reached Transactions and its
 * AI summary became "acquired a manufacturing facility for $100 million".
 *
 * Classification is by WHAT IS BEING ACQUIRED. A headline whose acquired object is a property
 * (warehouse, portfolio, site, SF...) is never corporate, whoever the buyer is. A REIT
 * take-private that names the portfolio it moves is its own kind: relevant news, but the buyout
 * price is a company price, so it is not a Transactions sale.
 */

export type CorporateDealKind = 'company-acquisition' | 'stake-or-valuation' | 'reit-take-private';

const PROPERTY_OBJECT_RE = /\b(?:warehouses?|facilit(?:y|ies)|buildings?|propert(?:y|ies)|plants?|sites?|land|acres?|parks?|campus(?:es)?|portfolios?|cent(?:er|re)s?|sq\.?\s*ft|square[- ]f(?:oo|ee)t|sf|ksf|parcels?|assets?|terminals?|depots?|hubs?|ios|outdoor\s+storage|lots?|yards?|complex(?:es)?)\b/i;
const COMPANY_OBJECT_RE = /\b(?:inc|corp|corporation|co(?=\.)|llc|ltd|company|companies|maker|manufacturer|producer|brand|business(?:es)?|firm|operator|provider|distributor|supplier|subsidiary|division|unit|startup|competitor|rival|bottler|processor|retailer|carrier|3pl|reit|group|holdings|partners)\b/i;
const REIT_RE = /\b(?:reit|real\s+estate\s+investment\s+trust|(?:industrial|logistics|realty|property|properties)\s+trust)\b/i;

// "Canned water maker's $100 million acquisition" — an operating company's own deal. Only
// operating-company nouns: "Example Realty's $60M acquisition" is an investor buying property.
const OPERATING_COMPANY_DEAL_RE = /\b(?:maker|manufacturer|producer|brand|bottler|processor|retailer|distributor|supplier)['’]s\s+(?:\$[\d.,]+\s*(?:million|billion|[mb])\b\s+)?(?:acquisition|purchase|deal|merger|buyout|takeover)\b(.{0,70})/i;
// "in talks to buy stake in HEA at $3 billion valuation", "to buy out Logum partners"
const VALUATION_RE = /\b(?:at|with)\s+(?:an?\s+)?\$[\d.,]+\s*(?:million|billion|[mb])\b\s+valuation\b/i;
const BUYOUT_RE = /\bbuy(?:s|ing)?\s+out\b|\bbuyouts?\b|\btake[sn]?\s+(?:[\w$.,-]+\s+){0,4}?private\b|\btake-private\b/i;
const STAKE_RE = /\b(?:stake|interest)\s+in\s+(.{2,60}?)(?=\s+(?:for|at|from|amid|as|valued)\b|[,;:(]|\s*$)/i;
const DEAL_VERB_OBJECT_RE = /\b(?:to\s+acquire|agree[sd]?\s+to\s+(?:acquire|buy|purchase)|acquires?|acquired|buys|bought|to\s+buy|complete[sd]?\s+(?:its\s+|the\s+)?(?:acquisition|purchase)\s+of|acquisition\s+of|merges?\s+with|to\s+merge\s+with|merger\s+with|takeover\s+of)\s+(.{3,90}?)(?=\s+(?:for|in|from|at|amid|as|to|with)\b|[,;:(—–]|\s-\s|\s*$)/gi;

function stripPublisher(title: string): string {
    return title.replace(/\s+[-–—|]\s+[^-–—|]{2,60}$/, '').trim();
}

/** The kind of company-level deal the headline describes, or null for a (possible) property deal. */
export function corporateDealKind(title: string): CorporateDealKind | null {
    const t = stripPublisher(title || '');
    if (!t) return null;
    if (BUYOUT_RE.test(t) && REIT_RE.test(t)) return 'reit-take-private';
    const operating = t.match(OPERATING_COMPANY_DEAL_RE);
    if (operating) {
        // "Fragrance distributor's $18M purchase of an Edison warehouse" is still a property deal.
        const object = operating[1].match(/^\s*of\s+(.*?)(?=\s+(?:for|in|from)\b|[,;]|$)/i);
        if (!object || !PROPERTY_OBJECT_RE.test(object[1])) return 'company-acquisition';
    }
    if (VALUATION_RE.test(t)) return 'stake-or-valuation';
    if (BUYOUT_RE.test(t) && !PROPERTY_OBJECT_RE.test(t)) return 'company-acquisition';
    const stake = t.match(STAKE_RE);
    if (stake && !PROPERTY_OBJECT_RE.test(stake[1])) return 'stake-or-valuation';
    for (const match of t.matchAll(DEAL_VERB_OBJECT_RE)) {
        const object = match[1];
        if (PROPERTY_OBJECT_RE.test(object)) continue;
        if (COMPANY_OBJECT_RE.test(object)) return 'company-acquisition';
    }
    return null;
}

/** Company-level M&A of any kind: never a Transactions property sale. */
export function isCorporateAcquisition(title: string): boolean {
    return corporateDealKind(title) !== null;
}

// --- Summary scope / status ---------------------------------------------------------------

const PROPERTY_NOUN = '(?:facilit(?:y|ies)|plants?|warehouses?|buildings?|propert(?:y|ies)|sites?|campus)';
const COMPLETED_VERB = '(?:acquired|purchased|bought|sold)';
// active: "acquired a manufacturing facility"; passive: "facility was acquired"; priced: "facility for $100M"
const SUMMARY_PROPERTY_DEAL_RES = [
    new RegExp(`\\b(?:acquired|purchased|bought|sold|buys|acquires|purchases|sells)\\s+(?:an?\\s+|the\\s+|its\\s+)?(?:[\\w'’,-]+\\s+){0,4}?${PROPERTY_NOUN}\\b`, 'i'),
    new RegExp(`\\b${PROPERTY_NOUN}\\b[^.;]{0,40}?\\b(?:was|were|has\\s+been|have\\s+been|is|are|got)\\s+(?:being\\s+)?${COMPLETED_VERB}\\b`, 'i'),
    new RegExp(`\\b${PROPERTY_NOUN}\\b[^.;$]{0,30}?\\bfor\\s+(?:about\\s+|nearly\\s+|roughly\\s+)?\\$\\s*\\d`, 'i'),
];

// Deal actions grouped by what completes them: buying and selling are different deals.
const ACTIONS: Array<{ pending: RegExp; done: RegExp }> = [
    { pending: /\b(?:acquire|acquiring|acquisition|buy|buying|purchase|purchasing)\b/i, done: /\b(?:acquired|bought|purchased)\b/i },
    { pending: /\b(?:sell|selling|sale|divest(?:ing|iture)?)\b/i, done: /\b(?:sold|divested)\b/i },
    { pending: /\b(?:merge|merging|merger)\b/i, done: /\bmerged\b/i },
    { pending: /\b(?:lease|leasing)\b/i, done: /\b(?:leased|signed)\b/i },
];
// Summary side: phrases that keep a deal pending. A bare "to" is not one ("sold it to Example").
const PENDING_MARKER_RE = /\b(?:agree[sd]?\s+to|plans?\s+to|planning\s+to|planned|proposed?|pending|expected\s+to|set\s+to|will|would|could|may|in\s+talks|eyes|eyeing|seeks?|seeking|considering|explor(?:es|ing)|nears?|under\s+contract|letter\s+of\s+intent|on\s+the\s+market|listed|marketing|to\s+(?:acquire|buy|purchase|sell|merge|lease))\b/i;
// Headline side also reads the bare infinitive: "Example Pharma to Acquire ...".
const HEADLINE_PENDING_RE = new RegExp(`${PENDING_MARKER_RE.source}|\\bto\\b`, 'i');
const CLOSING_EVIDENCE_RE = /\b(?:closed|completed|finalized|wrapped\s+up)\b/i;

/** The deal action the headline says is still pending ("plans to sell", "agrees to acquire"), if any. */
function pendingAction(title: string): { pending: RegExp; done: RegExp } | null {
    const t = stripPublisher(title);
    for (const clause of t.split(/[,;:]|\s+(?:and|but|after|while)\s+/i)) {
        const marker = clause.match(HEADLINE_PENDING_RE);
        if (!marker) continue;
        const after = clause.slice((marker.index || 0) + marker[0].length);
        const action = ACTIONS.find(a => a.pending.test(after.split(/\s+/).slice(0, 4).join(' ')));
        if (action) return action;
    }
    return null;
}

/**
 * A summary may shorten the source but must not change what was bought or whether THAT deal
 * happened. Rejects: a company acquisition restated as a property deal (active, passive or
 * priced), and the headline's pending deal restated as done. A past-tense verb about some other
 * deal in the source ("a warehouse it bought in 2019") is not closing evidence.
 */
export function summaryChangesDealScopeOrStatus(summary: string, title: string, source: string): string | null {
    if (!summary) return null;
    if (isCorporateAcquisition(title) && SUMMARY_PROPERTY_DEAL_RES.some(re => re.test(summary))) {
        return 'restates a company acquisition as a property deal';
    }
    const action = pendingAction(title);
    if (action) {
        const src = (source || '').replace(stripPublisher(title), ' ');
        const closedInSource = CLOSING_EVIDENCE_RE.test(src);
        const summaryClauses = summary.split(/[.;]/);
        const claimsDone = summaryClauses.some(c => action.done.test(c) && !PENDING_MARKER_RE.test(c));
        if (claimsDone && !closedInSource) return 'restates a pending deal as completed';
    }
    return null;
}
