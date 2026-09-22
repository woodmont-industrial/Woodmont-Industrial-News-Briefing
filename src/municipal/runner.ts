import { randomUUID } from 'node:crypto';
import { municipalAdapterFor } from './adapters/index.js';
import { resolvedMunicipalRequest } from './config.js';
import { BaselineMunicipalExtractor } from './extraction.js';
import { assignMunicipalEventToProject } from './identity.js';
import { mergeMunicipalKeywords } from './keywords.js';
import { rebuildMunicipalProjectState } from './lifecycle.js';
import { canonicalizeMunicipalUrl } from './normalize.js';
import { screenMunicipalDocument } from './relevance.js';
import { assertSafeShadowOutput, loadMunicipalShadowState, saveMunicipalShadowState } from './storage.js';
import {
    MUNICIPAL_SCHEMA_VERSION,
    DiscoveredMunicipalDocument,
    MunicipalCandidateRecord,
    MunicipalScreeningResult,
    MunicipalMonitorConfig,
    NormalizedMunicipalDocument,
    MunicipalRunOptions,
    MunicipalRunReport,
    MunicipalRunResult,
} from './types.js';

function sourceError(report: MunicipalRunReport, sourceKey: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    (report.errorsBySource[sourceKey] ||= []).push(message);
}

function uniqueDiscoveries(documents: DiscoveredMunicipalDocument[]): DiscoveredMunicipalDocument[] {
    const unique = new Map<string, DiscoveredMunicipalDocument>();
    for (const document of documents) {
        const key = document.sourceDocumentId || canonicalizeMunicipalUrl(document.documentUrl);
        if (!unique.has(key)) unique.set(key, document);
    }
    return [...unique.values()];
}

function assertOfficialProvenance(url: string, label: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`${label} is not a valid URL`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} must use http(s)`);
}

function candidateRecord(
    document: NormalizedMunicipalDocument,
    screening: MunicipalScreeningResult,
): MunicipalCandidateRecord {
    return {
        documentRevisionId: document.documentRevisionId,
        documentKey: document.documentKey,
        municipalityId: document.municipalityId,
        sourceId: document.sourceId,
        sourcePageUrl: document.sourcePageUrl,
        documentUrl: document.documentUrl,
        title: document.title,
        selected: screening.selected,
        reasonCodes: screening.reasonCodes,
        matchedKeywords: screening.matchedKeywords,
        screenedAt: screening.screenedAt,
    };
}

function sortedState<T, K extends keyof T>(items: T[], key: K): T[] {
    return [...items].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
}

export async function runMunicipalShadow(
    config: MunicipalMonitorConfig,
    options: MunicipalRunOptions,
): Promise<MunicipalRunResult> {
    const outputDir = assertSafeShadowOutput(options.outputDir);
    const now = options.now || (() => new Date());
    const fetcher = options.fetcher || ((url: string, init?: RequestInit) => fetch(url, init));
    const extractor = options.extractor || new BaselineMunicipalExtractor();
    const request = resolvedMunicipalRequest(config);
    const keywords = mergeMunicipalKeywords(config.keywords);
    const startedAt = now().toISOString();
    const state = loadMunicipalShadowState(outputDir);
    const report: MunicipalRunReport = {
        schemaVersion: MUNICIPAL_SCHEMA_VERSION,
        runId: `mrun_${randomUUID()}`,
        startedAt,
        completedAt: startedAt,
        sourcesChecked: 0,
        documentsDiscovered: 0,
        documentsNew: 0,
        documentsUnchanged: 0,
        documentsFailed: 0,
        documentsPassingStage1: 0,
        documentsRejected: 0,
        eventsExtracted: 0,
        projectsCreated: 0,
        projectsUpdated: 0,
        duplicatesSuppressed: 0,
        ambiguousIdentities: 0,
        errorsBySource: {},
    };

    const revisionIndex = new Map(state.documents.map((document, index) => [document.documentRevisionId, index]));
    const eventIds = new Set(state.events.map(event => event.eventId));

    for (const municipality of config.municipalities) {
        for (const source of municipality.sources) {
            if (source.enabled === false) continue;
            report.sourcesChecked++;
            const sourceKey = `${municipality.id}/${source.id}`;
            const adapter = municipalAdapterFor(source.type);
            const context = { municipality, source, request, fetcher, now };
            let discovered: DiscoveredMunicipalDocument[];
            try {
                const raw = await adapter.discover(context);
                discovered = uniqueDiscoveries(raw);
                report.documentsDiscovered += raw.length;
                report.duplicatesSuppressed += raw.length - discovered.length;
            } catch (error) {
                sourceError(report, sourceKey, error);
                continue;
            }

            for (const discovery of discovered) {
                try {
                    assertOfficialProvenance(discovery.sourcePageUrl, 'sourcePageUrl');
                    assertOfficialProvenance(discovery.documentUrl, 'documentUrl');
                    const document = await adapter.fetchDocument(discovery, context);
                    const existingIndex = revisionIndex.get(document.documentRevisionId);
                    if (existingIndex !== undefined) {
                        const existing = state.documents[existingIndex];
                        state.documents[existingIndex] = { ...existing, lastSeenAt: now().toISOString() };
                        report.documentsUnchanged++;
                        report.duplicatesSuppressed++;
                        continue;
                    }

                    state.documents.push(document);
                    revisionIndex.set(document.documentRevisionId, state.documents.length - 1);
                    report.documentsNew++;
                    const screening = screenMunicipalDocument(document, keywords, now().toISOString());
                    state.candidates.push(candidateRecord(document, screening));
                    if (!screening.selected) {
                        report.documentsRejected++;
                        continue;
                    }
                    report.documentsPassingStage1++;

                    const drafts = await extractor.extract({ document, screening });
                    for (const draft of drafts) {
                        assertOfficialProvenance(draft.sourcePageUrl, 'event.sourcePageUrl');
                        assertOfficialProvenance(draft.documentUrl, 'event.documentUrl');
                        const assignment = assignMunicipalEventToProject(draft, state.projects);
                        if (eventIds.has(assignment.event.eventId)) {
                            report.duplicatesSuppressed++;
                            continue;
                        }
                        state.projects = assignment.projects;
                        state.events.push(assignment.event);
                        eventIds.add(assignment.event.eventId);
                        report.eventsExtracted++;
                        if (assignment.created) report.projectsCreated++;
                        if (assignment.updated) report.projectsUpdated++;
                        if (assignment.ambiguous) report.ambiguousIdentities++;
                    }
                } catch (error) {
                    report.documentsFailed++;
                    sourceError(report, sourceKey, error);
                }
            }
        }
    }

    report.completedAt = now().toISOString();
    state.projects = state.projects.map(project => rebuildMunicipalProjectState(project, state.events));
    state.documents = sortedState(state.documents, 'documentRevisionId');
    state.candidates = sortedState(state.candidates, 'documentRevisionId');
    state.events = sortedState(state.events, 'eventId');
    state.projects = sortedState(state.projects, 'projectId');
    saveMunicipalShadowState(outputDir, state, report);
    return { report, state };
}
