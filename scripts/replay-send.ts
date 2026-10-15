/**
 * Deterministic dry-run replay of a past production send.
 *
 * Reconstructs the EXACT run-time state — feed.json, sent-articles.json, reserve-pool.json,
 * scoring-weights.json, etc. pulled from the git commits that existed at send time — into a
 * temp docsDir, freezes the wall clock to the send timestamp, installs a per-article tracer,
 * and runs the REAL sendDailyNewsletterWork() with sendEmail stubbed (DRY_RUN). Nothing sends.
 *
 * The point: stop debugging with mutated post-run files and hopeful reconstructions. This runs
 * the actual pipeline code and reports where every article lived and died.
 *
 * LIMITATION (2026-07-21): the replay uses the FROZEN feed.json descriptions. Production may
 * REGENERATE/enrich descriptions at send time (AI). Gates that read the description — notably
 * People classification (applyPeopleFilter's people-action + industrial checks, and therefore
 * the post-backfill People rescue) — can decide DIFFERENTLY in production than in a frozen
 * replay. Example: "HPS Floors Elevates … Epoxy" stayed in Relevant in replay (title-only
 * description) but shipped in People in production (enriched description passed the filter).
 * When validating a description-sensitive change, ALSO add a unit test with a production-like
 * enriched description (see src/server/people-rescue.test.ts) — do not rely on frozen replay alone.
 *
 * Usage:  node --import tsx scripts/replay-send.ts [config.json]
 * With no arg it replays production run 28862837091 (2026-07-07).
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface ReplayConfig {
    runId: string;
    frozenNowUtc: string;
    inputs: Record<string, string>;   // docs-relative path -> git ref
    spotlight: string[];              // title substrings to trace in detail
    triggerEvent?: string;
}

const DEFAULT_CONFIG: ReplayConfig = {
    runId: '28862837091',
    frozenNowUtc: '2026-07-07T11:31:08Z',
    inputs: {
        'feed.json': 'f0be7e0',                       // build that fed the run (11:03 UTC)
        'sent-articles.json': '2f54a3d^',             // state the run READ (before it wrote)
        'preferences/reserve-pool.json': '0c8441a',   // reserve refresh (06:51 UTC)
        'scoring-weights.json': '2f54a3d^',
        'included-articles.json': '2f54a3d^',
        'excluded-articles.json': '2f54a3d^',
    },
    spotlight: [
        'Union City', 'Broward', '92,000-Square-Foot', 'Tampa industrial park',
        'DiLeo-Bram Negotiates $10.5', 'Fausto', 'Johnson & Johnson', 'Nike to lease warehouse in Bethlehem',
        'Dalfen', 'EQT Real Estate', 'Casio', 'data center tax credit', "data center 'pause'", 'Environmental groups push Pennsylvania',
    ],
};

const cfgArg = process.argv[2];
const cfg: ReplayConfig = cfgArg ? JSON.parse(fs.readFileSync(cfgArg, 'utf-8')) : DEFAULT_CONFIG;

function sh(cmd: string): string { return execSync(cmd, { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 }); }
function resolveRef(ref: string): string { return sh(`git rev-parse "${ref}"`).trim(); }

// ---- 1. Stage frozen inputs into a temp docsDir --------------------------------------
const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'wm-replay-'));
console.log(`🗂️  temp docsDir: ${tmpDocs}`);
for (const [rel, ref] of Object.entries(cfg.inputs)) {
    const sha = resolveRef(ref);
    const dest = path.join(tmpDocs, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
        const content = sh(`git show ${sha}:docs/${rel}`);
        fs.writeFileSync(dest, content);
        console.log(`   ✅ ${rel.padEnd(34)} ← ${ref} (${sha.slice(0, 8)})`);
    } catch {
        console.log(`   ⚠️  ${rel.padEnd(34)} ← ${ref}  NOT FOUND at that ref — pipeline will use defaults`);
    }
}

// ---- 2. Freeze the wall clock to the send timestamp ----------------------------------
const RealDate = Date;
const FROZEN = new RealDate(cfg.frozenNowUtc).getTime();
class FrozenDate extends RealDate {
    constructor(...args: any[]) { if (args.length === 0) super(FROZEN); else super(...(args as [any])); }
    static now() { return FROZEN; }
}
(globalThis as any).Date = FrozenDate;
console.log(`🕐 clock frozen to ${cfg.frozenNowUtc}`);

// ---- 3. Environment: frozen docsDir + dry-run ----------------------------------------
process.env.WOODMONT_DOCS_DIR = tmpDocs;
process.env.DRY_RUN = '1';
process.env.TRIGGER_EVENT = cfg.triggerEvent || 'workflow_run';
process.env.NEWSLETTER_RECIPIENTS = process.env.NEWSLETTER_RECIPIENTS || 'replay@example.com';
process.env.EMAIL_TO = process.env.EMAIL_TO || 'replay@example.com';

// ---- 4. Install tracer + run the REAL pipeline ---------------------------------------
async function main() {
const outputDir = process.env.REPLAY_OUTPUT_DIR ? path.resolve(process.env.REPLAY_OUTPUT_DIR) : null;
if (outputDir && (outputDir === path.resolve('docs') || outputDir.startsWith(path.resolve('docs') + path.sep))) {
    throw new Error('Review output must be outside production docs');
}
const summaryBatches: Array<{ generated: number; requested: number }> = [];
const requests: Array<{ model: string; status: number }> = [];
const originalLog = console.log;
const originalFetch = globalThis.fetch;
if (outputDir) {
    console.log = (...args: any[]) => {
        const match = /\[AI Desc\] Generated (\d+)\/(\d+) descriptions/.exec(args.map(String).join(' '));
        if (match) summaryBatches.push({ generated: Number(match[1]), requested: Number(match[2]) });
        originalLog(...args);
    };
    globalThis.fetch = async (url, init) => {
        const target = new URL(String(url));
        if (process.env.DRY_RUN !== '1' || target.origin !== 'https://api.groq.com'
            || target.pathname !== '/openai/v1/chat/completions' || init?.method !== 'POST') {
            throw new Error('Review permits only Groq classification and summary requests');
        }
        if (requests.length >= 80) throw new Error('Review request budget exhausted');
        const record = { model: JSON.parse(String(init.body || '{}')).model || '', status: 0 };
        requests.push(record);
        const response = await originalFetch(url, init);
        record.status = response.status;
        return response;
    };
}
const { SendTracer, setActiveTracer } = await import('../src/server/send-tracer.js');
const { sendDailyNewsletterWork } = await import('../src/server/email.js');
const tracer = new SendTracer();
setActiveTracer(tracer);

console.log(`\n▶️  replaying run ${cfg.runId} …\n${'─'.repeat(70)}`);
await sendDailyNewsletterWork();
console.log(`${'─'.repeat(70)}\n`);

// ---- 5a. Surface the quality penalties (for auditing leaks/dupes in the replay) ------
try {
    const q = JSON.parse(fs.readFileSync(path.join(tmpDocs, 'diagnostics', 'latest.json'), 'utf-8')).quality;
    if (q?.penalties?.length) {
        console.log('\n⚠️  quality penalties this run:');
        for (const p of q.penalties) console.log(`     -${p.points} ${p.type}: ${p.detail || ''}`);
    }
    if (q?.notes?.length) q.notes.forEach((n: string) => console.log(`     note: ${n}`));
    // Audit: how often the LLM rubric was overridden (advisory) per section.
    const diag = JSON.parse(fs.readFileSync(path.join(tmpDocs, 'diagnostics', 'latest.json'), 'utf-8'));
    for (const s of ['availabilities', 'people']) {
        const n = diag.sections?.[s]?.rejectionReasons?.RUBRIC_ADVISORY_BYPASS || 0;
        if (n) console.log(`     🔎 audit: rubric advisory-bypassed ${n} ${s} candidate(s) (LLM said no, deterministic gates said yes)`);
    }
} catch { /* diagnostics optional */ }

// ---- 5. Determine what actually made the archived HTML -------------------------------
let html = '';
try { html = fs.readFileSync(path.join(tmpDocs, 'newsletter-archive', 'latest.html'), 'utf-8'); } catch { /* held */ }
const inHtml = (t: any) => {
    if (!html) return false;
    const title = (t.title || '').trim();
    return title.length > 12 && html.includes(title.slice(0, Math.min(title.length, 40)));
};

// ---- 6. Report -----------------------------------------------------------------------
console.log(`📦 archived HTML: ${html ? html.length + ' bytes' : 'NONE (send held)'}\n`);
console.log('════════ PER-DEAL LIFECYCLE ════════');
for (const needle of cfg.spotlight) {
    const hits = tracer.find(needle);
    if (!hits.length) { console.log(`\n• "${needle}"  → not present in run-time feed.json at all`); continue; }
    const t = hits[0];
    console.log(`\n• ${t.title.slice(0, 66)}  [${t.category || '?'}]`);
    console.log(`    ${t.events.map(e => (e.verdict === 'drop' ? '✗' : e.verdict === 'add' ? '+' : '·') + e.stage + (e.detail ? `(${e.detail})` : '')).join(' → ')}`);
    // True final fate = the LAST event: shipped if in HTML, else the last drop/present state.
    const last = t.events[t.events.length - 1];
    const fate = inHtml(t) ? 'SHIPPED (in archived HTML)'
        : last.stage === 'presentBeforeHTML' ? 'reached buildWorkBriefing but NOT in final HTML'
        : last.verdict === 'drop' ? 'DROPPED at ' + last.stage
        : 'ended after ' + last.stage;
    console.log(`    ⇒ ${fate}`);
}

// ---- 7. Verify the replay reproduced the real send ----------------------------------
// Section items (the archive's articleCount) and Week-in-Review are DISJOINT blocks.
const inSections = (t: any) => t.events.some((e: any) => e.stage === 'presentBeforeHTML');
const inWiR = (t: any) => t.events.some((e: any) => e.stage === 'weekInReview');
const sectionItems = tracer.all().filter(inSections);
const wirItems = tracer.all().filter(inWiR);
console.log(`\n════════ REPLAY OUTPUT — articleCount ${sectionItems.length} (+ ${wirItems.length} Week-in-Review) ════════`);
for (const cat of ['relevant', 'transactions', 'availabilities', 'people']) {
    const items = sectionItems.filter(t => t.category === cat);
    console.log(`\n  ${cat.toUpperCase()} (${items.length}):`);
    items.forEach(t => console.log(`     • ${t.title.slice(0, 70)}`));
}
if (wirItems.length) {
    const distinct = new Set(wirItems.map(t => t.title.trim().toLowerCase()));
    console.log(`\n  WEEK-IN-REVIEW (${wirItems.length}, ${distinct.size} distinct):`);
    wirItems.forEach(t => console.log(`     • ${t.title.slice(0, 70)}`));
}

if (outputDir) {
    const diagnosticsPath = path.join(tmpDocs, 'diagnostics', 'latest.json');
    const quality = fs.existsSync(diagnosticsPath) ? JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8')).quality : null;
    fs.writeFileSync(path.join(tmpDocs, 'replay-review.json'), JSON.stringify({
        previewOnly: true, deliveryInvoked: false, frozenNowUtc: cfg.frozenNowUtc,
        triggerEvent: process.env.TRIGGER_EVENT, inputs: cfg.inputs,
        codeRef: process.env.GITHUB_SHA || resolveRef('HEAD'),
        summaryBatches, requests, quality,
        sections: sectionItems.map(({ id, title, category }) => ({ id, title, category })),
        spotlight: cfg.spotlight.map(needle => ({ needle, traces: tracer.find(needle) })),
    }, null, 2) + '\n');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.cpSync(tmpDocs, outputDir, { recursive: true });
    console.log('Review HTML and diagnostics saved; no delivery was invoked.');
}
console.log = originalLog;
globalThis.fetch = originalFetch;
fs.rmSync(tmpDocs, { recursive: true, force: true });
console.log('\n✅ replay complete (temp docsDir cleaned up)');
}

main().catch(e => { console.error('replay failed:', e); try { fs.rmSync(tmpDocs, { recursive: true, force: true }); } catch {} process.exit(1); });
