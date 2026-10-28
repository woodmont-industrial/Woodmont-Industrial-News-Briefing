import * as fs from 'node:fs';
import * as path from 'node:path';
import { promises as dns } from 'node:dns';
import * as net from 'node:net';
import { createHash } from 'node:crypto';
import type { NormalizedItem } from '../types/index.js';
import { summaryQuantities } from '../filter/summary-quantities.js';
import { approvedFactUrl, newsletterFactFields, type NewsletterFacts } from '../shared/newsletter-facts.js';
import { hasNewsletterTargetRegion } from '../shared/newsletter-geography.js';
import { newsletterCategory } from '../shared/development-signal.js';
import references from '../feeds/article-source-references.json' with {type:'json'};

type Page={url:string;html:string};
type CacheEntry={checkedAt:string;facts:NewsletterFacts|null};
const plain=(html:string)=>html.replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"').replace(/&#(?:39|x27);/gi,"'").replace(/\s+/g,' ').trim();
const topicWords=(s:string)=>new Set(s.toLowerCase().replace(/\b(?:business wire|connect cre|the business journals)\b/g,'')
    .split(/[^a-z0-9]+/).filter(t=>t.length>=3&&!/^(the|and|for|with|from|has|new|real|estate)$/.test(t)));

export function extractNewsletterFacts(html:string, article:NormalizedItem, sourceUrl:string, now:Date):NewsletterFacts|null {
    if(!approvedFactUrl(sourceUrl)) return null;
    const title=plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'');
    const wanted=topicWords(article.title||''),actual=topicWords(title);
    const common=[...wanted].filter(w=>actual.has(w)).length;
    if(common<3 || common/Math.max(1,Math.min(wanted.size,actual.size))<0.5) return null;
    let body=/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1]
        || /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1];
    if(!body) return null;
    body=body.replace(/<(script|style|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi,' ');
    const paragraphs=body.replace(/<\/?(?:p|div|section|h[1-6]|li|br)\b[^>]*>/gi,'\n')
        .split(/\n+/).map(plain).filter(p=>p.length>35);
    const stop=paragraphs.findIndex(p=>/^About\s|^Contacts?\b|^\*.*assets under management/i.test(p));
    const story=stop>=0?paragraphs.slice(0,stop):paragraphs;
    let primary='';
    for(const p of story){
        if(!/\b(?:warehouse|industrial|distribution|logistics|portfolio)\b/i.test(p)) continue;
        const action=/\b(?:has acquired|acquired|purchased|sold|leased|closing of|closed|begins? construction|breaks? ground)\b/i.exec(p);
        if(!action) continue;
        const text=p.slice(action.index).split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
        if(summaryQuantities(text).length){primary=text;break;}
    }
    if(!primary || primary.length>1200) return null;
    const quantities=summaryQuantities(primary);
    const sizes=[...new Set(quantities.filter(q=>q.unit==='sf').map(q=>q.value))];
    const prices=[...new Set(quantities.filter(q=>q.unit==='usd').map(q=>q.value))];
    // Multiple areas in the deal sentence may be leased space and its container.
    // Do not let richer page text pick the largest or first figure accidentally.
    if(sizes.length>1 || prices.length>1) return null;
    const market=story.map(p=>p.split(/(?<=[.!?])\s+(?=[A-Z])/)[0])
        .find(p=>/\b(?:portfolio\s+(?:spans|includes)|properties\s+(?:are\s+)?(?:located\s+)?in)\b/i.test(p)
        &&hasNewsletterTargetRegion(p));
    const assetLocation=/\b(?:portfolio|property|properties|warehouse|facility|building)\b.{0,100}\b(?:in|at|located in)\b/i.test(primary)
        && hasNewsletterTargetRegion(primary)?primary:null;
    const evidence=[primary,...(market && market!==primary?[market]:[])];
    if(evidence.join(' ').split(/\s+/).length>160) return null;
    return {version:1,sourceUrl,checkedAt:now.toISOString(),evidence,
        squareFeet:sizes[0]??null,priceUsd:prices[0]??null,propertyLocationEvidence:market||assetLocation};
}

function publicAddress(raw:string):boolean {
    if(net.isIP(raw)===4){const [a,b]=raw.split('.').map(Number);return a!==0&&a!==10&&a!==127&&a!==169
        &&!(a===172&&b>=16&&b<=31)&&!(a===192&&b===168)&&a<224;}
    return net.isIP(raw)===6&&!/^(?:::|fc|fd|fe[89ab])/i.test(raw);
}

export async function loadApprovedFactPage(raw:string, signal:AbortSignal,
    resolve:(host:string)=>Promise<Array<{address:string}>>=host=>dns.lookup(host,{all:true})):Promise<Page> {
    let url=raw;
    for(let redirects=0;redirects<=2;redirects++){
        if(!approvedFactUrl(url)) throw Error('unapproved source or redirect');
        const addresses=await resolve(new URL(url).hostname);
        if(!addresses.length||addresses.some(a=>!publicAddress(a.address))) throw Error('non-public address');
        const response=await fetch(url,{redirect:'manual',signal,headers:{
            'User-Agent':'Woodmont-Industrial-News-Briefing/1.0 public-fact-verification','Accept':'text/html'}});
        if(response.status>=300&&response.status<400){
            const location=response.headers.get('location');await response.body?.cancel();
            if(!location||redirects===2) throw Error('redirect limit');
            url=new URL(location,url).toString();continue;
        }
        if(!response.ok) {await response.body?.cancel();throw Error('publisher unavailable');}
        if(!response.headers.get('content-type')?.includes('text/html')||Number(response.headers.get('content-length'))>1_000_000){
            await response.body?.cancel();throw Error('invalid content');}
        const reader=response.body?.getReader();if(!reader)throw Error('empty page');
        const chunks:Uint8Array[]=[];let size=0;
        try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;
            if(size>1_000_000)throw Error('page byte limit');chunks.push(r.value);}}
        catch(e){await reader.cancel();throw e;}
        return {url,html:Buffer.concat(chunks).toString('utf8')};
    }
    throw Error('redirect limit');
}

export async function enrichNewsletterFacts(items:NormalizedItem[], options:{cachePath:string;now?:Date;
    maxPages?:number;budgetMs?:number;loader?:(url:string,signal:AbortSignal)=>Promise<Page>;
    sourceReferences?:Array<{articleId:string;sourceUrl:string}>}) {
    const now=options.now||new Date(),started=Date.now(),budget=Math.min(45000,options.budgetMs??45000);
    let cache:Record<string,CacheEntry>={};
    try{if(fs.statSync(options.cachePath).size<1_000_000)cache=JSON.parse(fs.readFileSync(options.cachePath,'utf8'));}catch{}
    const reference=new Map((options.sourceReferences||references).map(r=>[r.articleId,r.sourceUrl]));
    const stats={attempted:0,cached:0,enriched:0,unavailable:0,unresolved:0};
    const candidates=[...items].sort((a,b)=>Number(reference.has(b.id||''))-Number(reference.has(a.id||''))
        ||Date.parse(b.pubDate||'')-Date.parse(a.pubDate||''));
    for(const item of candidates){
        if(item.category==='exclude'||item.category==='people'||Date.parse(item.pubDate||'')>now.getTime())continue;
        if(!/\b(?:warehouse|industrial|distribution|logistics)\b/i.test(item.title||''))continue;
        const existing=summaryQuantities((item.title||'')+' '+(item.description||''));
        const hasRequiredQuantity=item.category==='availabilities'
            ?existing.some(q=>q.unit==='sf'):existing.some(q=>q.unit==='sf'||q.unit==='usd');
        if(!reference.has(item.id||'') && hasRequiredQuantity && hasNewsletterTargetRegion(item.title||''))continue;
        const url=reference.get(item.id||'')||item.link||(item as any).url||'';
        if(!approvedFactUrl(url)){stats.unresolved++;continue;}
        const key=createHash('sha256').update(url+'\n'+item.title).digest('hex');const prior=cache[key];
        const age=prior?now.getTime()-Date.parse(prior.checkedAt):Infinity;
        let facts:NewsletterFacts|null=null;
        if(age>=0 && age<(prior?.facts?7*86400000:86400000)) {stats.cached++;facts=prior.facts;}
        else {
            if(stats.attempted>=Math.min(8,options.maxPages??6)||Date.now()-started>=budget)continue;
            stats.attempted++;
            try{const page=await(options.loader||loadApprovedFactPage)(url,AbortSignal.timeout(Math.max(1,Math.min(10000,budget-(Date.now()-started)))));
                if(!approvedFactUrl(page.url))throw Error('unapproved final source');
                // Keep the validated public reference (stable newswire IDs need
                // no company-name URL slug) while validating every fetched hop.
                facts=extractNewsletterFacts(page.html,item,url,now);}
            catch{stats.unavailable++;}
            cache[key]={checkedAt:now.toISOString(),facts};
        }
        if(!facts || !newsletterFactFields({_newsletterFacts:facts})._newsletterFacts)continue;
        const normalized=[facts.squareFeet!==null?`${facts.squareFeet.toLocaleString('en-US')} SF`:null,
            facts.priceUsd!==null?`$${facts.priceUsd.toLocaleString('en-US')}`:null].filter(Boolean).join('; ');
        // Refresh the same suffix instead of accumulating page excerpts every build.
        item.description=(item.description||'').split('\nVerified publisher facts:')[0]
            +'\nVerified publisher facts: '+facts.evidence.join(' ')+(normalized?' ['+normalized+']':'');
        (item as any)._newsletterFacts=facts;
        item.category=newsletterCategory(item);
        stats.enriched++;
    }
    const bounded=Object.fromEntries(Object.entries(cache).filter(([,v])=>now.getTime()-Date.parse(v.checkedAt)<7*86400000)
        .sort((a,b)=>Date.parse(b[1].checkedAt)-Date.parse(a[1].checkedAt)).slice(0,200));
    fs.mkdirSync(path.dirname(options.cachePath),{recursive:true});fs.writeFileSync(options.cachePath,JSON.stringify(bounded));
    return stats;
}
