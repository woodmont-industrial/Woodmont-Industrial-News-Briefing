import assert from 'node:assert/strict';
import { hasPositiveTargetRegionEvidence, hasStrongIndustrialAssetEvidence, RESERVE_NEWSLETTER_MAX_AGE_DAYS, WEEK_IN_REVIEW_MAX_AGE_DAYS } from './newsletter-filters.js';

const mk = (title: string, description = '', source=''): any => ({ title, description, source, link: 'https://www.bisnow.com/story' });

assert.equal(hasPositiveTargetRegionEvidence(mk('voestalpine BÖHLER expands warehouse in Austria')).pass, false);
assert.equal(hasPositiveTargetRegionEvidence(mk('Uzbekistan ranks seventh in the world for warehouse development')).pass, false);
assert.equal(hasPositiveTargetRegionEvidence(mk('UP draft unified industrial development authorities rules')).pass, false);
assert.equal(hasStrongIndustrialAssetEvidence(mk('Anthropic leases 465K SF in Hudson Square office tower')).pass, false);
assert.equal(hasStrongIndustrialAssetEvidence(mk('NYC Hudson Square office lease')).pass, false);
assert.equal(hasPositiveTargetRegionEvidence(mk('National office lease announced')).pass, false);
assert.equal(hasPositiveTargetRegionEvidence(mk('Major warehouse deal completed')).pass, false);
assert.equal(hasPositiveTargetRegionEvidence(mk('Google query warehouse update', '', 'Google News Search NJ PA FL')).pass, false);

assert.equal(hasPositiveTargetRegionEvidence(mk('Newark NJ warehouse lease signed')).pass, true);
assert.equal(hasStrongIndustrialAssetEvidence(mk('Newark NJ warehouse lease signed')).pass, true);
assert.equal(hasPositiveTargetRegionEvidence(mk('Lehigh Valley Pennsylvania industrial sale closes')).pass, true);
assert.equal(hasStrongIndustrialAssetEvidence(mk('Lehigh Valley Pennsylvania industrial sale closes')).pass, true);
assert.equal(hasPositiveTargetRegionEvidence(mk('Miami-Dade Florida logistics center opens')).pass, true);
assert.equal(hasStrongIndustrialAssetEvidence(mk('Miami-Dade Florida logistics center opens')).pass, true);
assert.equal(hasPositiveTargetRegionEvidence(mk('RE-NJ: Newark industrial team welcomes new broker', '', 'RE-NJ')).pass, true);

const age31 = 31 > RESERVE_NEWSLETTER_MAX_AGE_DAYS;
const age15 = 15 > RESERVE_NEWSLETTER_MAX_AGE_DAYS;
const age10 = 10 <= RESERVE_NEWSLETTER_MAX_AGE_DAYS;
assert.equal(age31, true);
assert.equal(age15, true);
assert.equal(age10, true);
assert.equal(WEEK_IN_REVIEW_MAX_AGE_DAYS, 7);

console.log('newsletter-filters tests passed');
