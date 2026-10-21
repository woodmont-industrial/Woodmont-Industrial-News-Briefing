/** Offline real-pipeline replay. Only counts, IDs and rendering checks leave scratch. */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';

async function main() {
    const [input, output, asOf = '2026-10-22T12:00:20Z'] = process.argv.slice(2);
    assert.ok(input && output, 'Usage: replay-editorial-email.ts <scratch-input-docs> <result.json> [instant]');
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-email-'));
    const log = console.log;
    let requests = 0;
    try {
        fs.cpSync(input, scratch, { recursive: true });
        for (const key of Object.keys(process.env)) {
            if (/API_KEY|SMTP|WEBHOOK|EMAIL_TO|NEWSLETTER_RECIPIENTS/.test(key)) delete process.env[key];
        }
        Object.assign(process.env, { WOODMONT_DOCS_DIR: scratch, DRY_RUN: '1', TRIGGER_EVENT: 'workflow_run',
            EMAIL_TO: 'offline@example.invalid', NEWSLETTER_RECIPIENTS: 'offline@example.invalid', TZ: 'America/New_York' });
        const block = () => { requests++; throw new Error('Network is disabled in the offline replay'); };
        globalThis.fetch = block;
        for (const transport of [http, https]) { transport.request = block; transport.get = block; }
        net.connect = block; net.createConnection = block; tls.connect = block;
        syncBuiltinESMExports();
        const RealDate = Date;
        const instant = Date.parse(asOf);
        assert.ok(Number.isFinite(instant));
        (globalThis as any).Date = class extends RealDate {
            constructor(...args: any[]) { super(...(args.length ? args : [instant]) as [any]); }
            static now() { return instant; }
        };
        // Production logs contain article text; do not expose the private candidate pool in CI.
        console.log = console.warn = console.error = () => {};
        const moduleAt = (file: string) => import(pathToFileURL(path.resolve(file)).href);
        const { SendTracer, setActiveTracer } = await moduleAt('src/server/send-tracer.ts');
        const { escapeHtml } = await moduleAt('src/shared/html-escape.ts');
        const { sendDailyNewsletterWork } = await moduleAt('src/server/email.ts');
        const tracer = new SendTracer(); setActiveTracer(tracer);
        assert.equal(await sendDailyNewsletterWork(), true, 'the real pipeline must produce a dry-run archive');
        const html = fs.readFileSync(path.join(scratch, 'newsletter-archive/latest.html'), 'utf8');
        const metadata = JSON.parse(fs.readFileSync(path.join(scratch, 'newsletter-archive/latest.json'), 'utf8'));
        const diagnostics = JSON.parse(fs.readFileSync(path.join(scratch, 'diagnostics/latest.json'), 'utf8'));
        const traces = tracer.all();
        const picked = traces.filter((trace: any) => trace.events.some((event: any) => event.stage === 'presentBeforeHTML'));
        const names: Record<string, string> = { relevant: 'Relevant Articles', transactions: 'Transactions',
            availabilities: 'Availabilities', people: 'People News' };
        const sectionHtml = (category: string) => html.split(`<!-- ${names[category]} -->`)[1]?.split('<!--')[0] || '';
        const sections = Object.fromEntries(Object.keys(names).map(category => [category,
            picked.filter((trace: any) => trace.category === category).map((trace: any) => trace.id).sort()]));
        const rendered = picked.filter((trace: any) => sectionHtml(trace.category).includes(escapeHtml(trace.title)));
        const result = { frozenNowUtc: asOf, dryRun: true, networkRequests: requests,
            articleCount: metadata.articleCount, score: metadata.score,
            editorialScore: diagnostics.quality?.editorialQualityScore, sections,
            renderedIds: rendered.map((trace: any) => trace.id).sort(),
            stages: Object.fromEntries(traces.filter((trace: any) => trace.id !== '__HTML__').map((trace: any) =>
                [trace.id, trace.events.filter((event: any) => event.verdict === 'add').map((event: any) => event.stage)])),
        };
        assert.equal(requests, 0, 'no network or delivery transport may be called');
        assert.equal(result.renderedIds.length, picked.length, 'every selected article must appear in the correct HTML section');
        fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
        log(`PASS: offline email rendered ${picked.length} articles; zero network requests`);
    } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}
main().catch(() => { process.stderr.write('Offline email replay failed; no delivery was attempted.\n'); process.exitCode = 1; });
