import { assertFreshFeedForSend, buildCapitalMarketsPackage, readCanarySmtpConfig, validateCanaryRecipients } from './capital-markets-delivery.js';
import { NormalizedItem } from '../types/index.js';

let failures = 0;
function check(value: unknown, label: string): void {
    if (value) console.log(`  OK   ${label}`);
    else { console.error(`  FAIL ${label}`); failures++; }
}
function rejects(fn: () => unknown, label: string): void {
    try { fn(); check(false, label); } catch { check(true, label); }
}

const day = (n: number) => new Date(Date.UTC(2026, 8, 23 - n, 12)).toISOString();
const item = (title: string, id: string, description = ''): NormalizedItem => ({
    id, title, description, link: `https://example.test/${id}`, source: 'Synthetic Source',
    pubDate: day(1), category: 'transactions', tier: 'A',
});

async function main(): Promise<void> {
console.log('=== Capital Markets production guard ===');

const sales = Array.from({ length: 8 }, (_, i) => item(
    `Buyer ${i} acquires Edison, New Jersey industrial warehouse for $${30 + i} million`, `sale-${i}`
));
const pkg = await buildCapitalMarketsPackage({
    articles: sales,
    asOfDate: '2026-09-23',
    asOfTime: '2026-09-23T00:00:00.000Z',
    lookbackHours: 168,
    includeWeekInReview: false,
    testBanner: true,
});
check(pkg.summary.sectionCounts.sales === 8, 'all eight qualifying sales remain in the selection model');
check(pkg.summary.subject === 'Woodmont Capital Markets & Industrial Intelligence Briefing',
  'the configured subject reaches the delivery package');
check(/<title>Capital Markets &amp; Industrial Intelligence Briefing<\/title>/.test(pkg.deliveryHtml),
  'the configured visible title reaches the delivery document');
check(/Showing 6 of 8 qualifying items/.test(pkg.deliveryHtml), 'delivery renderer caps the visible section at six');
check(/TEST ONLY — DO NOT FORWARD/.test(pkg.deliveryHtml), 'canary rendering carries the test banner');
check(!/PREVIEW ONLY|\bDiagnostics\b|\bsandbox\b/.test(pkg.deliveryHtml), 'delivery HTML contains no preview-only material');
check(pkg.summary.safetyChecks.includes('no-malformed-values'), 'delivery safety checks ran');
check(pkg.summary.weekInReviewIncluded === false, 'Friday block is caller-controlled');
check(/Week in Review — Top 5 Developments/.test(pkg.previewHtml), 'editor preview keeps Week in Review visible every day');
check(pkg.summary.feedHealth.status === 'FRESH', 'freshness is measured from the exact run timestamp');
try { assertFreshFeedForSend(pkg.summary.feedHealth); check(true, 'fresh input passes the send freshness gate'); }
catch { check(false, 'fresh input passes the send freshness gate'); }
rejects(() => assertFreshFeedForSend({
    status: 'STALE', newestAt: '2026-09-21T00:00:00.000Z', ageHours: 48, maxAgeHours: 18,
}), 'stale input is blocked before email delivery');

const rollingWindow = await buildCapitalMarketsPackage({
    articles: [
        { ...item('Buyer acquires Edison, New Jersey warehouse for $31 million', 'inside-window'), pubDate: '2026-09-22T12:00:01.000Z' },
        { ...item('Buyer acquires Edison, New Jersey warehouse for $32 million', 'outside-window'), pubDate: '2026-09-22T11:59:59.000Z' },
    ],
    asOfDate: '2026-09-23',
    asOfTime: '2026-09-23T12:00:00.000Z',
    lookbackHours: 24,
    includeWeekInReview: false,
});
check(rollingWindow.summary.sectionCounts.sales === 1, 'delivery uses an exact rolling 24-hour cutoff');
check(/\$31 million/.test(rollingWindow.deliveryHtml) && !/\$32 million/.test(rollingWindow.deliveryHtml), 'an item just outside the rolling window stays out');

const enriched = await buildCapitalMarketsPackage({
    articles: [item('ACME acquires an industrial warehouse in Edison, New Jersey', 'needs-price')],
    asOfDate: '2026-09-23',
    lookbackHours: 168,
    includeWeekInReview: false,
    enrichCandidates: true,
    metadataLoader: async () => 'ACME completed the warehouse acquisition for $25 million in Edison, New Jersey.',
});
check(enriched.summary.enrichment.candidates === 1, 'missing-price deal becomes an enrichment candidate');
check(enriched.summary.enrichment.promoted === 1, 'public metadata can promote a candidate without invented facts');
check(enriched.summary.sectionCounts.sales === 1, 'promoted candidate enters Sales Transactions');

const priorDomains = process.env.CM_CANARY_ALLOWED_DOMAINS;
process.env.CM_CANARY_ALLOWED_DOMAINS = 'woodmontproperties.com';
check(validateCanaryRecipients('analyst@woodmontproperties.com').length === 1, 'one corporate canary recipient is allowed');
check(validateCanaryRecipients('a@woodmontproperties.com,b@woodmontproperties.com').length === 2, 'two corporate canary recipients are allowed');
rejects(() => validateCanaryRecipients('a@woodmontproperties.com,b@woodmontproperties.com,c@woodmontproperties.com'), 'three recipients are blocked');
rejects(() => validateCanaryRecipients('analyst@example.com'), 'external recipient is blocked');
rejects(() => validateCanaryRecipients(
    'a@woodmontproperties.com,b@woodmontproperties.com',
    'b@woodmontproperties.com,a@woodmontproperties.com'
), 'production distribution list cannot be reused as the canary list');
rejects(() => validateCanaryRecipients(
    'department@woodmontproperties.com', 'department@woodmontproperties.com'
), 'a single-address production distribution alias cannot be reused');
const canarySmtp = {
    CM_CANARY_SMTP_HOST: 'smtp.example.test', CM_CANARY_SMTP_PORT: '587',
    CM_CANARY_SMTP_USER: 'canary-user', CM_CANARY_SMTP_PASS: 'synthetic-password',
    CM_CANARY_EMAIL_FROM: 'Woodmont Test <briefing@woodmontproperties.com>',
    CM_CANARY_ALLOWED_DOMAINS: 'woodmontproperties.com',
};
check(readCanarySmtpConfig(canarySmtp).port === 587, 'dedicated corporate canary SMTP config is accepted');
rejects(() => readCanarySmtpConfig({ ...canarySmtp, CM_CANARY_SMTP_PASS: '' }),
  'missing dedicated canary credentials block delivery');
rejects(() => readCanarySmtpConfig({ ...canarySmtp, CM_CANARY_EMAIL_FROM: 'briefing@example.com' }),
  'non-corporate canary sender is blocked');
rejects(() => readCanarySmtpConfig({
    ...canarySmtp, CM_CANARY_EMAIL_FROM: 'Woodmont Test\r\nBcc: all@example.com <briefing@woodmontproperties.com>'
}), 'sender header injection is blocked');
rejects(() => readCanarySmtpConfig({ ...canarySmtp, CM_CANARY_SMTP_PORT: '25' }),
  'unexpected canary SMTP port is blocked');
if (priorDomains === undefined) delete process.env.CM_CANARY_ALLOWED_DOMAINS;
else process.env.CM_CANARY_ALLOWED_DOMAINS = priorDomains;

console.log(failures ? `\n${failures} FAILURE(S)` : '\nOK: Capital Markets production guard');
process.exit(failures ? 1 : 0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
