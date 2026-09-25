/**
 * Runs every Capital Markets suite. Exit code is the total failure count.
 *   node tests/capital-markets/run-all.mjs
 * The committed public list has its own suite. WATCHLIST_CSV remains available
 * for exercising an optional runtime override without committing that file.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const suites = fs.readdirSync(HERE).filter(f => f.endsWith('.test.mjs')).sort();
let failed = 0;
for (const s of suites) {
  try {
    console.log(execFileSync(process.execPath, [path.join(HERE, s)], { encoding: 'utf8' }));
  } catch (e) {
    failed++;
    console.log(e.stdout || '');
    console.log(e.stderr || '');
  }
}
console.log(failed ? `\n${failed} SUITE(S) FAILED` : `\nALL ${suites.length} CAPITAL MARKETS SUITES PASS`);
process.exit(failed ? 1 : 0);
