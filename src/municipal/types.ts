export const MUNICIPAL_SCHEMA_VERSION = 1 as const;

export type MunicipalDocumentType =
    | 'agenda' | 'minutes' | 'packet' | 'ordinance' | 'application'
    | 'resolution' | 'notice' | 'meeting-page' | 'other';

export type MunicipalLifecycleStatus =
    | 'UNKNOWN' | 'NEW_APPLICATION' | 'SCHEDULED' | 'HEARD' | 'CONTINUED'
    | 'APPROVED' | 'DENIED' | 'APPEAL' | 'REVISED';

export type MunicipalUseType =
    | 'industrial' | 'warehouse' | 'logistics' | 'distribution-center'
    | 'fulfillment' | 'manufacturing' | 'data-center' | 'cold-storage'
    | 'flex-industrial' | 'unknown';

export type MunicipalKeywordGroup = 'uses' | 'landUse' | 'governmentAction';

export interface MunicipalKeywordConfig {
    uses: string[];
    landUse: string[];
    governmentAction: string[];
}

export interface MunicipalRequestConfig {
    timeoutMs: number;
    maxBytes: number;
    userAgent: string;
}

interface MunicipalSourceBase {
    id: string;
    body: string;
    url: string;
    enabled?: boolean;
}

export interface HtmlMunicipalSourceConfig extends MunicipalSourceBase {
    type: 'html';
    documentLinkTerms?: string[];
    allowedDocumentHosts?: string[];
    includeSourcePage?: boolean;
}

export interface LegistarMunicipalSourceConfig extends MunicipalSourceBase {
    type: 'legistar';
    client?: string;
    lookbackDays?: number;
    eventLimit?: number;
    bodies?: string[];
}

export type MunicipalSourceConfig = HtmlMunicipalSourceConfig | LegistarMunicipalSourceConfig;

export interface MunicipalityConfig {
    id: string;
    name: string;
    state: string;
    county?: string;
    sources: MunicipalSourceConfig[];
}

export interface MunicipalMonitorConfig {
    schemaVersion: 1;
    request?: Partial<MunicipalRequestConfig>;
    keywords?: Partial<MunicipalKeywordConfig>;
    municipalities: MunicipalityConfig[];
}

export interface DiscoveredMunicipalDocument {
    municipalityId: string;
    municipality: string;
    state: string;
    county: string | null;
    sourceId: string;
    sourcePlatform: 'official-html' | 'legistar';
    sourceDocumentId: string;
    sourcePageUrl: string;
    documentUrl: string;
    title: string;
    boardBody: string | null;
    meetingDate: string | null;
    documentType: MunicipalDocumentType;
    platformMetadata: Record<string, string | number | boolean | null>;
}

export interface NormalizedMunicipalDocument extends DiscoveredMunicipalDocument {
    documentKey: string;
    documentRevisionId: string;
    mediaType: string;
    text: string;
    contentHash: string;
    retrievedAt: string;
    firstSeenAt: string;
    lastSeenAt: string;
    extractionStatus: 'text-ready' | 'metadata-only';
    acquisitionNotes: string[];
}

export interface MunicipalKeywordEvidence {
    group: MunicipalKeywordGroup;
    term: string;
    index: number;
    excerpt: string;
}

export interface MunicipalScreeningResult {
    documentRevisionId: string;
    selected: boolean;
    reasonCodes: string[];
    matchedKeywords: MunicipalKeywordEvidence[];
    screenedAt: string;
}

export interface MunicipalEventDraft {
    municipalityId: string;
    municipality: string;
    state: string;
    county: string | null;
    boardBody: string | null;
    meetingDate: string | null;
    documentType: MunicipalDocumentType;
    projectName: string | null;
    siteAddress: string | null;
    applicantDeveloper: string | null;
    owner: string | null;
    useType: MunicipalUseType;
    squareFeet: number | null;
    acreage: number | null;
    actionRequested: string | null;
    status: MunicipalLifecycleStatus;
    decision: string | null;
    nextHearingDate: string | null;
    matchedKeywords: MunicipalKeywordEvidence[];
    sourcePlatform: 'official-html' | 'legistar';
    sourcePageUrl: string;
    documentUrl: string;
    sourceDocumentId: string;
    documentRevisionId: string;
    retrievedAt: string;
    contentHash: string;
    confidence: number;
    extractionNotes: string[];
}

export interface MunicipalEvent extends MunicipalEventDraft {
    eventId: string;
    projectId: string;
    firstSeenAt: string;
    lastSeenAt: string;
    identityAmbiguous: boolean;
    ambiguousCandidateProjectIds: string[];
}

export interface MunicipalProjectHistoryEntry {
    eventId: string;
    status: MunicipalLifecycleStatus;
    meetingDate: string | null;
    observedAt: string;
    decision: string | null;
    documentUrl: string;
}

export interface MunicipalProject {
    projectId: string;
    municipalityId: string;
    municipality: string;
    state: string;
    projectName: string | null;
    siteAddress: string | null;
    applicantDeveloper: string | null;
    owner: string | null;
    useType: MunicipalUseType;
    currentStatus: MunicipalLifecycleStatus;
    currentDecision: string | null;
    nextHearingDate: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    eventIds: string[];
    history: MunicipalProjectHistoryEntry[];
    identityKeys: string[];
    needsIdentityReview: boolean;
    ambiguousCandidateProjectIds: string[];
}

export interface MunicipalCandidateRecord {
    documentRevisionId: string;
    documentKey: string;
    municipalityId: string;
    sourceId: string;
    sourcePageUrl: string;
    documentUrl: string;
    title: string;
    selected: boolean;
    reasonCodes: string[];
    matchedKeywords: MunicipalKeywordEvidence[];
    screenedAt: string;
}

export interface MunicipalRunReport {
    schemaVersion: 1;
    runId: string;
    startedAt: string;
    completedAt: string;
    sourcesChecked: number;
    documentsDiscovered: number;
    documentsNew: number;
    documentsUnchanged: number;
    documentsFailed: number;
    documentsPassingStage1: number;
    documentsRejected: number;
    eventsExtracted: number;
    projectsCreated: number;
    projectsUpdated: number;
    duplicatesSuppressed: number;
    ambiguousIdentities: number;
    errorsBySource: Record<string, string[]>;
}

export interface MunicipalExtractionInput {
    document: NormalizedMunicipalDocument;
    screening: MunicipalScreeningResult;
}

export interface MunicipalExtractor {
    readonly name: string;
    extract(input: MunicipalExtractionInput): Promise<MunicipalEventDraft[]>;
}

export type MunicipalFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface MunicipalAdapterContext {
    municipality: MunicipalityConfig;
    source: MunicipalSourceConfig;
    request: MunicipalRequestConfig;
    fetcher: MunicipalFetch;
    now: () => Date;
}

export interface MunicipalSourceAdapter {
    readonly type: MunicipalSourceConfig['type'];
    discover(context: MunicipalAdapterContext): Promise<DiscoveredMunicipalDocument[]>;
    fetchDocument(document: DiscoveredMunicipalDocument, context: MunicipalAdapterContext): Promise<NormalizedMunicipalDocument>;
}

export interface MunicipalShadowState {
    documents: NormalizedMunicipalDocument[];
    candidates: MunicipalCandidateRecord[];
    events: MunicipalEvent[];
    projects: MunicipalProject[];
}

export interface MunicipalRunOptions {
    outputDir: string;
    fetcher?: MunicipalFetch;
    now?: () => Date;
    extractor?: MunicipalExtractor;
}

export interface MunicipalRunResult {
    report: MunicipalRunReport;
    state: MunicipalShadowState;
}
