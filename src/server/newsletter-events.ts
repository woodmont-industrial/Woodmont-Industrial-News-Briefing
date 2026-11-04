import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { NormalizedItem } from '../types/index.js';
import { summaryQuantities } from '../filter/summary-quantities.js';
import { newsletterFactFields, type NewsletterFacts } from '../shared/newsletter-facts.js';
import { newsletterTargetMatches } from '../shared/newsletter-geography.js';
import { dealEventClass, normalizeTitle } from '../shared/url-utils.js';
import { getPublisherName } from '../shared/publisher-name.js';

export type EventSource = { id: string; url: string; publisher: string };
type Actor = { root: string; full: string; words: number };
export type NewsEvent = {
    version: 1; kind: string; published: string; asset: string;
    locations: string[]; markets: string[]; addresses: string[]; actors: Actor[]; party: string | null;
    dollars: number | null; sf: number | null; acres: number | null;
    topic: string; stance: string; numbers: string[];
    // Development stories: the headline's subject firm (hashed) and project type.
    subject?: string | null; project?: string;
};
export type EventArticle = NormalizedItem & { _newsletterFacts?: NewsletterFacts; _eventSources?: EventSource[]; _eventOriginal?: string };
export type SentEvent = { id: string; sentAt: string; event: NewsEvent };
export type EventDecision = { leftId: string; rightId: string; reason: string; scope: 'edition' | 'history' };
export type EventAudit = { suppressed: EventDecision[]; possible: EventDecision[] };
const hash = (s: string) => createHash('sha256').update(s.toLowerCase()).digest('hex');
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const unique = <T>(a: T[]) => [...new Set(a)];
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.05;
const known = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const BROAD = new Set(('nj|n j|new jersey|pa|pennsylvania|fl|fla|florida|north jersey|south jersey|central jersey|south florida|central florida|lehigh valley|greater philadelphia|delaware valley|meadowlands|turnpike|garden state parkway').split('|'));
const STOP = new Set(('a an and as at by for from in into of on or the to with without both how why what when where who which can could will would may its their his her after before new old real estate industrial warehouse logistics demand market report outlook analysis update growth economic economy business investors investor firms firm company companies says said sees see questions question doubts doubt faces fuel long peak payoff benefits beyond big tech economists economist president chief executive officer vice director services group capital partners newsroom source daily news stocks shares financing years experience expands expansion announces announced').split(' '));

function actors(text: string): Actor[] {
    const result: Actor[] = [];
    for (const match of text.matchAll(/\b[A-Z][A-Za-z'’-]{2,}(?:\s+[A-Z][A-Za-z'’-]{2,}){0,4}\b/g)) {
        for (const phrase of match[0].split(/\s+(?:And|With|From|For|The)\s+/)) {
            if (newsletterTargetMatches(phrase).length) continue;
            const words = phrase.split(/\s+/).map(norm).filter(w => w && !STOP.has(w)
                && !/^(?:globest|reuters|bisnow|costar|commercial|observer|daily|news|north|south|east|west|northern|southern|eastern|western|national|nationwide)$/.test(w));
            if (!words.length) continue;
            const full = words.join(' ');
            if (!result.some(a => a.full === hash(full))) result.push({ root: hash(words[0]), full: hash(full), words: words.length });
        }
    }
    return result.slice(0, 20);
}

function commonActors(a: Actor[], b: Actor[]): number {
    return unique(a.filter(x => b.some(y => x.root === y.root
        && (x.full === y.full || x.words === 1 || y.words === 1))).map(x => x.root)).length;
}

export function eventText(a: EventArticle): string {
    const f = newsletterFactFields(a)._newsletterFacts as NewsletterFacts | undefined;
    return `${a.title || ''} ${a._eventOriginal ?? a.description ?? ''} ${f?.lead || ''}`;
}

export function identifyNewsEvent(a: EventArticle): NewsEvent | null {
    const text = eventText(a);
    const published = a.pubDate || (a as EventArticle & { date_published?: string }).date_published || '';
    if (!Number.isFinite(Date.parse(published))) return null;
    const f = newsletterFactFields(a)._newsletterFacts as NewsletterFacts | undefined;
    const quantities = summaryQuantities(text);
    const values = (unit: string) => unique(quantities.filter(q => q.unit === unit).map(q => q.value));
    const prices = values('usd'), sizes = values('sf');
    const acreage = unique([...text.matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*[-–]?\s*acres?\b/gi)]
        .map(m => Number(m[1].replace(/,/g, ''))));
    const locations = unique(newsletterTargetMatches(f?.propertyLocationEvidence || text)
        .map(m => norm(m[0])).filter(x => !BROAD.has(x))).sort();
    const markets = unique(newsletterTargetMatches(text).map(m => norm(m[0]))
        .map(place => /^(?:new jersey|nj|n j)$/.test(place) ? 'NJ'
            : /^(?:pennsylvania|pa)$/.test(place) ? 'PA'
            : /^(?:florida|fl|fla)$/.test(place) ? 'FL' : '').filter(Boolean));
    const suffixes: Record<string,string> = {rd:'road',st:'street',ave:'avenue',blvd:'boulevard',hwy:'highway',dr:'drive',ct:'court',ln:'lane'};
    const addressMatches = [...text.matchAll(/\b\d{1,6}\s+(?:[A-Za-z][A-Za-z'.-]*\s+){1,4}(?:Rd|Road|St|Street|Ave|Avenue|Blvd|Boulevard|Hwy|Highway|Way|Dr|Drive|Ct|Court|Lane|Ln)\b/gi)];
    const addresses = unique(addressMatches.map(m => hash(norm(m[0])
        .replace(/\b(?:rd|st|ave|blvd|hwy|dr|ct|ln)\b/g,word=>suffixes[word])))).sort();
    const kind = dealEventClass(a.title || '', a.description || '');
    const macro = !kind && /\bAI\b|artificial intelligence/i.test(text)
        && /\b(?:industrial|warehouse|logistics)\b/i.test(text) && /\bdemand\b/i.test(text);
    const stance = /\b(?:doubts?|questions?|peak|crest|payoff|durability)\b/i.test(text) ? 'questions-growth'
        : /\b(?:accelerat|strengthen|surge|boom)\w*\b/i.test(text) ? 'positive-growth' : 'neutral';
    if (!macro && !kind) return null;
    const company = "([A-Z][A-Za-z0-9'’&.-]*(?:[ \\t]+[A-Z][A-Za-z0-9'’&.-]*){0,4})";
    const titleParty = new RegExp('^' + company + '\\s+(?:[Aa]cquires?|[Bb]uys|[Bb]ought|[Pp]urchases?|(?:[Ss]naps|[Ss]coops|[Pp]icks)\\s+[Uu]p|[Nn]abs)\\b').exec(a.title || '')?.[1];
    const bodyParty = new RegExp('\\b(?:[Bb]uyer|[Pp]urchaser),?\\s+' + company).exec(text.replace(/(?<=[.!?])\s+(?=[A-Z])/g, '\n'))?.[1];
    const party = bodyParty || titleParty;
    const lead = (a.title || '').split(/\s*\|\s*/).pop()!;
    const first = norm(/^[A-Z][A-Za-z0-9'’&.-]{2,}/.exec(lead)?.[0] || '').split(' ')[0] || '';
    const subject = first && !STOP.has(first) && !newsletterTargetMatches(first).length
        && !/^(?:\d.*|developer|developers|township|county|city|state|governor|officials?|residents?|voters?|report|study|survey|data|plans?|proposed|major|largest|another)$/.test(first) ? first : '';
    const project = /\bdata\s+cent(?:er|re)s?\b/i.test(text) ? 'data-center'
        : /\b(?:distribution|fulfillment)\s+(?:center|centre|hub|facility|operations)\b|\bdistribution\s+hub\b/i.test(text) ? 'distribution'
        : /\b(?:manufacturing|production)\s+(?:plant|facility|operations|campus)\b/i.test(text) ? 'manufacturing' : '';
    const periods = [...text.matchAll(/\b(?:Q[1-4]\s*20\d{2}|(?:first|second|third|fourth)\s+quarter(?:\s+20\d{2})?|20\d{2})\b/gi)]
        .map(m => 'period:' + norm(m[0]));
    return { version:1, kind:macro ? 'macro' : kind!, published,
        asset:/\bIOS\b|industrial outdoor storage/i.test(text) ? 'ios'
            : /\bwarehouse|distribution|logistics\b/i.test(text) ? 'industrial' : '',
        locations, markets:unique(markets), addresses, actors:actors(text), party:party ? hash(norm(party)) : null,
        dollars:known(f?.priceUsd) ? f!.priceUsd : prices.length === 1 ? prices[0] : null,
        sf:known(f?.squareFeet) ? f!.squareFeet : sizes.length === 1 ? sizes[0] : null,
        acres:acreage.length === 1 ? acreage[0] : null,
        topic:macro ? 'ai-industrial-demand' : '', stance:macro ? stance : '',
        numbers:unique([...quantities.map(q => `${q.unit}:${q.value}`),...periods]).sort(),
        subject:subject ? hash(subject) : null, project,
    };
}

export function validNewsEvent(value: unknown): value is NewsEvent {
    if (!value || typeof value !== 'object') return false;
    const v = value as NewsEvent;
    const hashes = (a: unknown) => Array.isArray(a) && a.length <= 30 && a.every(s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s));
    return v.version === 1 && ['macro','acquire','finance','lease','people','develop-start','develop-deliver'].includes(v.kind)
        && Number.isFinite(Date.parse(v.published)) && typeof v.asset === 'string'
        && Array.isArray(v.locations) && v.locations.length <= 30 && v.locations.every(x => typeof x === 'string' && x.length < 80)
        && Array.isArray(v.markets) && v.markets.length <= 3 && v.markets.every(x => ['NJ','PA','FL'].includes(x))
        && hashes(v.addresses) && Array.isArray(v.actors) && v.actors.length <= 20
        && (v.party === null || hashes([v.party]))
        && v.actors.every(x => x && typeof x === 'object' && hashes([x.root,x.full]) && Number.isInteger(x.words) && x.words >= 1 && x.words <= 5)
        && [v.dollars,v.sf,v.acres].every(n => n === null || known(n))
        && typeof v.topic === 'string' && typeof v.stance === 'string'
        && (v.subject == null || hashes([v.subject]))
        && (v.project === undefined || ['','data-center','distribution','manufacturing'].includes(v.project))
        && Array.isArray(v.numbers) && v.numbers.length <= 60 && v.numbers.every(n => typeof n === 'string' && n.length < 80);
}

/**
 * One development story retold under a new headline: "<Firm> plans <town>
 * distribution operations" then "<Firm> opens distribution center in PA", or a
 * township's district vote reported with rounded acreage. Rewrites classify
 * inconsistently (a vote that mentions a land sale reads as "acquire"), so the
 * kinds need only include one development event.
 */
function sameDevelopmentStory(a: NewsEvent, b: NewsEvent): boolean {
    const blocked = ['macro','finance','lease'];
    if (blocked.includes(a.kind) || blocked.includes(b.kind)
        || !(a.kind.startsWith('develop') || b.kind.startsWith('develop'))) return false;
    if (!a.project || a.project !== b.project || !a.markets.some(m => b.markets.includes(m))) return false;
    if (Math.abs(Date.parse(a.published) - Date.parse(b.published)) > 10 * 86400000) return false;
    if (a.locations.length && b.locations.length && !a.locations.some(x => b.locations.includes(x))) return false;
    const acres = known(a.acres) && known(b.acres) && Math.min(a.acres!, b.acres!) >= 100
        && Math.abs(a.acres! - b.acres!) <= Math.max(a.acres!, b.acres!) * 0.02;
    if (known(a.acres) && known(b.acres) && !acres) return false;
    return acres || (!!a.subject && a.subject === b.subject);
}

/**
 * Against an already-sent deal, a retelling often drops the figures ("<Buyer>
 * snaps up <town> warehouse"). The same buyer and the same specific town, with
 * nothing conflicting, is the story we sent. Within one edition the stricter
 * metric rules still decide which copies merge.
 */
function sameSentDeal(a: NewsEvent, b: NewsEvent): boolean {
    return ['acquire','lease','finance'].includes(a.kind) && a.kind === b.kind && a.asset === b.asset
        && !!a.party && a.party === b.party && a.locations.length > 0 && sameSet(a.locations,b.locations)
        && Math.abs(Date.parse(a.published) - Date.parse(b.published)) <= 7 * 86400000
        && (['dollars','sf','acres'] as const).every(k => !known(a[k]) || !known(b[k]) || near(a[k]!,b[k]!))
        && (!a.addresses.length || !b.addresses.length || sameSet(a.addresses,b.addresses));
}

export function compareNewsEvents(a: NewsEvent | null, b: NewsEvent | null, scope: 'edition' | 'history' = 'edition'): 'same' | 'possible' | 'distinct' {
    if (a && b && sameDevelopmentStory(a, b)) return 'same';
    const strict = compareStrict(a, b);
    return strict !== 'same' && scope === 'history' && a && b && sameSentDeal(a, b) ? 'same' : strict;
}

function compareStrict(a: NewsEvent | null, b: NewsEvent | null): 'same' | 'possible' | 'distinct' {
    if (!a || !b || a.kind !== b.kind || Math.abs(Date.parse(a.published) - Date.parse(b.published)) > 3 * 86400000) return 'distinct';
    if (a.kind === 'macro') {
        if (a.topic !== b.topic || a.stance !== b.stance) return 'distinct';
        const common = commonActors(a.actors,b.actors);
        if (common < 1) return 'distinct';
        // New quantified results, periods or opposing conclusions are not a rerun.
        return common >= 2 && sameSet(a.numbers,b.numbers) ? 'same' : 'possible';
    }
    if (!['acquire','lease','finance'].includes(a.kind) || a.asset !== b.asset) return 'distinct';
    if (a.party && b.party && a.party !== b.party) return 'distinct';
    for (const field of ['dollars','sf','acres'] as const) {
        if (known(a[field]) && known(b[field]) && !near(a[field]!,b[field]!)) return 'distinct';
    }
    if (a.addresses.length && b.addresses.length && !sameSet(a.addresses,b.addresses)) return 'distinct';
    const matchedMetrics = (['dollars','sf','acres'] as const)
        .filter(k => known(a[k]) && known(b[k]) && near(a[k]!,b[k]!)).length;
    if (a.addresses.length && sameSet(a.addresses,b.addresses) && matchedMetrics >= 1
        && a.party && b.party && a.party === b.party) return 'same';
    if (a.locations.length && sameSet(a.locations,b.locations) && matchedMetrics >= 2
        && a.party && b.party && a.party === b.party) return 'same';
    return matchedMetrics >= 1 || a.locations.some(x => b.locations.includes(x))
        || a.markets.some(x => b.markets.includes(x)) ? 'possible' : 'distinct';
}

export function isPropertyDeal(a: EventArticle): boolean {
    return ['acquire','lease','finance'].includes(identifyNewsEvent(a)?.kind || '');
}

export function eventSources(a: EventArticle): EventSource[] {
    const f = newsletterFactFields(a)._newsletterFacts as NewsletterFacts | undefined;
    const url = f?.sourceUrl || a.link;
    const sources = [{id:a.id,url,publisher:getPublisherName(a) || a.source || 'Source'},...(Array.isArray(a._eventSources) ? a._eventSources : [])];
    return sources.filter((s,i) => {
        if (!s || typeof s.id !== 'string' || typeof s.url !== 'string' || typeof s.publisher !== 'string') return false;
        try { const u = new URL(s.url); return /^https?:$/.test(u.protocol) && !u.username && !u.password
            && sources.findIndex(other => other.url === s.url) === i; } catch { return false; }
    }).slice(0, 6);
}

export function summarySourceQuality(a: EventArticle): number {
    const original = (a._eventOriginal ?? a.description ?? '').split('\nVerified publisher facts:')[0].trim();
    const title = normalizeTitle(a.title || '');
    const body = normalizeTitle(original);
    const real = body.length >= 45 && !body.startsWith(title.slice(0, Math.min(45,title.length))) && !/\bboth and\b/i.test(original);
    return Number(real) * 100 + Math.min(60, original.length / 10)
        + Number(!a.link?.includes('news.google.com')) * 40;
}

/** Compare only eligible candidates; an editorial rejection is never overridden by a richer copy. */
export function dedupeEventEdition(
    sections: Record<string, EventArticle[]>, audit: EventAudit,
): { sections: Record<string, EventArticle[]>; removed: EventArticle[] } {
    const kept: EventArticle[] = [], removed: EventArticle[] = [];
    const output = Object.fromEntries(Object.keys(sections).map(k => [k,[] as EventArticle[]]));
    const rows = Object.entries(sections).flatMap(([section,items]) => items.map(a => ({a,section})))
        .sort((x,y) => summarySourceQuality(y.a) - summarySourceQuality(x.a));
    for (const {a,section} of rows) {
        const current = identifyNewsEvent(a);
        const same = kept.find(b => compareNewsEvents(current,identifyNewsEvent(b)) === 'same');
        if (same) {
            same._eventSources = [...eventSources(same),...eventSources(a)].filter((s,i,all) => all.findIndex(x => x.url === s.url) === i).slice(0,6);
            audit.suppressed.push({leftId:a.id,rightId:same.id,reason:'confirmed-event',scope:'edition'});
            removed.push(a); continue;
        }
        for (const b of kept) if (audit.possible.length < 50 && compareNewsEvents(current,identifyNewsEvent(b)) === 'possible')
            audit.possible.push({leftId:a.id,rightId:b.id,reason:'insufficient-or-new-facts',scope:'edition'});
        kept.push(a); output[section].push(a);
    }
    // Survivor choice must not silently change the existing section order.
    for (const section of Object.keys(output)) output[section].sort((a,b) => sections[section].indexOf(a) - sections[section].indexOf(b));
    return {sections:output,removed};
}

/** Legacy receipts are resolved against retained feed records, without rewriting history. */
export function loadSentNewsEvents(docsDir: string, articles: EventArticle[], now = new Date()): SentEvent[] {
    const byId = new Map(articles.map(a => [a.id,a]));
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(docsDir,'sent-articles.json'),'utf8'));
        return (Array.isArray(raw.sent) ? raw.sent : []).flatMap((entry: {id:string;sentAt:string;event?:unknown}) => {
            if (!entry) return [];
            const age = now.getTime() - Date.parse(entry.sentAt);
            // As long as deep backfill reaches (30 days), or a rewrite of a story
            // sent 15+ days ago returns through it unchecked.
            if (!entry || !entry.id || !Number.isFinite(age) || age < 0 || age > 30 * 86400000) return [];
            const event = validNewsEvent(entry.event) ? entry.event : byId.has(entry.id) ? identifyNewsEvent(byId.get(entry.id)!) : null;
            return event && Date.parse(event.published) <= now.getTime() ? [{id:entry.id,sentAt:entry.sentAt,event}] : [];
        });
    } catch { return []; }
}

export function filterSentNewsEvents(articles: EventArticle[], history: SentEvent[], audit: EventAudit): EventArticle[] {
    return articles.filter(a => {
        const event = identifyNewsEvent(a);
        const prior = history.find(h => compareNewsEvents(event,h.event,'history') === 'same');
        if (prior) {
            audit.suppressed.push({leftId:a.id,rightId:prior.id,reason:'previously-sent-event',scope:'history'});
            return false;
        }
        if (audit.possible.length < 50) {
            const possible = history.find(h => compareNewsEvents(event,h.event) === 'possible');
            if (possible) audit.possible.push({leftId:a.id,rightId:possible.id,reason:'insufficient-or-new-facts',scope:'history'});
        }
        return true;
    });
}
