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

export function hasNewsletterTargetRegion(text: string): boolean {
    return NEWSLETTER_TARGET_PATTERN.test(text);
}

export function newsletterTargetCount(text: string): number {
    return [...text.matchAll(new RegExp(NEWSLETTER_TARGET_PATTERN.source, 'gi'))].length;
}
