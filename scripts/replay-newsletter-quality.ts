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
    ['2026-10-28','a4ebfc468bae4d1459481c7bd0e3f795f9391029'],
    ['2026-10-30','d7af65a713937c760528c00c0a717505e17ca0d3']];
// Optional local copy of the exact public send-time docs; CI reads the pinned git object.
const localOct30At=process.argv.indexOf('--oct30-input');
const localOct30=localOct30At<0?null:path.resolve(process.argv[localOct30At+1]);
const localHistoryAt=process.argv.indexOf('--history-input');
const localHistory=localHistoryAt<0?null:path.resolve(process.argv[localHistoryAt+1]);
const oct30Published=[
    '85943a55b76053a1d16b3c1081b88b2928d1a177','a26ea4986f40226022eb7629689c2b74983482de',
    'c6439aedf30b6b28ce6a96c43c924c1f7c93aa6e','c8bd1d8cce5a3599acdf3607e8357f8236f9c291',
    '0ee38aa53ef9b71a1dc03837c8f4312d37ece80c','18a9252293dc3fb891f64c5f17174d23b9bed228',
    'e26622640adf84365e04f833184ad8567ffeeaff',
].sort();
const files=['feed.json','sent-articles.json','preferences/reserve-pool.json','scoring-weights.json',
    'included-articles.json','excluded-articles.json','weekly-top-articles.json','feed-health.json','build-receipt.json'];
const report:any={publicPageCheck:live,results:[]};
const run=(docs:string,cwd:string,date:string,label:string)=>{
    const output=path.join(root,date+'-'+label+'.json');
    execFileSync(process.execPath,['--import',path.resolve('node_modules/tsx/dist/loader.mjs'),replay,docs,output,date+'T12:00:20Z'],
        {cwd,env:{PATH:process.env.PATH,TZ:'America/New_York'},stdio:'pipe',timeout:120000});
    const {stages,...result}=JSON.parse(fs.readFileSync(output,'utf8'));
    return result;
};
async function main(){
    execFileSync('git',['worktree','add','--detach',baseline,'ca77b937d22943407cff4392cbd23b54c3bbd84c'],{stdio:'pipe'});
    fs.symlinkSync(path.resolve('node_modules'),path.join(baseline,'node_modules'),'dir');
    const actual=JSON.parse(localOct30?fs.readFileSync(path.join(localOct30,'weekly-top-articles.json'),'utf8'):
        execFileSync('git',['show','845d27aac2cef07772fbde4f8d5b5b7464ddce98:docs/weekly-top-articles.json'],{encoding:'utf8'}));
    for(const [date,ref] of dates){
        const docs=path.join(root,date);fs.mkdirSync(docs);
        for(const file of files){const output=path.join(docs,file);fs.mkdirSync(path.dirname(output),{recursive:true});
            const localDocs=date==='2026-10-30'?localOct30:localHistory&&path.join(localHistory,date);
            fs.writeFileSync(output,localDocs?fs.readFileSync(path.join(localDocs,file)):
                execFileSync('git',['show',`${ref}:docs/${file}`],{maxBuffer:32000000}));}
        const before=run(docs,baseline,date,'before');
        assert.deepEqual(before.renderedIds,date==='2026-10-30'?oct30Published:actual.week[date].map((a:any)=>a.id).sort(),
            'baseline reproduces the published issue');
        const after=run(docs,process.cwd(),date,'after');
        assert.equal(before.networkRequests,0);assert.equal(after.networkRequests,0);
        const result:any={date,before,after};report.results.push(result);
        const winterSale='b796663e4839029bdbf75bcc55975083830bbb97';
        assert.ok(after.sections.transactions.includes(winterSale),'the valid Winter Haven sale must render in Transactions');
        assert.ok(!after.sections.relevant.includes('14f68ade960e1446c8f3ff94834a91b673293451'),'the rejected office/personnel item stays out');
        if (date === '2026-10-28') {
            assert.ok(after.sections.relevant.includes('7120f30eb46f5c0dc930404fbb49b745c51224e1'),
                'the real Allentown groundbreaking renders in Relevant, including its former-company wording');
        }
        if (date === '2026-10-30') {
            const listing='0ee38aa53ef9b71a1dc03837c8f4312d37ece80c';
            assert.ok(!after.sections.transactions.includes(listing),'an offer of space is not a completed transaction');
            for (const id of ['e26622640adf84365e04f833184ad8567ffeeaff',
                'c8bd1d8cce5a3599acdf3607e8357f8236f9c291','c6439aedf30b6b28ce6a96c43c924c1f7c93aa6e']) {
                assert.ok(!after.renderedIds.includes(id)&&!after.weekInReviewIds.includes(id),'catalog/stock/opposition artifact stays out');
            }
            for (const id of ['85943a55b76053a1d16b3c1081b88b2928d1a177','a26ea4986f40226022eb7629689c2b74983482de'])
                assert.ok(after.sections.relevant.includes(id),'the real industrial report and manufacturing lease survive');
        }
        if(live){
            const items=mapFeedItemsToArticles(JSON.parse(fs.readFileSync(path.join(docs,'feed.json'),'utf8')).items);
            // Audit the entire normal-day feed, with separate caches for the
            // automatic path and the explicit canonical-reference repairs.
            const automatic = structuredClone(items);
            const automaticStats = await enrichNewsletterFacts(automatic, {
                cachePath: path.join(root, 'automatic-cache.json'),
                now: new Date(), sourceReferences: [],
            });
            const automaticDocs = path.join(root, date + '-automatic-docs');
            fs.cpSync(docs, automaticDocs, {recursive: true});
            writeEditorialFeed(automatic, path.join(automaticDocs, 'feed.json'));
            result.withoutReferences = {
                stats: automaticStats,
                recovered: automatic.filter(article => article._newsletterFacts).map(article => ({id: article.id})),
                email: run(automaticDocs, process.cwd(), date, 'automatic-facts'),
            };
            assert.equal(automaticStats.referenced, 0);
            assert.equal(automaticStats.eligible,
                automaticStats.direct + automaticStats.referenced + automaticStats.unresolved);
            assert.ok(automaticStats.attempted <= 6 && automaticStats.httpRequests <= 18);
            const stats=await enrichNewsletterFacts(items,{cachePath:path.join(root,'public-cache.json'),
                now:new Date()});
            const selected=items.filter(a=>refs.some(r=>r.articleId===a.id));
            result.publicFacts={stats,recovered:selected.map((a:any)=>({id:a.id,hasFacts:!!a._newsletterFacts}))};
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
            result.publicFacts.email=enriched;
            if(date!=='2026-10-30')assert.ok(enriched.sections.transactions.includes(refs[date==='2026-10-27'?1:0].articleId),'verified facts reach the final Transactions section');
        }
    }
    console.log(JSON.stringify(report));
    console.log('PASS: three published baselines and corrected final email paths'+(live?', including approved publisher pages':''));
}
main().catch(e=>{console.error(JSON.stringify(report));console.error('Replay incomplete:',e.message);process.exitCode=1;})
    .finally(()=>{const modules=path.join(baseline,'node_modules');if(fs.existsSync(modules)&&fs.lstatSync(modules).isSymbolicLink())fs.unlinkSync(modules);
        if(fs.existsSync(path.join(baseline,'.git')))try{execFileSync('git',['worktree','remove','--force',baseline],{stdio:'pipe'});}catch{}
        fs.rmSync(root,{recursive:true,force:true});});
