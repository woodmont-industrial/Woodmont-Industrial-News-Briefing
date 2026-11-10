/**
 * Website-only article archive (docs/archive.json).
 *
 * feed.json keeps 31 days because the newsletter reads it. The website wants a
 * longer history to browse, so each build folds the current feed into a
 * separate archive that keeps 90 days. Nothing in the newsletter, build
 * selection or send path reads this file.
 */
import * as fs from 'fs';
import * as path from 'path';
import { isNonArticlePage } from '../feeds/link-validation.js';
import { normalizeTitle } from '../shared/url-utils.js';

export const SITE_ARCHIVE_DAYS = 90;

/** A JSON Feed item as written to feed.json; only the fields the site reads are kept */
export type ArchiveItem = Record<string, any> & { id: string; url?: string; title?: string; date_published?: string };

export interface ArchiveExclusions {
    ids: Set<string>;
    urls: Set<string>;
    titles: Set<string>;
}

const DROP_FIELDS = ['content_html', '_source'];
const HIDDEN_CATEGORIES = new Set(['exclude', 'excluded', 'not relevant', 'blacklisted']);

const itemTime = (item: ArchiveItem): number => new Date(item.date_published || item.date_modified || 0).getTime() || 0;

/**
 * Fold the current feed into the archive. Current feed items replace archived
 * copies (they carry the latest classification); archived items stay until
 * they are older than the retention window, excluded by the user, or turn out
 * to be non-article pages.
 */
export function mergeSiteArchive(
    archived: ArchiveItem[],
    feedItems: ArchiveItem[],
    now: Date,
    exclusions: ArchiveExclusions,
    days = SITE_ARCHIVE_DAYS
): ArchiveItem[] {
    const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
    const byId = new Map<string, ArchiveItem>();
    for (const item of [...archived, ...feedItems]) {
        if (!item || !item.id || !item.title) continue;
        const slim: ArchiveItem = { ...item };
        for (const f of DROP_FIELDS) delete slim[f];
        byId.set(item.id, slim);
    }
    const seenTitles = new Set<string>();
    return [...byId.values()]
        .filter(item => {
            const t = itemTime(item);
            if (!t || t < cutoff) return false;
            if (HIDDEN_CATEGORIES.has(String(item.category || '').toLowerCase())) return false;
            const url = (item.url || '').toLowerCase();
            if (exclusions.ids.has(item.id) || (url && exclusions.urls.has(url))) return false;
            if (url && isNonArticlePage(item.url!)) return false;
            const title = normalizeTitle(item.title || '');
            return !(title && exclusions.titles.has(title));
        })
        .sort((a, b) => itemTime(b) - itemTime(a))
        // The same story from two feeds keeps its newest copy
        .filter(item => {
            const title = normalizeTitle(item.title || '');
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

/** Read docs/archive.json, fold in this build's feed items, write it back. Returns the item count. */
export function writeSiteArchive(docsDir: string, feedItems: ArchiveItem[], now = new Date()): number {
    const file = path.join(docsDir, 'archive.json');
    let archived: ArchiveItem[] = [];
    try {
        if (fs.existsSync(file)) archived = JSON.parse(fs.readFileSync(file, 'utf-8')).items || [];
    } catch {
        archived = [];
    }
    const items = mergeSiteArchive(archived, feedItems, now, loadExclusions(docsDir));
    fs.writeFileSync(file, JSON.stringify({
        version: 1,
        description: `Website archive: the last ${SITE_ARCHIVE_DAYS} days of feed articles. Not read by the newsletter.`,
        updatedAt: now.toISOString(),
        retentionDays: SITE_ARCHIVE_DAYS,
        items,
    }) + '\n', 'utf8');
    return items.length;
}
