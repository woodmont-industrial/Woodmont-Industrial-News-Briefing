import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractNewsletterFacts, enrichNewsletterFacts, loadApprovedFactPage } from './newsletter-facts.js';
import { approvedFactUrl, hasVerifiedTargetProperty } from '../shared/newsletter-facts.js';
import { isTargetRegion, applyTransactionFilter } from '../server/newsletter-filters.js';
import { generateJSONFeed } from './feed-generators.js';
import references from '../feeds/article-source-references.json' with {type:'json'};

const now=new Date('2026-10-28T12:00:20Z');
const source='https://www.businesswire.com/news/home/123456789/en/';
const article=(id='one',extra={})=>({id,title:'Example Buyer acquires three-building industrial portfolio',
    description:'Example Buyer acquires three-building industrial portfolio',category:'transactions',
    link:'https://news.google.com/rss/articles/'+id,pubDate:'2026-10-27T12:00:00Z',...extra} as any);
const page=(body:string,title=article().title)=>`<html><h1>${title}</h1><nav>Home Menu $900M 900000 SF Dallas</nav><main>
    <nav>Menu $800M 800000 SF</nav><p>${body}</p><p>About Example Buyer</p>
    <p>The company manages 999 million SF from a New Jersey headquarters.</p></main></html>`;
const html=page('Example Buyer has acquired a three-building, 182,255-square-foot industrial portfolio in Carlstadt, New Jersey, for $44.3 million.');
const facts=extractNewsletterFacts(html,article(),source,now)!;
assert.equal(facts.squareFeet,182255);assert.equal(facts.priceUsd,44300000);
assert.ok(facts.propertyLocationEvidence?.includes('Carlstadt'));
assert.ok(!facts.evidence.join(' ').includes('Menu'));assert.ok(!facts.evidence.join(' ').includes('headquarters'));
assert.equal(extractNewsletterFacts(page('Example Buyer leased 12,000 SF in a 200,000 SF industrial warehouse in Edison NJ.'),article(),source,now),null);
assert.equal(extractNewsletterFacts(page('Example Buyer has acquired a 200,000 SF industrial warehouse for $30M.','Different Retail Company Opens Shopping Mall'),article(),source,now),null);
for(const url of ['http://www.businesswire.com/a','https://businesswire.com.evil.test/a',
    'https://notbusinesswire.com/a','https://news.google.com/rss/articles/a','https://user:pass@www.businesswire.com/a',
    'https://www.businesswire.com:444/a','https://127.0.0.1/a']) assert.equal(approvedFactUrl(url),false,url);
assert.equal(approvedFactUrl(source),true);
const portfolioTitle='Example Manager closes $985M secondary industrial portfolio transaction';
const portfolioHtml=page('Example Manager announced the closing of a $985 million secondary in an 8.0 million-square-foot industrial portfolio.</p><p>The infill portfolio spans Atlanta, Chicago, Dallas and Jacksonville.',portfolioTitle);
const portfolio=extractNewsletterFacts(portfolioHtml,article('portfolio',{title:portfolioTitle}),source,now)!;
assert.equal(portfolio.squareFeet,8000000);assert.equal(portfolio.priceUsd,985000000);
assert.equal(hasVerifiedTargetProperty({_newsletterFacts:portfolio}),true);
assert.equal(isTargetRegion(article('portfolio',{title:portfolioTitle,_newsletterFacts:portfolio})),true);
assert.equal(isTargetRegion(article('outside',{title:'A Texas warehouse sells for $30M',_newsletterFacts:portfolio})),false,
    'a portfolio citation cannot relocate an explicit out-of-state asset');

async function main(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'newsletter-facts-'));
    try{
        const cachePath=path.join(root,'cache.json');let calls=0;
        const loader=async()=>{calls++;return{url:source,html};};
        const a=article();
        let stats=await enrichNewsletterFacts([a],{cachePath,now,sourceReferences:[{articleId:a.id,sourceUrl:source}],loader});
        assert.equal(stats.enriched,1);assert.equal(calls,1);assert.equal(applyTransactionFilter([a]).length,1);
        assert.equal(isTargetRegion(a),true);
        const feed:any=generateJSONFeed([a]);assert.equal(feed.items[0]._newsletterFacts.priceUsd,44300000);
        const copy=article();stats=await enrichNewsletterFacts([copy],{cachePath,now,sourceReferences:[{articleId:copy.id,sourceUrl:source}],loader});
        assert.equal(stats.cached,1);assert.equal(calls,1,'fresh-run cache avoids a second page fetch');
        assert.equal(copy.description,a.description,'cached enrichment is stable');
        const configured=article(references[0].articleId);
        stats=await enrichNewsletterFacts([configured],{cachePath:path.join(root,'configured.json'),now,loader});
        assert.equal(stats.enriched,1,'the configured canonical references work through the default import');
        const unresolved=article('unresolved');const text=unresolved.description;
        stats=await enrichNewsletterFacts([unresolved],{cachePath,now,sourceReferences:[],loader});
        assert.equal(stats.unresolved,1);assert.equal(unresolved.description,text,'opaque proxies stay unchanged without a verified canonical source');
        const failed=article('failed');const refs=[{articleId:'failed',sourceUrl:source}];
        const failedPath=path.join(root,'failed.json');let failures=0;
        const bad=async()=>{failures++;throw Error('403');};
        await enrichNewsletterFacts([failed],{cachePath:failedPath,now,sourceReferences:refs,loader:bad});
        await enrichNewsletterFacts([failed],{cachePath:failedPath,now,sourceReferences:refs,loader:bad});
        assert.equal(failures,1,'publisher refusal cools down instead of being bypassed');
        const future=article('future',{pubDate:'2026-10-29T12:00:00Z'});
        await enrichNewsletterFacts([future],{cachePath,now,sourceReferences:[{articleId:'future',sourceUrl:source}],loader});
        assert.equal(calls,2,'future articles do not get page extraction');
        let bounded=0;
        const batch=Array.from({length:10},(_,i)=>article('bounded-'+i,{title:article().title+' '+i}));
        stats=await enrichNewsletterFacts(batch,{cachePath:path.join(root,'bounded.json'),now,maxPages:2,
            sourceReferences:batch.map(a=>({articleId:a.id,sourceUrl:source})),loader:async()=>{bounded++;return{url:source,html};}});
        assert.equal(bounded,2);assert.equal(stats.attempted,2);
        const realFetch=globalThis.fetch;let requested=0;
        try{
            globalThis.fetch=async()=>{requested++;return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}});};
            await assert.rejects(()=>loadApprovedFactPage(source,AbortSignal.timeout(5000),async()=>[{address:'8.8.8.8'}]));
            assert.equal(requested,1,'unsafe redirect is rejected before a second fetch');
            requested=0;
            await assert.rejects(()=>loadApprovedFactPage(source,AbortSignal.timeout(5000),async()=>[{address:'127.0.0.1'}]));
            assert.equal(requested,0,'non-public DNS results are rejected before fetching');
        }finally{globalThis.fetch=realFetch;}
        console.log('PASS: public source evidence, unit scope, portfolio geography, cache, bounds, refusal, future date and unsafe redirects');
    }finally{fs.rmSync(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
