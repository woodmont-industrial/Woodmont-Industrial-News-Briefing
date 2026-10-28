import type { NormalizedItem } from '../types/index.js';

/** A construction milestone is news about a project, not an offer of space. */
export function isConstructionAnnouncement(article: Pick<NormalizedItem, 'title'>): boolean {
    const title = article.title || '';
    if (!/\b(?:industrial|warehouses?|logistics|distribution|fulfillment|manufacturing|cold[- ]storage)\b/i.test(title)) return false;
    if (/\b(?:office|retail|shopping cent(?:er|re)|apartments?|multifamily|hotels?|self[- ]storage)\b/i.test(title)) return false;
    // A completed transaction concerning a newly completed building stays a deal.
    if (/\b(?:acquir(?:es?|ed)|acquisition|purchase|bought|buys?|purchased|sells?|sold|leased|refinanc(?:es?|ed|ing)|securitization|CMBS|SASB)\b/i.test(title)) return false;
    if (/\b(?:available|for (?:lease|sale)|now leasing|listing|listed|offering|offered)\b/i.test(title)) return false;
    if (/\b(?:parcels?|packages?|shipments?|trucks?|same[- ]day)\b/i.test(title)) return false;
    const milestone = /\b(?:(?:breaks?|broke|breaking)\s+ground|groundbreaking|(?:begins?|starts?|commences?)\s+(?:construction|development|work\s+(?:on|at))|(?:construction|development)\s+(?:begins?|starts?|underway)|under construction)\b/i.test(title)
        || /\b(?:building|launches?|announces?|starts?|begins?)\b.{0,35}\bexpansion\b/i.test(title)
        || /\binvest(?:s|ed|ing)?\b.{0,65}\b(?:warehouse|facility|campus|plant)\s+expansion\b/i.test(title);
    const completion = /\b(?:delivers?|delivered|completes?|completed)\b/i.test(title)
        && /\b(?:project|facility|building|warehouses?|park|center|centre)\b/i.test(title);
    return milestone || completion;
}

export function newsletterCategory(article: NormalizedItem): NormalizedItem['category'] {
    return ['transactions', 'availabilities'].includes(article.category || '') && isConstructionAnnouncement(article)
        ? 'relevant' : article.category;
}
