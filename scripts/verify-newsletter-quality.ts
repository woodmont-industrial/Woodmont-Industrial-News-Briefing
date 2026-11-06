/** Authenticated provider checks and real offline email replays. Outputs IDs/counts only. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getAIProviders } from '../src/filter/ai-provider.js';
import { classifyWoodmontBatch } from '../src/filter/llm-classifier.js';
import { WOODMONT_RUBRIC_VERSION } from '../src/filter/woodmont-rubric.js';
import { generateDescriptions } from '../src/filter/description-generator.js';
import { summaryQuantities } from '../src/filter/summary-quantities.js';
import { getEditorialReviewCandidates, writeEditorialFeed } from '../src/build/editorial-review.js';
import { mapFeedItemsToArticles } from '../src/server/newsletter-filters.js';
import { editorialVerdictFields } from '../src/filter/editorial-verdict.js';
import { editorialRubricCases } from './editorial-rubric-cases.js';

const INPUT = '12e2824e33949df99cb3380fed344fce4c7b8565';
const BASE = 'ca77b937d22943407cff4392cbd23b54c3bbd84c';
const AS_OF = '2026-10-26T12:00:39Z';
const REPLAY = path.resolve('scripts/replay-editorial-email.ts');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'newsletter-quality-'));
const baseline = path.join(root, 'baseline-code');
const input = path.join(root, 'input');
const reportPath = path.resolve('artifacts/newsletter-quality/result.json');
const keys = { GROQ_API_KEY: process.env.GROQ_API_KEY, CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY };
const realFetch = globalThis.fetch;
const report: any = { inputRef:INPUT, baselineRef:BASE, asOf:AS_OF, rubricVersion:WOODMONT_RUBRIC_VERSION,
    dryRun:true, providers:[] };
const read = (file: string) => JSON.parse(fs.readFileSync(file,'utf8'));
const save = () => {
    const json = JSON.stringify(report,null,2)+'\n';
    for (const value of Object.values(keys)) assert.ok(!value || !json.includes(value), 'Secret-free result required');
    fs.mkdirSync(path.dirname(reportPath),{recursive:true}); fs.writeFileSync(reportPath,json);
};
const replay = (docs: string, code: string, name: string) => {
    const result = path.join(root,name+'.json');
    execFileSync(process.execPath,['--import',path.resolve('node_modules/tsx/dist/loader.mjs'),REPLAY,docs,result,AS_OF],
        {cwd:code,env:{PATH:process.env.PATH,TZ:'America/New_York'},stdio:'pipe',timeout:120000});
    return read(result);
};

async function main() {
    assert.ok(keys.GROQ_API_KEY && keys.CEREBRAS_API_KEY, 'Both provider secrets are required');
    fs.mkdirSync(input);
    for (const file of ['feed.json','sent-articles.json','preferences/reserve-pool.json','scoring-weights.json',
        'included-articles.json','excluded-articles.json','weekly-top-articles.json','feed-health.json','build-receipt.json']) {
        const destination = path.join(input,file); fs.mkdirSync(path.dirname(destination),{recursive:true});
        fs.writeFileSync(destination,execFileSync('git',['show',`${INPUT}:docs/${file}`],{maxBuffer:32*1024*1024}));
    }
    execFileSync('git',['worktree','add','--detach',baseline,BASE],{stdio:'pipe'});
    fs.symlinkSync(path.resolve('node_modules'),path.join(baseline,'node_modules'),'dir');
    report.baseline = replay(input,baseline,'baseline');
    const actual = JSON.parse(execFileSync('git',['show','aa7fbf647ad4e8d8ed341ecca521a38e6db987a9:docs/sent-articles.json'],{encoding:'utf8'}));
    const actualIds = actual.sent.filter((a:any)=>a.sentAt==='2026-10-26').map((a:any)=>a.id).sort();
    assert.deepEqual(report.baseline.renderedIds,actualIds,'Baseline must reproduce all seven actual published IDs');
    report.enforcementOnly = replay(input,process.cwd(),'enforcement-only');
    const originals = mapFeedItemsToArticles(read(path.join(input,'feed.json')).items);
    const sent = new Set(read(path.join(input,'sent-articles.json')).sent.map((a:any)=>a.id));
    const realIds = { financing:'3a0ee91e4a216fb8a987586e05445c6c2acffc9c',
        opposition:'75a20051828cead617cee4402d3aca785dbcaadc', construction:'cf1cc792331d25beb6c4c37d51c99ff4bd0c861e',
        smallListing:'4e3fbaff9be7007113acd10e285cb63850603658', oppositionFallback:'c37806326691ae6f297fa566a2f850dd2d954d0c' };
    const oldSource = execFileSync('git',['show',`${BASE}:src/filter/woodmont-rubric.ts`],{encoding:'utf8'});
    const oldPrompt = /WOODMONT_SYSTEM_PROMPT = `([\s\S]*?)`;/m.exec(oldSource)?.[1];
    assert.ok(oldPrompt);
    const providers = getAIProviders().sort((a,b)=>a.name==='Cerebras'?-1:b.name==='Cerebras'?1:0);
    for (const provider of providers) {
        delete process.env.GROQ_API_KEY; delete process.env.CEREBRAS_API_KEY;
        process.env[provider.name==='Groq'?'GROQ_API_KEY':'CEREBRAS_API_KEY'] = provider.apiKey;
        const result: any = { provider:provider.name,model:provider.model,requests:0,statuses:{},success:false };
        report.providers.push(result); save();
        let last = 0;
        let tokens: {limit:number;remaining:number;at:number}|undefined;
        globalThis.fetch = async (url,init) => {
            assert.equal(String(url),provider.url,'Only the selected provider endpoint may be called');
            assert.equal(init?.method,'POST');
            let wait = 2200-(Date.now()-last);
            if (provider.name==='Groq' && last) {
                const body = JSON.parse(String(init?.body));
                const estimated = Math.ceil(body.messages.reduce((n:number,m:any)=>n+m.content.length,0)/3.5)
                    + body.max_completion_tokens + 256;
                wait = Math.max(wait,tokens?Math.max(0,estimated-tokens.remaining)/tokens.limit*60000-(Date.now()-tokens.at):30000-(Date.now()-last));
            }
            if (wait>0) await new Promise(resolve=>setTimeout(resolve,wait));
            assert.ok(++result.requests<=65,'Bounded verification request count'); last=Date.now();
            const response = await realFetch(url,init);
            result.statuses[response.status]=(result.statuses[response.status]||0)+1;
            const limit=Number(response.headers.get('x-ratelimit-limit-tokens'));
            const remaining=Number(response.headers.get('x-ratelimit-remaining-tokens'));
            if(limit>0 && Number.isFinite(remaining)) tokens={limit,remaining,at:Date.now()};
            if(response.status===429 && Number(response.headers.get('retry-after'))>60) throw new Error('Provider daily quota exhausted');
            return response;
        };
        try {
            result.phase='paired-policy';
            const cases = editorialRubricCases(new Date(AS_OF));
            const checks = cases.map(c=>({...c.article}));
            const checked = await classifyWoodmontBatch(checks,1,0,600000,{asOf:new Date(AS_OF)});
            result.controls={...checked,decisions:checks.map((a:any,i)=>({id:a.id,expected:cases[i].approve,approve:a._woodmontApprove??null}))};
            save();
            assert.equal(checked.classified,cases.length);
            assert.ok(result.controls.decisions.every((d:any)=>d.expected===d.approve),'Every paired control must meet policy');

            result.phase='real-old-and-new';
            const real = [realIds.financing,realIds.opposition].map(id=>({...originals.find(a=>a.id===id)!}));
            assert.ok(real.every(a=>a.id));
            const old = structuredClone(real);
            const oldReview=await classifyWoodmontBatch(old,1,0,180000,{asOf:new Date(AS_OF),rubric:{version:'production-before-fix',systemPrompt:oldPrompt!}});
            const reviewed=await classifyWoodmontBatch(real,1,0,180000,{asOf:new Date(AS_OF)});
            result.realCases=real.map((a:any,i)=>({id:a.id,old:oldReview.classified===old.length?(old[i] as any)._woodmontApprove:null,
                new:a._woodmontApprove,version:a._woodmontRubricVersion})); save();
            assert.equal(reviewed.classified,2);
            assert.equal((real[0] as any)._woodmontApprove,true,'The valid regional financing story must survive');
            assert.equal((real[1] as any)._woodmontApprove,false,'Opposition-led coverage must remain rejected');

            const updated=structuredClone(originals);
            for (const a of real) Object.assign(updated.find(x=>x.id===a.id)!,editorialVerdictFields(a));
            if(provider.name==='Cerebras') {
                result.phase='reconsider-legacy-rejections';
                const candidates=getEditorialReviewCandidates(updated).filter((a:any)=>!sent.has(a.id)
                    && a._woodmontApprove===false && a._woodmontRubricVersion!==WOODMONT_RUBRIC_VERSION
                    && Date.parse(a.pubDate||'')>=Date.parse(AS_OF)-30*86400000);
                result.reconsideration=await classifyWoodmontBatch(candidates,1,0,240000,{asOf:new Date(AS_OF)});
                result.reconsideration.eligible=candidates.length;
            }
            result.phase='summary-generation';
            const summaries:any[]=[
                {id:'summary-abbreviation',title:'Example Buyer buys 160K SF industrial warehouse in Edison, New Jersey',description:'',source:'Example Publication',link:'https://example.test/summary-one',pubDate:AS_OF},
                {id:'summary-million',title:'Example Builder breaks ground on a 1 Million-Square-Foot New Jersey logistics park',description:'',source:'Example Publication',link:'https://example.test/summary-two',pubDate:AS_OF},
            ];
            await generateDescriptions(summaries);
            result.summaries=summaries.map((a:any,i)=>({id:a.id,generated:!!a.description,
                correctSize:summaryQuantities(a.description).some(q=>q.unit==='sf' && q.value===[160000,1000000][i]),
                noAgeWarning:!/(earlier development|old news|stale|this newsletter is old)/i.test(a.description)}));
            assert.ok(result.summaries.every((a:any)=>a.generated && a.correctSize && a.noAgeWarning),'Actual accepted summaries must retain supported size without age commentary');

            result.phase='render-real-pool';
            const docs=path.join(root,provider.name); fs.cpSync(input,docs,{recursive:true});
            writeEditorialFeed(updated,path.join(docs,'feed.json'));
            const stored=read(path.join(docs,'feed.json')).items;
            assert.equal(stored.find((a:any)=>a.id===realIds.financing)._woodmontRubricVersion,WOODMONT_RUBRIC_VERSION);
            result.email=replay(docs,process.cwd(),provider.name);
            assert.ok(result.email.renderedIds.includes(realIds.financing));
            assert.ok(result.email.sections.relevant.includes(realIds.construction));
            assert.ok(!result.email.renderedIds.includes(realIds.opposition));
            assert.ok(!result.email.renderedIds.includes(realIds.smallListing));
            assert.ok(!result.email.renderedIds.includes(realIds.oppositionFallback));
            assert.equal(result.email.networkRequests,0);
            result.phase='complete';result.success=true;
        } catch { result.error='VERIFICATION_FAILED: inspect sanitized decisions and counts'; }
        save(); console.log(JSON.stringify(result));
    }
    assert.ok(report.providers.length===2 && report.providers.every((p:any)=>p.success),'Both providers must pass independently');
    console.log('PASS: both providers, supported summaries, corrected real verdicts and full-pool offline email replays');
}
main().catch(()=>{console.error('Newsletter quality verification incomplete; see sanitized result.json');process.exitCode=1;}).finally(()=>{
    globalThis.fetch=realFetch;
    for(const [key,value] of Object.entries(keys)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
    save();
    const modules=path.join(baseline,'node_modules');if(fs.existsSync(modules)&&fs.lstatSync(modules).isSymbolicLink())fs.unlinkSync(modules);
    if(fs.existsSync(path.join(baseline,'.git')))try{execFileSync('git',['worktree','remove','--force',baseline],{stdio:'pipe'});}catch{}
    fs.rmSync(root,{recursive:true,force:true});
});
