import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// Exercise the actual CLI exemption, rather than only its validation helper.
for (const file of ['docs/data/capital-markets-scan.json', 'docs/data/capital-markets-scan-state.json']) {
    const original = fs.readFileSync(file);
    try {
        for (const [key, value] of [['Phone', '555-0100'], ['Portfolio SF', 999999999]]) {
            const mutated = JSON.parse(original.toString('utf8'));
            mutated[key] = value;
            fs.writeFileSync(file, JSON.stringify(mutated));
            const result = spawnSync(process.execPath, ['scripts/validate-capital-markets-privacy.mjs'], { encoding: 'utf8' });
            assert.equal(result.status, 1, 'the CLI must reject an out-of-contract public artifact');
            assert.match(result.stderr, /public scan artifact contract/, 'the schema guard must be the failing check');
        }
    } finally { fs.writeFileSync(file, original); }
}
console.log('PASS: actual privacy CLI rejects contact and portfolio fields in both artifacts');
