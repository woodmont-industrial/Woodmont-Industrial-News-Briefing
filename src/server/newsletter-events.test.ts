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
for (const changed of [
    {...rewrite,id:'new-actor',title:rewrite.title.replace('Baystone','Otherstone')},
    {...rewrite,id:'new-results',description:'Northwind now reports a 7% increase in industrial demand.'},
    {...rewrite,id:'new-period',description:'The Northwind and Baystone analysis covers Q4 2026.'},
    {...rewrite,id:'opposite',title:'AI industrial demand surges according to Northwind and Baystone'},
    {...rewrite,id:'old',pubDate:'2026-11-10T10:00:00Z'},
]) assert.notEqual(compareNewsEvents(identify(original),identify(changed)),'same',changed.id);

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
} finally { fs.rmSync(root,{recursive:true,force:true}); }
console.log('PASS: confirmed cross-section events, richer sources, ambiguity, distinct deals, paraphrased reports and sent receipts');
