import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeEditorialFeed } from '../build/editorial-review.js';
import { extractNewsletterFacts } from '../build/newsletter-facts.js';
import { escapeAttr } from '../shared/html-escape.js';
import { buildWorkBriefing } from './newsletter-work.js';
import { dedupeEventEdition, eventSources, identifyNewsEvent, loadSentNewsEvents, type EventArticle } from './newsletter-events.js';
import { normalizeTitleKey, saveSentArticles } from './newsletter-filters.js';
import { repairSummaryFromEvidence, unusableSummary } from '../filter/summary-quality.js';

const item = (id:string,title:string,description:string,extra={}):EventArticle => ({
    id,title,description,link:`https://commercialobserver.com/synthetic-${id}`,source:'Example News',
    category:'transactions',pubDate:'2026-11-03T15:00:00Z',tier:'C',...extra,
});
const title='Example Brokers arrange sale of Northern NJ IOS portfolio - Connect CRE';
const body='<h1>'+title+'</h1><article><p>Example Brokers arranged the $68.5-million sale of an industrial outdoor storage portfolio in Newark and Kearny, New Jersey.</p><p>The 14.97-acre portfolio was purchased by the buyer, Example Buyer, with a $52.2 million loan.</p></article>';
const proxy=item('proxy',title,title,{link:'https://news.google.com/rss/articles/synthetic',category:'relevant'});
proxy._newsletterFacts=extractNewsletterFacts(body,proxy,'https://www.connectcre.com/stories/example-brokers-arrange-sale-of-northern-nj-ios-portfolio/',new Date('2026-11-04T12:00:00Z'))!;
assert.equal(proxy._newsletterFacts?.priceUsd,68500000);
const detail=item('detail','Example Buyer acquires two IOS facilities near New Jersey shipping corridors',
    'Example Buyer acquired two industrial outdoor storage properties for $68.5 million in Newark and Kearny. The purchase covers 15 acres across the two facilities.');
const distinct1=item('separate-one','Example Buyer acquires a Newark NJ IOS property for $68.5M',
    'Example Buyer bought a 15-acre industrial outdoor storage property at 42 Example Road in Newark, NJ, for $68.5 million.');
const distinct2=item('separate-two','Different Buyer acquires a Newark NJ IOS property for $68.5M',
    'Different Buyer bought a 15-acre industrial outdoor storage property at 7 Sample Avenue in Newark, NJ, for $68.5 million.');
const prior=item('prior','Economists question how long AI can fuel industrial demand',
    'Northwind sees the AI economic boost nearing a peak, while Baystone questions the benefits beyond big technology.',{category:'relevant'});
const rewrite=item('rewrite','AI industrial demand faces doubts from Northwind and Baystone',
    'Northwind and Baystone question the durability of AI-driven industrial demand.',{category:'relevant'});
const garbled=item('garbled','Example firms form a New Jersey industrial logistics joint venture',
    'Both and Example and Sample bring years of experience in warehouse real estate.',{category:'relevant'});
const root=fs.mkdtempSync(path.join(os.tmpdir(),'events-pipeline-'));
try {
    fs.mkdirSync(path.join(root,'preferences'));
    for (const route of ['feed','reserve','manual']) {
        const feed=[proxy,detail,distinct1,distinct2,prior,garbled,...(route==='feed'?[rewrite]:[])];
        writeEditorialFeed(feed,path.join(root,'feed.json'));
        fs.writeFileSync(path.join(root,'sent-articles.json'),JSON.stringify({sent:[{id:prior.id,sentAt:'2026-11-03'},
            {id:'older-different-deal',sentAt:'2026-11-03',titleKey:normalizeTitleKey(distinct1.title),
                event:identifyNewsEvent({...distinct2,title:distinct1.title})}]}));
        fs.writeFileSync(path.join(root,'included-articles.json'),JSON.stringify({articles:route==='manual'?[{...rewrite,url:rewrite.link,date_published:rewrite.pubDate}]:[]}));
        fs.writeFileSync(path.join(root,'preferences/reserve-pool.json'),JSON.stringify({sections:{relevant:route==='reserve'?[{...rewrite,url:rewrite.link,date_published:rewrite.pubDate}]:[]}}));
        const output=path.join(root,'result.json');
        execFileSync(process.execPath,['--import','tsx','scripts/replay-editorial-email.ts',root,output,'2026-11-04T13:00:20Z'],{env:{PATH:process.env.PATH,TZ:'America/New_York'},stdio:'pipe'});
        const result=JSON.parse(fs.readFileSync(output,'utf8'));
        assert.ok(result.sections.transactions.includes('detail'),route+': richer source is the Transaction');
        assert.ok(!result.renderedIds.includes('proxy'),route+': cross-section duplicate is removed');
        for (const id of ['separate-one','separate-two']) assert.ok(result.sections.transactions.includes(id),route+': distinct deals survive ALL dedup passes');
        assert.ok(!result.renderedIds.includes('rewrite'),route+': prior-day event cannot return through refill');
        assert.ok(!result.renderedIds.includes('garbled'),route+': garbled imported caption is not rendered');
        assert.ok(result.summaryQuality.rejected.some((a:{id:string})=>a.id==='garbled'));
        assert.ok(result.additionalSourceCount>=1,'both citations reach the final pipeline HTML');
        assert.equal(result.networkRequests,0);
    }
    const {sections}=dedupeEventEdition({transactions:[detail],relevant:[proxy]},{suppressed:[],possible:[]});
    const html=buildWorkBriefing([],sections.transactions,[],[],'Review');
    for(const s of eventSources(sections.transactions[0])) assert.ok(html.includes(escapeAttr(s.url)),'the rendered survivor retains both escaped source links');
    assert.ok(repairSummaryFromEvidence(proxy));
    assert.equal(unusableSummary(proxy),null);
    assert.equal(unusableSummary(garbled),'garbled-or-boilerplate');
    const event=identifyNewsEvent(detail)!;
    saveSentArticles(root,[{id:detail.id,event}]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'sent-articles.json'),'utf8')).sent.find((a:{id:string})=>a.id===detail.id).event,event);
    assert.equal(loadSentNewsEvents(root,[]).filter(a=>a.id===detail.id).length,1,'validated event survives the sent-state writer without the original feed');
    console.log('PASS: full pipeline feed/reserve/queue event dedup, distinct deals, source links, summary gate and durable receipts; zero transport');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
