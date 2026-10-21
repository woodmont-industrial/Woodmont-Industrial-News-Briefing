import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

const repo = process.cwd();
const docs = path.join(repo, 'docs');
const targetId = '54d72d5316e4ac01ebf45df8de17f5728d16cf0d';
const frozenAt = '2026-10-22T12:00:20.000Z';
const RealDate = Date;
let frozenMillis = RealDate.parse(frozenAt);
class FrozenDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) super(frozenMillis);
        else super(...args);
    }
    static now() { return frozenMillis; }
}
globalThis.Date = FrozenDate;

for (const key of Object.keys(process.env)) {
    if (/(SMTP|WEBHOOK|CEREBRAS|GROQ|API_KEY|PASSWORD|SECRET|RECIPIENT|EMAIL_TO|EMAIL_FROM|TOKEN)/i.test(key)) delete process.env[key];
}
process.env.DRY_RUN = '1';
process.env.EMAIL_TO = 'dry-run@example.invalid';
process.env.NEWSLETTER_RECIPIENTS = 'dry-run@example.invalid';
process.env.TRIGGER_EVENT = 'repository_dispatch';

let networkAttempts = 0;
const blockNetwork = () => {
    networkAttempts++;
    throw new Error('The non-sending replay forbids network access.');
};
globalThis.fetch = async () => blockNetwork();
for (const mod of [http, https]) {
    mod.request = blockNetwork;
    mod.get = blockNetwork;
}
net.connect = blockNetwork;
net.createConnection = blockNetwork;
net.Socket.prototype.connect = blockNetwork;
tls.connect = blockNetwork;
syncBuiltinESMExports();

function fingerprint(dir) {
    const hash = createHash('sha256');
    function visit(current) {
        for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(current, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (entry.isFile()) {
                hash.update(path.relative(dir, file));
                hash.update(fs.readFileSync(file));
            }
        }
    }
    visit(dir);
    return hash.digest('hex');
}
const sourceFingerprint = fingerprint(docs);
const queue = JSON.parse(fs.readFileSync(path.join(docs, 'included-articles.json'), 'utf8'));
const target = queue.articles.find(a => a.id === targetId && a.category === 'people');
assert.ok(target, 'The requested article must be queued on the tested main snapshot.');
const originalSent = JSON.parse(fs.readFileSync(path.join(docs, 'sent-articles.json'), 'utf8'));
assert.ok(!originalSent.sent.some(a => a.id === targetId), 'The requested article must not already be sent.');

const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'people-replay-'));
const emailModule = await import('../src/server/email.ts');
const tracerModule = await import('../src/server/send-tracer.ts');
const sendDailyNewsletterWork = emailModule.sendDailyNewsletterWork || emailModule.default?.sendDailyNewsletterWork;
const SendTracer = tracerModule.SendTracer || tracerModule.default?.SendTracer;
const setActiveTracer = tracerModule.setActiveTracer || tracerModule.default?.setActiveTracer;
assert.equal(typeof sendDailyNewsletterWork, 'function');
const results = [];

function stage(label, removeFromFeed) {
    const dir = path.join(root, label);
    fs.cpSync(docs, dir, { recursive: true });
    if (removeFromFeed) {
        const file = path.join(dir, 'feed.json');
        const feed = JSON.parse(fs.readFileSync(file, 'utf8'));
        const before = feed.items.length;
        feed.items = feed.items.filter(a => a.id !== targetId);
        assert.ok(feed.items.length < before, 'The negative-input replay must actually remove the target from the feed.');
        fs.writeFileSync(file, JSON.stringify(feed));
    }
    return dir;
}

async function runCase(label, dir, expectTarget, instant = frozenAt) {
    frozenMillis = RealDate.parse(instant);
    process.env.WOODMONT_DOCS_DIR = dir;
    const tracer = new SendTracer();
    setActiveTracer(tracer);
    const logs = [];
    const oldLog = console.log;
    const oldWarn = console.warn;
    const oldError = console.error;
    const capture = (...args) => logs.push(args.map(String).join(' '));
    console.log = capture;
    console.warn = capture;
    console.error = capture;
    let success;
    try { success = await sendDailyNewsletterWork(); }
    finally {
        console.log = oldLog;
        console.warn = oldWarn;
        console.error = oldError;
        setActiveTracer(null);
    }
    const archive = path.join(dir, 'newsletter-archive', instant.slice(0, 10) + '.html');
    const html = fs.existsSync(archive) ? fs.readFileSync(archive, 'utf8') : '';
    const heading = /<h2\b[^>]*>\s*People News\s*<\/h2>/i.exec(html);
    const rest = heading ? html.slice(heading.index + heading[0].length) : '';
    const listEnd = rest.indexOf('</ul>');
    const people = listEnd >= 0 ? rest.slice(0, listEnd + 5) : '';
    const inPeople = people.includes(target.title.slice(0, 45));
    const trace = tracer.getByKey({ id: targetId });
    const finalTrace = Boolean(trace?.category === 'people' && trace.events.some(e => e.stage === 'presentBeforeHTML'));
    const queued = JSON.parse(fs.readFileSync(path.join(dir, 'included-articles.json'), 'utf8')).articles;
    const sent = JSON.parse(fs.readFileSync(path.join(dir, 'sent-articles.json'), 'utf8'));
    const suppressed = logs.some(line => line.includes('DRY_RUN: suppressing send'));
    if (expectTarget) {
        assert.equal(success, true, logs.slice(-12).join('\n'));
        assert.equal(suppressed, true, 'The real send function must report delivery suppression.');
        assert.equal(inPeople, true, 'The target must be in People in the final dated HTML.');
        assert.equal(finalTrace, true, 'The real pipeline must trace the target into People before HTML.');
        assert.ok(sent.sent.some(a => a.id === targetId), 'Only the isolated sent-state must record the target.');
    } else {
        assert.equal(inPeople, false, 'An already-consumed target must not repeat the next day.');
        assert.ok(!trace?.events.some(e => e.stage === 'presentBeforeHTML'), 'The repeat must not reach final rendering.');
    }
    assert.equal(queued.some(a => a.id === targetId), false, 'The isolated inclusion queue must be consumed.');
    assert.equal(networkAttempts, 0, 'There must be zero network attempts.');
    const sections = {};
    for (const t of tracer.all().filter(t => t.events.some(e => e.stage === 'presentBeforeHTML'))) {
        (sections[t.category] ||= []).push(t.title);
    }
    const result = {
        case: label, frozenAt: instant, completed: success,
        inPeople, tracedToPeople: finalTrace, deliverySuppressed: suppressed,
        queueConsumed: true, networkAttempts,
        queueMergeLog: logs.filter(line => /Merged \d+\/\d+ manually included/.test(line)),
        articles: sections,
    };
    results.push(result);
    oldLog('REPLAY_RESULT ' + JSON.stringify(result));
}

try {
    await runCase('normal-feed', stage('normal-feed', false), true);
    const missingDir = stage('queue-only', true);
    await runCase('feed-missing-target', missingDir, true);
    await runCase('following-day-no-repeat', missingDir, false, '2026-10-23T12:00:20.000Z');
    assert.equal(fingerprint(docs), sourceFingerprint, 'Repository docs must remain byte-identical.');
    const currentQueue = JSON.parse(fs.readFileSync(path.join(docs, 'included-articles.json'), 'utf8'));
    assert.ok(currentQueue.articles.some(a => a.id === targetId), 'The production inclusion queue must remain present.');
    const currentSent = JSON.parse(fs.readFileSync(path.join(docs, 'sent-articles.json'), 'utf8'));
    assert.ok(!currentSent.sent.some(a => a.id === targetId), 'Production sent-state must remain untouched.');
    const summary = [
        '## Non-sending People verification',
        '',
        '- Production snapshot: 86294b7b89be655c1cfebb3275d162a6264bf580.',
        '- Frozen send: Thursday October 22, 2026, 8:00 AM America/New_York.',
        '- Requested article: ' + target.title,
        '- Normal feed: present in final People HTML.',
        '- Removed from feed: queue restores it to final People HTML.',
        '- Following day: the consumed item does not repeat.',
        '- No network access or actual delivery; repository docs and live queue unchanged.',
        '',
        'The current feed is a frozen input; this does not predict the volume after tomorrow morning\'s build.',
    ].join('\n');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
    console.log('PASS: both inclusion routes, no repeated target, zero network attempts, production state unchanged.');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    globalThis.Date = RealDate;
    fs.rmSync(root, { recursive: true, force: true });
}
