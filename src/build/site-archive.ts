/**
 * Website-only article archive (docs/archive.json).
 *
 * feed.json keeps 31 days because the newsletter reads it. The website wants a
 * longer history to browse, so each build folds the current feed into a
 * separate archive that keeps 90 days. It starts from the current feed and
 * grows one build at a time. Nothing in the newsletter, build selection or
 * send path reads this file (see site-archive-isolation.test.ts).
 *
 * Records hold public article metadata only: no pipeline or AI reasoning
 * fields, no ownership or research enrichment. validateArchiveItem enforces
 * that on every write, and a failed validation leaves the previous file in
 * place rather than publishing anything partial.
 */
import * as fs from 'fs';
import * as path from 'path';
import { isNonArticlePage } from '../feeds/link-validation.js';
import { normalizeTitle } from '../shared/url-utils.js';

export const SITE_ARCHIVE_DAYS = 90;

/** Public article metadata the site shows; anything else is dropped on the way in */
export interface ArchiveItem {
    id: string;
    url: string;
    title: string;
    date_published: string;
    date_modified?: string;
    summary?: string;
    content_text?: string;
    image?: string;
    author?: { name: string };
    category?: string;
    tags?: string[];
}

export const ARCHIVE_FIELDS: readonly (keyof ArchiveItem)[] = [
    'id', 'url', 'title', 'date_published', 'date_modified', 'summary',
    'content_text', 'image', 'author', 'category', 'tags',
];
const SITE_CATEGORIES = new Set(['relevant', 'transactions', 'availabilities', 'people']);
const TEXT_LIMIT = 600;

export interface ArchiveExclusions {
    ids: Set<string>;
    urls: Set<string>;
    titles: Set<string>;
}

const isHttpUrl = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
};
const text = (value: unknown, limit = TEXT_LIMIT): string | undefined =>
    typeof value === 'string' && value.trim() ? value.slice(0, limit) : undefined;

// Capital Markets enrichment appends ownership metadata to an article's text and marks it
// with _cmEnrichment (src/server/capital-markets-enrichment.ts). Such an item is refused
// whole: dropping the marker alone would keep the enriched text.
const ENRICHMENT_MARKER = /^_cm/i;
export const hasEnrichment = (source: Record<string, any>): boolean => Object.keys(source).some(k => ENRICHMENT_MARKER.test(k));

/** Copy only the approved public fields from a feed item; null if it is not a publishable article */
export function toArchiveItem(source: Record<string, any>): ArchiveItem | null {
    if (!source || hasEnrichment(source)) return null;
    if (typeof source.id !== 'string' || !text(source.title) || !isHttpUrl(source.url)) return null;
    const published = new Date(source.date_published || 0);
    if (isNaN(published.getTime()) || published.getTime() === 0) return null;
    const category = String(source.category || 'relevant').toLowerCase();
    if (!SITE_CATEGORIES.has(category)) return null;
    const item: ArchiveItem = {
        id: source.id,
        url: source.url,
        title: text(source.title, 300)!,
        date_published: published.toISOString(),
        category,
    };
    const modified = new Date(source.date_modified || 0);
    if (!isNaN(modified.getTime()) && modified.getTime() > 0) item.date_modified = modified.toISOString();
    const summary = text(source.summary);
    if (summary) item.summary = summary;
    const body = text(source.content_text);
    if (body) item.content_text = body;
    if (isHttpUrl(source.image)) item.image = source.image;
    const authorName = text(typeof source.author === 'string' ? source.author : source.author?.name, 120);
    if (authorName) item.author = { name: authorName };
    if (Array.isArray(source.tags)) {
        const tags = source.tags.filter((t: unknown) => typeof t === 'string').map((t: string) => t.slice(0, 80)).slice(0, 10);
        if (tags.length) item.tags = tags;
    }
    return item;
}

/** Throws if a record carries anything beyond the approved public fields */
export function validateArchiveItem(item: Record<string, any>): void {
    const extra = Object.keys(item).filter(k => !(ARCHIVE_FIELDS as readonly string[]).includes(k));
    if (extra.length) throw new Error(`archive record ${item.id} has unapproved fields: ${extra.join(', ')}`);
    if (typeof item.id !== 'string' || typeof item.title !== 'string' || !isHttpUrl(item.url)) {
        throw new Error(`archive record ${item.id} is missing id, title or url`);
    }
    if (item.author !== undefined && (typeof item.author !== 'object' || Object.keys(item.author).some(k => k !== 'name'))) {
        throw new Error(`archive record ${item.id} has an unapproved author shape`);
    }
    if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some((t: unknown) => typeof t !== 'string'))) {
        throw new Error(`archive record ${item.id} has non-text tags`);
    }
}

const itemTime = (item: ArchiveItem): number => new Date(item.date_published).getTime() || 0;

/**
 * Fold the current feed into the archive. Current feed items replace archived
 * copies (they carry the latest classification); archived items stay until
 * they are older than the retention window, excluded by the user, or turn out
 * to be non-article pages.
 */
export function mergeSiteArchive(
    archived: Record<string, any>[],
    feedItems: Record<string, any>[],
    now: Date,
    exclusions: ArchiveExclusions,
    days = SITE_ARCHIVE_DAYS
): ArchiveItem[] {
    const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
    const byId = new Map<string, ArchiveItem>();
    for (const source of [...archived, ...feedItems]) {
        const item = toArchiveItem(source);
        if (item) byId.set(item.id, item);
    }
    const seenTitles = new Set<string>();
    return [...byId.values()]
        .filter(item => {
            if (itemTime(item) < cutoff) return false;
            const url = item.url.toLowerCase();
            if (exclusions.ids.has(item.id) || exclusions.urls.has(url)) return false;
            if (isNonArticlePage(item.url)) return false;
            const title = normalizeTitle(item.title);
            return !(title && exclusions.titles.has(title));
        })
        .sort((a, b) => itemTime(b) - itemTime(a))
        // The same story from two feeds keeps its newest copy
        .filter(item => {
            const title = normalizeTitle(item.title);
            if (!title) return true;
            if (seenTitles.has(title)) return false;
            seenTitles.add(title);
            return true;
        });
}

function loadExclusions(docsDir: string): ArchiveExclusions {
    const empty = { ids: new Set<string>(), urls: new Set<string>(), titles: new Set<string>() };
    try {
        const p = path.join(docsDir, 'excluded-articles.json');
        if (!fs.existsSync(p)) return empty;
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return {
            ids: new Set(data.excludedIds || []),
            urls: new Set((data.excludedUrls || []).map((u: string) => u.toLowerCase())),
            titles: new Set((data.excludedTitles || []).map((t: string) => normalizeTitle(t))),
        };
    } catch {
        return empty;
    }
}

/**
 * Validate every record, then replace the file in one step. Any invalid record
 * throws before anything is written, so the previously published archive stays.
 */
export function writeArchiveFile(file: string, items: Record<string, any>[], now = new Date()): void {
    const problems: string[] = [];
    for (const item of items) {
        try { validateArchiveItem(item); } catch (e) { problems.push((e as Error).message); }
    }
    if (problems.length) {
        throw new Error(`${problems.length} invalid archive record(s); archive.json left unchanged. First: ${problems[0]}`);
    }
    const body = JSON.stringify({
        version: 1,
        description: `Website archive: up to ${SITE_ARCHIVE_DAYS} days of public feed article metadata. Not read by the newsletter.`,
        updatedAt: now.toISOString(),
        retentionDays: SITE_ARCHIVE_DAYS,
        items,
    }) + '\n';
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, body, 'utf8');
    fs.renameSync(tmp, file);
}

/** Read docs/archive.json, fold in this build's feed items, validate, write it back */
export function writeSiteArchive(docsDir: string, feedItems: Record<string, any>[], now = new Date()): { count: number; oldest: string | null } {
    const file = path.join(docsDir, 'archive.json');
    let archived: Record<string, any>[] = [];
    if (fs.existsSync(file)) {
        // An unreadable archive is an error, not an empty one: starting over would silently drop history
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (!parsed || !Array.isArray(parsed.items)) throw new Error('archive.json has no items array; left unchanged');
        archived = parsed.items;
    }
    const items = mergeSiteArchive(archived, feedItems, now, loadExclusions(docsDir));
    writeArchiveFile(file, items, now);
    return { count: items.length, oldest: items.length ? items[items.length - 1].date_published : null };
}
