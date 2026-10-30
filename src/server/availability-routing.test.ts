import assert from 'node:assert/strict';
import { isConstructionAnnouncement } from '../shared/development-signal.js';
import { transactionFloorLabel } from '../shared/deal-threshold.js';
import { applyAvailabilityFilter, mapFeedItemsToArticles } from './newsletter-filters.js';
import { buildWorkBriefing } from './newsletter-work.js';

const item = (title: string, extra = {}) => ({title,description:title,category:'availabilities',
    id:title,link:'https://example.test/announcement',source:'Example Publication',pubDate:'2026-10-25T12:00:00Z',...extra} as any);
for (const title of [
    'Example Builder breaks ground on 1 Million-Square-Foot New Jersey logistics park',
    'Example Builder broke ground on an industrial warehouse in Edison NJ',
    'Example Builder delivers a 358K SF Lehigh Valley industrial project',
    'A 120,000 SF industrial warehouse in Edison NJ is completed',
]) {
    assert.equal(isConstructionAnnouncement(item(title)), true, title);
    assert.equal(applyAvailabilityFilter([item(title)]).length, 0);
    const mapped = mapFeedItemsToArticles([item(title)])[0];
    assert.equal(mapped.category, 'relevant', 'construction enters the current news section before selection');
}
for (const title of [
    'A 120,000 SF industrial warehouse in Edison NJ is available for lease',
    'Example Buyer completes acquisition of a newly completed industrial warehouse in Edison NJ',
    'Example Tenant leased a newly completed 120,000 SF warehouse in Edison NJ',
    'Industrial supplier delivers trucks to a warehouse in Edison NJ',
    'Developer breaks ground on a shopping center in Edison NJ',
]) assert.equal(isConstructionAnnouncement(item(title)), false, title);
assert.equal(applyAvailabilityFilter([item('5301 Sample Dr, Tallahassee FL - 7,360 sqft Flex Warehouse for Lease')]).length, 0);
assert.equal(applyAvailabilityFilter([item('15,000 SF industrial warehouse available for lease in Edison NJ')]).length, 0);
assert.equal(applyAvailabilityFilter([item('15,001 SF industrial warehouse available for lease in Edison NJ')]).length, 1);
assert.equal(applyAvailabilityFilter([item('120,000 SF industrial warehouse available for lease in Edison NJ')]).length, 1);
assert.equal(applyAvailabilityFilter([item('Broker lists Bergen County development site',
    {description:'Bergen County New Jersey industrial warehouse development land being brought to market'})]).length, 1,
    'entitled industrial land with an unknown building size retains its existing policy');
const html = buildWorkBriefing([],[],[],[],'October 26, 2026');
assert.ok(html.includes(transactionFloorLabel()), 'the footer states the actual transaction threshold');
assert.ok(!html.includes('Deals ≥100K SF or ≥$25M'));
console.log('PASS: construction routing, listing controls, strict 15K boundary, unknown-size land and shared footer');
