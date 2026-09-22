import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMunicipalConfig, validateMunicipalConfig } from './config.js';
import { BaselineMunicipalExtractor, inferMunicipalStatus } from './extraction.js';
import { createMunicipalFixtureFetch } from './fixture-fetch.js';
import { assignMunicipalEventToProject } from './identity.js';
import { DEFAULT_MUNICIPAL_KEYWORDS } from './keywords.js';
import { advanceMunicipalStatus } from './lifecycle.js';
import { sha256, stableMunicipalId } from './normalize.js';
import { screenMunicipalDocument } from './relevance.js';
import { runMunicipalShadow } from './runner.js';
import { assertSafeShadowOutput } from './storage.js';
import {
    MunicipalEventDraft,
    MunicipalLifecycleStatus,
    MunicipalProject,
    NormalizedMunicipalDocument,
} from './types.js';

let passed = 0;
function check(name: string, condition: unknown): void {
    assert.ok(condition, name);
    console.log(`✓ ${name}`);
    passed++;
}

function equal(name: string, actual: unknown, expected: unknown): void {
    assert.deepEqual(actual, expected, `${name}: got ${JSON.stringify(actual)}`);
    console.log(`✓ ${name}`);
    passed++;
}

function documentFor(text: string, id = 'case'): NormalizedMunicipalDocument {
    const contentHash = sha256(text);
    return {
        municipalityId: 'example-town-nj',
        municipality: 'Example Township',
        state: 'NJ',
        county: 'Example County',
        sourceId: 'planning-board',
        sourcePlatform: 'official-html',
        sourceDocumentId: id,
        sourcePageUrl: 'https://example.gov/planning-board/',
        documentUrl: `https://example.gov/records/${id}.html`,
        title: id,
        boardBody: 'Planning Board',
        meetingDate: '2026-09-15',
        documentType: 'agenda',
        platformMetadata: {},
        documentKey: stableMunicipalId('mdoc', id),
        documentRevisionId: stableMunicipalId('mrev', id, contentHash),
        mediaType: 'text/html',
        text,
        contentHash,
        retrievedAt: '2026-09-22T12:00:00.000Z',
        firstSeenAt: '2026-09-22T12:00:00.000Z',
        lastSeenAt: '2026-09-22T12:00:00.000Z',
        extractionStatus: 'text-ready',
        acquisitionNotes: [],
    };
}

function draft(
    revision: string,
    status: MunicipalLifecycleStatus,
    overrides: Partial<MunicipalEventDraft> = {},
): MunicipalEventDraft {
    return {
        municipalityId: 'example-town-nj',
        municipality: 'Example Township',
        state: 'NJ',
        county: 'Example County',
        boardBody: 'Planning Board',
        meetingDate: '2026-09-15',
        documentType: 'agenda',
        projectName: 'Commerce Logistics Center',
        siteAddress: '100 Commerce Road, Example Township',
        applicantDeveloper: 'Example Industrial Partners LLC',
        owner: null,
        useType: 'warehouse',
        squareFeet: 500000,
        acreage: 50,
        actionRequested: 'major site plan',
        status,
        decision: status === 'APPROVED' ? 'approved' : status === 'DENIED' ? 'denied' : null,
        nextHearingDate: status === 'CONTINUED' ? '2026-10-15' : null,
        matchedKeywords: [],
        sourcePlatform: 'official-html',
        sourcePageUrl: 'https://example.gov/planning-board/',
        documentUrl: `https://example.gov/records/${revision}.html`,
        sourceDocumentId: revision,
        documentRevisionId: revision,
        retrievedAt: `2026-09-${String(15 + Number(revision.replace(/\D/g, '') || 0)).padStart(2, '0')}T12:00:00.000Z`,
        contentHash: sha256(revision),
        confidence: 0.9,
        extractionNotes: [],
        ...overrides,
    };
}

async function main(): Promise<void> {
    const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
    const cases = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'fixtures', 'screening-cases.json'), 'utf8')) as Array<{
        name: string;
        text: string;
        selected: boolean;
        status: MunicipalLifecycleStatus;
    }>;
    for (const [index, testCase] of cases.entries()) {
        const doc = documentFor(testCase.text, `screen-${index}`);
        const result = screenMunicipalDocument(doc, DEFAULT_MUNICIPAL_KEYWORDS, '2026-09-22T12:00:00.000Z');
        equal(`screening: ${testCase.name}`, result.selected, testCase.selected);
        equal(`status: ${testCase.name}`, inferMunicipalStatus(testCase.text), testCase.status);
    }

    equal('lifecycle scheduled → heard', advanceMunicipalStatus('SCHEDULED', 'HEARD'), 'HEARD');
    equal('lifecycle new application → scheduled', advanceMunicipalStatus('NEW_APPLICATION', 'SCHEDULED'), 'SCHEDULED');
    equal('lifecycle heard → continued', advanceMunicipalStatus('HEARD', 'CONTINUED'), 'CONTINUED');
    equal('lifecycle continued → approved', advanceMunicipalStatus('CONTINUED', 'APPROVED'), 'APPROVED');
    equal('lifecycle continued → denied', advanceMunicipalStatus('CONTINUED', 'DENIED'), 'DENIED');
    equal('lifecycle denied → revised', advanceMunicipalStatus('DENIED', 'REVISED'), 'REVISED');
    equal('lifecycle approved → appeal', advanceMunicipalStatus('APPROVED', 'APPEAL'), 'APPEAL');
    equal('lifecycle approved does not regress to scheduled', advanceMunicipalStatus('APPROVED', 'SCHEDULED'), 'APPROVED');

    let projects: MunicipalProject[] = [];
    const sequence: MunicipalLifecycleStatus[] = ['SCHEDULED', 'HEARD', 'CONTINUED', 'APPROVED'];
    for (const [index, status] of sequence.entries()) {
        const assigned = assignMunicipalEventToProject(draft(`life-${index + 1}`, status), projects);
        projects = assigned.projects;
    }
    equal('same project maintains one current record', projects.length, 1);
    equal('same project preserves four immutable history entries', projects[0].history.length, 4);
    equal('same project advances to approved', projects[0].currentStatus, 'APPROVED');

    const first = assignMunicipalEventToProject(draft('similar-1', 'SCHEDULED'), []);
    const second = assignMunicipalEventToProject(draft('similar-2', 'SCHEDULED', {
        projectName: 'Commerce Cold Storage',
        siteAddress: '102 Commerce Road, Example Township',
        applicantDeveloper: 'Different Developer LLC',
        useType: 'cold-storage',
    }), first.projects);
    equal('similar addresses remain two projects', second.projects.length, 2);
    check('similar-address identity is flagged for review', second.ambiguous);
    check('both ambiguous project records are flagged', second.projects.every(project => project.needsIdentityReview));

    const sameDocumentA = assignMunicipalEventToProject(draft('multi-project-doc', 'SCHEDULED'), []);
    const sameDocumentB = assignMunicipalEventToProject(draft('multi-project-doc', 'SCHEDULED', {
        projectName: 'Second Warehouse Project',
        siteAddress: '900 Different Avenue, Example Township',
        applicantDeveloper: 'Second Applicant LLC',
    }), sameDocumentA.projects);
    check('two projects in one document receive distinct event IDs', sameDocumentA.event.eventId !== sameDocumentB.event.eventId);

    const unknownDoc = documentFor('The council considers a data center moratorium ordinance.', 'unknown-fields');
    const unknownScreen = screenMunicipalDocument(unknownDoc, DEFAULT_MUNICIPAL_KEYWORDS, unknownDoc.retrievedAt);
    const unknownDraft = (await new BaselineMunicipalExtractor().extract({ document: unknownDoc, screening: unknownScreen }))[0];
    equal('unknown project name remains null', unknownDraft.projectName, null);
    equal('unknown address remains null', unknownDraft.siteAddress, null);
    equal('unknown applicant remains null', unknownDraft.applicantDeveloper, null);

    assert.throws(
        () => validateMunicipalConfig({ schemaVersion: 1, secretWatchlist: [], municipalities: [] }),
        /unsupported field/,
    );
    console.log('✓ malformed/unsafe config fails closed');
    passed++;
    assert.throws(() => assertSafeShadowOutput('docs/municipal-output'), /\.municipal-shadow/);
    console.log('✓ public docs output is rejected');
    passed++;

    const repositoryRoot = path.resolve(fixtureRoot, '..', '..');
    const config = loadMunicipalConfig(path.join(repositoryRoot, 'config', 'municipal.example.json'));
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'municipal-shadow-test-'));
    const outputDir = path.join(tempRoot, 'state');
    const fixedNow = () => new Date('2026-09-22T12:00:00.000Z');
    try {
        const firstRun = await runMunicipalShadow(config, {
            outputDir,
            fetcher: createMunicipalFixtureFetch(),
            now: fixedNow,
        });
        equal('fixture checks two direct official sources', firstRun.report.sourcesChecked, 2);
        equal('fixture discovers three direct municipal documents', firstRun.report.documentsDiscovered, 3);
        equal('fixture extracts three events', firstRun.report.eventsExtracted, 3);
        check('fixture includes official HTML provenance', firstRun.state.events.some(event => event.sourcePlatform === 'official-html'));
        check('fixture includes Legistar provenance', firstRun.state.events.some(event => event.sourcePlatform === 'legistar'));
        check('every event has an official source URL', firstRun.state.events.every(event => /^https?:\/\//.test(event.sourcePageUrl)));
        check('moratorium survives Stage 1', firstRun.state.events.some(event =>
            event.matchedKeywords.some(keyword => keyword.term === 'moratorium')),
        );
        const warehouse = firstRun.state.events.find(event => event.projectName === 'Harbor Logistics Center');
        equal('baseline extracts warehouse square footage', warehouse?.squareFeet, 1200000);
        equal('baseline extracts next hearing date', warehouse?.nextHearingDate, '2026-10-06');

        const secondRun = await runMunicipalShadow(config, {
            outputDir,
            fetcher: createMunicipalFixtureFetch(),
            now: fixedNow,
        });
        equal('repeat scan marks all documents unchanged', secondRun.report.documentsUnchanged, 3);
        equal('repeat scan emits no duplicate events', secondRun.report.eventsExtracted, 0);
        equal('repeat scan preserves event count', secondRun.state.events.length, firstRun.state.events.length);
        equal('repeat scan preserves project count', secondRun.state.projects.length, firstRun.state.projects.length);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    console.log(`\nAll Municipal Intelligence tests passed (${passed} checks).`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
