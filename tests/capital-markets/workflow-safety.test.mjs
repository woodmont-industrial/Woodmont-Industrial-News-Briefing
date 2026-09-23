import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { harness } from './load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const h = harness('workflow safety');

const shadow = read('.github/workflows/capital-markets-shadow.yml');
const canary = read('.github/workflows/capital-markets-canary.yml');
const production = read('.github/workflows/send-only.yml');
const config = JSON.parse(read('config/capital-markets-newsletter.json'));

h.section('shadow has no delivery capability');
h.chk(/contents:\s*read/.test(shadow), 'shadow workflow has read-only repository permission');
h.chk(!/WEBHOOK_URL|SMTP_HOST|SMTP_PASS|EMAIL_TO|CM_CANARY_TO/.test(shadow),
  'shadow workflow receives no email credentials or recipients');
h.chk(!/send:capital-markets-canary|--send-capital-markets-canary/.test(shadow),
  'shadow workflow cannot invoke a send command');
h.chk(/build:capital-markets-shadow/.test(shadow), 'shadow workflow only builds review artifacts');

h.section('canary is manual and test-only');
h.chk(/^on:\s*\n\s+workflow_dispatch:/m.test(canary), 'canary is manual-dispatch only');
h.chk(!/^\s+schedule:|workflow_run:|repository_dispatch:/m.test(canary),
  'canary has no scheduled or automatic trigger');
h.chk(/SEND TEST ONLY/.test(canary), 'canary requires the exact test confirmation');
h.chk(/CM_CANARY_TO/.test(canary) && !/\bEMAIL_TO:/.test(canary),
  'canary uses its own recipient secret, never the department list');
h.chk(/environment:\s*capital-markets-canary/.test(canary),
  'canary runs behind its own GitHub environment approval boundary');
h.chk(/CM_PRODUCTION_TO_COMPARE:\s*\$\{\{ secrets\.EMAIL_TO \}\}/.test(canary),
  'the production destination is supplied only as a blast-radius comparison');
h.chk(!/WEBHOOK_URL|WEBHOOK_SECRET/.test(canary),
  'canary cannot invoke the production Power Automate webhook');
h.chk(/CM_CANARY_SMTP_HOST/.test(canary) && /CM_CANARY_SMTP_PASS/.test(canary)
   && !/^\s+SMTP_(?:HOST|PORT|USER|PASS):/m.test(canary),
  'canary uses only its dedicated SMTP secret namespace');
h.chk(/public baseline/i.test(canary),
  'uploaded artifact is accurately labelled when private watchlist data is excluded');

h.section('production remains isolated');
h.chk(!/capital-markets/i.test(production),
  'existing department workflow has no Capital Markets command or configuration');
h.chk(config.rollout.productionEnabled === false,
  'public configuration keeps Capital Markets production disabled');
h.chk(config.emptySendPolicy === 'HOLD', 'empty Capital Markets editions are held');
h.chk(typeof config.subject === 'string' && config.subject.length > 0 && config.subject.length <= 120,
  'the subject is editable in public config but length-bounded');
h.chk(config.maxFeedAgeHours > 0 && config.maxFeedAgeHours <= 24,
  'stale feed input is bounded by a 24-hour-or-less freshness limit');
h.chk(config.maxItemsPerSection <= 6, 'delivery section cap is six or fewer');

process.exit(h.done());
