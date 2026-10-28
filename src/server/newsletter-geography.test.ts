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
    'California logistics warehouse sold for $30M']) {
    assert.equal(isTargetRegion(article('negative',title)),false);
}
assert.equal(hasGeographicFailure(article('comparison','Ohio and Pennsylvania take different approaches to data centers')).fails,true);

const root=fs.mkdtempSync(path.join(os.tmpdir(),'newsletter-geography-'));
try {
    const items=[
        article('winter-sale','A Winter Haven industrial warehouse sells for $133 million'),
        article('lakeland-project','Example Developer building $175M expansion at Sarasota logistics campus'),
        article('lakeland-planned','Example Developer to invest $200M in Lakeland warehouse expansion'),
        article('winter-project','Example Developer starts work on 1.35M-SF Winter Haven spec warehouse','availabilities'),
        article('allentown-project','Groundbreaking set for a new warehouse in Allentown','availabilities'),
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
    console.log('PASS: one geography resolver, city boundaries, out-of-state controls and final rendered routing');
} finally {fs.rmSync(root,{recursive:true,force:true});}
