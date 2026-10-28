/** Fixed-input email comparisons; optional public pages only, never AI or delivery. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import {enrichNewsletterFacts} from '../src/build/newsletter-facts.js';
import {mapFeedItemsToArticles} from '../src/server/newsletter-filters.js';
import {writeEditorialFeed} from '../src/build/editorial-review.js';
import refs from '../src/feeds/article-source-references.json' with {type:'json'};

const root=fs.mkdtempSync(path.join(os.tmpdir(),'newsletter-fixed-input-'));
const baseline=path.join(root,'baseline');
const replay=path.resolve('scripts/replay-editorial-email.ts');
const live=process.argv.includes('--public-facts');
const dates=[['2026-10-27','83ab3d84aafc2ae4a12462bfeaae369abc329b36'],
    ['2026-10-28','a4ebfc468bae4d1459481c7bd0e3f795f9391029']];
const files=['feed.json','sent-articles.json','preferences/reserve-pool.json','scoring-weights.json',
    'included-articles.json','excluded-articles.json','weekly-top-articles.json','feed-health.json','build-receipt.json'];
const report:any={publicPageCheck:live,results:[]};
const run=(docs:string,cwd:string,date:string,label:string)=>{
    const output=path.join(root,date+'-'+label+'.json');
    execFileSync(process.execPath,['--import',path.resolve('node_modules/tsx/dist/loader.mjs'),replay,docs,output,date+'T12:00:20Z'],
        {cwd,env:{PATH:process.env.PATH,TZ:'America/New_York'},stdio:'pipe',timeout:120000});
    return JSON.parse(fs.readFileSync(output,'utf8'));
};
async function main(){
    execFileSync('git',['worktree','add','--detach',baseline,'ca77b937d22943407cff4392cbd23b54c3bbd84c'],{stdio:'pipe'});
    fs.symlinkSync(path.resolve('node_modules'),path.join(baseline,'node_modules'),'dir');
    const actual=JSON.parse(execFileSync('git',['show','845d27aac2cef07772fbde4f8d5b5b7464ddce98:docs/weekly-top-articles.json'],{encoding:'utf8'}));
    for(const [date,ref] of dates){
        const docs=path.join(root,date);fs.mkdirSync(docs);
        for(const file of files){const output=path.join(docs,file);fs.mkdirSync(path.dirname(output),{recursive:true});
            fs.writeFileSync(output,execFileSync('git',['show',`${ref}:docs/${file}`],{maxBuffer:32000000}));}
        const before=run(docs,baseline,date,'before');
        assert.deepEqual(before.renderedIds,actual.week[date].map((a:any)=>a.id).sort(),'baseline reproduces the published issue');
        const after=run(docs,process.cwd(),date,'after');
        assert.equal(before.networkRequests,0);assert.equal(after.networkRequests,0);
        const result:any={date,before,after};report.results.push(result);
        const winterSale='b796663e4839029bdbf75bcc55975083830bbb97';
        assert.ok(after.sections.transactions.includes(winterSale),'the valid Winter Haven sale must render in Transactions');
        assert.ok(!after.sections.relevant.includes('14f68ade960e1446c8f3ff94834a91b673293451'),'the rejected office/personnel item stays out');
        if(live){
            const items=mapFeedItemsToArticles(JSON.parse(fs.readFileSync(path.join(docs,'feed.json'),'utf8')).items);
            const selected=items.filter(a=>refs.some(r=>r.articleId===a.id));
            const stats=await enrichNewsletterFacts(selected,{cachePath:path.join(root,'public-cache.json'),
                now:new Date(),maxPages:2});
            const expected=selected.find(a=>a.id===refs[1].articleId) as any;
            assert.equal(expected?._newsletterFacts?.squareFeet,182255,'publisher page supplies the portfolio area');
            assert.equal(expected?._newsletterFacts?.priceUsd,44300000);
            if(date==='2026-10-28'){
                const portfolio=selected.find(a=>a.id===refs[0].articleId) as any;
                assert.equal(portfolio?._newsletterFacts?.squareFeet,8000000);
                assert.equal(portfolio?._newsletterFacts?.priceUsd,985000000);
                assert.match(portfolio?._newsletterFacts?.propertyLocationEvidence,/Jacksonville/);
            }
            writeEditorialFeed(items,path.join(docs,'feed.json'));
            const enriched=run(docs,process.cwd(),date,'public-facts');
            result.publicFacts={stats,email:enriched};
            assert.ok(enriched.sections.transactions.includes(refs[date==='2026-10-27'?1:0].articleId),'verified facts reach the final Transactions section');
        }
    }
    console.log(JSON.stringify(report));
    console.log('PASS: both published baselines and corrected final email paths'+(live?', including approved publisher pages':''));
}
main().catch(e=>{console.error(JSON.stringify(report));console.error('Replay incomplete:',e.message);process.exitCode=1;})
    .finally(()=>{const modules=path.join(baseline,'node_modules');if(fs.existsSync(modules)&&fs.lstatSync(modules).isSymbolicLink())fs.unlinkSync(modules);
        if(fs.existsSync(path.join(baseline,'.git')))try{execFileSync('git',['worktree','remove','--force',baseline],{stdio:'pipe'});}catch{}
        fs.rmSync(root,{recursive:true,force:true});});
