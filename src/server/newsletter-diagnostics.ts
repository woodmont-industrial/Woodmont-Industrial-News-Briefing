import * as fs from 'fs';
import * as path from 'path';
import { NormalizedItem } from '../types/index.js';

export const REASON_CODES = [
  'NO_TARGET_REGION_EVIDENCE','SOURCE_NOT_APPROVED','EXCLUDED_NON_TARGET_REGION','REGION_CONFLICT_WEAK_TARGET',
  'NO_STRONG_INDUSTRIAL_EVIDENCE','WRONG_ASSET_CLASS_OFFICE','WRONG_ASSET_CLASS_MULTIFAMILY','WRONG_ASSET_CLASS_RETAIL',
  'SECTION_RULE_FAILED','BELOW_SECTION_SCORE_FLOOR','STALE_RESERVE_ITEM','DUPLICATE_URL','DUPLICATE_SIGNATURE'
];

export function emptySectionDiag() {
  return {
    loaded: 0, inWindow: 0, regionPass: 0, industrialPass: 0, sectionPass: 0, dedupRemoved: 0, stalePruned: 0, selected: 0,
    rejectionReasons: Object.fromEntries(REASON_CODES.map(r => [r, 0])),
    nearMisses: [],
    tierFill: { tier1_24h: 0, tier2_48h: 0, tier3_72h: 0, tier4_7d: 0, tier5_reserve: 0, tier6_adjacent: 0 },
    underfilled: false,
    underfillReason: null as string | null,
  };
}

export function writeNewsletterDiagnostics(docsDir: string, payload: any) {
  if (!payload?.generatedAt || !payload?.runId || !payload?.sections) throw new Error('Invalid diagnostics payload');
  const ddir = path.join(docsDir, 'diagnostics');
  fs.mkdirSync(ddir, { recursive: true });
  const file = path.join(ddir, `newsletter-run-${payload.runId}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(path.join(ddir, 'latest.json'), JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  const runs = fs.readdirSync(ddir).filter(f => /^newsletter-run-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(f)).sort().reverse();
  for (const old of runs.slice(30)) fs.unlinkSync(path.join(ddir, old));
}

export function makeNearMiss(article: NormalizedItem, score: number, reasons: string[], regions: string[], industrialEvidence: string[]) {
  return {
    title: article.title || '', source: (article as any).source || '', url: (article as any).url || article.link || '',
    date: (article as any).date_published || article.pubDate || '', category: (article as any).category || '',
    score, regions, industrialEvidence, rejectionReasons: reasons,
  };
}
