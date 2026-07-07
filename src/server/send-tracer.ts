/**
 * SendTracer — per-article, stage-by-stage trace of a newsletter send.
 *
 * Populated by the REAL pipeline (sendDailyNewsletterWork) at each stage boundary, so a
 * trace reflects exactly what the live code did — not a reconstruction. It is a no-op in
 * production: the pipeline only touches it when a tracer has been installed via
 * setActiveTracer(), which only the dry-run replay harness does.
 *
 * The main hook is `diff(before, after, stage)`: given the article arrays immediately
 * before and after a stage, it records which articles were DROPPED at that stage. Combined
 * with explicit `mark()` calls (loaded, pool, routed, present-before-HTML, in-HTML) this
 * yields a full lifecycle per article without duplicating any filtering logic.
 */

export type TraceVerdict = 'pass' | 'drop' | 'add' | 'info';
export interface TraceEvent { stage: string; verdict: TraceVerdict; detail?: string; }
export interface ArticleTrace { id: string; title: string; category?: string; events: TraceEvent[]; }

function keyOf(a: any): string {
    return String(a?.id || a?.link || a?.url || a?.title || '');
}

export class SendTracer {
    private traces = new Map<string, ArticleTrace>();

    private ensure(a: any): ArticleTrace {
        const k = keyOf(a);
        let t = this.traces.get(k);
        if (!t) { t = { id: k, title: a?.title || '', category: a?.category, events: [] }; this.traces.set(k, t); }
        if (a?.category) t.category = a.category; // category can change (e.g. routed → relevant)
        return t;
    }

    /** Record one event for one article. */
    mark(a: any, stage: string, verdict: TraceVerdict, detail?: string): void {
        this.ensure(a).events.push({ stage, verdict, detail });
    }

    /** Record the same event for many articles. */
    markMany(arr: any[], stage: string, verdict: TraceVerdict, detail?: string): void {
        for (const a of arr || []) this.mark(a, stage, verdict, detail);
    }

    /** Record which of `before` were dropped by a stage (absent from `after`). */
    diff(before: any[], after: any[], stage: string, detail?: string): void {
        const afterKeys = new Set((after || []).map(keyOf));
        for (const a of before || []) if (!afterKeys.has(keyOf(a))) this.mark(a, stage, 'drop', detail);
    }

    getByKey(a: any): ArticleTrace | undefined { return this.traces.get(keyOf(a)); }
    all(): ArticleTrace[] { return [...this.traces.values()]; }

    /** Traces whose title matches a substring (case-insensitive) — for spotlighting specific deals. */
    find(substr: string): ArticleTrace[] {
        const s = substr.toLowerCase();
        return this.all().filter(t => t.title.toLowerCase().includes(s));
    }

    /** Compact one-line summary of an article's lifecycle. */
    static summarize(t: ArticleTrace): string {
        const seq = t.events.map(e => e.verdict === 'drop' ? `✗${e.stage}` : e.verdict === 'add' ? `+${e.stage}` : e.stage + (e.detail ? `(${e.detail})` : '')).join(' → ');
        return `[${t.category || '?'}] ${t.title.slice(0, 60)}\n     ${seq}`;
    }
}

// ---- Module-level active tracer (null in prod → zero overhead) --------------------
let active: SendTracer | null = null;
export function setActiveTracer(t: SendTracer | null): void { active = t; }
export function getActiveTracer(): SendTracer | null { return active; }
