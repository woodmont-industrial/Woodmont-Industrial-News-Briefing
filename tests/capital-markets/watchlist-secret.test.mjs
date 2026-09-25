import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import { harness } from './load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'encode-capital-markets-watchlist.mjs');
const h = harness('watchlist secret encoder');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-watchlist-'));

try {
  h.section('valid synthetic CSV');
  const csv = 'Company Name,Website Domain\r\nACME Industrial,acme.example\r\nVertex Property Group,vertex.example\r\n';
  const csvPath = path.join(tempDir, 'synthetic.csv');
  fs.writeFileSync(csvPath, csv, 'utf8');
  const encoded = spawnSync(process.execPath, [SCRIPT, csvPath], { encoding: 'utf8' });
  h.chk(encoded.status === 0, 'encoder exits successfully');
  const compressed = Buffer.from(encoded.stdout.trim(), 'base64');
  h.chk(compressed[0] === 0x1f && compressed[1] === 0x8b, 'output carries the gzip magic bytes');
  h.chk(gunzipSync(compressed).toString('utf8') === csv, 'encoded output round-trips exactly');
  h.chk(Buffer.byteLength(encoded.stdout.trim(), 'utf8') < 48_000,
    'synthetic output fits the GitHub secret limit');
  h.chk(/Validated 2 company row\(s\)/.test(encoded.stderr), 'diagnostic reports only the row count and sizes');
  h.chk(!encoded.stderr.includes('ACME') && !encoded.stderr.includes('Vertex'),
    'diagnostic does not log company values');

  h.section('fail-closed validation');
  const badHeaderPath = path.join(tempDir, 'bad-header.csv');
  fs.writeFileSync(badHeaderPath, 'Organization,Website\r\nSynthetic Co,example.test\r\n', 'utf8');
  const badHeader = spawnSync(process.execPath, [SCRIPT, badHeaderPath], { encoding: 'utf8' });
  h.chk(badHeader.status !== 0 && /Company Name/.test(badHeader.stderr),
    'missing required header is rejected before encoding');

  const largePath = path.join(tempDir, 'too-large-for-secret.csv');
  const randomish = randomBytes(80_000).toString('base64');
  fs.writeFileSync(largePath, `Company Name,Website Domain\r\n${randomish},example.test\r\n`, 'utf8');
  const tooLarge = spawnSync(process.execPath, [SCRIPT, largePath], { encoding: 'utf8' });
  h.chk(tooLarge.status !== 0 && /48 KB secret limit/.test(tooLarge.stderr),
    'an encoded value above GitHub\'s secret limit is rejected');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

process.exit(h.done());
