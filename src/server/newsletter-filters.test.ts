import assert from 'node:assert/strict';
import { finalNewsletterGate, RESERVE_NEWSLETTER_MAX_AGE_DAYS } from './newsletter-filters.js';

const mk = (title: string, description = '', source='Bisnow', category='relevant'): any => ({ title, description, source, category, link: 'https://www.bisnow.com/story' });

// Reject leaks
assert.equal(finalNewsletterGate(mk('voestalpine BÖHLER expands warehouse in Austria','industrial warehouse expansion'), 'transactions').pass, false);
assert.equal(finalNewsletterGate(mk('Uzbekistan ranks seventh in warehouse development'), 'relevant').pass, false);
assert.equal(finalNewsletterGate(mk('UP draft unified industrial development authorities rules'), 'relevant').pass, false);
assert.equal(finalNewsletterGate(mk('Anthropic leases 465K SF in Hudson Square office tower'), 'transactions').pass, false);
assert.equal(finalNewsletterGate(mk('Hudson Square office available for lease'), 'availabilities').pass, false);
assert.equal(finalNewsletterGate(mk('Atlanta industrial lease announced', '', 'RE-NJ'), 'transactions').pass, false);
assert.equal(finalNewsletterGate(mk('Google query warehouse update', '', 'Google News Search NJ PA FL'), 'relevant').pass, false);
assert.equal(finalNewsletterGate(mk('Warehouse lease signed with major tenant'), 'transactions').pass, false);
assert.equal(finalNewsletterGate(mk('Office space now available in Newark NJ'), 'availabilities').pass, false);

// Accept target stories
assert.equal(finalNewsletterGate(mk('Newark NJ warehouse lease signed'), 'transactions').pass, true);
assert.equal(finalNewsletterGate(mk('Carteret NJ warehouse lease signed'), 'transactions').pass, true);
assert.equal(finalNewsletterGate(mk('Edison NJ industrial sale closes'), 'transactions').pass, true);
assert.equal(finalNewsletterGate(mk('Lehigh Valley Pennsylvania industrial sale closes'), 'transactions').pass, true);
assert.equal(finalNewsletterGate(mk('Philadelphia warehouse lease completed'), 'transactions').pass, true);
assert.equal(finalNewsletterGate(mk('Bucks County PA logistics facility delivered'), 'transactions').pass, true);
assert.equal(finalNewsletterGate(mk('Miami-Dade logistics center opens'), 'relevant').pass, true);
assert.equal(finalNewsletterGate(mk('Broward County industrial lease signed'), 'transactions').pass, true);
assert.equal(finalNewsletterGate(mk('Tampa industrial distribution center opens'), 'relevant').pass, true);
assert.equal(finalNewsletterGate(mk('RE-NJ industrial team welcomes broker in Newark NJ', '', 're-nj.com', 'people'), 'people').pass, true);
assert.equal(finalNewsletterGate(mk('Philadelphia industrial broker appointed at JLL', '', 'JLL', 'people'), 'people').pass, true);

// Section behavior
assert.equal(finalNewsletterGate(mk('National CRE office market update','commercial real estate office leasing'), 'relevant').pass, false);
assert.equal(finalNewsletterGate(mk('NJ property transaction closes','lease signed in Newark NJ'), 'transactions').pass, false);
assert.equal(finalNewsletterGate(mk('NJ warehouse now leasing 250k sf in Newark NJ','warehouse for lease in Newark NJ'), 'availabilities').pass, true);
assert.equal(finalNewsletterGate(mk('823 Newark Ave, Elizabeth, NJ 07208 - 8000 SF Warehouse - LoopNet'), 'availabilities').pass, true);
assert.equal(finalNewsletterGate(mk('CBRE appoints broker in Newark NJ industrial team','appointed to industrial brokerage team', 'CBRE','people'), 'people').pass, true);

assert.equal(15 > RESERVE_NEWSLETTER_MAX_AGE_DAYS, true);
assert.equal(31 > RESERVE_NEWSLETTER_MAX_AGE_DAYS, true);

console.log('final newsletter gate tests passed');
