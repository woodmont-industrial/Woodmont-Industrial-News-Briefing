import { TARGET_REGIONS, CRE_COMPANY_NAMES } from './region-data.js';

// This is the department newsletter's existing NJ/PA/FL coverage. It does not
// promote a municipality into a Capital Markets target tier.
const EXISTING_EMAIL_ALIASES = [
    'NJ', 'N.J.', 'PA', 'FL', 'Fla.', 'Lakeland', 'Fort Myers', 'Ft. Myers',
    'Ft Myers', 'Naples', 'Sarasota', 'Pensacola', 'Saint Petersburg',
    'St Petersburg', 'St. Petersburg', 'Lakewood', 'Mount Olive', 'Mt Olive',
    'Mt Laurel', 'Mount Laurel', 'Cranbury', 'Moonachie', 'Carlstadt',
    'Parsippany', 'Robbinsville', 'Morrisville', 'Carlisle', 'Valley Forge',
    'Lehigh County', 'Northampton County', 'Pasco County', 'Collier County',
    'Seminole County', 'Volusia', 'Alachua',
];
const names = [...new Set([...TARGET_REGIONS.filter(r => !CRE_COMPANY_NAMES.includes(r)),
    ...EXISTING_EMAIL_ALIASES].map(r => r.trim().replace(/^,\s*/, '')).filter(Boolean))];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
// Non-alphanumeric boundaries handle dotted abbreviations and prevent a city
// from matching inside a company name or a longer municipality.
export const NEWSLETTER_TARGET_PATTERN = new RegExp('(?<![a-z0-9])(?:'
    + names.sort((a,b) => b.length-a.length).map(escape).join('|') + ')(?![a-z0-9])', 'i');

const NON_TARGET_QUALIFIERS = [
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
    'Connecticut', 'Delaware', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana',
    'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
    'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska',
    'Nevada', 'New Hampshire', 'New Mexico', 'New York', 'North Carolina',
    'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Rhode Island', 'South Carolina',
    'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
    'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Italy', 'France',
    'Germany', 'Spain', 'Canada', 'United Kingdom',
];
const NON_TARGET_CODES = new Set(('AL AK AZ AR CA CO CT DE GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO '
    + 'MT NE NV NH NM NY NC ND OH OK OR RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' '));
const QUALIFIER_PATTERN = new RegExp('^\\s*(?:,\\s*|\\(\\s*|in\\s+)?('
    + NON_TARGET_QUALIFIERS.sort((a,b) => b.length-a.length).map(escape).join('|') + ')(?![a-z])', 'i');

function hasNonTargetQualifier(text: string, match: RegExpMatchArray): boolean {
    const tail = text.slice((match.index || 0) + match[0].length);
    if (QUALIFIER_PATTERN.test(tail)) return true;
    const code = /^\s*(?:,\s*|\(\s*|\s+)([a-z]{2})(?![a-z])/i.exec(tail);
    return !!code && NON_TARGET_CODES.has(code[1].toUpperCase())
        && (code[1] === code[1].toUpperCase() || /^\s*[,\(]/.test(tail));
}

function stateCodeHasContext(text: string, match: RegExpMatchArray): boolean {
    if (!/^(?:PA|FL|NJ)$/i.test(match[0])) return true;
    if (text.trim().toUpperCase() === match[0].toUpperCase()) return true;
    const before = text.slice(0, match.index);
    const after = text.slice((match.index || 0) + match[0].length);
    // Preserve the existing regional-publication hint used by People rescue.
    // An explicit non-target property location still wins in the article guard.
    return (match[0].toUpperCase() === 'NJ' && /\bReal Estate\s+$/i.test(before))
        || /(?:[,(/]\s*|\b(?:in|across|throughout|from|of|northern|southern|central|north|south|western|eastern)\s+)$/i.test(before)
        || /\b(?:in|near|at|from)\s+[A-Z][A-Za-z'.-]*(?:\s+[A-Z][A-Za-z'.-]*){0,3}\s+$/i.test(before)
        || /^(?:\s*[-–]\s*based|\s+(?:industrial|warehouse|logistics|real estate|property|manufacturing|distribution|development|office|brokerage|firm|team)\b)/i.test(after);
}

export function newsletterTargetMatches(text: string): RegExpMatchArray[] {
    return [...text.matchAll(new RegExp(NEWSLETTER_TARGET_PATTERN.source, 'gi'))]
        .filter(match => !hasNonTargetQualifier(text, match) && stateCodeHasContext(text, match));
}

export function hasExplicitNonTargetCity(text: string): boolean {
    return [...text.matchAll(new RegExp(NEWSLETTER_TARGET_PATTERN.source, 'gi'))]
        .some(match => hasNonTargetQualifier(text, match));
}

export function hasNewsletterTargetRegion(text: string): boolean {
    return newsletterTargetMatches(text).length > 0;
}

export function newsletterTargetCount(text: string): number {
    return newsletterTargetMatches(text).length;
}
