import { hasNewsletterTargetRegion } from './newsletter-geography.js';

export const FACT_SOURCE_DOMAINS = ['businesswire.com','rebusinessonline.com','bisnow.com','connectcre.com'];
export type NewsletterFacts = { version:1; sourceUrl:string; checkedAt:string; evidence:string[];
    squareFeet:number|null; priceUsd:number|null; propertyLocationEvidence:string|null };

export function approvedFactUrl(raw:string):boolean {
    try {
        const u=new URL(raw);
        return u.protocol==='https:' && !u.username && !u.password && !u.port
            && FACT_SOURCE_DOMAINS.some(d=>u.hostname===d || u.hostname.endsWith('.'+d));
    } catch {return false;}
}

export function newsletterFactFields(article:any):Record<string,unknown> {
    const f=article?._newsletterFacts as NewsletterFacts|undefined;
    if(!f || f.version!==1 || !approvedFactUrl(f.sourceUrl) || !Array.isArray(f.evidence)
        || f.evidence.length>4 || f.evidence.some(t=>typeof t!=='string'||t.length>1200)
        || !Number.isFinite(Date.parse(f.checkedAt))) return {};
    return {_newsletterFacts:f};
}

/** A property/portfolio location from the verified release, never an office address. */
export function hasVerifiedTargetProperty(article:any):boolean {
    const f=newsletterFactFields(article)._newsletterFacts as NewsletterFacts|undefined;
    return !!f?.propertyLocationEvidence && f.evidence.includes(f.propertyLocationEvidence)
        && hasNewsletterTargetRegion(f.propertyLocationEvidence);
}
