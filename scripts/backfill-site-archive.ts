/**
 * One-off: seed docs/archive.json from saved feed.json snapshots (one per day,
 * e.g. extracted with `git show <commit>:docs/feed.json`). Older snapshots were
 * built under older rules, so every item is re-checked with today's region and
 * non-article filters before it enters the archive.
 *
 * Usage: node --import tsx scripts/backfill-site-archive.ts <snapshot-dir>
 */
import * as fs from 'fs';
import * as path from 'path';
import { mergeSiteArchive, writeSiteArchive, ArchiveItem } from '../src/build/site-archive.js';
import { isTargetRegion, isNotExcludedRegion, postDescriptionRegionCheck } from '../src/server/newsletter-filters.js';
import { TARGET_REGIONS, MAJOR_EXCLUDE_REGIONS, INTERNATIONAL_EXCLUDE } from '../src/shared/region-data.js';

const dir = process.argv[2];
if (!dir) throw new Error('usage: backfill-site-archive.ts <snapshot-dir>');
const docsDir = path.join(process.cwd(), 'docs');

// Same gate as the build's region filter in static.ts
const passesRegion = (item: ArchiveItem): boolean => {
    const a = { ...item, link: item.url, description: item.content_text || item.summary || '' } as any;
    const text = (a.title + ' ' + a.description).toUpperCase();
    if (INTERNATIONAL_EXCLUDE.some((term: string) => text.includes(term))) return false;
    if (MAJOR_EXCLUDE_REGIONS.some((r: string) => text.includes(r)) && !TARGET_REGIONS.some((r: string) => text.includes(r))) return false;
    return postDescriptionRegionCheck(a) && (isTargetRegion(a) || isNotExcludedRegion(a));
};

const byId = new Map<string, ArchiveItem>();
let dropped = 0;
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    const items: ArchiveItem[] = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')).items || [];
    for (const item of items) {
        if (!passesRegion(item)) { dropped++; continue; }
        byId.set(item.id, item);
    }
}
const empty = { ids: new Set<string>(), urls: new Set<string>(), titles: new Set<string>() };
const seed = mergeSiteArchive([], [...byId.values()], new Date(), empty);
fs.writeFileSync(path.join(docsDir, 'archive.json'), JSON.stringify({ items: seed }));
// Re-run through the normal writer so exclusions and the file format match the build
const current = JSON.parse(fs.readFileSync(path.join(docsDir, 'feed.json'), 'utf-8')).items || [];
const count = writeSiteArchive(docsDir, current);
console.log(`archive.json: ${count} items (${dropped} snapshot items failed today's region checks)`);
