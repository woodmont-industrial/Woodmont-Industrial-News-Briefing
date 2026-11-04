import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compareNewsEvents, dedupeEventEdition, eventSources, filterSentNewsEvents, identifyNewsEvent,
    loadSentNewsEvents, validNewsEvent, type EventArticle, type EventAudit } from './newsletter-events.js';

const article = (id: string, title: string, description: string, extra = {}): EventArticle => ({
    id,title,description,link:`https://commercialobserver.com/synthetic-${id}`,source:'Example News',
    pubDate:'2026-11-03T12:00:00Z',category:'transactions',tier:'C',...extra,
});
const detail = article('detail','Example Buyer acquires two IOS facilities in New Jersey',
    'Example Buyer bought two industrial outdoor storage properties for $68.5 million in Kearny and Newark. The acquisition adds 15 acres to its portfolio.');
const proxy = article('proxy','Example Brokers arrange sale of Northern NJ IOS portfolio - Connect CRE',
    'Example Brokers arrange sale of Northern NJ IOS portfolio Connect CRE',{
        category:'relevant', link:'https://news.google.com/rss/articles/synthetic-proxy',
        _newsletterFacts:{version:1,sourceUrl:'https://www.connectcre.com/stories/example-brokers-arrange-sale-of-northern-nj-ios-portfolio/',
            checkedAt:'2026-11-04T12:00:00Z',evidence:['The industrial portfolio is located in Kearny and Newark, New Jersey.'],
            squareFeet:null,priceUsd:68500000,propertyLocationEvidence:'The industrial portfolio is located in Kearny and Newark, New Jersey.',
            lead:'Example Brokers arranged the $68.5-million sale of an industrial outdoor storage portfolio in Newark and Kearny, NJ. It also arranged $52.2 million in financing for the 14.97-acre portfolio for the buyer, Example Buyer.'},
    });
const identify = identifyNewsEvent;
assert.equal(compareNewsEvents(identify(detail),identify(proxy)),'same','two independent metrics and the property locations confirm the IOS event');
assert.equal(compareNewsEvents(identify(detail),identify({...proxy,_newsletterFacts:{...proxy._newsletterFacts!,lead:proxy._newsletterFacts!.lead+' Example Brokers represented the seller.'}})),'same','a buyer name stops at the sentence boundary before the next broker credit');
assert.equal(compareNewsEvents(identify(detail),identify({...proxy,_newsletterFacts:undefined})),'possible','a metric-less market overlap is flagged, never merged');
const audit: EventAudit = {suppressed:[],possible:[]};
const result = dedupeEventEdition({relevant:[proxy],transactions:[detail],people:[],availabilities:[]},audit);
assert.deepEqual(result.sections.transactions.map(a=>a.id),['detail']);
assert.equal(result.sections.relevant.length,0);
assert.equal(eventSources(result.sections.transactions[0]).length,2,'both public source links are retained');
assert.equal(audit.suppressed.length,1);
for (const changed of [
    {...detail,id:'other-price',description:detail.description.replace('$68.5','$78.5')},
    {...detail,id:'other-buyer',title:'Different Buyer acquires two IOS facilities in New Jersey',description:detail.description.replaceAll('Example Buyer','Different Buyer')},
    {...detail,id:'other-places',description:detail.description.replace('Kearny and Newark','Edison and Carteret')},
    {...detail,id:'other-type',title:'Example Buyer leases two IOS facilities in New Jersey',description:detail.description.replace('bought','leased').replace('acquisition','lease')},
]) assert.notEqual(compareNewsEvents(identify(detail),identify(changed)),'same',changed.id);
const one = {...detail,id:'address-one',description:detail.description+' The site is at 42 Example Road.'};
const two = {...detail,id:'address-two',description:detail.description+' The site is at 7 Sample Avenue.'};
assert.equal(compareNewsEvents(identify(one),identify(two)),'distinct','distinct properties cannot collapse on matching region, buyer and price');
const thin = article('thin','Example Buyer buys New Jersey IOS properties for $68.5 million','Regional IOS properties were sold for $68.5 million.');
assert.equal(compareNewsEvents(identify(detail),identify(thin)),'possible','a coarse price match is advisory');
const possibleAudit: EventAudit = {suppressed:[],possible:[]};
assert.equal(dedupeEventEdition({transactions:[detail,thin]},possibleAudit).sections.transactions.length,2);
assert.equal(possibleAudit.possible.length,1);

const original = article('original','Economists question how long AI can fuel industrial real estate demand',
    'Northwind sees the AI economic boost nearing a peak, while Baystone questions the benefits beyond big technology.',{category:'relevant'});
const rewrite = article('rewrite','AI industrial demand faces doubts from Northwind and Baystone','',{category:'relevant',pubDate:'2026-11-04T10:00:00Z'});
assert.equal(compareNewsEvents(identify(original),identify(rewrite)),'same','rewritten macro coverage shares two actors, a topic and a conclusion');
assert.notEqual(compareNewsEvents(identify({...original,title:original.title+' - GlobeSt'}),
    identify({...rewrite,title:rewrite.title.replace('Baystone','Otherstone')+' - GlobeSt'})),'same','a shared publisher is not a second named firm');
for (const changed of [
    {...rewrite,id:'new-actor',title:rewrite.title.replace('Baystone','Otherstone')},
    {...rewrite,id:'new-results',description:'Northwind now reports a 7% increase in industrial demand.'},
    {...rewrite,id:'new-period',description:'The Northwind and Baystone analysis covers Q4 2026.'},
    {...rewrite,id:'opposite',title:'AI industrial demand surges according to Northwind and Baystone'},
    {...rewrite,id:'old',pubDate:'2026-11-10T10:00:00Z'},
]) assert.notEqual(compareNewsEvents(identify(original),identify(changed)),'same',changed.id);

// A development story retold days later under a new headline (November 3–4:
// a sent township vote and a sent facility opening both reran).
const planned = article('dev-plan','Examplecorp Plans Allentown, Pennsylvania, Distribution Operations',
    'Examplecorp has established distribution operations in Allentown, Pennsylvania. The project is expected to create 45 jobs.',
    {category:'relevant',pubDate:'2026-10-31T12:00:00Z'});
const opened = article('dev-open','Examplecorp Opens Largest North American Distribution Center in PA','',{category:'relevant'});
const vote = article('dev-vote','Example Township Approves 4,466-Acre Data Center Overlay District in Northeast Pennsylvania','',
    {category:'relevant',pubDate:'2026-11-02T12:00:00Z'});
const rumor = article('dev-rumor','4,500-Acre Data Center District Approved In Pennsylvania Town',
    'The approval was hailed by Example Group, which assembled 194 families that own land in the district and aims to sell it for $1.4B.',
    {category:'relevant',pubDate:'2026-10-29T12:00:00Z'});
assert.equal(compareNewsEvents(identify(planned),identify(opened)),'same','the same firm, project and state, retold as an opening');
assert.equal(compareNewsEvents(identify(vote),identify(rumor)),'same','rounded acreage of the same district vote, though the land-sale wording reads as an acquisition');
for (const [base, changed] of [
    [planned, {...opened,id:'other-state',title:opened.title.replace('in PA','in Florida')}],
    [planned, {...planned,id:'other-town',title:planned.title.replace('Allentown','Pittsburgh'),description:planned.description.replace('Allentown','Pittsburgh'),pubDate:opened.pubDate}],
    [planned, {...opened,id:'other-firm',title:opened.title.replace('Examplecorp','Othercorp')}],
    [planned, {...opened,id:'months-later',pubDate:'2026-11-20T12:00:00Z'}],
    [planned, {...opened,id:'financing',title:'Examplecorp secures $50 million loan for Allentown, Pennsylvania distribution center'}],
    [vote, {...rumor,id:'other-acreage',title:rumor.title.replace('4,500','1,200')}],
    [vote, {...rumor,id:'other-project',title:rumor.title.replace('Data Center','Warehouse Park')}],
] as Array<[EventArticle, EventArticle]>) assert.notEqual(compareNewsEvents(identify(base),identify(changed)),'same',changed.id);

// A sent deal retold without figures, 3+ days later (the October 19 send reran
// through deep backfill on November 4).
const sentDeal = article('sent-deal','Harborview Partners buys logistics site leased by a parcel carrier in South Brunswick','',
    {pubDate:'2026-10-16T09:52:00Z'});
const retold = article('retold','Harborview Partners Snaps Up South Brunswick Warehouse Fully Leased to a Parcel Carrier','',
    {pubDate:'2026-10-19T16:46:00Z'});
assert.equal(compareNewsEvents(identify(retold),identify(sentDeal),'history'),'same','same buyer and town as a sent deal');
assert.notEqual(compareNewsEvents(identify(retold),identify(sentDeal)),'same','within one edition the metric rules still decide');
for (const changed of [
    {...retold,id:'other-town',title:retold.title.replace('South Brunswick','Cranbury')},
    {...retold,id:'other-buyer',title:retold.title.replace('Harborview Partners','Otherview Partners')},
    {...retold,id:'other-size',title:retold.title+' at 343,000 SF',description:''},
    {...retold,id:'week-later',pubDate:'2026-10-27T12:00:00Z'},
    {...retold,id:'lease',title:'Harborview Partners leases South Brunswick warehouse to a parcel carrier'},
]) {
    const base = changed.id === 'other-size' ? {...sentDeal,title:sentDeal.title+' for 120,000 SF'} : sentDeal;
    assert.notEqual(compareNewsEvents(identify(changed),identify(base),'history'),'same',changed.id);
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'newsletter-events-'));
try {
    fs.writeFileSync(path.join(root,'sent-articles.json'),JSON.stringify({sent:[{id:original.id,sentAt:'2026-11-03'}]}));
    const history=loadSentNewsEvents(root,[original,rewrite],new Date('2026-11-04T13:00:00Z'));
    const historyAudit: EventAudit={suppressed:[],possible:[]};
    assert.equal(filterSentNewsEvents([rewrite],history,historyAudit).length,0,'legacy sent IDs can recover an event from the retained feed');
    assert.equal(historyAudit.suppressed[0].scope,'history');
    const event=identify(original)!;
    assert.equal(validNewsEvent(event),true);
    fs.writeFileSync(path.join(root,'sent-articles.json'),JSON.stringify({sent:[{id:original.id,sentAt:'2026-11-03',event}]}));
    assert.equal(loadSentNewsEvents(root,[],new Date('2026-11-04T13:00:00Z')).length,1,'persisted receipts work after the old feed item expires');
    assert.ok(!JSON.stringify(event).includes('Northwind'),'receipts store hashes, not company inventories');
    assert.equal(validNewsEvent({...event,actors:[null]}),false);
    assert.equal(validNewsEvent({...event,published:'invalid'}),false);
    fs.writeFileSync(path.join(root,'sent-articles.json'),JSON.stringify({sent:[{id:planned.id,sentAt:'2026-11-02',event:identify(planned)}]}));
    const devHistory=loadSentNewsEvents(root,[],new Date('2026-11-04T13:00:00Z'));
    assert.equal(devHistory.length,1,'a development receipt with subject and project validates');
    assert.equal(filterSentNewsEvents([opened],devHistory,{suppressed:[],possible:[]}).length,0,'a sent development story does not rerun');
    assert.ok(!JSON.stringify(devHistory).includes('examplecorp'),'the subject firm is stored as a hash');
    assert.equal(validNewsEvent({...identify(planned)!,project:'casino'}),false);
    fs.writeFileSync(path.join(root,'sent-articles.json'),JSON.stringify({sent:[{id:sentDeal.id,sentAt:'2026-10-19T13:00:00Z'}]}));
    const deep=loadSentNewsEvents(root,[sentDeal],new Date('2026-11-04T13:00:00Z'));
    assert.equal(filterSentNewsEvents([retold],deep,{suppressed:[],possible:[]}).length,0,'a send 16 days old still blocks its deep-backfill rewrite');
    assert.equal(loadSentNewsEvents(root,[sentDeal],new Date('2026-11-20T13:00:00Z')).length,0,'receipts expire after the 30-day backfill reach');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
console.log('PASS: confirmed cross-section events, richer sources, ambiguity, distinct deals, paraphrased reports, retold development stories and sent receipts');
