/**
 * Company-level M&A is not an industrial property transaction.
 *
 * "Canned water maker's $100 million acquisition includes Florida manufacturing facility"
 * (2026-11-18) is one operating company buying another; the plant comes with the business and
 * the $100M prices the company, not the building. It reached Transactions and its AI summary
 * became "acquired a manufacturing facility for $100 million". Headline-only: a deal whose
 * object is a property (warehouse, portfolio, site, SF...) is never treated as corporate.
 */

const PROPERTY_OBJECT_RE = /\b(?:warehouses?|facilit(?:y|ies)|buildings?|propert(?:y|ies)|plants?|sites?|land|acres?|parks?|campus(?:es)?|portfolios?|cent(?:er|re)s?|sq\.?\s*ft|square[- ]f(?:oo|ee)t|sf|ksf|parcels?|assets?|terminals?|depots?|hubs?|ios|outdoor\s+storage|lots?|yards?|complex(?:es)?)\b/i;
const COMPANY_OBJECT_RE = /\b(?:inc|corp|corporation|co(?=\.)|llc|ltd|company|companies|maker|manufacturer|producer|brand|business(?:es)?|firm|operator|provider|distributor|supplier|subsidiary|division|unit|startup|competitor|rival|bottler|processor|retailer|carrier|3pl|reit|group|holdings|partners)\b/i;

// "X's $100 million acquisition includes Florida manufacturing facility"
const INCLUDES_FACILITY_RE = /\b(?:acquisition|purchase|deal|merger|buyout|takeover)\b[^.]{0,80}?\b(?:includ(?:es|ing|ed)|comes?\s+with)\b[^.]{0,60}?\b(?:facilit(?:y|ies)|plants?|warehouses?|buildings?|propert(?:y|ies)|sites?|campus)\b/i;
// "Canned water maker's $100 million acquisition"
const COMPANY_POSSESSIVE_DEAL_RE = /\b(?:maker|manufacturer|producer|company|firm|brand|bottler|processor|retailer|distributor|supplier)['’]s\s+(?:\$[\d.,]+\s*(?:million|billion|[mb])\b\s+)?(?:acquisition|purchase|deal|merger|buyout|takeover)\b/i;
// "in talks to buy stake in HEA at $3 billion valuation", "to buy out Logum partners"
const VALUATION_OR_BUYOUT_RE = /\b(?:at|with)\s+(?:an?\s+)?\$[\d.,]+\s*(?:million|billion|[mb])\b\s+valuation\b|\bbuy(?:s|ing)?\s+out\b|\bbuyout\b/i;
const STAKE_RE = /\b(?:stake|interest)\s+in\s+(.{2,60}?)(?=\s+(?:for|at|from|amid|as|valued)\b|[,;:(]|\s*$)/i;
const DEAL_VERB_OBJECT_RE = /\b(?:to\s+acquire|agree[sd]?\s+to\s+(?:acquire|buy|purchase)|acquires?|acquired|buys|bought|to\s+buy|complete[sd]?\s+(?:its\s+|the\s+)?(?:acquisition|purchase)\s+of|acquisition\s+of|merges?\s+with|to\s+merge\s+with|merger\s+with|takeover\s+of)\s+(.{3,90}?)(?=\s+(?:for|in|from|at|amid|as|to|with)\b|[,;:(—–]|\s-\s|\s*$)/gi;

function stripPublisher(title: string): string {
    return title.replace(/\s+[-–—|]\s+[^-–—|]{2,60}$/, '').trim();
}

/** Why the headline is company-level M&A, or null when it is (or may be) a property deal. */
export function corporateAcquisitionReason(title: string): string | null {
    const t = stripPublisher(title || '');
    if (!t) return null;
    if (INCLUDES_FACILITY_RE.test(t)) return 'facility included in a company acquisition';
    if (COMPANY_POSSESSIVE_DEAL_RE.test(t)) return 'acquisition by an operating company';
    // A REIT take-private that names the portfolio it transfers ("$5B Example Industrial Trust
    // Buyout, Take 50M SF Logistics Portfolio Private") stays a portfolio-scale transaction.
    if (VALUATION_OR_BUYOUT_RE.test(t) && !PROPERTY_OBJECT_RE.test(t)) return 'company valuation or buyout';
    const stake = t.match(STAKE_RE);
    if (stake && !PROPERTY_OBJECT_RE.test(stake[1])) return 'stake in a company';
    for (const match of t.matchAll(DEAL_VERB_OBJECT_RE)) {
        const object = match[1];
        if (PROPERTY_OBJECT_RE.test(object)) continue;
        if (COMPANY_OBJECT_RE.test(object)) return 'company is the acquired object';
    }
    return null;
}

export function isCorporateAcquisition(title: string): boolean {
    return corporateAcquisitionReason(title) !== null;
}

// --- Summary scope / status ---------------------------------------------------------------

const PENDING_STATUS_RE = /\b(?:to\s+(?:acquire|buy|purchase|sell|merge|lease|build|develop)|agree[sd]?\s+to|plans?\s+to|planned|planning|proposed?|proposal|pending|expected\s+to\s+(?:close|be\s+completed)|set\s+to|will\s+(?:acquire|buy|sell|build)|in\s+talks|eyes|eyeing|seeks?|considering|nears?|under\s+contract|letter\s+of\s+intent|could|may|would)\b/i;
const COMPLETED_DEAL_RE = /\b(?:acquired|purchased|bought|sold|closed|completed|finalized)\b/i;
const SUMMARY_FACILITY_PURCHASE_RE = /\b(?:acquired|purchased|bought|buys|acquires|purchases)\s+(?:an?\s+|the\s+|its\s+)?(?:[\w'’-]+\s+){0,4}?(?:facilit(?:y|ies)|plants?|warehouses?|buildings?|propert(?:y|ies)|sites?|campus)\b/i;

/**
 * A summary may shorten the source but must not change what was bought or whether the
 * deal happened. Rejects: a corporate acquisition restated as a property purchase, and a
 * pending/proposed deal restated as completed. `source` is the title plus any description.
 */
export function summaryChangesDealScopeOrStatus(summary: string, title: string, source: string): string | null {
    if (!summary) return null;
    if (isCorporateAcquisition(title) && SUMMARY_FACILITY_PURCHASE_RE.test(summary)) {
        return 'restates a company acquisition as a property purchase';
    }
    const src = stripPublisher(title) + ' ' + (source || '');
    if (PENDING_STATUS_RE.test(stripPublisher(title)) && !COMPLETED_DEAL_RE.test(src)
        && COMPLETED_DEAL_RE.test(summary) && !PENDING_STATUS_RE.test(summary)) {
        return 'restates a pending deal as completed';
    }
    return null;
}
