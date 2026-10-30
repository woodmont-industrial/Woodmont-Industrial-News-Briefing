import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isTargetRegion, hasGeographicFailure } from './newsletter-filters.js';
import { hasNewsletterTargetRegion } from '../shared/newsletter-geography.js';
import { generateJSONFeed } from '../build/feed-generators.js';

const article = (id: string, title: string, category = 'transactions', description = title) => ({
    id,title,description,category,source:'Example Publication',link:`https://news.google.com/rss/articles/${id}`,
    pubDate:'2026-10-28T10:00:00Z',_woodmontApprove:true,
} as any);
for (const place of ['Winter Haven','Lakeland','Ft. Myers','Carlisle','Lehigh Valley','N.J.']) {
    assert.equal(hasNewsletterTargetRegion(place),true,place);
    assert.equal(isTargetRegion(article(place,`A 120,000 SF industrial warehouse in ${place} sells for $30M`)),true,place);
}
for (const place of ['Westchester','Lakelandia','Winter Havenbrook','Newarkshire']) {
    assert.equal(hasNewsletterTargetRegion(place),false,'substring collision: '+place);
}
for (const title of ['New Jersey firm buys a Texas industrial warehouse for $30M',
    'California logistics warehouse sold for $30M',
    'A 120,000 SF industrial warehouse in Lakewood, CO sells for $30M',
    'A 120,000 SF industrial warehouse in Lakewood, Colorado sells for $30M',
    'A 120,000 SF industrial warehouse in Lakewood, OH sells for $30M',
    'A 120,000 SF industrial warehouse in Naples, Italy sells for $30M',
    'A 120,000 SF industrial warehouse in Morrisville, NC sells for $30M',
    'A 120,000 SF industrial warehouse in Morrisville, North Carolina sells for $30M',
    'A 120,000 SF industrial warehouse in Carlisle, Massachusetts sells for $30M',
    "A 120,000 SF industrial warehouse in Colorado's Lakewood sells for $30M",
    'A 120,000 SF industrial warehouse in Colorado’s Lakewood sells for $30M',
    "A 120,000 SF industrial warehouse in Italy's Naples sells for $30M",
    "A 120,000 SF industrial warehouse in North Carolina's Morrisville sells for $30M",
    "A 120,000 SF industrial warehouse in Massachusetts' Carlisle sells for $30M",
    'New Jersey buyer acquires a warehouse in Lakewood, CO for $30M']) {
    assert.equal(isTargetRegion(article('negative',title)),false);
}
for (const place of ['Lakewood, NJ','Naples, FL','Morrisville, PA','Carlisle, PA','Limerick PA','Bonita Springs FL']) {
    assert.equal(isTargetRegion(article('positive',`A 120,000 SF industrial warehouse in ${place} sells for $30M`)),true,place);
}
assert.equal(isTargetRegion(article('buyer-location','Lakewood, Colorado firm buys an industrial warehouse in Edison, NJ for $30M')),true);
assert.equal(isTargetRegion(article('buyer-location-code','Lakewood, CO firm buys an industrial warehouse in Edison, NJ for $30M')),true);
assert.equal(isTargetRegion(article('buyer-prefix',"Colorado's Lakewood firm buys an industrial warehouse in Edison, NJ for $30M")),true);
assert.equal(hasNewsletterTargetRegion('Lakewood'),true,'an unqualified city retains the existing newsletter policy');
assert.equal(hasNewsletterTargetRegion("Colorado's Lakewood"),false);
assert.equal(hasNewsletterTargetRegion('Colorado’s Lakewood'),false);
assert.equal(hasNewsletterTargetRegion("Italy's Naples"),false);
assert.equal(hasNewsletterTargetRegion("North Carolina's Morrisville"),false);
assert.equal(hasNewsletterTargetRegion("Massachusetts' Carlisle"),false);
assert.equal(hasNewsletterTargetRegion("New Jersey's Lakewood"),true);
assert.equal(hasNewsletterTargetRegion('Industrial warehouse installs a PA system'),false,'PA is not automatically Pennsylvania');
assert.equal(hasNewsletterTargetRegion('Industrial warehouse upgrades the FL software module'),false,'FL needs location context');
assert.equal(hasGeographicFailure(article('comparison','Ohio and Pennsylvania take different approaches to data centers')).fails,true);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'newsletter-geography-'));
try {
    const items=[
        article('winter-sale','A Winter Haven industrial warehouse sells for $133 million'),
        article('lakeland-project','Example Developer building $175M expansion at Sarasota logistics campus'),
        article('lakeland-planned','Example Developer to invest $200M in Lakeland warehouse expansion'),
        article('winter-project','Example Developer starts work on 1.35M-SF Winter Haven spec warehouse','availabilities'),
        article('allentown-project','Groundbreaking set for a new warehouse on the former Example Trucks property in Allentown','availabilities'),
        article('wrong-lakewood','A 130,000 SF industrial warehouse in Lakewood, CO sells for $31M'),
        article('wrong-morrisville','A 140,000 SF industrial warehouse in Morrisville, NC sells for $32M'),
        article('wrong-prefix',"A 150,000 SF industrial warehouse in Colorado's Lakewood sells for $33M"),
    ];
    fs.writeFileSync(path.join(root,'feed.json'),JSON.stringify(generateJSONFeed(items)));
    const output=path.join(root,'result.json');
    execFileSync(process.execPath,['--import','tsx','scripts/replay-editorial-email.ts',root,output,'2026-10-28T12:00:20Z'],
        {cwd:process.cwd(),env:{PATH:process.env.PATH,TZ:'America/New_York'},stdio:'pipe'});
    const result=JSON.parse(fs.readFileSync(output,'utf8'));
    assert.ok(result.sections.transactions.includes('winter-sale'),'the sale survives the final rendered email');
    for (const id of ['lakeland-project','lakeland-planned','winter-project','allentown-project']) {
        assert.ok(result.sections.relevant.includes(id),id+' is construction news in the final email');
        assert.ok(!result.sections.availabilities.includes(id));
    }
    assert.equal(result.networkRequests,0);
    assert.ok(!result.renderedIds.includes('wrong-lakewood'));
    assert.ok(!result.renderedIds.includes('wrong-morrisville'));
    assert.ok(!result.renderedIds.includes('wrong-prefix'));
    console.log('PASS: one geography resolver, city boundaries, out-of-state controls and final rendered routing');
} finally {fs.rmSync(root,{recursive:true,force:true});}
