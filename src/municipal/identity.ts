import { normalizeIdentityText, stableMunicipalId } from './normalize.js';
import { advanceMunicipalStatus } from './lifecycle.js';
import { MunicipalEvent, MunicipalEventDraft, MunicipalProject } from './types.js';

interface AssignmentResult {
    event: MunicipalEvent;
    projects: MunicipalProject[];
    created: boolean;
    updated: boolean;
    ambiguous: boolean;
}

function identityParts(draft: MunicipalEventDraft) {
    return {
        address: normalizeIdentityText(draft.siteAddress),
        name: normalizeIdentityText(draft.projectName),
        applicant: normalizeIdentityText(draft.applicantDeveloper),
    };
}

function strongKeys(draft: MunicipalEventDraft): string[] {
    const parts = identityParts(draft);
    const keys: string[] = [];
    if (parts.address) keys.push(`address:${draft.municipalityId}:${parts.address}`);
    if (parts.name && parts.applicant) keys.push(`name-applicant:${draft.municipalityId}:${parts.name}:${parts.applicant}`);
    return keys;
}

function conflicts(draft: MunicipalEventDraft, project: MunicipalProject): boolean {
    const incoming = identityParts(draft);
    const existing = identityParts({
        ...draft,
        siteAddress: project.siteAddress,
        projectName: project.projectName,
        applicantDeveloper: project.applicantDeveloper,
    });
    if (incoming.address && existing.address && incoming.address !== existing.address) return true;
    if (incoming.name && existing.name && incoming.name !== existing.name) return true;
    if (incoming.applicant && existing.applicant && incoming.applicant !== existing.applicant) return true;
    return false;
}

function addressStreet(value: string): { number: string; street: string } | null {
    const normalized = normalizeIdentityText(value);
    const match = normalized.match(/^(\d+)\s+(.+)$/);
    return match ? { number: match[1], street: match[2] } : null;
}

function ambiguousCandidate(draft: MunicipalEventDraft, project: MunicipalProject): boolean {
    if (draft.municipalityId !== project.municipalityId) return false;
    const incoming = identityParts(draft);
    const existingName = normalizeIdentityText(project.projectName);
    const existingApplicant = normalizeIdentityText(project.applicantDeveloper);
    const existingAddress = normalizeIdentityText(project.siteAddress);
    if (incoming.address && existingAddress && incoming.address === existingAddress && conflicts(draft, project)) return true;
    if (incoming.name && existingName && incoming.name === existingName && conflicts(draft, project)) return true;
    if (incoming.applicant && existingApplicant && incoming.applicant === existingApplicant && conflicts(draft, project)) return true;
    if (draft.siteAddress && project.siteAddress) {
        const a = addressStreet(draft.siteAddress);
        const b = addressStreet(project.siteAddress);
        if (a && b && a.street === b.street && a.number !== b.number) return true;
    }
    return false;
}

function eventId(draft: MunicipalEventDraft): string {
    const parts = identityParts(draft);
    return stableMunicipalId(
        'mevt',
        draft.documentRevisionId,
        draft.sourceDocumentId,
        parts.address,
        parts.name,
        parts.applicant,
        draft.useType,
        draft.actionRequested,
    );
}

function flagAmbiguousProjects(
    projects: MunicipalProject[],
    candidateIds: Set<string>,
    relatedProjectId: string,
): MunicipalProject[] {
    return projects.map(project => candidateIds.has(project.projectId)
        ? {
            ...project,
            needsIdentityReview: true,
            ambiguousCandidateProjectIds: [
                ...new Set([...project.ambiguousCandidateProjectIds, relatedProjectId]),
            ],
        }
        : project);
}

export function assignMunicipalEventToProject(
    draft: MunicipalEventDraft,
    projects: MunicipalProject[],
): AssignmentResult {
    const keys = strongKeys(draft);
    const exact = projects.filter(project =>
        project.municipalityId === draft.municipalityId
        && project.identityKeys.some(key => keys.includes(key))
        && !conflicts(draft, project),
    );
    const ambiguousIds = new Set(
        projects.filter(project => ambiguousCandidate(draft, project)).map(project => project.projectId),
    );
    if (exact.length > 1) exact.forEach(project => ambiguousIds.add(project.projectId));
    const matched = exact.length === 1 ? exact[0] : null;
    const id = eventId(draft);

    if (matched) {
        const updatedProject: MunicipalProject = {
            ...matched,
            projectName: matched.projectName || draft.projectName,
            siteAddress: matched.siteAddress || draft.siteAddress,
            applicantDeveloper: matched.applicantDeveloper || draft.applicantDeveloper,
            owner: matched.owner || draft.owner,
            useType: matched.useType === 'unknown' ? draft.useType : matched.useType,
            currentStatus: advanceMunicipalStatus(matched.currentStatus, draft.status),
            currentDecision: draft.decision || matched.currentDecision,
            nextHearingDate: draft.status === 'APPROVED' || draft.status === 'DENIED'
                ? null
                : draft.nextHearingDate || matched.nextHearingDate,
            lastSeenAt: draft.retrievedAt,
            eventIds: [...matched.eventIds, id],
            history: [...matched.history, {
                eventId: id,
                status: draft.status,
                meetingDate: draft.meetingDate,
                observedAt: draft.retrievedAt,
                decision: draft.decision,
                documentUrl: draft.documentUrl,
            }],
            identityKeys: [...new Set([...matched.identityKeys, ...keys])],
            needsIdentityReview: matched.needsIdentityReview || ambiguousIds.size > 0,
            ambiguousCandidateProjectIds: [...new Set([...matched.ambiguousCandidateProjectIds, ...ambiguousIds])],
        };
        const nextProjects = flagAmbiguousProjects(
            projects.map(project => project.projectId === matched.projectId ? updatedProject : project),
            ambiguousIds,
            matched.projectId,
        );
        return {
            event: {
                ...draft,
                eventId: id,
                projectId: matched.projectId,
                firstSeenAt: draft.retrievedAt,
                lastSeenAt: draft.retrievedAt,
                identityAmbiguous: ambiguousIds.size > 0,
                ambiguousCandidateProjectIds: [...ambiguousIds],
            },
            projects: nextProjects,
            created: false,
            updated: true,
            ambiguous: ambiguousIds.size > 0,
        };
    }

    const projectId = stableMunicipalId('mproj', draft.municipalityId, keys[0] || id);
    const newProject: MunicipalProject = {
        projectId,
        municipalityId: draft.municipalityId,
        municipality: draft.municipality,
        state: draft.state,
        projectName: draft.projectName,
        siteAddress: draft.siteAddress,
        applicantDeveloper: draft.applicantDeveloper,
        owner: draft.owner,
        useType: draft.useType,
        currentStatus: draft.status,
        currentDecision: draft.decision,
        nextHearingDate: draft.nextHearingDate,
        firstSeenAt: draft.retrievedAt,
        lastSeenAt: draft.retrievedAt,
        eventIds: [id],
        history: [{
            eventId: id,
            status: draft.status,
            meetingDate: draft.meetingDate,
            observedAt: draft.retrievedAt,
            decision: draft.decision,
            documentUrl: draft.documentUrl,
        }],
        identityKeys: keys,
        needsIdentityReview: ambiguousIds.size > 0 || keys.length === 0,
        ambiguousCandidateProjectIds: [...ambiguousIds],
    };
    const nextProjects = flagAmbiguousProjects([...projects, newProject], ambiguousIds, projectId);
    return {
        event: {
            ...draft,
            eventId: id,
            projectId,
            firstSeenAt: draft.retrievedAt,
            lastSeenAt: draft.retrievedAt,
            identityAmbiguous: ambiguousIds.size > 0 || keys.length === 0,
            ambiguousCandidateProjectIds: [...ambiguousIds],
        },
        projects: nextProjects,
        created: true,
        updated: false,
        ambiguous: ambiguousIds.size > 0 || keys.length === 0,
    };
}
